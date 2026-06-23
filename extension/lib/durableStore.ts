// Durable encrypted local audio container (offline-durable-capture).
//
// Every captured chunk is encrypted at rest with WebCrypto AES-GCM and written to
// IndexedDB BEFORE any upload is attempted, so capture never depends on the network
// and survives MV3 service-worker / offscreen-document eviction. IndexedDB is shared
// across extension contexts (same chrome-extension:// origin), so the offscreen
// recorder persists chunks and the background sync queue drains them from the same DB.
//
// The AES-GCM key is generated NON-EXTRACTABLE and stored as a CryptoKey object —
// raw key material is never written to chrome.storage or localStorage.

const DB_NAME = 'saip-durable';
const DB_VERSION = 1;
const CHUNKS_STORE = 'chunks';
const META_STORE = 'meta';
const KEY_ID = 'aesKey';
const IV_BYTES = 12; // 96-bit IV recommended for AES-GCM

export type SessionStatus = 'recording' | 'pending-finalize' | 'done';

export interface SessionMeta {
  sessionId: string;
  mimeType: string;
  patientId?: string;
  /** Streamed transcript if one was produced online; empty when captured offline. */
  transcript?: string;
  /** When true, the server should re-transcribe the assembled audio (offline/batch). */
  retranscribe?: boolean;
  status: SessionStatus;
  createdAt: number;
}

interface ChunkRecord {
  sessionId: string;
  seq: number;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  uploaded: 0 | 1;
}

export interface PendingChunk {
  seq: number;
  blob: Blob;
}

// ─── Low-level IndexedDB helpers ─────────────────────────────────────────────

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
    // Non-extractable so raw key material can never leave the browser.
    const cryptoKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
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

/** Encrypt a chunk and persist it durably. Resolves only after the write commits. */
export async function putChunk(sessionId: string, seq: number, chunk: Blob): Promise<void> {
  const key = await getKey();
  const plaintext = await chunk.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const record: ChunkRecord = {
    sessionId,
    seq,
    iv: iv.buffer,
    ciphertext,
    uploaded: 0,
  };
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

/** Decrypted, seq-ordered chunks for a session that have not yet been uploaded. */
export async function getPendingChunks(sessionId: string): Promise<PendingChunk[]> {
  const key = await getKey();
  const records = (await allChunks(sessionId))
    .filter((r) => r.uploaded === 0)
    .sort((a, b) => a.seq - b.seq);
  const out: PendingChunk[] = [];
  for (const r of records) {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(r.iv) },
      key,
      r.ciphertext,
    );
    out.push({ seq: r.seq, blob: new Blob([plaintext]) });
  }
  return out;
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

// ─── Session metadata ────────────────────────────────────────────────────────

function metaKey(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function setSessionMeta(meta: SessionMeta): Promise<void> {
  await tx(META_STORE, 'readwrite', (s) => s.put({ key: metaKey(meta.sessionId), meta }));
}

export async function getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const row = await tx<{ key: string; meta: SessionMeta } | undefined>(
    META_STORE,
    'readonly',
    (s) => s.get(metaKey(sessionId)),
  );
  return row?.meta ?? null;
}

/** All sessions not yet finalized — drained by the sync queue on wake-up. */
export async function listActiveSessions(): Promise<SessionMeta[]> {
  const rows = await tx<Array<{ key: string; meta: SessionMeta }>>(META_STORE, 'readonly', (s) =>
    s.getAll(),
  );
  return rows
    .filter((r) => r.key.startsWith('session:') && r.meta && r.meta.status !== 'done')
    .map((r) => r.meta);
}

/** Remove all chunks and metadata for a session after the server confirms finalize. */
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
