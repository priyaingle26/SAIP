// ─── Shared Types for SAIP Extension ────────────────────────────────────────

export interface SaipUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

export interface Encounter {
  id: string;
  clientName: string;
  date: string;
  status: 'pending' | 'transcribed' | 'generated' | 'autofilled';
  audioUrl?: string;
  transcript?: string;
  generatedNote?: ClinicalNote;
}

export interface ClinicalNote {
  raw?: string;
  // Legacy SOAP fields (optional for MVP)
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  chiefComplaint?: string;
  mentalStatusExam?: string;
  riskAssessment?: string;
  interventions?: string;
  goals?: string;
}

export interface FormField {
  selector: string;
  value: string;
  label?: string;
}

export interface AutofillPayload {
  encounterId: string;
  fields: FormField[];
}

// ─── Message Types (Background ↔ Side Panel ↔ Content Script) ───────────────

export type MessageType =
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'AUDIO_READY'
  | 'TRANSCRIBE_REQUEST'
  | 'TRANSCRIBE_COMPLETE'
  | 'GENERATE_REQUEST'
  | 'GENERATE_COMPLETE'
  | 'AUTOFILL_REQUEST'
  | 'AUTOFILL_COMPLETE'
  | 'AUTOFILL_FORM_REQUEST'
  | 'AUTOFILL_FORM_COMPLETE'
  | 'DETECT_FORM_REQUEST'
  | 'FORM_DETECTED'
  | 'AUTH_REQUEST'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'ERROR';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
  error?: string;
}

export interface RecordingState {
  isRecording: boolean;
  startTime?: number;
  encounterId?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TranscribeResponse {
  encounterId: string;
  transcript: string;
  duration: number;
}

export interface GenerateResponse {
  encounterId: string;
  note: ClinicalNote;
}

// ─── Form Assistant Types ────────────────────────────────────────────────────

export interface DetectedForm {
  formType: string;
  confidence: number; // 0–1
}

export interface FormAnswersRequest {
  formType: string;
  formContext: string;   // document.body.innerText captured by content script
  transcript: string;
  clinicalNote: string;
}

export interface FormAnswersResponse {
  formType: string;
  confidence: number;
  fields: Record<string, string>;
}
