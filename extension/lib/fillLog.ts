import { STORAGE_KEYS } from './constants';
import { postAutofillAudit } from './apiClient';
import type { FillLogEntry } from './schemas';

// Runtime observability artifact (design.md D8): the last autofill run is
// persisted so the side panel's debug view can show what happened without
// needing devtools — which labels were found, which fields were missed, and
// which scored widgets were correctly left for manual entry.
//
// Each run is also fire-and-forget posted to the backend as an immutable audit
// entry for compliance and cross-device history.

export async function persistFillLog(
  entry: FillLogEntry,
  encounterId?: string,
): Promise<void> {
  // Always save locally so the debug panel works offline
  await chrome.storage.local.set({ [STORAGE_KEYS.lastFillLog]: entry });

  // Fire-and-forget to backend — failure does NOT block the fill UX
  postAutofillAudit(encounterId, entry).catch(() => {
    // Ignore: retry on next fill or sync. Audit trail is best-effort vs. UX.
  });
}

export async function getLastFillLog(): Promise<FillLogEntry | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.lastFillLog);
  return (result[STORAGE_KEYS.lastFillLog] as FillLogEntry | undefined) ?? null;
}
