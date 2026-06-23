// Resumable sync queue (offline-durable-capture).
//
// Drains durably-stored chunks to the backend in seq order with retry + exponential
// backoff. A single upload failure NEVER permanently disables uploads — the chunk just
// stays pending for the next drain (on persist while online, on `online`, or on a
// chrome.alarms heartbeat). When a session is marked pending-finalize and all its chunks
// are uploaded, the registered finalize callback runs; the session is deleted from the
// durable store only after finalize succeeds.

import {
  listActiveSessions,
  getPendingChunks,
  markUploaded,
  countPending,
  deleteSession,
  type SessionMeta,
} from './durableStore';
import { uploadChunk, getSessionReceivedSeqs } from './apiClient';

// Called when a session's audio is fully uploaded and it is ready to finalize.
// Returns true on success (durable session is then deleted), false to retry later.
export type FinalizeHandler = (meta: SessionMeta) => Promise<boolean>;

let finalizeHandler: FinalizeHandler | null = null;
let draining = false;
let rerun = false;

export function setFinalizeHandler(handler: FinalizeHandler): void {
  finalizeHandler = handler;
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Upload all pending chunks for one session; returns true if none remain afterwards. */
async function drainSession(meta: SessionMeta): Promise<boolean> {
  // Skip chunks the server already holds (resume after an interruption without re-sending).
  const received = await getSessionReceivedSeqs(meta.sessionId);
  const pending = await getPendingChunks(meta.sessionId);

  for (const { seq, blob } of pending) {
    if (received.has(seq)) {
      await markUploaded(meta.sessionId, seq);
      continue;
    }
    let ok = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !ok; attempt++) {
      if (attempt > 0) await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      ok = await uploadChunk(meta.sessionId, seq, blob);
    }
    if (!ok) return false; // offline / server down — leave pending, retry on next drain
    await markUploaded(meta.sessionId, seq);
  }

  return (await countPending(meta.sessionId)) === 0;
}

/**
 * Drain every active session. Coalesces concurrent calls so overlapping triggers
 * (persist + alarm + online) do not run the queue twice in parallel.
 */
export async function drainAll(): Promise<void> {
  if (draining) {
    rerun = true;
    return;
  }
  draining = true;
  try {
    do {
      rerun = false;
      const sessions = await listActiveSessions();
      for (const meta of sessions) {
        const fullyUploaded = await drainSession(meta);
        if (!fullyUploaded) continue;
        if (meta.status === 'pending-finalize' && finalizeHandler) {
          const done = await finalizeHandler(meta);
          if (done) await deleteSession(meta.sessionId);
        }
      }
    } while (rerun);
  } finally {
    draining = false;
  }
}
