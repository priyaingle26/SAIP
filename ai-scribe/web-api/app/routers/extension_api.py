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
    patient_id: str | None = None

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
            clientName=enc.label or enc.autolabel or "Current Session",
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
        clientName=enc.label or enc.autolabel or "Current Session",
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
    patient_id: str | None = Form(None),
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
            if patient_id and not existing_enc.patient_id:
                existing_enc.patient_id = _validate_patient_ownership(database, patient_id, session.username)
            existing_enc.modified = now
            database.commit()
            return TranscribeResponse(encounterId=existing_enc.id, transcript=output.transcript)

        # Create a new Encounter + Recording
        eid = db.next_sqid(database)
        rid = db.next_sqid(database)

        validated_patient_id = _validate_patient_ownership(database, patient_id, session.username) if patient_id else None

        recording = db.Recording(
            id=rid,
            encounter_id=eid,
            duration=0,
            transcript=output.transcript,
        )
        encounter = db.Encounter(
            id=eid,
            username=session.username,
            patient_id=validated_patient_id,
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

async def _relay_session(client_ws: WebSocket, openai_ws, manual_commit: bool = False) -> None:
    """Bidirectional relay: extension PCM frames → OpenAI, OpenAI events → extension.

    Two modes:

    * Server VAD (gpt-4o-transcribe, ``manual_commit=False``) — OpenAI detects
      speech boundaries from natural silence and auto commit+clears the buffer per
      turn. We just relay audio; no timer, no manual commit. This avoids mid-word
      chopping (better accuracy) and buffer accumulation (no token explosion /
      1006 drops).
    * Manual commit (gpt-realtime-whisper, ``manual_commit=True``) — no server VAD,
      so we commit on a fixed cadence to flush segments AND explicitly clear the
      buffer after every commit so audio never accumulates across the session.
    """
    # 16-bit mono PCM @ 24 kHz → 48000 bytes/sec. OpenAI rejects commits with
    # < 100 ms (4800 bytes) of audio, so only commit once enough has accumulated.
    MIN_COMMIT_BYTES = 4800        # 100 ms — OpenAI's minimum buffer size
    COMMIT_INTERVAL_S = 2.5        # cadence of live caption segments (manual mode)

    stop_event = asyncio.Event()
    pending = {"bytes": 0}         # bytes appended since the last commit

    async def _commit_if_ready() -> bool:
        if pending["bytes"] >= MIN_COMMIT_BYTES:
            pending["bytes"] = 0
            try:
                await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
                # Clear so the next segment starts fresh — committing alone can leave
                # the buffer accumulating in transcription sessions, which is the
                # documented cause of token blow-up and abrupt 1006 disconnects.
                await openai_ws.send(json.dumps({"type": "input_audio_buffer.clear"}))
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
        # Manual mode only: commit every COMMIT_INTERVAL_S so whisper transcribes
        # incrementally. Server-VAD mode never runs this.
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
    # Timer only needed when there is no server VAD to segment audio for us.
    t3 = asyncio.create_task(periodic_commit()) if manual_commit else None

    await t1  # Wait for client to stop sending audio
    if t3 is not None:
        t3.cancel()
        try:
            await t3
        except asyncio.CancelledError:
            pass

    # Flush any audio still in the buffer. Server-VAD mode may have a trailing
    # partial turn that hasn't hit a silence boundary yet; a manual commit closes
    # it so the final words aren't lost. Then give OpenAI a moment to return the
    # last segment before tearing down the OpenAI→client pump.
    try:
        await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
    except Exception:
        pass
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

            model = settings.REALTIME_TRANSCRIPTION_MODEL
            is_whisper = model == "gpt-realtime-whisper"

            transcription_cfg: dict = {"model": model, "language": "en"}
            if is_whisper:
                # whisper has no server VAD: `delay` enables live partial deltas and
                # _relay_session commits the buffer on a timer.
                transcription_cfg["delay"] = settings.REALTIME_TRANSCRIPTION_DELAY
                turn_detection = None
            else:
                # gpt-4o-transcribe family: let SERVER VAD segment on natural silence
                # and auto commit+clear. silence_duration_ms is how long a pause must
                # last to close a turn — 500 ms balances responsiveness vs word splits.
                turn_detection = {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    # Shorter silence window → turns close faster → transcript text
                    # appears after shorter pauses (more responsive). Tunable via env.
                    "silence_duration_ms": settings.REALTIME_VAD_SILENCE_MS,
                }

            await openai_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {"type": "audio/pcm", "rate": 24000},
                            "transcription": transcription_cfg,
                            "turn_detection": turn_detection,
                        }
                    }
                },
            }))
            await _relay_session(websocket, openai_ws, manual_commit=is_whisper)



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
        # Match the configured service's model (SPEAKER_LABELING_MODEL is an
        # OpenAI name that 404s on Gemini, silently degrading diarization).
        output = service.complete(settings.DEFAULT_NOTE_GENERATION_MODEL, messages)
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
    patient_id: str | None = Form(None),
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
            if patient_id and not existing_enc.patient_id:
                existing_enc.patient_id = _validate_patient_ownership(database, patient_id, session.username)
            existing_enc.modified = now
            database.commit()
            return FinalizeResponse(
                encounterId=existing_enc.id,
                transcript=labeled_text,
                turns=turns,
            )

        validated_patient_id = _validate_patient_ownership(database, patient_id, session.username) if patient_id else None
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
            patient_id=validated_patient_id,
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

    footer = f"\n\n*Generated in part by SAIP, with patient consent where applicable.*\n*Note ID: ext-{request.encounter_id}*"
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

                # Trigger single profile-update call if encounter is linked to a patient
                patient_id_for_update = enc.patient_id or request.patient_id
                logger.info(
                    f"Profile update check: enc.patient_id={enc.patient_id!r} "
                    f"request.patient_id={request.patient_id!r} → using {patient_id_for_update!r}"
                )
                if patient_id_for_update:
                    # Link the encounter to the patient if generate supplied the id
                    if not enc.patient_id:
                        enc.patient_id = patient_id_for_update
                        database.commit()
                    try:
                        patient = database.execute(
                            select(db.Patient).where(
                                db.Patient.id == patient_id_for_update,
                                db.Patient.username == session.username,
                                db.Patient.inactivated.is_(None),
                            )
                        ).scalar_one_or_none()
                        if patient:
                            _update_patient_profile(database, patient, enc.id, request.transcript, final_text)
                            logger.info(f"Patient profile updated for {patient.id} ({patient.name})")
                        else:
                            logger.warning(f"Profile update skipped: patient {patient_id_for_update!r} not found for user {session.username}")
                    except Exception as pe:
                        logger.exception(f"Patient profile update failed (non-fatal): {pe}")
                else:
                    logger.info("Profile update skipped: no patient linked to this encounter")
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
        "nextVisitDate": "The date the next visit is scheduled, in YYYY-MM-DD format. Only fill this when a specific next-visit date is stated or clearly derivable from the visit; empty string otherwise. Resolve relative references (e.g. 'next Tuesday', 'in two weeks') against today's date.",
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
        "monitoringHealthSafety": "Monitoring of the client's health and safety: any health/safety concerns identified during the visit and the follow-up taken to address them. If none were raised, state that no health or safety concerns were noted.",
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
    "T-KIDS Delivered Services": {
        "deliveredServiceTypeCode": "The type of service delivered during this visit. Choose the single closest match from EXACTLY these options: Assistive Technology, Audiology Services, Nutrition, Occupational Therapy, Physical Therapy, Specialized Skills Training, Speech Language Therapy, Vision Services. Infer from what the visit was about (e.g., speech/language work -> Speech Language Therapy; motor/feeding/daily-living skills -> Occupational Therapy; gross-motor/mobility -> Physical Therapy). Empty string only if the visit gives no indication of the service type.",
        "coVisit": "Whether this was a co-visit (two providers present at the same visit). One of: Yes, No. Empty string if not assessable.",
    },
    "28-Day": {
        "was28DayVisit": "Whether this was a 28-day visit. One of: Yes, No. Empty string if not stated.",
        "reason": "If this was not a standard visit, the reason category for the deviation. One of: Program, Family, Other. Empty string if not applicable.",
        "justification": "Free-text justification explaining the reason, if a reason was given. Empty string if none.",
    },
    "Batching (PM USE ONLY)": {
        "omitFromBatch": "Program-manager-only control to omit this note from the TKIDS batch. One of: Yes (empty string otherwise). Leave empty unless the visit explicitly calls for omission — this is an administrative decision, not a clinical one.",
    },
    "Medications": {
        "aimsScore": "AIMS (abnormal involuntary movement) score result. One of: Positive, Negative, N/A, Unable to perform due to visit type COVID 19. Empty string if not stated.",
        "aimsDateLastDone": "Date the AIMS was last done, in YYYY-MM-DD format. Empty string if not stated.",
        "medReconciliationReviewed": "Pre-existing medications reviewed for medication reconciliation this visit. One of: Yes, No. Empty string if not stated.",
        "pdmpReviewed": "PDMP database reviewed selection (exact option text as shown on the form). Empty string if not stated.",
        "otcMedications": "Has the patient taken any over-the-counter medications, herbal supplements or vitamins. One of: Yes, No. Empty string if not stated.",
        "otcList": "If OTC/herbal/vitamins were taken, list them. Empty string otherwise.",
        "onMultipleAntipsychotics": "Patient is on more than 2 anti-psychotics. One of: Yes, No. Empty string if not stated.",
        "benzodiazepineUsage": "Benzodiazepine usage. One of: Yes, No. Empty string if not stated.",
        "educationOnRisk": "Education on risk provided. One of: Yes, No, N/A. Empty string if not stated.",
        "controlledMeds": "Controlled medications (including from other providers). One of: Yes, No. Empty string if not stated.",
    },
    "Plan / Recommendations": {
        "labReviewed": "Lab information reviewed and/or lab tests ordered. One of: Yes, No. Empty string if not stated.",
        "labComments": "Lab-related comments, if any. Empty string otherwise.",
        "labDateDrawn": "Date labs were drawn, in YYYY-MM-DD format. Empty string if not stated.",
        "labWnl": "Labs within normal limits. One of: Yes, No, N/A - See Comments. Empty string if not stated.",
        "problem1": "The first problem identified in the plan. Empty string if none.",
        "status1": "Status of the first problem. Empty string if none.",
        "plan1": "Plan/recommendation for the first problem. Empty string if none.",
        "treatmentPlanComments": "Overall treatment plan comments. Empty string if nothing relevant.",
        "returnTo": "Who the patient should return to, comma-separated, chosen only from: Nurse, NP, PA, Doctor, N/A - Discharged. Empty string if not stated.",
        "returnInWeeks": "Return interval in weeks (number). Empty string if not stated.",
    },
    "Diagnostic Review": {
        "reasonForAction": "Reason for action. One of: Admission or Provisional, Death, Discharge (MH Campus Only), Reevaluation. Empty string if not stated.",
        "axisLevel": "R69 axis level(s), comma-separated, chosen only from: Axis Level 1, Axis Level 2, Axis Level 3. Empty string if not stated.",
        "currentAdaptiveLevel": "Current adaptive behavioral level. One of: Mild, Moderate, Not Intellectually Disabled, Profound, Severe. Empty string if not stated.",
        "potentialAdaptiveLevel": "Potential adaptive behavioral level. One of: Mild, Moderate, Not Intellectually Disabled, Profound, Severe. Empty string if not stated.",
        "iqTestScore": "IQ test score (number). Empty string if not stated.",
        "iqTestType": "IQ test type (exact test name as shown on the form). Empty string if not stated.",
        "iqTestDate": "IQ test date, in YYYY-MM-DD format. Empty string if not stated.",
        "sqTestScore": "SQ (social quotient/adaptive) test score (number). Empty string if not stated.",
        "sqTestType": "SQ test type (exact test name as shown on the form). Empty string if not stated.",
        "sqTestDate": "SQ test date, in YYYY-MM-DD format. Empty string if not stated.",
    },
    "IDD ONLY": {
        "currentAdaptiveLevel": "Current adaptive behavioral level. One of: Zero, One, Two, Three, Four. Empty string if not stated.",
        "potentialAdaptiveLevel": "Potential adaptive behavioral level. One of: Zero, One, Two, Three, Four. Empty string if not stated.",
        "adaptiveLevelDate": "Adaptive behavioral level date, in YYYY-MM-DD format. Empty string if not stated.",
        "icapLon": "ICAP LON value. One of: 1, 5, 6, 8, 9. Empty string if not stated.",
        "icapLos": "ICAP LOS value. One of: 1, 2, 3, 4, 5, 6, 7, 8, 9, Any. Empty string if not stated.",
        "icapDate": "ICAP date, in YYYY-MM-DD format. Empty string if not stated.",
        "iqScore": "IQ score (number). Empty string if not stated.",
        "iqTestType": "IQ test type. Empty string if not stated.",
        "iqTestDate": "IQ test date, in YYYY-MM-DD format. Empty string if not stated.",
        "sqScore": "SQ score (number). Empty string if not stated.",
        "sqTestType": "SQ test type. Empty string if not stated.",
        "sqTestDate": "SQ test date, in YYYY-MM-DD format. Empty string if not stated.",
        "mobility": "Mobility description. Empty string if not stated.",
        "sensoryImpairment": "Sensory impairment description. Empty string if not stated.",
    },
    "IDD CASE MGT Short Note": {
        "providedTo": "Who services were provided to (e.g. Individual/Client, Family, Guardian, Caregiver, Advocate). Empty string if not stated.",
        "providedAt": "Where services were provided (e.g. Home, Office, Community, Telehealth). Empty string if not stated.",
        "contactType": "Type of contact (e.g. Face-to-Face, Phone, Telehealth, Written Communication). Empty string if not stated.",
        "descriptionOfServices": "Narrative description of the service(s) provided during this IDD case management contact. Summarize from the transcript.",
        "summaryNeeds": "Narrative summary of needs or issues identified/addressed and activities performed. Summarize from the transcript.",
        "recommendations": "Recommendations, referrals, or plan discussed during this contact. Summarize from the transcript.",
    },
    "Adult Substance Use": {
        "auditFrequency": "AUDIT-C Q1: how often do you have a drink containing alcohol. Score 0-4 (0=Never, 1=Monthly or less, 2=2-4 times a month, 3=2-3 times a week, 4=4+ times a week). Empty string if not assessable.",
        "auditTypicalDay": "AUDIT-C Q2: how many standard drinks on a typical drinking day. Score 0-4 (0=1-2, 1=3-4, 2=5-6, 3=7-9, 4=10+). Empty string if not assessable.",
        "auditBinge": "AUDIT-C Q3: how often six or more drinks on one occasion. Score 0-4 (0=Never, 1=Less than monthly, 2=Monthly, 3=Weekly, 4=Daily or almost daily). Empty string if not assessable.",
        "auditResult": "Whether the total AUDIT-C score is positive or negative for unhealthy alcohol use. One of: Positive, Negative. Empty string if not assessable.",
        "tobaccoStatus": "Tobacco use status. One of: Current User, Never Used, Past User. Empty string if not stated.",
        "tobaccoProducts": "Tobacco products the patient uses, comma-separated, chosen only from: Bidis, Chewing Tobacco, Cigars / Cigarillos, Cigarettes, Vaping, Hookah, Kreteks, Pipe, Snuff. Empty string if none/not stated.",
        "tobaccoFrequency": "How frequently the patient uses tobacco per day. One of: 1-5 times per day, 5-10 times per day, 10-15 times per day, 15-20 times per day, 20 or more times per day. Empty string if not stated.",
        "tobaccoWaking": "How soon within waking the patient uses tobacco. One of: Less than 30 minutes, Greater than 30 minutes. Empty string if not stated.",
        "tobaccoReadyQuit": "How ready the patient is to quit tobacco. One of: In the next 30 days, In the next 6 months, Eventually, Not at all. Empty string if not stated.",
        "tobaccoCessationEducation": "Tobacco cessation education/counseling provided. One of: Yes, No. Empty string if not stated.",
        "illegalDrugUse": "Has the patient used illegal drugs or prescription drugs for non-medical reasons within the last month. One of: Yes, No. Empty string if not stated.",
        "illegalDrugList": "If illegal/non-medical drug use was reported, list the substances. Empty string otherwise.",
        "substanceUseComments": "Narrative substance use and tobacco screening comments. Empty string if nothing relevant.",
    },
    "Child Substance Use": {
        "crafftA1": "CRAFFT Part A Q1: in the past 12 months, drank any alcohol (more than a few sips). One of: Yes, No. Empty string if not assessable.",
        "crafftA2": "CRAFFT Part A Q2: smoked any marijuana or hashish. One of: Yes, No. Empty string if not assessable.",
        "crafftA3": "CRAFFT Part A Q3: used anything else to get high. One of: Yes, No. Empty string if not assessable.",
        "crafftAAnyYes": "Did the individual answer Yes to any Part A question. One of: Yes, No. Empty string if not assessable.",
        "crafftB1": "CRAFFT Part B Q1: ridden in a car driven by someone (including self) who was high or using alcohol/drugs. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "crafftB2": "CRAFFT Part B Q2: use alcohol or drugs to relax, feel better, or fit in. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "crafftB3": "CRAFFT Part B Q3: use alcohol or drugs while by yourself or alone. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "crafftB4": "CRAFFT Part B Q4: forget things you did while using alcohol or drugs. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "crafftB5": "CRAFFT Part B Q5: family or friends told you to cut down on drinking/drug use. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "crafftB6": "CRAFFT Part B Q6: gotten in trouble while using alcohol or drugs. Score 1 for Yes, 0 for No. Empty string if not assessable.",
        "tobaccoStatus": "Tobacco use status. One of: Current User, Never Used, Past User. Empty string if not stated.",
        "tobaccoProducts": "Tobacco products the patient uses, comma-separated, chosen only from: Bidis, Chewing Tobacco, Cigars / Cigarillos, Cigarettes, Vaping, Hookah, Kreteks, Pipe, Snuff. Empty string if none/not stated.",
        "tobaccoFrequency": "How frequently the patient uses tobacco per day. One of: 1-5 times per day, 5-10 times per day, 10-15 times per day, 15-20 times per day, 20 or more times per day. Empty string if not stated.",
        "tobaccoWaking": "How soon within waking the patient uses tobacco. One of: Less than 30 minutes, Greater than 30 minutes. Empty string if not stated.",
        "tobaccoReadyQuit": "How ready the patient is to quit tobacco. One of: In the next 30 days, In the next 6 months, Eventually, Not at all. Empty string if not stated.",
        "tobaccoCessationEducation": "Tobacco cessation education/counseling provided. One of: Yes, No. Empty string if not stated.",
        "illegalDrugUse": "Has the patient used illegal drugs or prescription drugs for non-medical reasons within the last month. One of: Yes, No. Empty string if not stated.",
        "illegalDrugList": "If illegal/non-medical drug use was reported, list the substances. Empty string otherwise.",
        "substanceUseComments": "Narrative substance use and tobacco screening comments/referrals. Empty string if nothing relevant.",
    },
    "BMI Eval": {
        "bmiNotMeasuredReason": "Reason BMI was not measured, if applicable. One of: Immobile, Measurement Device Capacity Exceeded, Refused. Empty string if BMI was measured or not stated.",
        "bmiPopulation": "BMI population category. One of: Adult - Age 18 or greater, Child / Adolescent - Age 3 - 17, Not Performed. Empty string if not stated.",
        "weightChange": "Weight change from previous visit. One of: Increased, Decreased, Same, N/A. Empty string if not stated.",
        "weightChangePounds": "Weight change in pounds from previous visit (number). Empty string if not stated.",
        "bmiCalculationType": "How the BMI value was obtained. One of: Actual, Reported. Empty string if not stated.",
        "adultCurrentBmi": "Adult current visit BMI value (number). Empty string if not stated.",
        "childBmiPercentile": "Child/youth current visit BMI percentile. Empty string if not stated.",
        "bmiOutsideNormal": "Is BMI outside normal parameters for age. One of: Yes, No. Empty string if not stated.",
        "nutritionCounseling": "Nutrition counseling provided. One of: Yes, No. Empty string if not stated.",
        "exerciseCounseling": "Exercise counseling provided. One of: Yes, No. Empty string if not stated.",
        "weightMgmtEducation": "Education for weight management provided. One of: Yes, No. Empty string if not stated.",
        "dietarySupplements": "Dietary supplements recommended. One of: Yes, No. Empty string if not stated.",
        "medicationAdjustment": "Medication adjustment / change made. One of: Yes, No. Empty string if not stated.",
        "referredToPcp": "Referred to PCP for weight management. One of: Yes, No. Empty string if not stated.",
        "bmiComments": "Narrative BMI measurement comments, if any were discussed. Empty string otherwise.",
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
        "phqDate": "Today's date (the date the screening was completed), in YYYY-MM-DD format. Use today's date if a screening occurred; empty string otherwise.",
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
        "phqEverAttempt": "Have you EVER, in your whole life, tried to kill yourself or made a suicide attempt. One of: Yes, No. Empty string if not assessable.",
        "phqDate": "Today's date (the date the screening was completed), in YYYY-MM-DD format. Use today's date if a screening occurred; empty string otherwise.",
    },
    "Suicide/Homicide Risk": {
        "sourceOfHistory": (
            "Who provided the source of history for this assessment. "
            "One of: Patient, Patient / LAR / Parent, Patient / Other Family, "
            "Patient / Other Advocate, Patient / Other Mental Health Provider, "
            "Patient / Records Review (Summarize in HPA). Empty string if not stated."
        ),
        "wishedDead": (
            "C-SSRS Item 1 — Passive suicidal ideation: Has the patient wished they were dead "
            "or wished they could go to sleep and not wake up? Return Y if endorsed, N if denied, "
            "or empty string if not discussed."
        ),
        "thoughtsKillingSelf": (
            "C-SSRS Item 2 — Active suicidal ideation (non-specific): Has the patient had thoughts "
            "of killing themselves? Return Y if endorsed, N if denied, or empty string if not discussed."
        ),
        "thinkingHowKillSelf": (
            "C-SSRS Item 3 — Active ideation with method: Has the patient been thinking about HOW "
            "they might kill themselves? Return Y if endorsed, N if denied, or empty string if not discussed."
        ),
        "intentionToAct": (
            "C-SSRS Item 4 — Active ideation with intent: Has the patient had thoughts of killing "
            "themselves AND had some intention of acting on them? Return Y if endorsed, N if denied, "
            "or empty string if not discussed."
        ),
        "detailsAndIntent": (
            "C-SSRS Item 5 — Active ideation with plan: Has the patient started to work out the "
            "details of how to kill themselves? Return Y if endorsed, N if denied, or empty string "
            "if not discussed."
        ),
        "suicidalBehavior": (
            "C-SSRS Item 6 — Suicidal behavior (preparatory/attempt): Has the patient done anything, "
            "started to do anything, or prepared to do anything to end their life? Return Y if endorsed, "
            "N if denied, or empty string if not discussed."
        ),
        "homicidalIdeation": (
            "C-SSRS Homicide Item 1: Has the patient had thoughts of killing someone else? "
            "Return Y if endorsed, N if denied, or empty string if not discussed."
        ),
        "homicidalPlan": (
            "C-SSRS Homicide Item 2: Has the patient started to work out the details of how to kill "
            "someone else? Return Y if endorsed, N if denied, or empty string if not discussed."
        ),
    },
}

class FormAnswersRequest(BaseModel):
    formType: str
    formContext: str = ""
    transcript: str
    clinicalNote: str
    encounterId: str | None = None
    patientId: str | None = None


class FormAnswersResponse(BaseModel):
    formType: str
    confidence: float
    fields: dict
    confirmedProfileValues: dict | None = None


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
        "You are a clinical documentation assistant filling a Credible EHR form from a visit.\n"
        "Use the transcript as the primary source of truth and the clinical note as a "
        "clinician-reviewed summary. Use the form context (raw page text) to understand the "
        "exact field labels.\n"
        "Fill EVERY field you can reasonably support from the visit. Narrative fields (such as "
        "a visit summary) should ALWAYS be written from the transcript/note whenever a visit "
        "occurred — do not leave them blank just because the visit type differs from the form's "
        "usual use.\n"
        "Only leave a field as an empty string when the visit genuinely contains nothing relevant "
        "to it. Do not fabricate specific facts such as names, dates, or exact numbers that have "
        "no basis in the conversation.\n"
        "For symptom-frequency rating fields (described as 'Score 0-3'), INFER the score from how "
        "the patient describes that symptom over the period — even if it was not asked as a formal "
        "questionnaire item: 'not at all'/denies → 0; 'a few days'/'several days'/'sometimes' → 1; "
        "'more than half the days'/'often'/'a lot' → 2; 'nearly every day'/'almost always'/"
        "'constantly' → 3. Use an empty string only when the patient gave no indication about that "
        "symptom.\n"
        "For date fields, return the date in YYYY-MM-DD format. Only fill a date when it is "
        "explicitly stated or clearly derivable; resolve relative references (e.g. 'next "
        "Tuesday') against TODAY'S DATE given below. Empty string if no date applies.\n"
        "For fields with a controlled list of options, return ONLY option text exactly as given, "
        "comma-separated if multiple apply.\n"
        "Return ONLY valid JSON. Return EVERY field defined in the schema.\n"
        "Do not return markdown. Do not return explanations."
    )

    from datetime import date as _date
    user_prompt = (
        f"TODAY'S DATE: {_date.today().isoformat()}\n\n"
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

    # Fetch confirmed patient profile values to augment AI context and form fill
    confirmed_profile: dict[str, str] = {}
    if request.patientId:
        try:
            profile_rows = database.execute(
                select(db.PatientProfileField)
                .where(
                    db.PatientProfileField.patient_id == request.patientId,
                    db.PatientProfileField.is_current.is_(True),
                )
            ).scalars().all()
            confirmed_profile = {
                row.field_key: row.value
                for row in profile_rows
                if row.provenance == "confirmed"
            }
        except Exception as e:
            logger.warning(f"Could not fetch patient profile for form answers: {e}")

    # Build confirmed-profile context block to inject into the AI prompt
    confirmed_context = ""
    if confirmed_profile:
        lines = "\n".join(f"- {k}: {v}" for k, v in confirmed_profile.items())
        confirmed_context = (
            f"\n\nCONFIRMED PATIENT PROFILE (clinician-verified — treat as ground truth):\n{lines}"
        )

    fields = _generate_structured_fields(
        schema, "FORM TYPE", request.formType,
        request.formContext, request.transcript, request.clinicalNote + confirmed_context,
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
        confirmedProfileValues=confirmed_profile if confirmed_profile else None,
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
    "rosFindings": "Comma-separated list of body systems with POSITIVE findings on review of systems, chosen only from: Constitutional, Eyes, Ears/Nose/Throat, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Integumentary, Neurological, Endocrine, Hematologic/Lymphatic. Empty string if all systems are negative/unremarkable.",
    "rosComments": "Narrative comments elaborating on the review of systems findings (the 'Current Review of Systems and Changes Noted' field).",
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

# Single-form schemas that reuse the shared evaluation field dicts above. These
# let the eval sub-pages also work via the single-form path (/generate-form-answers)
# when opened individually (no bundle fvid in the URL).
FORM_SCHEMAS["Mental Status Exam"] = {**_MSE_FIELDS}
FORM_SCHEMAS["Review of Systems"] = {**_ROS_FIELDS}


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


# =============================================================================
# PATIENT MANAGEMENT — Helpers
# =============================================================================

def _validate_patient_ownership(database: db.DatabaseSession, patient_id: str, username: str) -> str | None:
    """Return patient_id if it belongs to username, else None (never raises)."""
    try:
        patient = database.execute(
            select(db.Patient).where(
                db.Patient.id == patient_id,
                db.Patient.username == username,
                db.Patient.inactivated.is_(None),
            )
        ).scalar_one_or_none()
        return patient.id if patient else None
    except Exception:
        return None


def _update_patient_profile(
    database: db.DatabaseSession,
    patient: db.Patient,
    encounter_id: str,
    transcript: str,
    note: str,
) -> None:
    """Issue exactly one generative-AI call to extract profile fields and
    merge them into the patient's profile via supersede-with-history.
    All new values get provenance='suggested'.  Raises on AI failure so the
    caller can catch and log without blocking note generation.
    """
    from app.config.ai import generative_ai_services  # noqa: PLC0415

    # Field schema for the extraction call — demographics + PHQ-9 keys
    PROFILE_FIELD_SCHEMA = {
        "name": "Patient's full name if mentioned.",
        "dob": "Date of birth in ISO format YYYY-MM-DD if mentioned, else empty string.",
        "gender": "Patient's gender if mentioned, else empty string.",
        "phone": "Phone number if mentioned, else empty string.",
        "address": "Home address if mentioned, else empty string.",
        "primaryDiagnosis": "Primary diagnosis or chief complaint if mentioned, else empty string.",
        "medications": "Current medications as a comma-separated list if mentioned, else empty string.",
        "allergies": "Known allergies if mentioned, else empty string.",
        "phqInterest": "PHQ item: interest/pleasure. Score 0-3 or empty string if not assessable.",
        "phqMood": "PHQ item: depressed/hopeless mood. Score 0-3 or empty string.",
        "phqSleep": "PHQ item: sleep trouble. Score 0-3 or empty string.",
        "phqEnergy": "PHQ item: fatigue/low energy. Score 0-3 or empty string.",
        "phqAppetite": "PHQ item: appetite change. Score 0-3 or empty string.",
        "phqSelfWorth": "PHQ item: feeling worthless/failure. Score 0-3 or empty string.",
        "phqConcentration": "PHQ item: concentration difficulty. Score 0-3 or empty string.",
        "phqPsychomotor": "PHQ item: psychomotor change. Score 0-3 or empty string.",
        "phqSelfHarm": "PHQ item: self-harm thoughts. Score 0-3 or empty string.",
        "phqDifficulty": "PHQ difficulty item. One of: Not difficult at all, Somewhat difficult, Very difficult, Extremely difficult. Empty string if not assessable.",
    }

    system_prompt = (
        "You are a clinical data extraction assistant. "
        "Given a patient encounter transcript and clinical note, extract known structured profile fields. "
        "Return ONLY a flat JSON object with the keys listed in the schema. "
        "Set a field to an empty string if the information was not stated or indicated in the encounter. "
        "Do not invent specific facts (names, dates, exact numbers) that have no basis in the conversation. "
        "For PHQ symptom fields (described 'Score 0-3'), INFER the score from how the patient describes "
        "that symptom even if it was not asked formally: 'not at all'/denies → 0; 'a few/several days'/"
        "'sometimes' → 1; 'more than half the days'/'often' → 2; 'nearly every day'/'almost always' → 3; "
        "empty string only if the patient gave no indication about that symptom. "
        "These values are saved as 'suggested' and reviewed/confirmed by the clinician before use. "
        "Return raw JSON, no markdown fences."
    )

    schema_desc = "\n".join(f"- {k}: {v}" for k, v in PROFILE_FIELD_SCHEMA.items())
    user_prompt = (
        f"SCHEMA:\n{schema_desc}\n\n"
        f"TRANSCRIPT:\n{transcript[:6000]}\n\n"
        f"CLINICAL NOTE:\n{note[:3000]}\n\n"
        "Extract and return the JSON profile object."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Strict structured output: every profile key is a string, empty if unknown.
    # complete_structured uses the provider's native schema enforcement (OpenAI
    # json_schema / Gemini responseSchema) so the result is always valid JSON.
    # Use DEFAULT_NOTE_GENERATION_MODEL so the model matches the configured
    # service (a hardcoded OpenAI name like "gpt-4o-mini" 404s on Gemini).
    response_schema = {
        "type": "object",
        "properties": {key: {"type": "string"} for key in PROFILE_FIELD_SCHEMA},
        "required": list(PROFILE_FIELD_SCHEMA.keys()),
    }
    service = generative_ai_services[0]
    output = service.complete_structured(
        settings.DEFAULT_NOTE_GENERATION_MODEL, messages, response_schema
    )
    raw = output.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    extracted: dict = json.loads(raw)
    now = datetime.now(timezone.utc).astimezone()

    for field_key, value in extracted.items():
        if not isinstance(value, str) or not value.strip():
            continue  # skip empty / null fields

        # Supersede-with-history: mark previous current rows for this key as non-current
        database.execute(
            db.PatientProfileField.__table__.update()
            .where(
                db.PatientProfileField.patient_id == patient.id,
                db.PatientProfileField.field_key == field_key,
                db.PatientProfileField.is_current.is_(True),
            )
            .values(is_current=False)
        )

        new_field = db.PatientProfileField(
            id=db.next_sqid(database),
            patient_id=patient.id,
            field_key=field_key,
            value=value.strip(),
            provenance="suggested",
            source_encounter_id=encounter_id,
            is_current=True,
            updated=now,
        )
        database.add(new_field)

    database.commit()


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


# =============================================================================
# PATIENT MANAGEMENT — API Endpoints (tasks 2.1–2.5, 3.4, 3.5)
# =============================================================================

class PatientOut(BaseModel):
    id: str
    name: str
    dob: str | None = None
    credibleClientId: str | None = None
    created: str
    modified: str


class PatientCreate(BaseModel):
    name: str
    dob: str | None = None
    credibleClientId: str | None = None


class PatientUpdate(BaseModel):
    name: str | None = None
    dob: str | None = None
    credibleClientId: str | None = None


class ProfileFieldOut(BaseModel):
    id: str
    fieldKey: str
    value: str
    provenance: str
    sourceEncounterId: str | None = None
    confirmedBy: str | None = None
    updated: str
    isCurrent: bool
    history: list["ProfileFieldOut"] = []


ProfileFieldOut.model_rebuild()


class PatientProfileOut(BaseModel):
    patientId: str
    fields: list[ProfileFieldOut]


def _patient_out(p: db.Patient) -> PatientOut:
    return PatientOut(
        id=p.id,
        name=p.name,
        dob=p.dob,
        credibleClientId=p.credible_client_id,
        created=p.created.isoformat(),
        modified=p.modified.isoformat(),
    )


def _field_out(f: db.PatientProfileField, history: list[db.PatientProfileField] | None = None) -> ProfileFieldOut:
    return ProfileFieldOut(
        id=f.id,
        fieldKey=f.field_key,
        value=f.value,
        provenance=f.provenance,
        sourceEncounterId=f.source_encounter_id,
        confirmedBy=f.confirmed_by,
        updated=f.updated.isoformat(),
        isCurrent=f.is_current,
        history=[_field_out(h) for h in (history or [])],
    )


@router.post("/patients", status_code=201)
async def create_patient(
    request: PatientCreate,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> PatientOut:
    _ensure_user(database, session.username)
    now = datetime.now(timezone.utc).astimezone()
    pid = db.next_sqid(database)
    patient = db.Patient(
        id=pid,
        username=session.username,
        name=request.name,
        dob=request.dob,
        credible_client_id=request.credibleClientId,
        created=now,
        modified=now,
    )
    database.add(patient)
    database.commit()
    return _patient_out(patient)


@router.patch("/patients/{patient_id}")
async def update_patient(
    patient_id: str,
    request: PatientUpdate,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> PatientOut:
    patient = database.execute(
        select(db.Patient).where(
            db.Patient.id == patient_id,
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if request.name is not None:
        patient.name = request.name
    if request.dob is not None:
        patient.dob = request.dob
    if request.credibleClientId is not None:
        patient.credible_client_id = request.credibleClientId
    patient.modified = datetime.now(timezone.utc).astimezone()
    database.commit()
    return _patient_out(patient)


@router.get("/patients/search")
async def search_patients(
    q: str = Query(""),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> list[PatientOut]:
    from sqlalchemy import or_
    query = (
        select(db.Patient)
        .where(
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
        .order_by(db.Patient.modified.desc())
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                db.Patient.name.ilike(pattern),
                db.Patient.credible_client_id.ilike(pattern),
            )
        )
    patients = database.execute(query).scalars().all()
    return [_patient_out(p) for p in patients]


@router.get("/patients/{patient_id}")
async def get_patient(
    patient_id: str,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> PatientOut:
    patient = database.execute(
        select(db.Patient).where(
            db.Patient.id == patient_id,
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return _patient_out(patient)


@router.get("/patients/{patient_id}/profile")
async def get_patient_profile(
    patient_id: str,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> PatientProfileOut:
    patient = database.execute(
        select(db.Patient).where(
            db.Patient.id == patient_id,
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # All field rows for this patient, sorted newest first
    all_rows = database.execute(
        select(db.PatientProfileField)
        .where(db.PatientProfileField.patient_id == patient_id)
        .order_by(db.PatientProfileField.updated.desc())
    ).scalars().all()

    # Group into current + history per field_key
    current_by_key: dict[str, db.PatientProfileField] = {}
    history_by_key: dict[str, list[db.PatientProfileField]] = {}
    for row in all_rows:
        if row.is_current:
            current_by_key[row.field_key] = row
        else:
            history_by_key.setdefault(row.field_key, []).append(row)

    fields = [
        _field_out(f, history_by_key.get(f.field_key, []))
        for f in current_by_key.values()
    ]
    return PatientProfileOut(patientId=patient_id, fields=fields)


@router.post("/patients/{patient_id}/profile/{field_key}/confirm")
async def confirm_profile_field(
    patient_id: str,
    field_key: str,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> ProfileFieldOut:
    patient = database.execute(
        select(db.Patient).where(
            db.Patient.id == patient_id,
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    field = database.execute(
        select(db.PatientProfileField).where(
            db.PatientProfileField.patient_id == patient_id,
            db.PatientProfileField.field_key == field_key,
            db.PatientProfileField.is_current.is_(True),
        )
    ).scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Profile field not found")

    field.provenance = "confirmed"
    field.confirmed_by = session.username
    field.updated = datetime.now(timezone.utc).astimezone()
    database.commit()
    return _field_out(field)


@router.get("/patients/{patient_id}/encounters")
async def get_patient_encounters(
    patient_id: str,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> list[ExtEncounter]:
    from sqlalchemy.orm import selectinload
    patient = database.execute(
        select(db.Patient).where(
            db.Patient.id == patient_id,
            db.Patient.username == session.username,
            db.Patient.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    rows = database.execute(
        select(db.Encounter)
        .where(
            db.Encounter.patient_id == patient_id,
            db.Encounter.inactivated.is_(None),
        )
        .order_by(db.Encounter.created.desc())
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
        status = "generated" if note else ("transcribed" if transcript else "pending")
        result.append(ExtEncounter(
            id=enc.id,
            clientName=enc.label or enc.autolabel or "Current Session",
            date=enc.created.isoformat(),
            status=status,
            transcript=transcript,
            generatedNote=note,
        ))
    return result


@router.patch("/encounters/{encounter_id}/patient")
async def assign_encounter_patient(
    encounter_id: str,
    patient_id: str | None = Body(None),
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session),
) -> dict:
    enc = database.execute(
        select(db.Encounter).where(
            db.Encounter.id == encounter_id,
            db.Encounter.username == session.username,
            db.Encounter.inactivated.is_(None),
        )
    ).scalar_one_or_none()
    if not enc:
        raise HTTPException(status_code=404, detail="Encounter not found")

    if patient_id is not None:
        validated = _validate_patient_ownership(database, patient_id, session.username)
        if not validated:
            raise HTTPException(status_code=404, detail="Patient not found")
        enc.patient_id = validated
    else:
        enc.patient_id = None

    enc.modified = datetime.now(timezone.utc).astimezone()
    database.commit()
    return {"encounterId": encounter_id, "patientId": enc.patient_id}
