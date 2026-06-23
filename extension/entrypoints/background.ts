
import { transcribeAudio, generateNote, fetchEncounters, finalizeStream, checkStreamingStatus, getStreamTicket } from '../lib/apiClient';
import { verifyToken, getAuthToken } from '../lib/auth';
import { STORAGE_KEYS, SAIP_ENDPOINTS } from '../lib/constants';
import { drainAll, setFinalizeHandler } from '../lib/syncQueue';
import { setSessionMeta, getSessionMeta, type SessionMeta } from '../lib/durableStore';
import type { ExtensionMessage, Encounter, StreamFinalizedPayload } from '../lib/schemas';

const DRAIN_ALARM = 'saip-drain';

export default defineBackground(() => {
  // Open Side Panel when the action icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // ── Re-inject content scripts into already-open tabs on install/update ───────
  // Chrome does NOT re-inject content scripts into existing tabs when the
  // extension is reloaded/updated — the old content script becomes orphaned and
  // messaging fails ("Content script unavailable"). Re-injecting here makes the
  // extension work in tabs that were open before the reload, without a page refresh.
  chrome.runtime.onInstalled.addListener(() => {
    void reinjectContentScripts();
  });

  // ── saip-audio port: audio ready for processing ─────────────────────────────
  // Two message shapes:
  //   { sessionId, mimeType }            — live recording: chunks are durably persisted;
  //                                         mark finalize intent and let the sync queue run.
  //   { audioBase64, mimeType, encounterId? } — file upload: transcribe the blob server-side.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'saip-audio') {
      port.onMessage.addListener(async (payload: {
        sessionId?: string;
        audioBase64?: string;
        mimeType: string;
        encounterId?: string;
      }) => {
        if (payload.sessionId) {
          await markSessionPendingFinalize(payload.sessionId, payload.mimeType);
          void drainAll();
        } else if (payload.audioBase64) {
          const pid = await getSelectedPatientId();
          await processAudio(payload.audioBase64, payload.mimeType, payload.encounterId, pid ?? undefined);
        }
      });
    }

    if (port.name === 'saip-stream') {
      handleStreamPort(port);
    }
  });

  // ── Resumable sync wiring ───────────────────────────────────────────────────
  setFinalizeHandler(finalizeSession);
  // Periodic heartbeat re-wakes an evicted worker to drain any backlog (min 30s).
  chrome.alarms.create(DRAIN_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DRAIN_ALARM) void drainAll();
  });
  // Drain immediately when connectivity returns or a new chunk is persisted.
  self.addEventListener('online', () => void drainAll());
  chrome.runtime.onMessage.addListener((message: { type?: string }) => {
    if (message?.type === 'CHUNK_PERSISTED') void drainAll();
  });
  void drainAll(); // resume any backlog left from a previous worker lifetime

  // ── Standard message router ────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'AUTH_REQUEST' || message.type === 'AUTOFILL_REQUEST') {
        handleMessage(message, sendResponse);
        return true;
      }
      // Allow side panel to set the active patient for the recording session.
      // Persist to storage so it survives service-worker restarts.
      if (message.type === 'SET_PATIENT') {
        sessionPatientId = (message.payload as { patientId: string | null })?.patientId ?? null;
        chrome.storage.local.set({ [STORAGE_KEYS.selectedPatientId]: sessionPatientId });
        sendResponse({ type: 'AUTH_SUCCESS' }); // reuse generic ack
        return true;
      }
    }
  );

  syncEncounters();
});

// ─── Re-inject content scripts into matching open tabs ───────────────────────

async function reinjectContentScripts() {
  try {
    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts ?? [];
    for (const cs of contentScripts) {
      if (!cs.js || !cs.matches) continue;
      const tabs = await chrome.tabs.query({ url: cs.matches });
      for (const tab of tabs) {
        // Only http(s) tabs are injectable; skip chrome://, about:, etc.
        if (!tab.id || !/^https?:/.test(tab.url ?? '')) continue;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: cs.all_frames ?? false },
            files: cs.js,
            world: (cs as any).world as chrome.scripting.ExecutionWorld | undefined,
          });
        } catch {
          // Tab may be discarded or disallow injection — ignore and continue.
        }
      }
    }
  } catch {
    // Manifest/scripting unavailable — non-fatal.
  }
}

// ─── Streaming session state ─────────────────────────────────────────────────

let realtimeWs: WebSocket | null = null;
let streamingTranscript: string | null = null; // null = not in streaming mode
let streamingDeltaBuffer = '';                 // accumulates current partial utterance
let sessionPatientId: string | null = null;    // patient linked to the current recording session

// Read the selected patient, preferring storage (survives SW restarts) over the
// in-memory copy. The in-memory variable is null after Chrome recycles the worker.
async function getSelectedPatientId(): Promise<string | null> {
  if (sessionPatientId) return sessionPatientId;
  const result = await chrome.storage.local.get(STORAGE_KEYS.selectedPatientId);
  const stored = result[STORAGE_KEYS.selectedPatientId] as string | null | undefined;
  sessionPatientId = stored ?? null;
  return sessionPatientId;
}

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
    streamingTranscript = null;
    return;
  }

  const statusOk = await checkStreamingStatus();
  if (!statusOk) {
    streamingTranscript = null;
    chrome.runtime.sendMessage({ type: 'STREAM_ERROR', error: 'Streaming unavailable — using batch transcription' });
    return;
  }

  // Prefer a short-lived ticket (keeps the bearer token out of WS access logs).
  // Fall back to the token directly if the ticket endpoint is unavailable.
  const ticket = await getStreamTicket();
  const url = ticket
    ? SAIP_ENDPOINTS.transcribeStream(ticket, true)      // ?ticket=…
    : SAIP_ENDPOINTS.transcribeStream(token, false);     // ?token=… (legacy fallback)

  try {
    realtimeWs = new WebSocket(url);
    realtimeWs.binaryType = 'arraybuffer';

    realtimeWs.onopen = () => {
      chrome.runtime.sendMessage({ type: 'STREAM_START' });
    };

    realtimeWs.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data as string) as { type: string; text?: string; message?: string };
        
        let safeText = event.text;
        if (safeText) {
          // Keep only standard letters, numbers, whitespace, and basic punctuation
          safeText = safeText.replace(/[^a-zA-Z0-9\s.,!?'"()\-:;“”‘’]/g, '');
        }

        if (event.type === 'delta' && safeText) {
          streamingDeltaBuffer += safeText;
          chrome.runtime.sendMessage({ type: 'STREAM_DELTA', payload: { delta: safeText } });
        } else if (event.type === 'completed' && safeText) {
          // Commit utterance to assembled transcript
          if (streamingTranscript !== null) {
            streamingTranscript += (streamingTranscript ? ' ' : '') + safeText;
          }
          streamingDeltaBuffer = '';
          chrome.runtime.sendMessage({ type: 'STREAM_COMPLETED', payload: { completed: safeText } });
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

// ─── Batch path: transcribe an uploaded audio file server-side ───────────────

async function processAudio(audioBase64: string, mimeType: string, encounterId?: string, patientId?: string) {
  try {
    const byteChars = atob(audioBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: mimeType });

    const transcribeResult = await transcribeAudio(blob, encounterId, patientId);
    if (!transcribeResult.success || !transcribeResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: transcribeResult.error });
      return;
    }

    const { encounterId: eid, transcript } = transcribeResult.data;
    chrome.runtime.sendMessage({ type: 'TRANSCRIBE_COMPLETE', payload: { encounterId: eid, transcript } });

    const generateResult = await generateNote(eid, transcript, patientId);
    if (!generateResult.success || !generateResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: generateResult.error });
      return;
    }

    await saveEncounterLocally({
      id: eid,
      clientName: 'Current Session',
      date: new Date().toISOString(),
      status: 'generated',
    });
    chrome.runtime.sendMessage({ type: 'GENERATE_COMPLETE', payload: generateResult.data });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) });
  }
}

// ─── Record finalize intent when recording stops ─────────────────────────────
// Captures the streamed transcript if one was produced online; otherwise flags the
// session for server-side re-transcription (offline/batch). The actual finalize runs
// from the sync queue once every chunk has been uploaded.

async function markSessionPendingFinalize(sessionId: string, mimeType: string) {
  const transcript = streamingTranscript ?? '';
  const patientId = await getSelectedPatientId();
  streamingTranscript = null;
  streamingDeltaBuffer = '';

  const existing = await getSessionMeta(sessionId);
  await setSessionMeta({
    sessionId,
    mimeType,
    patientId: patientId ?? undefined,
    transcript,
    // No streamed transcript (offline or streaming unavailable) → re-transcribe audio.
    retranscribe: !transcript,
    status: 'pending-finalize',
    createdAt: existing?.createdAt ?? Date.now(),
  });

  if (transcript) {
    chrome.runtime.sendMessage({ type: 'TRANSCRIBE_COMPLETE', payload: { transcript } });
  }
}

// ─── Finalize a fully-uploaded session: label + persist + generate note ──────
// Returns true on success (the sync queue then deletes the durable session); false to
// retry on the next drain (e.g. transient network failure / still offline).

async function finalizeSession(meta: SessionMeta): Promise<boolean> {
  try {
    const result = await finalizeStream(
      meta.sessionId,
      meta.transcript ?? '',
      undefined,
      meta.patientId,
      meta.retranscribe ?? false,
    );
    if (!result.success || !result.data) return false;

    const { encounterId: eid, transcript: labeled, turns } = result.data;

    const generateResult = await generateNote(eid, labeled, meta.patientId);
    if (!generateResult.success || !generateResult.data) return false;

    // Do NOT persist PHI (transcript/note) to chrome.storage.local — server is the system
    // of record. Save only non-PHI metadata so the UI can list the session.
    await saveEncounterLocally({
      id: eid,
      clientName: 'Current Session',
      date: new Date().toISOString(),
      status: 'generated',
    });

    chrome.runtime.sendMessage({
      type: 'STREAM_FINALIZED',
      payload: { encounterId: eid, transcript: labeled, turns } satisfies StreamFinalizedPayload,
    });
    chrome.runtime.sendMessage({ type: 'GENERATE_COMPLETE', payload: generateResult.data });
    return true;
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'ERROR', error: String(err) });
    return false;
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
