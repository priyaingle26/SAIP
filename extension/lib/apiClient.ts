import { SAIP_ENDPOINTS } from './constants';
import { getAuthToken } from './auth';
import type {
  Encounter,
  TranscribeResponse,
  GenerateResponse,
  FormAnswersRequest,
  FormAnswersResponse,
  EvaluationAnswersRequest,
  EvaluationAnswersResponse,
  ApiResponse,
  FillLogEntry,
  TranscriptTurn,
  Patient,
  PatientProfile,
  ProfileField,
} from './schemas';

export interface FinalizeStreamResponse {
  encounterId: string;
  transcript: string;
  turns: TranscriptTurn[];
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Upload audio blob and trigger transcription ─────────────────────────────
export async function transcribeAudio(
  audioBlob: Blob,
  encounterId?: string,
  patientId?: string,
): Promise<ApiResponse<TranscribeResponse>> {
  try {
    const token = await getAuthToken();
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    if (encounterId) form.append('encounter_id', encounterId);
    if (patientId) form.append('patient_id', patientId);

    const res = await fetch(SAIP_ENDPOINTS.transcribe, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Generate clinical note from transcript ───────────────────────────────────
export async function generateNote(
  encounterId: string,
  transcript: string,
  patientId?: string,
): Promise<ApiResponse<GenerateResponse>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.generate, {
      method: 'POST',
      headers,
      body: JSON.stringify({ encounter_id: encounterId, transcript, patient_id: patientId }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Fetch encounter list (extension-format) ──────────────────────────────────
export async function fetchEncounters(): Promise<ApiResponse<Encounter[]>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.encounters, { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Fetch single encounter ───────────────────────────────────────────────────
export async function fetchEncounter(
  id: string
): Promise<ApiResponse<Encounter>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.encounter(id), { headers });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Generate form answers from transcript + clinical note ────────────────────
export async function generateFormAnswers(
  req: FormAnswersRequest
): Promise<ApiResponse<FormAnswersResponse>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.generateFormAnswers, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Fetch persisted form answers for an encounter + form type ────────────────
export async function fetchFormAnswers(
  encounterId: string,
  formType: string
): Promise<ApiResponse<Record<string, string>>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.formAnswers(encounterId, formType), { headers });
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'not_found' };
      throw new Error(await res.text());
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Generate evaluation-bundle answers (one call covers every sub-page) ─────
export async function generateEvaluation(
  req: EvaluationAnswersRequest
): Promise<ApiResponse<EvaluationAnswersResponse>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.generateEvaluation, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Fetch cached evaluation bundle from backend ──────────────────────────────
export async function fetchEvalCache(
  encounterId: string,
  bundleId: string
): Promise<ApiResponse<Record<string, string>>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.evalCache(encounterId, bundleId), { headers });
    if (!res.ok) {
      if (res.status === 404) return { success: false, error: 'not_found' };
      throw new Error(await res.text());
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Check whether the backend has Realtime streaming configured ─────────────
export async function checkStreamingStatus(): Promise<boolean> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.streamingStatus, { headers });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.available === true;
  } catch {
    return false;
  }
}

// ─── Finalize a streaming session ─────────────────────────────────────────────
// Preferred path: send sessionId (audio already uploaded as chunks).
// Fallback path: send audioBlob (legacy single-blob upload).
export async function finalizeStream(
  audioOrSessionId: Blob | string,
  transcript: string,
  encounterId?: string,
  patientId?: string,
  retranscribe = false,
): Promise<ApiResponse<FinalizeStreamResponse>> {
  try {
    const token = await getAuthToken();
    const form = new FormData();
    form.append('transcript', transcript);
    if (typeof audioOrSessionId === 'string') {
      // Chunked-upload path: reference pre-uploaded audio by session id
      form.append('session_id', audioOrSessionId);
    } else {
      // Legacy blob path: attach full audio file
      form.append('audio', audioOrSessionId, 'recording.webm');
    }
    if (encounterId) form.append('encounter_id', encounterId);
    if (patientId) form.append('patient_id', patientId);
    // When set, the backend re-transcribes the assembled audio with the configured
    // service instead of trusting the streamed transcript (offline/batch + A/B testing).
    if (retranscribe) form.append('retranscribe', 'true');

    const res = await fetch(SAIP_ENDPOINTS.transcribeFinalize, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Upload one durable audio chunk (binary) ─────────────────────────────────
// Idempotent on the server for a repeated (session_id, seq), so retries are safe.
export async function uploadChunk(
  sessionId: string,
  seq: number,
  chunk: Blob,
): Promise<boolean> {
  try {
    const token = await getAuthToken();
    const res = await fetch(SAIP_ENDPOINTS.transcribeChunk(sessionId, seq), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: chunk,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Which seq values the server already holds for a session ──────────────────
// Lets the client resume after an interruption without re-uploading received chunks.
export async function getSessionReceivedSeqs(sessionId: string): Promise<Set<number>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.transcribeSessionStatus(sessionId), { headers });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set<number>(Array.isArray(data?.received) ? data.received : []);
  } catch {
    return new Set();
  }
}

// ─── Get a short-lived single-use ticket for the transcription WebSocket ─────
// Keeps the long-lived bearer token out of WS URLs / server access logs.
export async function getStreamTicket(): Promise<string | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.streamTicket, { method: 'POST', headers });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.ticket as string) ?? null;
  } catch {
    return null;
  }
}

// ─── Patient management ───────────────────────────────────────────────────────

export async function searchPatients(q: string): Promise<ApiResponse<Patient[]>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.patientsSearch(q), { headers });
    if (!res.ok) throw new Error(await res.text());
    return { success: true, data: await res.json() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function createPatient(
  name: string,
  dob?: string,
  credibleClientId?: string,
): Promise<ApiResponse<Patient>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.patients, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, dob, credibleClientId }),
    });
    if (!res.ok) throw new Error(await res.text());
    return { success: true, data: await res.json() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getPatient(patientId: string): Promise<ApiResponse<Patient>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.patient(patientId), { headers });
    if (!res.ok) throw new Error(await res.text());
    return { success: true, data: await res.json() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function fetchPatientProfile(patientId: string): Promise<ApiResponse<PatientProfile>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.patientProfile(patientId), { headers });
    if (!res.ok) throw new Error(await res.text());
    return { success: true, data: await res.json() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function confirmProfileField(
  patientId: string,
  fieldKey: string,
): Promise<ApiResponse<ProfileField>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.confirmProfileField(patientId, fieldKey), {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    return { success: true, data: await res.json() };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Delete server-side chunks for a not-yet-finalized session ───────────────
export async function deleteServerSession(sessionId: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    const res = await fetch(SAIP_ENDPOINTS.deleteSession(sessionId), {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Delete a finalized encounter and its stored recording ────────────────────
export async function deleteEncounter(encounterId: string): Promise<boolean> {
  try {
    const token = await getAuthToken();
    const res = await fetch(SAIP_ENDPOINTS.deleteEncounter(encounterId), {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Post an autofill audit entry ────────────────────────────────────────────
export async function postAutofillAudit(
  encounterId: string | undefined,
  entry: FillLogEntry
): Promise<ApiResponse<void>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.autofillAudit, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        encounterId,
        formType: entry.formType,
        frameUrl: entry.frameUrl,
        confidence: entry.confidence ?? 1.0,
        filled: entry.filled,
        missed: entry.missed.length,
        manualRequired: entry.manualRequired.length,
        detail: {
          filledLabels: entry.filled > 0 ? entry.labelsSeen.slice(0, entry.filled) : [],
          missed: entry.missed,
          manual: entry.manualRequired,
        },
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
