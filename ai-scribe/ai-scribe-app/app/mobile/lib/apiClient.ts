// Mobile PWA API client for the durable chunked-upload + finalize flow.
//
// Reuses the SAME backend endpoints as the Chrome extension:
//   POST   /transcribe-chunk?session_id&seq      (binary chunk upload, idempotent)
//   GET    /transcribe-session-status?session_id  (which seqs the server already holds)
//   POST   /transcribe-finalize                   (assemble + re-transcribe + generate)
//   DELETE /transcribe-session?session_id         (discard not-yet-finalized server chunks)
//   DELETE /ext-encounters/{id}                   (delete a finalized encounter + recording)

function getApiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function getToken(): string | null {
  try {
    return localStorage.getItem('saip_ext_token');
  } catch {
    return null;
  }
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface FinalizeResponse {
  encounterId: string;
  transcript: string;
  turns?: Array<{ speaker: string; text: string }>;
}

/** Upload one durable audio chunk (binary). Idempotent on the server for repeated (session, seq). */
export async function uploadChunk(sessionId: string, seq: number, chunk: Blob): Promise<boolean> {
  try {
    const url = getApiUrl(
      `/transcribe-chunk?session_id=${encodeURIComponent(sessionId)}&seq=${seq}`,
    );
    const res = await fetch(url, { method: 'POST', headers: authHeader(), body: chunk });
    return res.ok;
  } catch {
    return false;
  }
}

/** Which seq values the server already holds — lets the client resume without re-uploading. */
export async function getSessionReceivedSeqs(sessionId: string): Promise<Set<number>> {
  try {
    const url = getApiUrl(`/transcribe-session-status?session_id=${encodeURIComponent(sessionId)}`);
    const res = await fetch(url, { headers: authHeader() });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set<number>(Array.isArray(data?.received) ? data.received : []);
  } catch {
    return new Set();
  }
}

/** Finalize a fully-uploaded session: assemble chunks server-side, re-transcribe, return transcript. */
export async function finalizeSession(
  sessionId: string,
  transcript: string,
  patientId?: string,
  retranscribe = true,
): Promise<{ ok: boolean; data?: FinalizeResponse }> {
  try {
    const form = new FormData();
    form.append('transcript', transcript);
    form.append('session_id', sessionId);
    if (patientId) form.append('patient_id', patientId);
    if (retranscribe) form.append('retranscribe', 'true');
    const res = await fetch(getApiUrl('/transcribe-finalize'), {
      method: 'POST',
      headers: authHeader(),
      body: form,
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

/** Generate a clinical note from a transcript. */
export async function generateNote(
  encounterId: string,
  transcript: string,
  patientId?: string,
): Promise<{ ok: boolean; data?: { note: { raw: string }; encounterId: string; notesByLanguage?: Record<string, string>; primaryLanguage?: string } }> {
  try {
    const res = await fetch(getApiUrl('/generate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ encounter_id: encounterId, transcript, patient_id: patientId }),
    });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

/** Delete server-side chunks for a not-yet-finalized session (discard). Idempotent. */
export async function deleteServerSession(sessionId: string): Promise<boolean> {
  try {
    const url = getApiUrl(`/transcribe-session?session_id=${encodeURIComponent(sessionId)}`);
    const res = await fetch(url, { method: 'DELETE', headers: authHeader() });
    return res.ok;
  } catch {
    return false;
  }
}

/** Delete a finalized encounter and its stored recording. Idempotent. */
export async function deleteEncounter(encounterId: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl(`/ext-encounters/${encounterId}`), {
      method: 'DELETE',
      headers: authHeader(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
