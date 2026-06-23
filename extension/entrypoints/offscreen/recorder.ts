// Offscreen Document — Microphone capture for Manifest V3
// Dual-path: MediaRecorder for the saved webm blob + Web Audio PCM16 for live streaming.
//
// Durable capture: each MediaRecorder timeslice is encrypted and written to the durable
// IndexedDB store (lib/durableStore) BEFORE any upload is attempted, so capture never
// depends on the network and survives service-worker / offscreen-document eviction. The
// background sync queue drains those chunks from the same shared IndexedDB. We notify it
// after each persist (live drain) and on stop (finalize once fully synced).

import { putChunk, setSessionMeta, requestPersistentStorage } from '../../lib/durableStore';

const TARGET_SAMPLE_RATE = 24000; // OpenAI Realtime API requires 24 kHz mono PCM16
const CHUNK_TIMESLICE_MS = 3000;  // 3-second slices balance request count vs latency

let mediaRecorder: MediaRecorder | null = null;
let mimeType = 'audio/webm;codecs=opus';

// Durable-capture state
let currentSessionId: string | null = null;
let chunkSeq = 0;
let pendingPersists: Promise<void>[] = [];

// Web Audio resources
let audioContext: AudioContext | null = null;
let pcmSource: MediaStreamAudioSourceNode | null = null;
let pcmProcessor: ScriptProcessorNode | null = null;
let streamPort: chrome.runtime.Port | null = null;

// ─── Listen for commands from background worker ───────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.type) {
    case 'START_RECORDING':
      startRecording().then(() => sendResponse({ success: true }));
      break;
    case 'STOP_RECORDING':
      stopRecording().then(() => sendResponse({ success: true }));
      break;
    default:
      sendResponse({ success: false, error: 'Unknown command' });
  }
  return true;
});

// ─── Start recording: open mic, wire both capture paths ──────────────────────
async function startRecording() {
  if (mediaRecorder?.state === 'recording') return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // ── MediaRecorder path (webm for upload) ──────────────────────────────
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }

    // Reset durable-capture state
    currentSessionId = crypto.randomUUID();
    chunkSeq = 0;
    pendingPersists = [];

    // Best-effort: keep the encrypted container from being evicted under pressure.
    void requestPersistentStorage();
    // Record the session so the sync queue can drain + finalize it even across evictions.
    await setSessionMeta({
      sessionId: currentSessionId,
      mimeType,
      status: 'recording',
      createdAt: Date.now(),
    });

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size === 0 || !currentSessionId) return;
      const seq = chunkSeq++;
      const sid = currentSessionId;

      // Encrypt + persist durably FIRST; uploading is the sync queue's job. A failure
      // here just leaves the chunk pending — it is never dropped or held only in memory.
      const persist = putChunk(sid, seq, e.data)
        .then(() => {
          // Wake the background sync queue to drain while online (best-effort).
          chrome.runtime.sendMessage({ type: 'CHUNK_PERSISTED', sessionId: sid }).catch(() => {});
        })
        .catch(() => {});
      pendingPersists.push(persist);
    };

    mediaRecorder.onstop = async () => {
      // Ensure every produced chunk is durably written before we ask to finalize.
      await Promise.allSettled(pendingPersists);

      if (currentSessionId) {
        const port = chrome.runtime.connect({ name: 'saip-audio' });
        port.postMessage({ sessionId: currentSessionId, mimeType });
      }

      stream.getTracks().forEach((t) => t.stop());
      cleanupPcmCapture();
    };

    // Raise timeslice to reduce request count while keeping memory bounded
    mediaRecorder.start(CHUNK_TIMESLICE_MS);

    // ── Web Audio PCM path (live streaming) ───────────────────────────────
    await startPcmCapture(stream);

    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'ERROR',
      error: `Microphone access denied: ${err}`,
    });
  }
}

// ─── Start PCM capture: AudioWorklet preferred, ScriptProcessor fallback ──────
async function startPcmCapture(stream: MediaStream) {
  streamPort = chrome.runtime.connect({ name: 'saip-stream' });
  streamPort.postMessage({ type: 'STREAM_START' });

  try {
    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
    pcmSource = audioContext.createMediaStreamSource(stream);

    try {
      const workletUrl = chrome.runtime.getURL('pcm-worklet.js');
      await audioContext.audioWorklet.addModule(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor');
      workletNode.port.onmessage = (ev) => {
        const { pcm } = ev.data as { pcm: ArrayBuffer };
        sendPcmFrame(pcm);
      };
      pcmSource.connect(workletNode);
    } catch {
      startScriptProcessorFallback();
    }
  } catch {
    startScriptProcessorFallback();
  }
}

function startScriptProcessorFallback() {
  if (!audioContext || !pcmSource) return;

  pcmProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  pcmProcessor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0);
    const pcm = floatToPcm16(input);
    sendPcmFrame(pcm.buffer as ArrayBuffer);
  };
  pcmSource.connect(pcmProcessor);
  pcmProcessor.connect(audioContext.destination);
}

function sendPcmFrame(buffer: ArrayBuffer) {
  const b64 = arrayBufferToBase64(buffer);
  streamPort?.postMessage({ type: 'STREAM_PCM_FRAME', frame: b64 });
}

function cleanupPcmCapture() {
  try { pcmProcessor?.disconnect(); } catch { /* ignore */ }
  try { pcmSource?.disconnect(); } catch { /* ignore */ }
  try { audioContext?.close(); } catch { /* ignore */ }
  pcmProcessor = null;
  pcmSource = null;
  audioContext = null;
}

// ─── Stop recording ────────────────────────────────────────────────────────────
async function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    streamPort?.postMessage({ type: 'STREAM_STOP' });
    mediaRecorder.stop();
    chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function floatToPcm16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767 | 0));
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
