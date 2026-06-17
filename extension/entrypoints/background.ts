
import { transcribeAudio, generateNote, fetchEncounters } from '../lib/apiClient';
import { verifyToken } from '../lib/auth';
import { STORAGE_KEYS } from '../lib/constants';
import type { ExtensionMessage, Encounter } from '../lib/schemas';

export default defineBackground(() => {
  // Open Side Panel when the action icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
      chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // ── Port listener: receives audio blob from offscreen recorder ──────────────
  // We use ports instead of sendMessage to bypass WXT's dev-mode message interceptor
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'saip-audio') return;
    port.onMessage.addListener(async (payload: { audioBase64: string; mimeType: string; encounterId?: string }) => {
      await processAudio(payload.audioBase64, payload.mimeType, payload.encounterId);
    });
  });

  // ── Standard message router (AUTOFILL_REQUEST, AUTH_REQUEST, etc.) ──────────
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'AUTH_REQUEST' || message.type === 'AUTOFILL_REQUEST') {
        handleMessage(message, sendResponse);
        return true;
      }
    }
  );

  // Sync encounters on startup if user is logged in
  syncEncounters();
});

// ─── Process audio blob: transcribe → generate note → notify side panel ───────
async function processAudio(audioBase64: string, mimeType: string, encounterId?: string) {
  try {
    // Convert base64 to Blob
    const byteChars = atob(audioBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Step 1: Transcribe (backend now persists Encounter + Recording, returns a stable sqid)
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

    // Step 2: Generate note
    const generateResult = await generateNote(eid, transcript);
    if (!generateResult.success || !generateResult.data) {
      chrome.runtime.sendMessage({ type: 'ERROR', error: generateResult.error });
      return;
    }

    // Persist locally so the side panel can show it immediately
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
        // Let WXT handle unknown messages silently — don't error for internal WXT traffic
        break;
    }
  } catch (err) {
    sendResponse({ type: 'ERROR', error: String(err) });
  }
}

async function saveEncounterLocally(encounter: Encounter) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.encounters);
  const existing = (result[STORAGE_KEYS.encounters] ?? []) as Encounter[];
  // Prepend new and remove any prior entry with the same id
  const updated = [encounter, ...existing.filter((e) => e.id !== encounter.id)];
  await chrome.storage.local.set({ [STORAGE_KEYS.encounters]: updated });
}

// Merge backend encounters with local cache — never delete unsynced local entries.
async function syncEncounters() {
  const user = await verifyToken();
  if (!user) return;

  const result = await fetchEncounters();
  if (!result.success || !result.data) return;

  const backendList = result.data as Encounter[];
  const local = await chrome.storage.local.get(STORAGE_KEYS.encounters);
  const localList = (local[STORAGE_KEYS.encounters] ?? []) as Encounter[];

  // Build a map of backend encounters by id for O(1) lookup
  const backendById = new Map(backendList.map((e) => [e.id, e]));

  // Keep local-only entries (not yet synced to backend) and merge them at the end
  const localOnly = localList.filter((e) => !backendById.has(e.id));

  // Merge: backend list (authoritative) + unsynced local entries
  const merged = [...backendList, ...localOnly];
  await chrome.storage.local.set({ [STORAGE_KEYS.encounters]: merged });
}
