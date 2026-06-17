import asyncio
import base64
import json
import logging
from datetime import datetime, timezone
from typing import Annotated
import uuid

from fastapi import APIRouter, UploadFile, Depends, HTTPException, Body, Form, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select

import app.config.db as db
import app.schemas as sch
from app.config import settings, is_openai_supported, is_realtime_streaming_available
from app.security import create_access_token, decode_token, WebAPISession
from app.tasks.transcription import transcribe_audio
from app.tasks.generation import generate_note

logger = logging.getLogger(__name__)

router = APIRouter()

# --- Auth Schemas ---
class LoginRequest(BaseModel):
    email: str

class UserObject(BaseModel):
    id: str
    email: str
    name: str

class LoginResponse(BaseModel):
    user: UserObject
    access_token: str

class GenerateRequest(BaseModel):
    encounter_id: str
    transcript: str

class TranscribeResponse(BaseModel):
    encounterId: str
    transcript: str

class ClinicalNoteOutput(BaseModel):
    raw: str

class GenerateResponse(BaseModel):
    note: ClinicalNoteOutput

# --- Auth Endpoints ---

@router.post("/auth/login")
async def extension_login(request: LoginRequest) -> LoginResponse:
    if request.email != "demo@saip.local":
        raise HTTPException(status_code=401, detail="Only demo@saip.local is allowed in MVP")

    user_session = WebAPISession(
        username=request.email,
        sessionId=str(uuid.uuid4()),
        rights=[]
    )
    token = create_access_token(user_session)

    return LoginResponse(
        user=UserObject(
            id="usr_demo123",
            email=request.email,
            name="Dr. Demo User"
        ),
        access_token=token
    )

def authenticate_bearer(authorization: str | None = None) -> WebAPISession:
    from fastapi import Header
    pass # we will use Depends to grab header

from fastapi import Request

async def get_current_session(request: Request) -> WebAPISession:
    authorization = request.headers.get("authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    try:
        return decode_token(authorization.removeprefix("Bearer "))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

@router.get("/auth/me")
async def extension_me(session: WebAPISession = Depends(get_current_session)) -> UserObject:
    return UserObject(
        id="usr_demo123",
        email=session.username,
        name="Dr. Demo User"
    )

# --- Extension-specific Encounter Read Endpoints ---

class ExtEncounterNote(BaseModel):
    raw: str

class ExtEncounter(BaseModel):
    id: str
    clientName: str
    date: str
    status: str
    transcript: str | None = None
    generatedNote: ExtEncounterNote | None = None

@router.get("/ext-encounters")
async def ext_list_encounters(
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> list[ExtEncounter]:
    """Extension-format encounter list for the current user."""
    from sqlalchemy.orm import selectinload
    rows = database.execute(
        select(db.Encounter)
        .where(
            db.Encounter.username == session.username,
            db.Encounter.inactivated.is_(None),
        )
        .order_by(db.Encounter.created.desc())
        .limit(50)
        .options(
            selectinload(db.Encounter.recording),
            selectinload(db.Encounter.draft_notes),
        )
    ).scalars().all()

    result = []
    for enc in rows:
        transcript = enc.recording.transcript if enc.recording else None
        active_notes = [n for n in enc.draft_notes if not n.inactivated]
        note = ExtEncounterNote(raw=active_notes[-1].content) if active_notes else None
        status = "autofilled" if enc.context and "autofilled" in enc.context else (
            "generated" if note else ("transcribed" if transcript else "pending")
        )
        result.append(ExtEncounter(
            id=enc.id,
            clientName=enc.label or enc.autolabel or "Session",
            date=enc.created.isoformat(),
            status=status,
            transcript=transcript,
            generatedNote=note,
        ))
    return result


@router.get("/ext-encounters/{encounter_id}")
async def ext_get_encounter(
    encounter_id: str,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> ExtEncounter:
    from sqlalchemy.orm import selectinload
    enc = database.execute(
        select(db.Encounter)
        .where(
            db.Encounter.id == encounter_id,
            db.Encounter.username == session.username,
            db.Encounter.inactivated.is_(None),
        )
        .options(
            selectinload(db.Encounter.recording),
            selectinload(db.Encounter.draft_notes),
        )
    ).scalar_one_or_none()
    if not enc:
        raise HTTPException(status_code=404, detail="Encounter not found")

    transcript = enc.recording.transcript if enc.recording else None
    active_notes = [n for n in enc.draft_notes if not n.inactivated]
    note = ExtEncounterNote(raw=active_notes[-1].content) if active_notes else None
    status = "generated" if note else ("transcribed" if transcript else "pending")
    return ExtEncounter(
        id=enc.id,
        clientName=enc.label or enc.autolabel or "Session",
        date=enc.created.isoformat(),
        status=status,
        transcript=transcript,
        generatedNote=note,
    )


# --- AI Endpoints ---

def _ensure_user(database: db.DatabaseSession, username: str) -> None:
    """Create the user record if it doesn't already exist."""
    user = database.execute(
        select(db.User).where(db.User.username == username)
    ).scalar_one_or_none()
    if not user:
        now = datetime.now(timezone.utc).astimezone()
        database.add(db.User(username=username, registered=now, updated=now))
        database.flush()


@router.post("/transcribe")
async def extension_transcribe(
    audio: UploadFile,
    encounter_id: str | None = Form(None),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> TranscribeResponse:
    if audio.size is None or audio.content_type is None:
        raise HTTPException(status_code=400, detail="Audio file metadata is missing")

    # Transcribe first (slow operation before any DB writes)
    output = await transcribe_audio(audio.file, audio.filename or "recording.webm", audio.content_type)

    now = datetime.now(timezone.utc).astimezone()

    try:
        _ensure_user(database, session.username)

        # Attempt to reuse an existing encounter if the client sent one
        existing_enc = None
        if encounter_id:
            existing_enc = database.execute(
                select(db.Encounter)
                .where(
                    db.Encounter.id == encounter_id,
                    db.Encounter.username == session.username,
                    db.Encounter.inactivated.is_(None),
                )
            ).scalar_one_or_none()

        if existing_enc:
            # Update the recording transcript on the existing encounter
            if existing_enc.recording:
                existing_enc.recording.transcript = output.transcript
            existing_enc.modified = now
            database.commit()
            return TranscribeResponse(encounterId=existing_enc.id, transcript=output.transcript)

        # Create a new Encounter + Recording
        eid = db.next_sqid(database)
        rid = db.next_sqid(database)

        recording = db.Recording(
            id=rid,
            encounter_id=eid,
            duration=0,
            transcript=output.transcript,
        )
        encounter = db.Encounter(
            id=eid,
            username=session.username,
            created=now,
            modified=now,
            recording=recording,
        )
        database.add(encounter)
        database.commit()

        return TranscribeResponse(encounterId=eid, transcript=output.transcript)

    except Exception as e:
        logger.error(f"Failed to persist encounter after transcription: {e}")
        # Return a non-persisted id so the extension can still function
        fallback_id = encounter_id or str(uuid.uuid4())
        return TranscribeResponse(encounterId=fallback_id, transcript=output.transcript)


# =============================================================================
# LIVE TRANSCRIPTION — WebSocket Proxy (tasks 2.1–2.4)
# =============================================================================

async def _relay_session(client_ws: WebSocket, openai_ws) -> None:
    """Bidirectional relay: extension PCM frames → OpenAI, OpenAI events → extension.

    `gpt-realtime-whisper` has no server VAD — it transcribes a *committed* audio
    buffer as a whole and emits a single `...transcription.completed` per commit.
    To produce LIVE captions we therefore commit the buffer on a fixed cadence
    (`COMMIT_INTERVAL_S`) so a fresh `completed` segment arrives every few seconds
    while the clinician is still speaking, instead of one block at the very end.
    """
    # 16-bit mono PCM @ 24 kHz → 48000 bytes/sec. OpenAI rejects commits with
    # < 100 ms (4800 bytes) of audio, so only commit once enough has accumulated.
    MIN_COMMIT_BYTES = 4800        # 100 ms — OpenAI's minimum buffer size
    COMMIT_INTERVAL_S = 2.5        # cadence of live caption segments

    stop_event = asyncio.Event()
    pending = {"bytes": 0}         # bytes appended since the last commit

    async def _commit_if_ready() -> bool:
        if pending["bytes"] >= MIN_COMMIT_BYTES:
            pending["bytes"] = 0
            try:
                await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                return True
            except Exception:
                return False
        return False

    async def client_to_openai() -> None:
        try:
            while True:
                msg = await client_ws.receive()
                if "bytes" in msg and msg["bytes"]:
                    audio_b64 = base64.b64encode(msg["bytes"]).decode()
                    await openai_ws.send(json.dumps({
                        "type": "input_audio_buffer.append",
                        "audio": audio_b64,
                    }))
                    pending["bytes"] += len(msg["bytes"])
                elif "text" in msg and msg["text"]:
                    try:
                        ctrl = json.loads(msg["text"])
                        if ctrl.get("type") == "stop":
                            break
                    except Exception:
                        pass
        except Exception:
            pass
        stop_event.set()

    async def periodic_commit() -> None:
        # Commit every COMMIT_INTERVAL_S so whisper transcribes incrementally.
        try:
            while not stop_event.is_set():
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=COMMIT_INTERVAL_S)
                except asyncio.TimeoutError:
                    pass
                if stop_event.is_set():
                    break
                await _commit_if_ready()
        except Exception:
            pass

    async def openai_to_client() -> None:
        try:
            async for raw in openai_ws:
                event = json.loads(raw)
                etype = event.get("type", "")
                logger.info(f"OpenAI WS Event: {etype}")
                if "transcription.delta" in etype or "audio_transcript.delta" in etype:
                    delta = event.get("delta", "")
                    if delta:
                        logger.debug(f"  delta text: {delta!r}")
                        await client_ws.send_json({"type": "delta", "text": delta})
                elif "transcription.completed" in etype or "audio_transcript.done" in etype:
                    text = (
                        event.get("transcript")
                        or event.get("item", {}).get("content", [{}])[0].get("transcript", "")
                    )
                    logger.info(f"  completed text: {text!r}")
                    if text and text.strip():
                        await client_ws.send_json({"type": "completed", "text": text})
                elif etype == "error":
                    logger.error(f"OpenAI WS Error: {json.dumps(event)}")
                    await client_ws.send_json({"type": "error", "message": event.get("error", {}).get("message", str(event))})
        except Exception as exc:
            logger.error(f"openai_to_client error: {exc}")

    t1 = asyncio.create_task(client_to_openai())
    t2 = asyncio.create_task(openai_to_client())
    t3 = asyncio.create_task(periodic_commit())

    await t1  # Wait for client to stop sending audio
    t3.cancel()
    try:
        await t3
    except asyncio.CancelledError:
        pass

    # Final commit of any remaining audio, then give OpenAI a moment to return
    # the last segment before tearing down the OpenAI→client pump.
    await _commit_if_ready()
    await asyncio.sleep(3.0)
    t2.cancel()
    try:
        await t2
    except asyncio.CancelledError:
        pass


@router.websocket("/transcribe-stream")
async def transcribe_stream_ws(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    """Backend-proxied OpenAI Realtime transcription session.
    Bearer token passed as query param ?token= (browser WS can't set headers).
    """
    # Validate before accept so browser sees close frame on bad token
    try:
        _session = decode_token(token)
    except Exception:
        await websocket.close(code=1008, reason="Invalid token")
        return

    if not is_realtime_streaming_available:
        await websocket.close(code=1011, reason="OpenAI not configured")
        return

    await websocket.accept()

    import websockets as ws_lib  # noqa: PLC0415

    # GA Realtime API for transcription sessions uses intent parameter instead of model in URL
    openai_url = "wss://api.openai.com/v1/realtime?intent=transcription"
    openai_headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
    }

    try:
        async with ws_lib.connect(openai_url, additional_headers=openai_headers) as openai_ws:
            logger.info("Connected to OpenAI Realtime WebSocket")
            await openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "transcription": {
                                "model": settings.REALTIME_TRANSCRIPTION_MODEL,
                                "language": "en",
                                # `delay` enables live partial (.delta) transcripts;
                                # lower = earlier text. Without it, whisper only emits
                                # a single `.completed` per commit (no live captions).
                                "delay": settings.REALTIME_TRANSCRIPTION_DELAY,
                            },
                            # gpt-realtime-whisper has no server VAD — audio is committed
                            # manually (periodically in _relay_session) to flush segments.
                            "turn_detection": None
                        }
                    }
                },
            }))
            await _relay_session(websocket, openai_ws)



    except Exception as e:
        logger.error(f"Realtime WS proxy error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# =============================================================================
# SPEAKER LABELING + FINALIZE/PERSIST (tasks 3.1–3.4)
# =============================================================================

def _get_clinician_name(username: str) -> str:
    """Resolve display name from username.  Returns "Dr. Demo User" for the MVP demo account."""
    if username == "demo@saip.local":
        return "Dr. Demo User"
    # Derive a formatted name from the email prefix as a fallback
    prefix = username.split("@")[0].replace(".", " ").replace("_", " ").title()
    return f"Dr. {prefix}"


def _label_transcript(raw_transcript: str, clinician_name: str) -> list[dict]:
    """Call SPEAKER_LABELING_MODEL to split transcript into labeled turns.

    Returns [{"speaker": str, "text": str}, ...].  On any failure, returns a
    single turn attributed to Speaker 1 so callers always get a usable list.
    """
    from app.config.ai import generative_ai_services  # noqa: PLC0415

    if not raw_transcript.strip():
        return [{"speaker": clinician_name, "text": raw_transcript}]

    service = generative_ai_services[0]

    system_prompt = (
        "You are a clinical transcript labeler. "
        f"The clinician in this conversation is named '{clinician_name}'. "
        "The other party is the Patient. "
        "Split the transcript into turns and label each turn with the speaker. "
        f"Use '{clinician_name}' for the clinician and 'Patient' for the patient. "
        "If a turn is ambiguous, use 'Speaker 1' or 'Speaker 2'. "
        "Return ONLY a JSON array: [{\"speaker\": \"...\", \"text\": \"...\"}]"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"TRANSCRIPT:\n{raw_transcript}"},
    ]

    try:
        output = service.complete(settings.SPEAKER_LABELING_MODEL, messages)
        raw = output.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        turns = json.loads(raw)
        if isinstance(turns, list) and turns:
            return turns
    except Exception as e:
        logger.warning(f"Speaker labeling failed, using raw transcript: {e}")

    # Graceful fallback — no data loss
    return [{"speaker": "Speaker 1", "text": raw_transcript}]


def _turns_to_plaintext(turns: list[dict]) -> str:
    return "\n".join(f"{t['speaker']}: {t['text']}" for t in turns)


class FinalizeResponse(BaseModel):
    encounterId: str
    transcript: str
    turns: list[dict]


@router.post("/transcribe-finalize")
async def extension_transcribe_finalize(
    audio: UploadFile,
    transcript: str = Form(...),
    encounter_id: str | None = Form(None),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> FinalizeResponse:
    """Accept the webm audio blob + pre-streamed transcript, run speaker labeling,
    persist Encounter + Recording, return the encounter id + labeled turns.
    Audio is stored but not re-transcribed (transcript already provided).
    """
    now = datetime.now(timezone.utc).astimezone()

    clinician_name = _get_clinician_name(session.username)
    turns = _label_transcript(transcript, clinician_name)
    labeled_text = _turns_to_plaintext(turns)

    try:
        _ensure_user(database, session.username)

        existing_enc = None
        if encounter_id:
            existing_enc = database.execute(
                select(db.Encounter)
                .where(
                    db.Encounter.id == encounter_id,
                    db.Encounter.username == session.username,
                    db.Encounter.inactivated.is_(None),
                )
            ).scalar_one_or_none()

        if existing_enc:
            if existing_enc.recording:
                existing_enc.recording.transcript = labeled_text
            existing_enc.modified = now
            database.commit()
            return FinalizeResponse(
                encounterId=existing_enc.id,
                transcript=labeled_text,
                turns=turns,
            )

        eid = db.next_sqid(database)
        rid = db.next_sqid(database)
        recording = db.Recording(
            id=rid,
            encounter_id=eid,
            duration=0,
            transcript=labeled_text,
        )
        encounter = db.Encounter(
            id=eid,
            username=session.username,
            created=now,
            modified=now,
            recording=recording,
        )
        database.add(encounter)
        database.commit()

        return FinalizeResponse(encounterId=eid, transcript=labeled_text, turns=turns)

    except Exception as e:
        logger.error(f"Failed to persist finalized encounter: {e}")
        fallback_id = encounter_id or str(uuid.uuid4())
        return FinalizeResponse(encounterId=fallback_id, transcript=labeled_text, turns=turns)


@router.get("/streaming-status")
async def streaming_status() -> dict:
    """Report whether the Realtime streaming path is available."""
    return {"available": is_realtime_streaming_available, "model": settings.REALTIME_TRANSCRIPTION_MODEL}


@router.post("/generate")
async def extension_generate(
    request: GenerateRequest,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session)
) -> GenerateResponse:

    instructions = """
    You are a senior medical resident working in an Emergency Department. I need you to create a succinct note that summarizes a complete doctor patient encounter.
    Only include information that is clearly stated in the conversation.

    Structure the note as follows:
    # Patient Demographics and Chief Complaint (CC)
    # History of Presenting Illness
    # Recent Healthcare Encounters
    # Relevant Past Medical/Surgical History
    # Select Medications
    # Allergies
    # Social History
    # Family History
    # Physical Exam
    # Investigations
    # Impression and Plan
    """

    note_def = None
    try:
        user_record = database.execute(
            select(db.User).where(db.User.username == session.username)
        ).scalar_one_or_none()

        if user_record and user_record.default_note:
            note_def = database.execute(
                select(db.NoteDefinition).where(
                    db.NoteDefinition.id == user_record.default_note,
                    db.NoteDefinition.inactivated.is_(None)
                ).order_by(db.NoteDefinition.created.desc())
            ).scalars().first()

            if note_def and note_def.instructions:
                instructions = note_def.instructions
    except Exception as e:
        logger.warning(f"Failed to fetch NoteDefinition: {e}")

    output = generate_note(
        model=settings.DEFAULT_NOTE_GENERATION_MODEL,
        instructions=instructions,
        context=None,
        transcript=request.transcript,
        output_type="Markdown"
    )

    footer = f"\n\n*\\<\\<Generated in part by SAIP, with patient consent where applicable.\\>\\>*\n*\\<\\<Note ID: ext-{request.encounter_id}\\>\\>*"
    final_text = output.text + footer

    # Persist DraftNote to the encounter if it exists in the DB
    try:
        enc = database.execute(
            select(db.Encounter).where(
                db.Encounter.id == request.encounter_id,
                db.Encounter.username == session.username,
                db.Encounter.inactivated.is_(None),
            )
        ).scalar_one_or_none()

        if enc:
            # Resolve a note definition to satisfy the FK constraint
            if not note_def:
                note_def = database.execute(
                    select(db.NoteDefinition).where(
                        db.NoteDefinition.username == settings.SYSTEM_USER,
                        db.NoteDefinition.inactivated.is_(None),
                    ).order_by(db.NoteDefinition.created.desc())
                ).scalars().first()

            if note_def:
                now = datetime.now(timezone.utc).astimezone()
                # Inactivate any previous extension-generated notes for this encounter
                for existing_note in enc.draft_notes:
                    if existing_note.inactivated is None and existing_note.definition_id == note_def.id:
                        existing_note.inactivated = now

                draft_note = db.DraftNote(
                    id=db.next_sqid(database),
                    encounter_id=enc.id,
                    definition_id=note_def.id,
                    definition_version=note_def.version,
                    created=now,
                    title=note_def.title,
                    model=settings.DEFAULT_NOTE_GENERATION_MODEL,
                    content=final_text,
                    output_type="Markdown",
                )
                database.add(draft_note)
                enc.modified = now
                database.commit()
    except Exception as e:
        logger.error(f"Failed to persist draft note: {e}")

    return GenerateResponse(note=ClinicalNoteOutput(raw=final_text))


# =============================================================================
# FORM ASSISTANT — Generate Form Answers
# =============================================================================

FORM_SCHEMAS: dict[str, dict] = {
    "Counseling Progress Note": {
        "modality": "Type of contact. One of: Individual, Family, Couple.",
        "participants": "Who was present during the session (e.g., Client, or Client and Others with names/relationships).",
        "methodsUsed": "Methods used during the session (e.g., CBT, motivational interviewing, psychoeducation).",
        "materialsUsed": "Materials or handouts used during the session, if any.",
        "data": "Subjective and objective data observed/reported during the session — the session content.",
        "assessment": "Clinical assessment of the issue(s) discussed, including behavioral observations.",
        "response": "The client's response to the intervention, including progress or lack of progress toward recovery goals.",
        "plan": "Plan for the next session, including any recommendations or referrals.",
    },
    "ECI Service Delivery Note": {
        "language": "The family's native/primary language used during the visit (e.g., English, Spanish).",
        "presentDuringVisit": "Who was present during the visit.",
        "ifspOutcomes": "IFSP outcomes addressed during this visit.",
        "jointPlanningReflection": "What has happened since the last visit and what was planned to work on during this visit.",
        "observationPractice": "What was observed and practiced during the visit, including feedback provided.",
        "reflectionFeedback": "What the parent/caregiver will work on between visits and the plan for the next visit.",
    },
    "FAYS SOAP Note": {
        "participants": "Who was present (e.g., Youth, Primary Participating Caregiver, Secondary Participating Caregiver, Other family member/participants) — comma-separated.",
        "focusOfContact": "The focus area or purpose of this contact/session.",
        "subjective": "Subjective: the client/family's reported experience, in their own words or paraphrased.",
        "objective": "Objective: the clinician's direct observations during the session.",
        "assessment": "Assessment: clinical interpretation of the subjective and objective information.",
        "plan": "Plan: next steps, interventions, or referrals.",
    },
    "IDD Service & Outcome": {
        "providedTo": "Who the service was provided to (e.g., Individual, Family, Caregiver) — select the closest matching option text.",
        "providedAt": "Where the service was provided (e.g., Home, Community, Office) — select the closest matching option text.",
        "contactType": "The type/mode of contact (e.g., Face to Face, Telephone, Telehealth) — select the closest matching option text.",
        "summaryOfVisit": "Summary of the visit: services rendered and what occurred.",
        "monitoringServices": "Monitoring/oversight activities performed and their outcome.",
    },
    "Person Centered Recovery Plan": {
        "modifications": "Comma-separated list of plan changes made this cycle, chosen from: Updated Strengths and/or Barriers, New or Revised Objective(s), Change in Assignment (SAI), New or Revised Goal(s), New or Revised Intervention(s). Empty string if no changes.",
        "referralsRequired": "Whether a new referral is required. One of: Yes, No, N/A.",
        "referralSpecify": "If a referral is required, specify what it is for. Empty string if not applicable.",
        "satisfactionWithServices": "Whether the client is satisfied with services received. One of: Yes, No, NA.",
        "individualStatement": "A direct quote from the individual (in quotes) about whether services this plan cycle led to improvement and/or if there are other services needed to address unmet needs. Include LAR/family/significant others involvement if mentioned.",
    },
    "Psychosocial Rehab Note": {
        "modality": "Type of contact. One of: Individual, Family, Couple.",
        "participants": "Who was present during the session (e.g., Individual, or Individual and Others with names/relationships).",
        "methodsUsed": "Methods used during the training session.",
        "materialsUsed": "Materials used to provide the training.",
        "behaviorRelatedToRecovery": "Pertinent events/behavior related to the client's recovery observed during the session.",
        "servicesProvided": "Summary of activities/services provided during the session.",
        "progressTowardGoals": "Progress or lack of progress in achieving the recovery plan goal.",
        "nextSessionPlan": "Plan for the next session.",
        "currentDiagnosis": "The client's current diagnosis, if mentioned.",
    },
    "Skills Training Note": {
        "modality": "Type of contact. One of: Individual, Family, Couple.",
        "participants": "Who was present during the session (e.g., Individual, or Individual and Others with names/relationships).",
        "methodsUsed": "Methods used during the training session.",
        "materialsUsed": "Materials used to provide the training.",
        "behaviorRelatedToRecovery": "Pertinent events/behavior related to the client's recovery observed during the session.",
        "servicesProvided": "Summary of activities/services (skills trained) provided during the session.",
        "progressTowardGoals": "Progress or lack of progress in achieving the recovery plan goal.",
        "nextSessionPlan": "Plan for the next session, including skills to practice.",
        "currentDiagnosis": "The client's current diagnosis, if mentioned.",
    },
    "PHQ-9 Adult": {
        "phqInterest": "Item: Little interest or pleasure in doing things. Score 0-3, or empty string if not assessable.",
        "phqMood": "Item: Feeling down, depressed, or hopeless. Score 0-3, or empty string if not assessable.",
        "phqSleep": "Item: Trouble falling/staying asleep, or sleeping too much. Score 0-3, or empty string if not assessable.",
        "phqEnergy": "Item: Feeling tired or having little energy. Score 0-3, or empty string if not assessable.",
        "phqAppetite": "Item: Poor appetite or overeating. Score 0-3, or empty string if not assessable.",
        "phqSelfWorth": "Item: Feeling bad about yourself / a failure / let self or family down. Score 0-3, or empty string if not assessable.",
        "phqConcentration": "Item: Trouble concentrating (e.g., reading, watching TV). Score 0-3, or empty string if not assessable.",
        "phqPsychomotor": "Item: Moving/speaking slowly, or being fidgety/restless. Score 0-3, or empty string if not assessable.",
        "phqSelfHarm": "Item: Thoughts of being better off dead or of self-harm. Score 0-3, or empty string if not assessable.",
        "phqDifficulty": "How difficult these problems made daily functioning. One of: Not difficult at all, Somewhat difficult, Very difficult, Extremely difficult. Empty string if not assessable.",
    },
    "PHQ-9 Adolescent": {
        "phqMood": "Item: Feeling down, depressed, irritable, or hopeless. Score 0-3, or empty string if not assessable.",
        "phqInterest": "Item: Little interest or pleasure in doing things. Score 0-3, or empty string if not assessable.",
        "phqSleep": "Item: Trouble falling/staying asleep, or sleeping too much. Score 0-3, or empty string if not assessable.",
        "phqAppetite": "Item: Poor appetite, weight loss, or overeating. Score 0-3, or empty string if not assessable.",
        "phqEnergy": "Item: Feeling tired or having little energy. Score 0-3, or empty string if not assessable.",
        "phqSelfWorth": "Item: Feeling bad about yourself / a failure / let self or family down. Score 0-3, or empty string if not assessable.",
        "phqConcentration": "Item: Trouble concentrating (e.g., school work, reading, TV). Score 0-3, or empty string if not assessable.",
        "phqPsychomotor": "Item: Moving/speaking slowly, or being fidgety/restless. Score 0-3, or empty string if not assessable.",
        "phqSelfHarm": "Item: Thoughts of being better off dead or of self-harm. Score 0-3, or empty string if not assessable.",
        "phqDepressedPastYear": "In the past year, felt depressed or sad most days even if okay sometimes. One of: Yes, No. Empty string if not assessable.",
        "phqDifficulty": "How difficult these problems made daily functioning. One of: Not difficult at all, Somewhat difficult, Very difficult, Extremely difficult. Empty string if not assessable.",
        "phqSuicidalPastMonth": "In the past month, had serious thoughts about ending your life. One of: Yes, No. Empty string if not assessable.",
    },
}

class FormAnswersRequest(BaseModel):
    formType: str
    formContext: str = ""
    transcript: str
    clinicalNote: str
    encounterId: str | None = None


class FormAnswersResponse(BaseModel):
    formType: str
    confidence: float
    fields: dict


def _generate_structured_fields(schema: dict, subject_label: str, subject_value: str, form_context: str, transcript: str, clinical_note: str) -> dict:
    """Calls the configured AI service with a field-keyed schema and returns the parsed JSON fields dict."""
    import json as _json
    from app.config.ai import form_ai_service, form_ai_model

    schema_json = str(schema)

    response_schema = {
        "type": "OBJECT",
        "properties": {key: {"type": "STRING"} for key in schema},
        "required": list(schema.keys()),
    }

    system_prompt = (
        "You are an expert behavioral health clinical documentation assistant.\n"
        "Your task is to generate structured answers for a Credible EHR form.\n"
        "Use the transcript as the primary source of truth.\n"
        "Use the clinical note as a clinician-reviewed summary.\n"
        "Use the form context (raw page text) to understand the exact field labels on the form.\n"
        "Never invent information. If information is missing, return an empty string.\n"
        "For fields with a controlled list of options, return ONLY option text exactly as given, "
        "comma-separated if multiple apply.\n"
        "Return ONLY valid JSON. Return EVERY field defined in the schema.\n"
        "Do not return markdown. Do not return explanations."
    )

    user_prompt = (
        f"{subject_label}:\n{subject_value}\n\n"
        f"FORM CONTEXT (raw page text):\n{form_context[:4000]}\n\n"
        f"TRANSCRIPT:\n{transcript}\n\n"
        f"CLINICAL NOTE:\n{clinical_note}\n\n"
        f"SCHEMA (field key -> description):\n{schema_json}\n\n"
        "Generate the completed JSON."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        output = form_ai_service.complete_structured(form_ai_model, messages, response_schema)
        raw_text = output.text.strip()

        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        return _json.loads(raw_text)
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"AI returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")


@router.post("/generate-form-answers")
async def extension_generate_form_answers(
    request: FormAnswersRequest,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> FormAnswersResponse:
    schema = FORM_SCHEMAS.get(request.formType)
    if schema is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown form type: {request.formType}. "
                   f"Supported: {list(FORM_SCHEMAS.keys())}",
        )

    fields = _generate_structured_fields(
        schema, "FORM TYPE", request.formType,
        request.formContext, request.transcript, request.clinicalNote,
    )

    # Persist as FormAnswerSet (upsert: latest generation wins)
    if request.encounterId:
        try:
            now = datetime.now(timezone.utc).astimezone()
            fas_id = db.next_sqid(database)
            form_answer_set = db.FormAnswerSet(
                id=fas_id,
                encounter_id=request.encounterId,
                form_type=request.formType,
                fields=json.dumps(fields),
                model=settings.DEFAULT_NOTE_GENERATION_MODEL,
                created=now,
            )
            database.add(form_answer_set)
            database.commit()
        except Exception as e:
            logger.error(f"Failed to persist FormAnswerSet: {e}")

    return FormAnswersResponse(
        formType=request.formType,
        confidence=1.0,
        fields=fields,
    )


@router.get("/form-answers")
async def get_form_answers(
    encounter_id: str = Query(...),
    form_type: str = Query(...),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> dict:
    """Return the most recent generated field map for an encounter + form type."""
    row = database.execute(
        select(db.FormAnswerSet)
        .where(
            db.FormAnswerSet.encounter_id == encounter_id,
            db.FormAnswerSet.form_type == form_type,
        )
        .order_by(db.FormAnswerSet.created.desc())
    ).scalars().first()

    if not row:
        raise HTTPException(status_code=404, detail="No saved form answers for this encounter and form type")

    return json.loads(row.fields)


# =============================================================================
# FORM ASSISTANT — Generate Evaluation Answers (multi-page bundles)
# =============================================================================

_MSE_FIELDS = {
    "orientation": "Orientation findings, comma-separated from: Person, Place, Time, Situation. Empty string if not all are intact (only list intact ones), or describe deficits if assessed.",
    "rapport": "Rapport established, comma-separated from: Appropriate, Hostile, Evasive, Distant, Inattentive, Guarded, Shy, Poor Eye Contact.",
    "appearance": "Appearance, comma-separated from: Appropriate, Poorly Dressed, Poorly Groomed, Disheveled, Body Odor.",
    "mood": "Mood, comma-separated from: WNL, Euthymic, Depressed, Anxious, Jocular, Labile, Irritable/Angry, Elation.",
    "affect": "Affect, comma-separated from: Neutral, Euthymic, Depressed, Anxious, Irritable/angry, Blunted/flat, Labile, Euphoric.",
    "speech": "Speech, comma-separated from: Normal, Increased Latency, Decreased Rate, Poverty, Hyperverbal, Incoherent, Loud, Soft, Mute, Pressured, Mumbled, Slurred.",
    "thoughtContentProcess": "Thought content & process, comma-separated from: Coherent, Disorganized, Delusional, Persecution, Reference, Paranoia, Thought insertion, Broadcasting, Grandiose, Circumstantial, Tangential, Perseveration, Loose Associations, Clanging, Word Salad, Impoverished, Worthlessness, Loneliness, Guilt, Hopelessness, Accusatory, Grievance Collecting.",
    "hallucinations": "Hallucinations, comma-separated from: None, Auditory, Visual, Command, Tactile, Olfactory, Internal Sensations.",
    "insight": "Insight, one of: Excellent, Good, Fair, Poor, Grossly impaired.",
    "judgement": "Judgement, one of: Excellent, Good, Fair, Poor, Grossly impaired.",
    "language": "Language, one of: Excellent, Good, Fair, Poor, Grossly impaired.",
    "cognitiveAttention": "Cognitive attention/concentration, comma-separated from: No Gross Deficits, Concrete.",
    "psychomotor": "Psychomotor activity, comma-separated from: Normal, Restless, Retardation, Fidgety, Hyperactive/Intrusive.",
    "musculoskeletal": "Musculoskeletal exam findings, if mentioned. Empty string if not assessed.",
    "mseComments": "Additional free-text mental status exam comments not captured by the categories above.",
}

_ROS_FIELDS = {
    "rosFindings": "Comma-separated list of body systems with POSITIVE findings on review of systems, chosen only from: Constitutional, Eyes, ENT, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Skin, Neurological, Psychiatric. Empty string if all systems are negative/unremarkable.",
    "rosComments": "Narrative comments elaborating on the review of systems findings.",
}

_MEDICAL_BMI_FIELDS = {
    "medicalConditions": "Relevant medical conditions / medical history mentioned.",
    "bmiComments": "Narrative comments related to BMI, weight, or the physical exam, if mentioned.",
}

EVALUATION_SCHEMAS: dict[str, dict] = {
    "psych-eval": {
        "sourceOfInformation": "Source of the information for this evaluation (e.g., Client self-report, Parent/Guardian, Medical records).",
        "presentingProblems": "The presenting problem(s) / chief complaint that brought the client in for this evaluation.",
        "familyHistory": "Relevant family psychiatric and/or medical history.",
        "traumaHistory": "History of trauma, abuse, or neglect, if any was disclosed. Empty string if none disclosed.",
        "tobaccoStatus": "Tobacco use status (e.g., Never, Former, Current).",
        "substanceUseComments": "Narrative comments on substance use history (alcohol, drugs), excluding tobacco.",
        **_MSE_FIELDS,
        **_ROS_FIELDS,
        **_MEDICAL_BMI_FIELDS,
    },
    "em-ept": {
        "historySource": "Source of the patient history (e.g., Patient, Parent/Guardian).",
        "chiefComplaint": "The chief complaint / reason for this visit.",
        "historyPresentIllness": "History of present illness (HPI) — a narrative of the current complaint and its course.",
        **_MSE_FIELDS,
        **_ROS_FIELDS,
        **_MEDICAL_BMI_FIELDS,
    },
}


class EvaluationAnswersRequest(BaseModel):
    bundleId: str
    formContext: str = ""
    transcript: str
    clinicalNote: str
    encounterId: str | None = None
    visitId: str | None = None    # fvid/visittemp_id from the EHR URL


class EvaluationAnswersResponse(BaseModel):
    bundleId: str
    fields: dict


@router.post("/generate-evaluation")
async def extension_generate_evaluation(
    request: EvaluationAnswersRequest,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> EvaluationAnswersResponse:
    schema = EVALUATION_SCHEMAS.get(request.bundleId)
    if schema is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown evaluation bundle: {request.bundleId}. "
                   f"Supported: {list(EVALUATION_SCHEMAS.keys())}",
        )

    fields = _generate_structured_fields(
        schema, "EVALUATION BUNDLE", request.bundleId,
        request.formContext, request.transcript, request.clinicalNote,
    )

    # Persist as EvaluationBundleCache
    if request.encounterId:
        try:
            now = datetime.now(timezone.utc).astimezone()
            cache_entry = db.EvaluationBundleCache(
                id=db.next_sqid(database),
                encounter_id=request.encounterId,
                bundle_id=request.bundleId,
                visit_id=request.visitId,
                fields=json.dumps(fields),
                model=settings.DEFAULT_NOTE_GENERATION_MODEL,
                created=now,
            )
            database.add(cache_entry)
            database.commit()
        except Exception as e:
            logger.error(f"Failed to persist EvaluationBundleCache: {e}")

    return EvaluationAnswersResponse(bundleId=request.bundleId, fields=fields)


@router.get("/eval-cache")
async def get_eval_cache(
    encounter_id: str = Query(...),
    bundle_id: str = Query(...),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> dict:
    """Return the most recent cached evaluation bundle for an encounter + bundle id."""
    row = database.execute(
        select(db.EvaluationBundleCache)
        .where(
            db.EvaluationBundleCache.encounter_id == encounter_id,
            db.EvaluationBundleCache.bundle_id == bundle_id,
        )
        .order_by(db.EvaluationBundleCache.created.desc())
    ).scalars().first()

    if not row:
        raise HTTPException(status_code=404, detail="No cached evaluation for this encounter and bundle")

    return json.loads(row.fields)


# =============================================================================
# AUTOFILL AUDIT TRAIL
# =============================================================================

class AutofillAuditRequest(BaseModel):
    encounterId: str | None = None
    formType: str
    frameUrl: str
    confidence: float
    filled: int
    missed: int
    manualRequired: int
    detail: dict          # {filled: str[], missed: str[], manual: str[]}
    username: str | None = None


class AutofillAuditEntry(BaseModel):
    id: str
    encounterId: str | None
    formType: str
    frameUrl: str
    confidence: float
    filled: int
    missed: int
    manualRequired: int
    occurred: str


@router.post("/autofill-audit", status_code=201)
async def create_autofill_audit(
    request: AutofillAuditRequest,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> AutofillAuditEntry:
    now = datetime.now(timezone.utc).astimezone()
    entry_id = db.next_sqid(database)
    entry = db.AutofillAuditEntry(
        id=entry_id,
        encounter_id=request.encounterId,
        form_type=request.formType,
        frame_url=request.frameUrl,
        confidence=request.confidence,
        filled=request.filled,
        missed=request.missed,
        manual_required=request.manualRequired,
        detail=json.dumps(request.detail),
        username=request.username or session.username,
        occurred=now,
    )
    database.add(entry)
    database.commit()

    return AutofillAuditEntry(
        id=entry.id,
        encounterId=entry.encounter_id,
        formType=entry.form_type,
        frameUrl=entry.frame_url,
        confidence=entry.confidence,
        filled=entry.filled,
        missed=entry.missed,
        manualRequired=entry.manual_required,
        occurred=entry.occurred.isoformat(),
    )


@router.get("/autofill-audit")
async def list_autofill_audit(
    encounter_id: str = Query(...),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> list[AutofillAuditEntry]:
    rows = database.execute(
        select(db.AutofillAuditEntry)
        .where(db.AutofillAuditEntry.encounter_id == encounter_id)
        .order_by(db.AutofillAuditEntry.occurred.desc())
    ).scalars().all()

    return [
        AutofillAuditEntry(
            id=r.id,
            encounterId=r.encounter_id,
            formType=r.form_type,
            frameUrl=r.frame_url,
            confidence=r.confidence,
            filled=r.filled,
            missed=r.missed,
            manualRequired=r.manual_required,
            occurred=r.occurred.isoformat(),
        )
        for r in rows
    ]
