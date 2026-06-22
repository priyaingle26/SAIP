// Offscreen Document — Microphone capture for Manifest V3
// Dual-path: MediaRecorder for the saved webm blob + Web Audio PCM16 for live streaming.
//
// Chunked archive upload: each MediaRecorder timeslice is POSTed as binary directly to
// the backend (no base64, no accumulation in memory). On stop we send the sessionId so
// background.ts can finalize by reference. If any chunk upload fails, we fall back to the
// existing single-blob path (audioChunks[] accumulates the tail only).

import { SAIP_BASE_URL, STORAGE_KEYS } from '../../lib/constants';

const TARGET_SAMPLE_RATE = 24000; // OpenAI Realtime API requires 24 kHz mono PCM16
const CHUNK_TIMESLICE_MS = 3000;  // 3-second slices balance request count vs latency

let mediaRecorder: MediaRecorder | null = null;
let mimeType = 'audio/webm;codecs=opus';

// Chunked-upload state
let currentSessionId: string | null = null;
let chunkSeq = 0;
let chunkFailureOccurred = false;
let fallbackChunks: Blob[] = []; // used only when a chunk upload fails
let pendingUploads: Promise<void>[] = [];

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

    // Reset chunked-upload state
    currentSessionId = crypto.randomUUID();
    chunkSeq = 0;
    chunkFailureOccurred = false;
    fallbackChunks = [];
    pendingUploads = [];

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      const seq = chunkSeq++;

      if (chunkFailureOccurred) {
        // Already in fallback mode — accumulate locally
        fallbackChunks.push(e.data);
        return;
      }

      // Upload chunk as binary — no base64
      const upload = uploadChunk(e.data, seq).catch(() => {
        // On failure: switch to fallback mode and collect this chunk locally
        chunkFailureOccurred = true;
        fallbackChunks.push(e.data);
      });
      pendingUploads.push(upload);
    };

    mediaRecorder.onstop = async () => {
      // Wait for any in-flight chunk uploads to settle
      await Promise.allSettled(pendingUploads);

      const port = chrome.runtime.connect({ name: 'saip-audio' });

      if (!chunkFailureOccurred && currentSessionId) {
        // Happy path: all chunks uploaded — finalize by sessionId reference
        port.postMessage({ sessionId: currentSessionId, mimeType, allChunksUploaded: true });
      } else {
        // Fallback path: some chunks failed — send assembled blob as before
        const blob = new Blob(fallbackChunks, { type: mimeType });
        const base64 = await blobToBase64(blob);
        port.postMessage({ audioBase64: base64, mimeType, allChunksUploaded: false });
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

// ─── Upload one chunk as binary to the backend ───────────────────────────────
async function uploadChunk(chunk: Blob, seq: number): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.authToken);
  const token = result[STORAGE_KEYS.authToken] as string | undefined;
  if (!token || !currentSessionId) throw new Error('No auth token or session');

  const url = `${SAIP_BASE_URL}/transcribe-chunk?session_id=${encodeURIComponent(currentSessionId)}&seq=${seq}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: chunk,
  });
  if (!res.ok) throw new Error(`Chunk upload failed: ${res.status}`);
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
