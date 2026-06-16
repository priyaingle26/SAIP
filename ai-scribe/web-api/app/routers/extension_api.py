from typing import Annotated
import uuid

from fastapi import APIRouter, UploadFile, Depends, HTTPException, Body, Form
from pydantic import BaseModel
from sqlalchemy import select

import app.config.db as db
import app.schemas as sch
from app.config import settings
from app.security import create_access_token, decode_token, WebAPISession
from app.tasks.transcription import transcribe_audio
from app.tasks.generation import generate_note

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

# --- AI Endpoints ---

@router.post("/transcribe")
async def extension_transcribe(
    audio: UploadFile,
    encounter_id: str | None = Form(None),
    session: WebAPISession = Depends(get_current_session)
) -> TranscribeResponse:
    if audio.size is None or audio.content_type is None:
        raise HTTPException(status_code=400, detail="Audio file metadata is missing")
        
    encounterId = encounter_id or str(uuid.uuid4())
    
    # Process synchronously
    output = await transcribe_audio(audio.file, audio.filename or "recording.webm", audio.content_type)
    
    return TranscribeResponse(
        encounterId=encounterId,
        transcript=output.transcript
    )

@router.post("/generate")
async def extension_generate(
    request: GenerateRequest,
    session: WebAPISession = Depends(get_current_session),
    database: db.DatabaseSession = Depends(db.get_database_session)
) -> GenerateResponse:
    
        # Fallback default instructions (changed to Full Visit instructions)
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

    
    # Try to fetch the user's customized Berta Scribe NoteDefinition prompt
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
        print(f"Failed to fetch NoteDefinition: {e}")
        pass
    
    output = generate_note(
        model=settings.DEFAULT_NOTE_GENERATION_MODEL,
        instructions=instructions,
        context=None,
        transcript=request.transcript,
        output_type="Markdown"
    )
    
    # Append the same SAIP footer used by the web app
    footer = f"\n\n*\\<\\<Generated in part by SAIP, with patient consent where applicable.\\>\\>*\n*\\<\\<Note ID: ext-{request.encounter_id}\\>\\>*"
    final_text = output.text + footer
    
    return GenerateResponse(
        note=ClinicalNoteOutput(raw=final_text)
    )


# =============================================================================
# FORM ASSISTANT — Generate Form Answers
# =============================================================================

# --- Form Schemas (one per supported Credible form type) ---

FORM_SCHEMAS: dict[str, dict] = {
    "Counseling Progress Note": {
        "modality": "Select one: Individual, Family, or Couple.",
        "participants": "Identify who was present (e.g., Client, or Others with names and relationships to Client).",
        "methodsUsed": "Describe the methods used during the session.",
        "materialsUsed": "Describe the material used during the session.",
        "data": "Subjective and objective information; content of the session, include teaching methods and material used during the session.",
        "assessment": "Assessment of the issue(s), include behavioral observations.",
        "response": "Response of the Person to the intervention, include session progress or lack of progress toward recovery goal(s).",
        "plan": "Plan for the next session, include recommendations/referrals.",
    },
    "ECI Service Delivery Note": {
        "language": "Specify the language (e.g., English).",
        "presentDuringVisit": "Who was present during visit.",
        "ifspOutcomes": "IFSP Outcomes Addressed (specify).",
        "jointPlanningReflection": "What has happened since the last visit and what will we be working on during this visit?",
        "observationPractice": "What did we observe and practice today? What was the feedback provided?",
        "reflectionFeedback": "What will parent/caregiver work on between visits and what is the plan for the next visit?",
        "nextVisitDate": "Next visit is scheduled (Date format, if mentioned).",
    },
    "FAYS SOAP Note": {
        "participants": "",
        "focusOfContact": "",
        "subjective": "",
        "objective": "",
        "assessment": "",
        "plan": "",
    },
    "IDD Case Management Note": {
        "summaryOfVisit": "",
        "servicesProvided": "",
        "clientSatisfaction": "",
        "outcome": "",
        "progress": "",
        "monitoringServices": "",
    },
    "Person Centered Recovery Plan": {
        "strengths": "",
        "barriers": "",
        "goal": "",
        "goalProgress": "",
        "objective": "",
        "objectiveProgress": "",
        "interventions": "",
        "dischargePlan": "",
    },
    "Psych Eval": {
        "presentingProblems": "",
        "familyHistory": "",
        "suicideRisk": "",
        "homicideRisk": "",
        "medicalConditions": "",
        "reviewOfSystems": "",
        "substanceUse": "",
        "traumaHistory": "",
        "relationships": "",
        "mentalStatusComments": "",
        "medications": "",
        "treatmentPlan": "",
        "referrals": "",
    },
    "Psychosocial Rehab Note": {
        "modality": "",
        "participants": "",
        "methodsUsed": "",
        "materialsUsed": "",
        "behaviorRelatedToRecovery": "",
        "servicesProvided": "",
        "progressTowardGoals": "",
        "nextSessionPlan": "",
        "currentDiagnosis": "",
    },
    "Skills Training Note": {
        "modality": "",
        "participants": "",
        "methodsUsed": "",
        "materialsUsed": "",
        "behaviorRelatedToRecovery": "",
        "servicesProvided": "",
        "progressTowardGoals": "",
        "nextSessionPlan": "",
        "currentDiagnosis": "",
    },
    "E&M EPT": {
        "chiefComplaint": "",
        "historyPresentIllness": "",
        "suicideRisk": "",
        "medicalConditions": "",
        "reviewOfSystems": "",
        "mentalStatusComments": "",
        "substanceUse": "",
        "medications": "",
        "plan": "",
        "treatmentComments": "",
    },
}

# --- Request / Response Models ---

class FormAnswersRequest(BaseModel):
    formType: str
    formContext: str = ""
    transcript: str
    clinicalNote: str


class FormAnswersResponse(BaseModel):
    formType: str
    confidence: float
    fields: dict


# --- Endpoint ---

@router.post("/generate-form-answers")
async def extension_generate_form_answers(
    request: FormAnswersRequest,
    session: WebAPISession = Depends(get_current_session),
) -> FormAnswersResponse:
    schema = FORM_SCHEMAS.get(request.formType)
    if schema is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown form type: {request.formType}. "
                   f"Supported: {list(FORM_SCHEMAS.keys())}",
        )

    schema_json = str(schema)

    system_prompt = (
        "You are an expert behavioral health clinical documentation assistant.\n"
        "Your task is to generate structured answers for a specific Credible EHR form.\n"
        "Use the transcript as the primary source of truth.\n"
        "Use the clinical note as a clinician-reviewed summary.\n"
        "Use the form context (raw page text) to understand the exact field labels on the form.\n"
        "Never invent information. If information is missing, return an empty string.\n"
        "Return ONLY valid JSON. Return EVERY field defined in the schema.\n"
        "Do not return markdown. Do not return explanations."
    )

    user_prompt = (
        f"FORM TYPE:\n{request.formType}\n\n"
        f"FORM CONTEXT (raw page text):\n{request.formContext[:4000]}\n\n"
        f"TRANSCRIPT:\n{request.transcript}\n\n"
        f"CLINICAL NOTE:\n{request.clinicalNote}\n\n"
        f"SCHEMA:\n{schema_json}\n\n"
        "Generate the completed JSON."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    import json as _json
    from app.config.ai import generative_ai_services

    service = next(iter(generative_ai_services), None)
    if service is None:
        raise HTTPException(status_code=503, detail="No generative AI service available")

    try:
        output = service.complete(settings.DEFAULT_NOTE_GENERATION_MODEL, messages)
        raw_text = output.text.strip()

        # Strip markdown code fences if the model wrapped in ```json ... ```
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
            raw_text = raw_text.strip()

        fields = _json.loads(raw_text)
    except _json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI returned invalid JSON: {e}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {e}")

    return FormAnswersResponse(
        formType=request.formType,
        confidence=1.0,  # detection confidence comes from the frontend
        fields=fields,
    )
