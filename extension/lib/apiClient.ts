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
} from './schemas';

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
  encounterId?: string
): Promise<ApiResponse<TranscribeResponse>> {
  try {
    const token = await getAuthToken();
    const form = new FormData();
    form.append('audio', audioBlob, 'recording.webm');
    if (encounterId) form.append('encounter_id', encounterId);

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
  transcript: string
): Promise<ApiResponse<GenerateResponse>> {
  try {
    const headers = await authHeaders();
    const res = await fetch(SAIP_ENDPOINTS.generate, {
      method: 'POST',
      headers,
      body: JSON.stringify({ encounter_id: encounterId, transcript }),
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
