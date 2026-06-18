// Patient management API client — calls the extension API backend (port 8000).
// Uses the same JWT token stored by the extension.

const EXTENSION_API_BASE =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_EXTENSION_API_URL ?? 'http://localhost:8000')
    : 'http://localhost:8000';

export interface Patient {
  id: string;
  name: string;
  dob?: string;
  credibleClientId?: string;
  created: string;
  modified: string;
}

export interface ProfileField {
  id: string;
  fieldKey: string;
  value: string;
  provenance: 'suggested' | 'confirmed';
  sourceEncounterId?: string;
  confirmedBy?: string;
  updated: string;
  isCurrent: boolean;
  history: ProfileField[];
}

export interface PatientProfile {
  patientId: string;
  fields: ProfileField[];
}

function getToken(): string | null {
  try {
    return localStorage.getItem('saip_auth_token');
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiCall<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${EXTENSION_API_BASE}${path}`, {
    method,
    headers: authHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const patientsApi = {
  create: (name: string, dob?: string, credibleClientId?: string) =>
    apiCall<Patient>('POST', '/patients', { name, dob, credibleClientId }),

  update: (id: string, patch: Partial<Pick<Patient, 'name' | 'dob' | 'credibleClientId'>>) =>
    apiCall<Patient>('PATCH', `/patients/${id}`, patch),

  get: (id: string) => apiCall<Patient>('GET', `/patients/${id}`),

  search: (q: string) =>
    apiCall<Patient[]>('GET', `/patients/search?q=${encodeURIComponent(q)}`),

  getProfile: (id: string) => apiCall<PatientProfile>('GET', `/patients/${id}/profile`),

  confirmField: (patientId: string, fieldKey: string) =>
    apiCall<ProfileField>('POST', `/patients/${patientId}/profile/${encodeURIComponent(fieldKey)}/confirm`),

  getEncounters: (id: string) =>
    apiCall<unknown[]>('GET', `/patients/${id}/encounters`),
};
