import { evaluationCacheKey } from './constants';
import { fetchEvalCache } from './apiClient';
import type { EvaluationCacheEntry } from './schemas';

// Evaluation bundles (Psych Eval, E&M EPT) generate once per `fvid` and cache
// here; every sub-page reads its own field subset from this cache instead of
// re-calling the AI (design.md D7 — "generate once, fill progressively").
//
// The backend is the source of truth (written during POST /generate-evaluation).
// chrome.storage.local is a read-through cache for fast reads and offline tolerance.

export async function getCachedEvaluation(
  fvid: string,
  encounterId?: string,
  bundleId?: string,
): Promise<EvaluationCacheEntry | null> {
  // 1. Local cache first (fastest path, works offline)
  const key = evaluationCacheKey(fvid);
  const stored = await chrome.storage.local.get(key);
  const local = stored[key] as EvaluationCacheEntry | undefined;
  if (local) return local;

  // 2. Cache miss → read-through to backend before requiring regeneration
  if (encounterId && bundleId) {
    try {
      const result = await fetchEvalCache(encounterId, bundleId);
      if (result.success && result.data) {
        const entry: EvaluationCacheEntry = {
          bundleId,
          fields: result.data,
          generatedAt: Date.now(),
        };
        // Populate local cache so subsequent sub-page fills are fast
        await chrome.storage.local.set({ [key]: entry });
        return entry;
      }
    } catch {
      // Backend unavailable — return null; caller will regenerate
    }
  }

  return null;
}

export async function setCachedEvaluation(
  fvid: string,
  bundleId: string,
  fields: Record<string, string>,
  // encounterId/visitId are accepted for API compatibility but the backend
  // already persisted during POST /generate-evaluation — no second write needed.
  _encounterId?: string,
  _visitId?: string,
): Promise<void> {
  const key = evaluationCacheKey(fvid);
  const entry: EvaluationCacheEntry = { bundleId, fields, generatedAt: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

export async function clearCachedEvaluation(fvid: string): Promise<void> {
  await chrome.storage.local.remove(evaluationCacheKey(fvid));
}
