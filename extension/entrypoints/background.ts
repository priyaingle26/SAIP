
import { transcribeAudio, generateNote, fetchEncounters, finalizeStream, checkStreamingStatus } from '../lib/apiClient';
import { verifyToken, getAuthToken } from '../lib/auth';
import { STORAGE_KEYS, SAIP_ENDPOINTS } from '../lib/constants';
import type { ExtensionMessage, Encounter, StreamFinalizedPayload } from '../lib/schemas';

export default defineBackground(() => {
  // Open Side Panel when the action icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // ── saip-audio port: receives the final webm blob from offscreen ────────────
  // Used both for batch transcription AND (with streamingTranscript set) finalize
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'saip-audio') {
      port.onMessage.addListener(async (payload: {
        audioBase64: string;
        mimeType: string;
        encounterId?: string;
      }) => {
        if (streamingTranscript !== null) {
          // Streaming path: finalize with the assembled transcript
          await finalizeStreamingSession(payload.audioBase64, payload.mimeType);
        } else {
          // Batch path: upload and transcribe server-side
          await processAudio(payload.audioBase64, payload.mimeType, payload.encounterId);
        }
      });
    }

    if (port.name === 'saip-stream') {
      handleStreamPort(port);
    }
  });

  // ── Standard message router ────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'AUTH_REQUEST' || message.type === 'AUTOFILL_REQUEST') {
        handleMessage(message, sendResponse);
        return true;
      }
    }
  );

  syncEncounters();
});

// ─── Streaming session state ─────────────────────────────────────────────────

let realtimeWs: WebSocket | null = null;
let streamingTranscript: string | null = null; // null = not in streaming mode
let streamingDeltaBuffer = '';                 // accumulates current partial utterance

// ─── Handle the saip-stream port from offscreen ──────────────────────────────

function handleStreamPort(port: chrome.runtime.Port) {
  port.onMessage.addListener(async (msg: { type: string; frame?: string }) => {
    switch (msg.type) {
      case 'STREAM_START':
        await openRealtimeWs();
        break;

      case 'STREAM_PCM_FRAME':
        if (realtimeWs?.readyState === WebSocket.OPEN && msg.frame) {
          // Decode base64 → ArrayBuffer and send as binary to backend WS
          const binary = atob(msg.frame);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          realtimeWs.send(bytes.buffer);
        }
        break;

      case 'STREAM_STOP':
        // Signal the backend to commit the audio buffer and wait for final events
        if (realtimeWs?.readyState === WebSocket.OPEN) {
          realtimeWs.send(JSON.stringify({ type: 'stop' }));
        }
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    // Offscreen disconnected — close WS if still open
    realtimeWs?.close();
  });
}

// ─── Open the backend-proxied Realtime WebSocket ──────────────────────────────

async function openRealtimeWs() {
  streamingTranscript = '';
  streamingDeltaBuffer = '';

  const token = await getAuthToken();
  if (!token) {
    // Not authenticated — fall back to batch
    streamingTranscript = null;
    return;
  }

  // Check whether backend has OpenAI configured
  const statusOk = await checkStreamingStatus();
  if (!statusOk) {
    streamingTranscript = null;
    chrome.runtime.sendMessage({ type: 'STREAM_ERROR', error: 'Streaming unavailable — using batch transcription' });
    return;
  }

  const url = SAIP_ENDPOINTS.transcribeStream(token);

  try {
    realtimeWs = new WebSocket(url);
    realtimeWs.binaryType = 'arraybuffer';

    realtimeWs.onopen = () => {
      chrome.runtime.sendMessage({ type: 'STREAM_START' });
    };

    realtimeWs.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as { type: string; text?: string; message?: string };
        if (event.type === 'delta' && event.text) {
          streamingDeltaBuffer += event.text;
          chrome.runtime.sendMessage({ type: 'STREAM_DELTA', payload: { delta: event.text } });
        } else if (event.type === 'completed' && event.text) {
          // Commit utterance to assembled transcript
          if (streamingTranscript !== null) {
            streamingTranscript += (streamingTranscript ? ' ' : '') + event.text;
          }
          streamingDeltaBuffer = '';
          chrome.runtime.sendMessage({ type: 'STREAM_COMPLETED', payload: { completed: event.text } });
        } else if (event.type === 'error') {
          chrome.runtime.sendMessage({ type: 'STREAM_ERROR', error: event.message ?? 'Stream error' });
        }
      } catch {
        // ignore
      }
    };

    realtimeWs.onerror = () => {
      // WS error — fall back to batch (streamingTranscript stays set; finalizeStreamingSession handles null check)
      streamingTranscript = null;
      realtimeWs = null;
    };

    realtimeWs.onclose = () => {
      realtimeWs = null;
    };
  } catch {
    streamingTranscript = null;
    realtimeWs = null;
  }
}

// ─── Finalize streaming session: label + persist ─────────────────────────────

async function finalizeStreamingSession(audioBase64: string, mimeType: string) {
  const transcript = streamingTranscript ?? '';
  streamingTranscript = null;
  streamingDeltaBuffer = '';

  if (!transcript) {
    // Nothing was transcribed — fall through to batch
    await processAudio(audioBase64, mimeType);
    return;
  }

  chrome.runtime.sendMessage({ type: 'TRANSCRIBE_COMPLETE', payload: { transcript } });

  try {
    const byteChars = atob(audioBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const result = await finalizeStream(blob, transcript);
    if (!result.success || !result.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: result.error });
      return;
    }

    const { encounterId: eid, transcript: labeled, turns } = result.data;

    // Generate note using the labeled transcript
    const generateResult = await generateNote(eid, labeled);
    if (!generateResult.success || !generateResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: generateResult.error });
      return;
    }

    await saveEncounterLocally({
      id: eid,
      clientName: 'Current Session',
      date: new Date().toISOString(),
      status: 'generated',
      transcript: labeled,
      generatedNote: generateResult.data.note,
    });

    chrome.runtime.sendMessage({
      type: 'STREAM_FINALIZED',
      payload: { encounterId: eid, transcript: labeled, turns } satisfies StreamFinalizedPayload,
    });
    chrome.runtime.sendMessage({ type: 'GENERATE_COMPLETE', payload: generateResult.data });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) });
  }
}

// ─── Batch path (unchanged, also serves as fallback) ─────────────────────────

async function processAudio(audioBase64: string, mimeType: string, encounterId?: string) {
  try {
    const byteChars = atob(audioBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    const transcribeResult = await transcribeAudio(blob, encounterId);
    if (!transcribeResult.success || !transcribeResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: transcribeResult.error });
      return;
    }

    const { encounterId: eid, transcript } = transcribeResult.data;
    chrome.runtime.sendMessage({
      type: 'TRANSCRIBE_COMPLETE',
      payload: { encounterId: eid, transcript },
    });

    const generateResult = await generateNote(eid, transcript);
    if (!generateResult.success || !generateResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: generateResult.error });
      return;
    }

    await saveEncounterLocally({
      id: eid,
      clientName: 'Current Session',
      date: new Date().toISOString(),
      status: 'generated',
      transcript,
      generatedNote: generateResult.data.note,
    });

    chrome.runtime.sendMessage({
      type: 'GENERATE_COMPLETE',
      payload: generateResult.data,
    });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) });
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: ExtensionMessage) => void
) {
  try {
    switch (message.type) {
      case 'AUTH_REQUEST': {
        const user = await verifyToken();
        sendResponse(
          user
            ? { type: 'AUTH_SUCCESS', payload: user }
            : { type: 'AUTH_FAILURE', error: 'Not authenticated' }
        );
        break;
      }

      case 'AUTOFILL_REQUEST': {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          sendResponse({ type: 'ERROR', error: 'No active tab found' });
          break;
        }
        await chrome.tabs.sendMessage(tab.id, message);
        sendResponse({ type: 'AUTOFILL_COMPLETE' });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    sendResponse({ type: 'ERROR', error: String(err) });
  }
}

async function saveEncounterLocally(encounter: Encounter) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.encounters);
  const existing = (result[STORAGE_KEYS.encounters] ?? []) as Encounter[];
  const updated = [encounter, ...existing.filter((e) => e.id !== encounter.id)];
  await chrome.storage.local.set({ [STORAGE_KEYS.encounters]: updated });
}

async function syncEncounters() {
  const user = await verifyToken();
  if (!user) return;

  const result = await fetchEncounters();
  if (!result.success || !result.data) return;

  const backendList = result.data as Encounter[];
  const local = await chrome.storage.local.get(STORAGE_KEYS.encounters);
  const localList = (local[STORAGE_KEYS.encounters] ?? []) as Encounter[];

  const backendById = new Map(backendList.map((e) => [e.id, e]));
  const localOnly = localList.filter((e) => !backendById.has(e.id));
  const merged = [...backendList, ...localOnly];
  await chrome.storage.local.set({ [STORAGE_KEYS.encounters]: merged });
}
