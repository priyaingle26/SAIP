// ─── Resolve the Credible form frame inside the active tab ──────────────────
// Credible BH renders forms in different ways depending on the page type:
//
//   1. Standard notes/evaluations: nested iframe at webforms/questions.asp
//   2. Plan editing pages (Recovery Plan, etc.): top-level page with no iframe
//
// Strategy:
//   a) First try the known standard form frame URL.
//   b) If not found, send DETECT_FORM_REQUEST to every frame and pick the one
//      that returns the highest confidence score.
//   c) Fall back to the top frame (frameId 0) if all else fails.

import type { ExtensionMessage } from './schemas';

const FORM_FRAME_URL_FRAGMENT = 'webforms/questions.asp';

// Known URL fragments that indicate a top-level Credible page hosting a form
// directly (no nested iframe). Add fragments here for new page types.
const STANDALONE_FRAME_URL_FRAGMENTS = [
  'credibleplan',
  'credible_plan',
  'plan.asp',
  'planview',
  '/plan/',
  'CrediblePlans',
];

export async function resolveFormFrameId(tabId: number): Promise<number | null> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return null;

    // 1. Look for the standard form iframe first
    const formFrame = frames.find((f) => f.url.includes(FORM_FRAME_URL_FRAGMENT));
    if (formFrame) return formFrame.frameId;

    // 2. Check if any frame URL suggests a standalone plan-editing page
    const standaloneFrame = frames.find((f) =>
      STANDALONE_FRAME_URL_FRAGMENTS.some((frag) => f.url.toLowerCase().includes(frag.toLowerCase()))
    );
    if (standaloneFrame) return standaloneFrame.frameId;

    // 3. If only one frame (top-level page), return null → top frame
    if (frames.length === 1) return null;

    return null;
  } catch {
    return null;
  }
}

// ─── Send a message to the form frame, falling back to the top frame ─────────
// Falls back so standalone pages and local/dev test pages keep working.
//
// For DETECT_FORM_REQUEST specifically, we try ALL frames and return the result
// with the highest confidence — this handles both iframe-based and top-level forms.
export async function sendToFormFrame<T = unknown>(
  tabId: number,
  message: unknown
): Promise<T> {
  const msg = message as ExtensionMessage;

  // For form detection, poll all frames and pick the best result
  if (msg.type === 'DETECT_FORM_REQUEST') {
    return bestFrameDetect<T>(tabId, message);
  }

  // For other messages (autofill, etc.), use the resolved frame
  const frameId = await resolveFormFrameId(tabId);
  const options = frameId !== null ? { frameId } : undefined;
  return chrome.tabs.sendMessage(tabId, message, options) as Promise<T>;
}

// ─── Poll all frames for DETECT_FORM_REQUEST and pick the best result ────────
async function bestFrameDetect<T>(tabId: number, message: unknown): Promise<T> {
  type DetectPayload = { formType: string; confidence: number; formContext?: string; fvid?: string; bundle?: string };
  type DetectResponse = { type: string; payload?: DetectPayload; error?: string };

  let frames: chrome.webNavigation.GetAllFrameResultDetails[] = [];
  try {
    frames = (await chrome.webNavigation.getAllFrames({ tabId })) ?? [];
  } catch {
    // Fallback: just send to top frame
    return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
  }

  const httpFrames = frames.filter((f) => f.url && /^https?:/.test(f.url));

  let best: DetectResponse | null = null;
  let bestConfidence = -1;

  const tryFrames = async (frameList: typeof httpFrames) => {
    await Promise.all(
      frameList.map(async (frame) => {
        try {
          const resp = await chrome.tabs.sendMessage(tabId, message, {
            frameId: frame.frameId,
          }) as DetectResponse;
          if (resp?.type === 'FORM_DETECTED') {
            const conf = resp.payload?.confidence ?? 0;
            if (conf > bestConfidence) {
              bestConfidence = conf;
              best = resp;
            }
          }
        } catch {
          // Frame may not have content script — ignore
        }
      })
    );
  };

  await tryFrames(httpFrames);

  if (best) return best as unknown as T;

  // ── Content script not responding in any frame — try to inject it now ────
  // This happens when the extension is reloaded/updated while a tab is open,
  // or when the page URL matches a newly-added host pattern not in the previous
  // manifest. The scripting API lets us inject without requiring a page reload.
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content-scripts/content.js'],
    });
    // Brief wait for the injected script to initialize its message listener
    await new Promise((r) => setTimeout(r, 350));
    // Retry across all frames after injection
    await tryFrames(httpFrames);
  } catch {
    // scripting.executeScript may fail if the tab URL is not covered by
    // host_permissions (e.g. chrome:// pages). Swallow and fall through.
  }

  if (best) return best as unknown as T;

  // Last-resort: send to top frame (will throw if still unavailable — caller
  // shows "Content script unavailable" error which prompts the user to reload)
  return chrome.tabs.sendMessage(tabId, message) as Promise<T>;
}
