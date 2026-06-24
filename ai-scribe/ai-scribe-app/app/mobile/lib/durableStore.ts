// Durable encrypted local audio container for the mobile PWA.
//
// Ported from the Chrome extension (extension/lib/durableStore.ts). Every captured chunk is
// encrypted at rest with WebCrypto AES-GCM and written to IndexedDB BEFORE any upload is
// attempted, so capture never depends on the network and survives a tab crash / reload / OOM /
// storage eviction. The AES-GCM key is generated NON-EXTRACTABLE — raw key material never
// leaves the browser. IndexedDB is shared between the page and the service worker (same origin),
// so the SW Background Sync drain reads the same chunks the page wrote.

const DB_NAME = 'saip-mobile-durable';
const DB_VERSION = 1;
const CHUNKS_STORE = 'chunks';
const META_STORE = 'meta';
const DELETIONS_STORE = 'deletions';
const KEY_ID = 'aesKey';
const IV_BYTES = 12; // 96-bit IV recommended for AES-GCM

export type SessionStatus = 'recording' | 'pending-finalize' | 'done';

export interface SessionMeta {
  sessionId: string;
  mimeType: string;
  patientId?: string;
  /** Streamed transcript if one was produced online; empty when captured offline. */
  transcript?: string;
  /** When true, the server should re-transcribe the assembled audio (always true on mobile). */
  retranscribe?: boolean;
  status: SessionStatus;
  createdAt: number;
  /** Heartbeat: an active OR paused recording keeps this fresh so it is not treated as abandoned. */
  updatedAt?: number;
  /** True while the clinician has paused the recording (e.g. a break). */
  paused?: boolean;
  /** Accumulated ACTIVE recording time (ms), excluding paused spans. Updated on each pause. */
  recordedMs?: number;
  /** Epoch (ms) of the last start/resume. Live elapsed = recordedMs + (now - lastResumedAt). */
  lastResumedAt?: number;
}

interface ChunkRecord {
  sessionId: string;
  seq: number;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  uploaded: 0 | 1;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE, { keyPath: ['sessionId', 'seq'] });
        store.createIndex('by_session', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(DELETIONS_STORE)) {
        db.createObjectStore(DELETIONS_STORE, { keyPath: ['id', 'kind'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ─── Encryption key lifecycle ────────────────────────────────────────────────

let keyPromise: Promise<CryptoKey> | null = null;

async function getKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const existing = await tx<{ key: string; cryptoKey: CryptoKey } | undefined>(
      META_STORE,
      'readonly',
      (s) => s.get(KEY_ID),
    );
    if (existing?.cryptoKey) return existing.cryptoKey;
    const cryptoKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    );
    await tx(META_STORE, 'readwrite', (s) => s.put({ key: KEY_ID, cryptoKey }));
    return cryptoKey;
  })();
  return keyPromise;
}

// ─── Storage persistence ─────────────────────────────────────────────────────

/** Ask the browser to keep our IndexedDB data instead of evicting under pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}

// ─── Chunk operations ────────────────────────────────────────────────────────

export async function putChunk(sessionId: string, seq: number, chunk: Blob): Promise<void> {
  const key = await getKey();
  const plaintext = await chunk.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const record: ChunkRecord = { sessionId, seq, iv: iv.buffer, ciphertext, uploaded: 0 };
  await tx(CHUNKS_STORE, 'readwrite', (s) => s.put(record));
}

function allChunks(sessionId: string): Promise<ChunkRecord[]> {
  return openDb().then(
    (db) =>
      new Promise<ChunkRecord[]>((resolve, reject) => {
        const t = db.transaction(CHUNKS_STORE, 'readonly');
        const index = t.objectStore(CHUNKS_STORE).index('by_session');
        const req = index.getAll(IDBKeyRange.only(sessionId));
        req.onsuccess = () => resolve(req.result as ChunkRecord[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function getPendingSeqs(sessionId: string): Promise<number[]> {
  return (await allChunks(sessionId))
    .filter((r) => r.uploaded === 0)
    .map((r) => r.seq)
    .sort((a, b) => a - b);
}

export async function getChunkBlob(sessionId: string, seq: number): Promise<Blob | null> {
  const rec = await tx<ChunkRecord | undefined>(CHUNKS_STORE, 'readonly', (s) =>
    s.get([sessionId, seq]),
  );
  if (!rec) return null;
  const key = await getKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(rec.iv) },
    key,
    rec.ciphertext,
  );
  return new Blob([plaintext]);
}

export async function countPending(sessionId: string): Promise<number> {
  const records = await allChunks(sessionId);
  return records.filter((r) => r.uploaded === 0).length;
}

export async function markUploaded(sessionId: string, seq: number): Promise<void> {
  const rec = await tx<ChunkRecord | undefined>(CHUNKS_STORE, 'readonly', (s) =>
    s.get([sessionId, seq]),
  );
  if (!rec) return;
  rec.uploaded = 1;
  await tx(CHUNKS_STORE, 'readwrite', (s) => s.put(rec));
}

// ─── Sync + quota summaries ──────────────────────────────────────────────────

export interface SyncSummary {
  pendingChunks: number;
  activeSessions: number;
}

export async function getSyncSummary(): Promise<SyncSummary> {
  const sessions = await listActiveSessions();
  let pendingChunks = 0;
  for (const s of sessions) pendingChunks += await countPending(s.sessionId);
  return { pendingChunks, activeSessions: sessions.length };
}

export interface QuotaInfo {
  usage: number;
  quota: number;
  ratio: number;
}

export async function checkStorageQuota(): Promise<QuotaInfo | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) return null;
    return { usage, quota, ratio: usage / quota };
  } catch {
    return null;
  }
}

// ─── Session metadata ────────────────────────────────────────────────────────

function metaKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function setSessionMeta(meta: SessionMeta): Promise<void> {
  await tx(META_STORE, 'readwrite', (s) => s.put({ key: metaKey(meta.sessionId), meta }));
}

export async function touchSession(sessionId: string): Promise<void> {
  const meta = await getSessionMeta(sessionId);
  if (!meta) return;
  await setSessionMeta({ ...meta, updatedAt: Date.now() });
}

export async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const row = await tx<{ key: string; meta: SessionMeta } | undefined>(
    META_STORE,
    'readonly',
    (s) => s.get(metaKey(sessionId)),
  );
  return row?.meta ?? null;
}

export async function listActiveSessions(): Promise<SessionMeta[]> {
  const rows = await tx<Array<{ key: string; meta: SessionMeta }>>(META_STORE, 'readonly', (s) =>
    s.getAll(),
  );
  return rows
    .filter((r) => r.key.startsWith('session:') && r.meta && r.meta.status !== 'done')
    .map((r) => r.meta);
}

export interface TimerState {
  recordedMs: number;
  lastResumedAt?: number;
}

/** Record a pause: fold the current active span into recordedMs and set paused. */
export async function markPaused(sessionId: string): Promise<TimerState> {
  const meta = await getSessionMeta(sessionId);
  if (!meta) return { recordedMs: 0 };
  const now = Date.now();
  const recordedMs = (meta.recordedMs ?? 0) + (meta.lastResumedAt ? now - meta.lastResumedAt : 0);
  await setSessionMeta({ ...meta, paused: true, recordedMs, updatedAt: now });
  return { recordedMs, lastResumedAt: undefined };
}

/** Record a resume: start a fresh active span from now. */
export async function markResumed(sessionId: string): Promise<TimerState> {
  const meta = await getSessionMeta(sessionId);
  const now = Date.now();
  if (!meta) return { recordedMs: 0, lastResumedAt: now };
  await setSessionMeta({ ...meta, paused: false, lastResumedAt: now, updatedAt: now });
  return { recordedMs: meta.recordedMs ?? 0, lastResumedAt: now };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const records = await allChunks(sessionId);
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const t = db.transaction([CHUNKS_STORE, META_STORE], 'readwrite');
        const chunks = t.objectStore(CHUNKS_STORE);
        for (const r of records) chunks.delete([r.sessionId, r.seq]);
        t.objectStore(META_STORE).delete(metaKey(sessionId));
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}

// ─── Runtime config mirror (so the service worker can read token + backend URL) ──
// The service worker has no access to localStorage / process.env, so the page mirrors the
// auth token and backend base URL into IndexedDB for the Background Sync drain to use.

export interface RuntimeConfig {
  token: string;
  backendUrl: string;
}

export async function setRuntimeConfig(cfg: RuntimeConfig): Promise<void> {
  await tx(META_STORE, 'readwrite', (s) => s.put({ key: 'runtime', ...cfg }));
}

export async function getRuntimeConfig(): Promise<RuntimeConfig | null> {
  const row = await tx<{ key: string; token: string; backendUrl: string } | undefined>(
    META_STORE,
    'readonly',
    (s) => s.get('runtime'),
  );
  return row ? { token: row.token, backendUrl: row.backendUrl } : null;
}

// ─── Deletion tombstones (offline delete reconciliation) ─────────────────────

export type DeletionKind = 'session' | 'encounter';

export interface DeletionTombstone {
  id: string;
  kind: DeletionKind;
}

export async function addDeletionTombstone(id: string, kind: DeletionKind): Promise<void> {
  await tx(DELETIONS_STORE, 'readwrite', (s) => s.put({ id, kind }));
}

export async function listDeletionTombstones(): Promise<DeletionTombstone[]> {
  return tx<DeletionTombstone[]>(DELETIONS_STORE, 'readonly', (s) => s.getAll());
}

export async function clearDeletionTombstone(id: string, kind: DeletionKind): Promise<void> {
  await tx(DELETIONS_STORE, 'readwrite', (s) => s.delete([id, kind]));
}

export async function hasDeletionTombstone(id: string, kind: DeletionKind): Promise<boolean> {
  const rec = await tx<DeletionTombstone | undefined>(DELETIONS_STORE, 'readonly', (s) =>
    s.get([id, kind]),
  );
  return !!rec;
}
