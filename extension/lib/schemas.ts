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
  | 'ERROR'
  // Live streaming
  | 'STREAM_START'
  | 'STREAM_DELTA'
  | 'STREAM_COMPLETED'
  | 'STREAM_FINALIZED'
  | 'STREAM_ERROR';

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
  /** Present when the current page is inside a multi-page evaluation bundle. */
  fvid?: string;
  /** Bundle id (e.g. 'psych-eval' | 'em-ept') derived from fvid, if recognized. */
  bundle?: string;
}

export interface FormAnswersRequest {
  formType: string;
  formContext: string;   // document.body.innerText captured by content script
  transcript: string;
  clinicalNote: string;
  encounterId?: string;
}

export interface FormAnswersResponse {
  formType: string;
  confidence: number;
  fields: Record<string, string>;
}

// ─── Evaluation bundle types (Psych Eval, E&M EPT — design.md D7) ────────────

export interface EvaluationAnswersRequest {
  bundleId: string;
  formContext: string;
  transcript: string;
  clinicalNote: string;
  encounterId?: string;
  visitId?: string;
}

export interface EvaluationAnswersResponse {
  bundleId: string;
  fields: Record<string, string>;
}

/** Cached bundle generation result, keyed by fvid in chrome.storage.local. */
export interface EvaluationCacheEntry {
  bundleId: string;
  fields: Record<string, string>;
  generatedAt: number;
}

// ─── Observability (design.md D8) ────────────────────────────────────────────

/** Runtime record of one autofill run, persisted for live debugging. */
export interface FillLogEntry {
  formType: string;
  filled: number;
  missed: string[];
  manualRequired: string[];
  labelsSeen: string[];
  frameUrl: string;
  ts: number;
  confidence?: number;
}

// ─── Live Streaming Transcription ────────────────────────────────────────────

/** One labeled speaker turn returned by the finalize endpoint. */
export interface TranscriptTurn {
  speaker: string;
  text: string;
}

/** Messages sent from the backend WS to the extension during streaming. */
export type StreamingEvent =
  | { type: 'delta'; text: string }
  | { type: 'completed'; text: string }
  | { type: 'error'; message: string };

/** Extension message types added for live streaming. */
export type StreamingMessageType =
  | 'STREAM_START'
  | 'STREAM_STOP'
  | 'STREAM_PCM_FRAME'
  | 'STREAM_DELTA'
  | 'STREAM_COMPLETED'
  | 'STREAM_ERROR'
  | 'STREAM_FINALIZED';

/** Payload sent when streaming finishes and the encounter is persisted. */
export interface StreamFinalizedPayload {
  encounterId: string;
  transcript: string;
  turns: TranscriptTurn[];
}

/** Payload for live caption updates forwarded to the side panel. */
export interface StreamCaptionPayload {
  /** Incremental word(s) from a delta event. */
  delta?: string;
  /** Full committed text from a completed-utterance event. */
  completed?: string;
}
