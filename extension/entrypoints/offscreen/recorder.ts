// Offscreen Document — Microphone capture for Manifest V3
// Runs in an isolated offscreen context; communicates via chrome.runtime.sendMessage

let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let mimeType = 'audio/webm;codecs=opus';

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

// ─── Start microphone recording ───────────────────────────────────────────────
async function startRecording() {
  if (mediaRecorder?.state === 'recording') return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Pick best supported format
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

      const port = chrome.runtime.connect({ name: 'saip-audio' });
      port.postMessage({ audioBase64: base64, mimeType });
      // Removed port.disconnect() to ensure message delivery

      // Release microphone
      stream.getTracks().forEach((t) => t.stop());
    };

    mediaRecorder.start(1000); // Collect chunks every 1s

    // Notify background that recording started
    chrome.runtime.sendMessage({ type: 'RECORDING_STARTED' });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'ERROR',
      error: `Microphone access denied: ${err}`,
    });
  }
}

// ─── Stop recording and trigger upload ───────────────────────────────────────
async function stopRecording() {
  if (mediaRecorder?.state === 'recording') {
    mediaRecorder.stop();
    chrome.runtime.sendMessage({ type: 'RECORDING_STOPPED' });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
