import { SAIP_ENDPOINTS, STORAGE_KEYS } from './constants';
import type { SaipUser } from './schemas';

export async function login(email: string, password: string): Promise<SaipUser> {
  const res = await fetch(SAIP_ENDPOINTS.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  const data = await res.json();
  const user = data.user as SaipUser;
  const token = data.access_token as string;
  await chrome.storage.local.set({
    [STORAGE_KEYS.authToken]: token,
    [STORAGE_KEYS.currentUser]: user,
  });
  return user;
}

export async function logout(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.currentUser,
  ]);
}

export async function getStoredUser(): Promise<SaipUser | null> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.authToken,
    STORAGE_KEYS.currentUser,
  ]);
  if (!result[STORAGE_KEYS.authToken]) return null;
  return (result[STORAGE_KEYS.currentUser] ?? null) as SaipUser | null;
}

export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.authToken);
  return (result[STORAGE_KEYS.authToken] ?? null) as string | null;
}

export async function verifyToken(): Promise<SaipUser | null> {
  const token = await getAuthToken();
  if (!token) return null;
  const res = await fetch(SAIP_ENDPOINTS.me, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user as SaipUser;
}
