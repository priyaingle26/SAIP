// ─── Resolve the Credible form frame inside the active tab ──────────────────
// Credible BH renders the actual form inside a nested iframe
// (webforms/questions.asp) several levels below the tab's top frame. Messages
// must target that frame specifically — the top frame is just the nav shell.

const FORM_FRAME_URL_FRAGMENT = 'webforms/questions.asp';

export async function resolveFormFrameId(tabId: number): Promise<number | null> {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames) return null;
    const formFrame = frames.find((f) => f.url.includes(FORM_FRAME_URL_FRAGMENT));
    return formFrame ? formFrame.frameId : null;
  } catch {
    return null;
  }
}

// ─── Send a message to the form frame, falling back to the top frame ────────
// Falls back so local/dev test pages (no iframe nesting) keep working.
export async function sendToFormFrame<T = unknown>(
  tabId: number,
  message: unknown
): Promise<T> {
  const frameId = await resolveFormFrameId(tabId);
  const options = frameId !== null ? { frameId } : undefined;
  return chrome.tabs.sendMessage(tabId, message, options) as Promise<T>;
}
