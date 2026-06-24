// Resumable sync queue for the mobile PWA.
//
// Ported from the Chrome extension. Drains durably-stored chunks to the backend in seq order
// with retry + backoff, finalizes a fully-uploaded session via the registered handler, and
// drains deletion tombstones (offline-delete reconcile). Safe to run from either the page or
// the service worker (Background Sync) — both share the same IndexedDB.

import {
  listActiveSessions,
  getPendingSeqs,
  getChunkBlob,
  markUploaded,
  countPending,
  deleteSession,
  getSyncSummary,
  listDeletionTombstones,
  clearDeletionTombstone,
  hasDeletionTombstone,
  type SessionMeta,
  type SyncSummary,
} from './durableStore';
import {
  uploadChunk,
  getSessionReceivedSeqs,
  deleteServerSession,
  deleteEncounter,
} from './apiClient';

export type FinalizeHandler = (meta: SessionMeta) => Promise<boolean>;
export type StatusReporter = (summary: SyncSummary, syncing: boolean) => void;

let finalizeHandler: FinalizeHandler | null = null;
let statusReporter: StatusReporter | null = null;
let draining = false;
let rerun = false;

export function setFinalizeHandler(handler: FinalizeHandler): void {
  finalizeHandler = handler;
}

export function setStatusReporter(reporter: StatusReporter): void {
  statusReporter = reporter;
}

async function reportStatus(syncing: boolean): Promise<void> {
  if (!statusReporter) return;
  try {
    statusReporter(await getSyncSummary(), syncing);
  } catch {
    /* ignore */
  }
}

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function drainSession(meta: SessionMeta): Promise<boolean> {
  const received = await getSessionReceivedSeqs(meta.sessionId);
  const seqs = await getPendingSeqs(meta.sessionId);

  for (const seq of seqs) {
    if (received.has(seq)) {
      await markUploaded(meta.sessionId, seq);
      continue;
    }
    const blob = await getChunkBlob(meta.sessionId, seq);
    if (!blob) continue;
    let ok = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !ok; attempt++) {
      if (attempt > 0) await delay(BASE_DELAY_MS * 2 ** (attempt - 1));
      ok = await uploadChunk(meta.sessionId, seq, blob);
    }
    if (!ok) return false; // offline / server down — retry next drain
    await markUploaded(meta.sessionId, seq);
  }

  return (await countPending(meta.sessionId)) === 0;
}

export async function drainAll(): Promise<void> {
  if (draining) {
    rerun = true;
    return;
  }
  draining = true;
  await reportStatus(true);
  try {
    do {
      rerun = false;
      const sessions = await listActiveSessions();
      for (const meta of sessions) {
        // Delete-wins: skip sessions with a pending deletion tombstone.
        if (await hasDeletionTombstone(meta.sessionId, 'session')) continue;
        const fullyUploaded = await drainSession(meta);
        await reportStatus(true);
        if (!fullyUploaded) continue;
        if (meta.status === 'pending-finalize' && finalizeHandler) {
          const done = await finalizeHandler(meta);
          if (done) await deleteSession(meta.sessionId);
        }
      }
      await drainTombstones();
    } while (rerun);
  } finally {
    draining = false;
    await reportStatus(false);
  }
}

/** Issue server-side deletes for any tombstones written while offline. */
async function drainTombstones(): Promise<void> {
  const tombstones = await listDeletionTombstones();
  for (const t of tombstones) {
    const ok = t.kind === 'session' ? await deleteServerSession(t.id) : await deleteEncounter(t.id);
    if (ok) await clearDeletionTombstone(t.id, t.kind);
  }
}
