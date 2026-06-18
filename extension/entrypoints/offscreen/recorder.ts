// Offscreen Document — Microphone capture for Manifest V3
// Dual-path: MediaRecorder for the saved webm blob + Web Audio PCM16 for live streaming.

const TARGET_SAMPLE_RATE = 24000; // OpenAI Realtime API requires 24 kHz mono PCM16

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let mimeType = 'audio/webm;codecs=opus';

// Web Audio resources
let audioContext: AudioContext | null = null;
let pcmSource: MediaStreamAudioSourceNode | null = null;
let pcmProcessor: ScriptProcessorNode | null = null;
let streamPort: chrome.runtime.Port | null = null;

// The AudioWorklet processor lives in public/pcm-worklet.js and is loaded by
// extension-origin URL (chrome.runtime.getURL). A blob: URL is blocked by the
// extension CSP (`script-src 'self'`), which previously forced a silent fallback
// to the deprecated ScriptProcessorNode.

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

    // ── MediaRecorder path (webm blob for upload) ──────────────────────────
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
    }
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType });
      const base64 = await blobToBase64(blob);

      // Notify background with the full audio blob
      const port = chrome.runtime.connect({ name: 'saip-audio' });
      port.postMessage({ audioBase64: base64, mimeType });

      stream.getTracks().forEach((t) => t.stop());
      cleanupPcmCapture();
    };

    mediaRecorder.start(1000);

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

    // Load the worklet from an extension-origin URL (CSP-safe, not a blob:)
    try {
      const workletUrl = chrome.runtime.getURL('pcm-worklet.js');
      await audioContext.audioWorklet.addModule(workletUrl);

      const workletNode = new AudioWorkletNode(audioContext, 'pcm16-processor');
      workletNode.port.onmessage = (ev) => {
        const { pcm } = ev.data as { pcm: ArrayBuffer };
        sendPcmFrame(pcm);
      };
      pcmSource.connect(workletNode);
      // AudioWorklet does not need to be connected to destination to fire
    } catch {
      startScriptProcessorFallback();
    }
  } catch {
    // AudioContext failed — fall back to ScriptProcessor on a new context
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
  pcmProcessor.connect(audioContext.destination); // must be connected for events to fire
}

function sendPcmFrame(buffer: ArrayBuffer) {
  // chrome.runtime port only accepts JSON — encode as base64
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
  // Don't null streamPort here — background needs it for the final STREAM_STOP
}

// ─── Stop recording ────────────────────────────────────────────────────────────
async function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    // Signal background to stop PCM streaming before MediaRecorder stops
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
