// Durable mobile recorder controller.
//
// Wraps MediaRecorder with: encrypted durable capture (chunk → IndexedDB before upload),
// 5s heartbeat, pause/resume with stopwatch accounting, Screen Wake Lock during recording,
// deterministic auto-pause when the app is backgrounded (the OS suspends mic capture when
// hidden — we never assume background capture continued), and Background Sync requests so the
// service worker can finish uploads after the tab closes (Android Chrome; graceful fallback).

import {
  putChunk,
  setSessionMeta,
  touchSession,
  markPaused,
  markResumed,
  requestPersistentStorage,
  checkStorageQuota,
  getSessionMeta,
  type TimerState,
} from './durableStore';
import { drainAll } from './syncQueue';

const CHUNK_TIMESLICE_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 5000;
const QUOTA_WARN_RATIO = 0.9;
const QUOTA_CHECK_EVERY = 10;
const SYNC_TAG = 'saip-drain';

export interface RecorderCallbacks {
  onStarted?: (sessionId: string) => void;
  onPaused?: (timing: TimerState, auto: boolean) => void;
  onResumed?: (timing: TimerState) => void;
  /** `discarded` is true when the stop came from discard() — no finalize will follow. */
  onStopped?: (discarded: boolean) => void;
  onStorageWarning?: (info: { usageMB: number; quotaMB: number }) => void;
  onError?: (message: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WakeLockSentinelLike = { release: () => Promise<void> } | null;

export class MobileRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private mimeType = 'audio/webm;codecs=opus';
  private sessionId: string | null = null;
  private seq = 0;
  private pendingPersists: Promise<void>[] = [];
  private paused = false;
  private discarding = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private wakeLock: WakeLockSentinelLike = null;
  private cb: RecorderCallbacks;
  private stopResolve: (() => void) | null = null;

  constructor(cb: RecorderCallbacks = {}) {
    this.cb = cb;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  async start(patientId?: string): Promise<void> {
    if (this.mediaRecorder?.state === 'recording') return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!MediaRecorder.isTypeSupported(this.mimeType)) this.mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(this.mimeType)) this.mimeType = 'audio/mp4';

      this.sessionId = crypto.randomUUID();
      this.seq = 0;
      this.pendingPersists = [];
      this.paused = false;
      this.discarding = false;

      void requestPersistentStorage();
      void this.maybeWarnStorage();

      const startedAt = Date.now();
      await setSessionMeta({
        sessionId: this.sessionId,
        mimeType: this.mimeType,
        patientId,
        status: 'recording',
        createdAt: startedAt,
        updatedAt: startedAt,
        recordedMs: 0,
        lastResumedAt: startedAt,
        retranscribe: true,
      });

      const sid = this.sessionId;
      this.heartbeat = setInterval(() => void touchSession(sid), HEARTBEAT_INTERVAL_MS);

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
      this.mediaRecorder.ondataavailable = (e) => this.onData(e);
      this.mediaRecorder.onstop = () => void this.onStop();
      this.mediaRecorder.start(CHUNK_TIMESLICE_MS);

      await this.acquireWakeLock();
      this.cb.onStarted?.(sid);
    } catch (err) {
      this.cb.onError?.(`Microphone access denied: ${String(err)}`);
    }
  }

  private onData(e: BlobEvent) {
    if (e.data.size === 0 || !this.sessionId) return;
    const seq = this.seq++;
    const sid = this.sessionId;
    const persist = putChunk(sid, seq, e.data)
      .then(() => {
        void drainAll();
        void this.requestBackgroundSync();
      })
      .catch(() => {});
    this.pendingPersists.push(persist);
    if (seq % QUOTA_CHECK_EVERY === 0) void this.maybeWarnStorage();
  }

  private async onStop() {
    this.clearHeartbeat();
    await this.releaseWakeLock();
    await Promise.allSettled(this.pendingPersists);

    const wasDiscard = this.discarding;
    if (!wasDiscard && this.sessionId) {
      const meta = await getSessionMeta(this.sessionId);
      if (meta) {
        await setSessionMeta({ ...meta, status: 'pending-finalize', retranscribe: true, paused: false });
      }
      void drainAll();
      void this.requestBackgroundSync();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.discarding = false;
    // Only the discard path resolves a waiter; the caller then purges local + server data
    // AFTER all chunk writes have settled (no orphan-chunk race).
    this.stopResolve?.();
    this.stopResolve = null;
    this.cb.onStopped?.(wasDiscard);
  }

  async pause(auto = false): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') return;
    this.paused = true;
    this.mediaRecorder.pause();
    await this.releaseWakeLock();
    let timing: TimerState = { recordedMs: 0 };
    if (this.sessionId) timing = await markPaused(this.sessionId);
    this.cb.onPaused?.(timing, auto);
  }

  async resume(): Promise<void> {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'paused') return;
    this.paused = false;
    this.mediaRecorder.resume();
    await this.acquireWakeLock();
    let timing: TimerState = { recordedMs: 0, lastResumedAt: Date.now() };
    if (this.sessionId) timing = await markResumed(this.sessionId);
    this.cb.onResumed?.(timing);
  }

  async stop(): Promise<void> {
    if (!this.mediaRecorder) return;
    if (this.mediaRecorder.state === 'paused') {
      this.paused = false;
      this.mediaRecorder.resume();
    }
    if (this.mediaRecorder.state === 'recording') this.mediaRecorder.stop();
  }

  /** Discard: stop + release mic WITHOUT handing off to finalize. Caller writes the tombstone first.
   *  Resolves only AFTER the recorder has fully stopped and all chunk writes settled, so the
   *  caller can purge local + server data without racing a final pending chunk. */
  discard(): Promise<void> {
    if (!this.mediaRecorder) return Promise.resolve();
    this.discarding = true;
    return new Promise<void>((resolve) => {
      this.stopResolve = resolve;
      const mr = this.mediaRecorder!;
      if (mr.state === 'paused') mr.resume();
      if (mr.state === 'recording' || mr.state === 'paused') {
        mr.stop();
      } else {
        this.discarding = false;
        this.stopResolve = null;
        resolve();
      }
    });
  }

  destroy() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.clearHeartbeat();
    void this.releaseWakeLock();
  }

  // ── Backgrounding: the OS stops mic capture when hidden → auto-pause deterministically ──
  private onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      if (this.mediaRecorder?.state === 'recording') void this.pause(true);
    } else {
      // Returned to foreground — re-acquire wake lock if still actively recording.
      if (this.mediaRecorder?.state === 'recording') void this.acquireWakeLock();
    }
  };

  // ── Wake Lock (feature-detected; non-fatal if unsupported) ──
  private async acquireWakeLock() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wl = (navigator as any).wakeLock;
      if (wl?.request) this.wakeLock = await wl.request('screen');
    } catch {
      /* unsupported or denied — recording still works */
    }
  }

  private async releaseWakeLock() {
    try {
      await this.wakeLock?.release();
    } catch {
      /* ignore */
    }
    this.wakeLock = null;
  }

  // ── Background Sync (Android Chrome); silent no-op where unsupported ──
  private async requestBackgroundSync() {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sync = (reg as any).sync;
      if (sync?.register) await sync.register(SYNC_TAG);
    } catch {
      /* Background Sync unavailable (e.g. iOS Safari) — foreground/launch drain covers it */
    }
  }

  private async maybeWarnStorage() {
    const q = await checkStorageQuota();
    if (!q || q.ratio < QUOTA_WARN_RATIO) return;
    this.cb.onStorageWarning?.({
      usageMB: Math.round(q.usage / 1_048_576),
      quotaMB: Math.round(q.quota / 1_048_576),
    });
  }

  private clearHeartbeat() {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
