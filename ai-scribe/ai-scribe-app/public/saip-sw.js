/* SAIP mobile Background Sync service worker.
 *
 * On a `saip-drain` sync event (Android Chrome — fired even after the tab is closed), this
 * reads the SAME encrypted IndexedDB the page wrote (`saip-mobile-durable`), uploads pending
 * chunks, finalizes fully-uploaded sessions, and reconciles deletion tombstones. It is plain
 * JS (a service worker cannot import the page's bundled TS modules), so it re-implements just
 * the durable read/upload path. The CryptoKey is read from IndexedDB (CryptoKey objects are
 * usable in the SW context); the auth token + backend URL come from the page-mirrored
 * `runtime` config (the SW cannot read localStorage / process.env).
 *
 * Where Background Sync is unavailable (iOS Safari), this never runs and the page handles
 * draining in the foreground / on launch.
 */

const DB_NAME = 'saip-mobile-durable';
const CHUNKS_STORE = 'chunks';
const META_STORE = 'meta';
const DELETIONS_STORE = 'deletions';
const SYNC_TAG = 'saip-drain';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drainAll());
});

// Allow the page to nudge a drain directly (foreground fallback path).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'saip-drain') event.waitUntil(drainAll());
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: ['sessionId', 'seq'] });
        chunks.createIndex('by_session', 'sessionId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('deletions')) {
        db.createObjectStore('deletions', { keyPath: ['id', 'kind'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbReq(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const r = fn(t.objectStore(store));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

async function getRuntime() {
  const row = await idbReq(META_STORE, 'readonly', (s) => s.get('runtime'));
  return row ? { token: row.token, backendUrl: row.backendUrl } : null;
}

async function getKey() {
  const row = await idbReq(META_STORE, 'readonly', (s) => s.get('aesKey'));
  return row ? row.cryptoKey : null;
}

async function listActiveSessions() {
  const rows = await idbReq(META_STORE, 'readonly', (s) => s.getAll());
  return rows
    .filter((r) => r.key && r.key.startsWith('session:') && r.meta && r.meta.status !== 'done')
    .map((r) => r.meta);
}

function allChunks(sessionId) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(CHUNKS_STORE, 'readonly');
        const idx = t.objectStore(CHUNKS_STORE).index('by_session');
        const r = idx.getAll(IDBKeyRange.only(sessionId));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }),
  );
}

async function decryptChunk(rec, key) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(rec.iv) },
    key,
    rec.ciphertext,
  );
  return new Blob([plain]);
}

async function markUploaded(sessionId, seq) {
  const rec = await idbReq(CHUNKS_STORE, 'readonly', (s) => s.get([sessionId, seq]));
  if (!rec) return;
  rec.uploaded = 1;
  await idbReq(CHUNKS_STORE, 'readwrite', (s) => s.put(rec));
}

async function deleteSession(sessionId) {
  const records = await allChunks(sessionId);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([CHUNKS_STORE, META_STORE], 'readwrite');
    const chunks = t.objectStore(CHUNKS_STORE);
    for (const r of records) chunks.delete([r.sessionId, r.seq]);
    t.objectStore(META_STORE).delete('session:' + sessionId);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function receivedSeqs(rt, sessionId) {
  try {
    const res = await fetch(
      rt.backendUrl + '/transcribe-session-status?session_id=' + encodeURIComponent(sessionId),
      { headers: { Authorization: 'Bearer ' + rt.token } },
    );
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(Array.isArray(data.received) ? data.received : []);
  } catch {
    return new Set();
  }
}

async function drainSession(rt, key, meta) {
  const received = await receivedSeqs(rt, meta.sessionId);
  const records = (await allChunks(meta.sessionId))
    .filter((r) => r.uploaded === 0)
    .sort((a, b) => a.seq - b.seq);

  for (const rec of records) {
    if (received.has(rec.seq)) {
      await markUploaded(meta.sessionId, rec.seq);
      continue;
    }
    const blob = await decryptChunk(rec, key);
    let ok = false;
    for (let attempt = 0; attempt < 5 && !ok; attempt++) {
      try {
        const res = await fetch(
          rt.backendUrl + '/transcribe-chunk?session_id=' + encodeURIComponent(meta.sessionId) + '&seq=' + rec.seq,
          { method: 'POST', headers: { Authorization: 'Bearer ' + rt.token }, body: blob },
        );
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (!ok) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    if (!ok) return false; // still offline — retry on the next sync
    await markUploaded(meta.sessionId, rec.seq);
  }
  const remaining = (await allChunks(meta.sessionId)).filter((r) => r.uploaded === 0).length;
  return remaining === 0;
}

async function finalizeSession(rt, meta) {
  try {
    const form = new FormData();
    form.append('transcript', meta.transcript || '');
    form.append('session_id', meta.sessionId);
    if (meta.patientId) form.append('patient_id', meta.patientId);
    form.append('retranscribe', 'true');
    const res = await fetch(rt.backendUrl + '/transcribe-finalize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + rt.token },
      body: form,
    });
    if (!res.ok) return false;
    const data = await res.json();
    // Generate the note so the encounter is complete; best-effort.
    try {
      await fetch(rt.backendUrl + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + rt.token },
        body: JSON.stringify({
          encounter_id: data.encounterId,
          transcript: data.transcript,
          patient_id: meta.patientId,
        }),
      });
    } catch {
      /* note generation can be retried from the app */
    }
    return true;
  } catch {
    return false;
  }
}

async function drainTombstones(rt) {
  const tombstones = await idbReq(DELETIONS_STORE, 'readonly', (s) => s.getAll());
  for (const t of tombstones) {
    let ok = false;
    try {
      if (t.kind === 'session') {
        const res = await fetch(
          rt.backendUrl + '/transcribe-session?session_id=' + encodeURIComponent(t.id),
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + rt.token } },
        );
        ok = res.ok;
      } else {
        const res = await fetch(rt.backendUrl + '/ext-encounters/' + t.id, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + rt.token },
        });
        ok = res.ok;
      }
    } catch {
      ok = false;
    }
    if (ok) await idbReq(DELETIONS_STORE, 'readwrite', (s) => s.delete([t.id, t.kind]));
  }
}

async function drainAll() {
  const rt = await getRuntime();
  const key = await getKey();
  if (!rt || !rt.token || !key) return; // nothing we can do without token + key
  const tombstoned = new Set(
    (await idbReq(DELETIONS_STORE, 'readonly', (s) => s.getAll())).map((t) => t.id),
  );
  const sessions = await listActiveSessions();
  for (const meta of sessions) {
    if (tombstoned.has(meta.sessionId)) continue;
    const fullyUploaded = await drainSession(rt, key, meta);
    if (!fullyUploaded) continue;
    if (meta.status === 'pending-finalize') {
      const done = await finalizeSession(rt, meta);
      if (done) await deleteSession(meta.sessionId);
    }
  }
  await drainTombstones(rt);
}
