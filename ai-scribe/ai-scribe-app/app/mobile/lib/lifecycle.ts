// Mobile recording lifecycle helpers: abandoned-recording recovery, state restoration,
// and service-worker registration. Used on app launch and when the page regains focus.

import {
  listActiveSessions,
  setSessionMeta,
  type SessionMeta,
} from './durableStore';

// A `recording` session with no heartbeat within this window is no longer being captured
// (tab killed, OS suspended and never resumed) and is safe to finalize from its durable audio.
const RECORDING_ACTIVE_TIMEOUT_MS = 15 * 1000;

export function isRecordingActive(meta: SessionMeta): boolean {
  return (
    meta.status === 'recording' &&
    Date.now() - (meta.updatedAt ?? meta.createdAt) < RECORDING_ACTIVE_TIMEOUT_MS
  );
}

/** The session currently being captured (fresh heartbeat), if any — for UI restoration on reopen. */
export async function getActiveRecordingSession(): Promise<SessionMeta | null> {
  const sessions = await listActiveSessions();
  return sessions.find(isRecordingActive) ?? null;
}

/** Promote any abandoned `recording` session to finalize (re-transcribe its durable audio). */
export async function recoverStaleRecordingSessions(): Promise<boolean> {
  let promoted = false;
  const sessions = await listActiveSessions();
  for (const meta of sessions) {
    if (meta.status !== 'recording' || isRecordingActive(meta)) continue;
    await setSessionMeta({ ...meta, retranscribe: true, status: 'pending-finalize', paused: false });
    promoted = true;
  }
  return promoted;
}

/** Register the Background Sync service worker (Android Chrome). Non-fatal where unsupported. */
export async function registerServiceWorker(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('/saip-sw.js');
    }
  } catch {
    /* SW unavailable — foreground/launch drain still works */
  }
}
