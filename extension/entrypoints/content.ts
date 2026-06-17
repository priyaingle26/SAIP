
import { detectCredibleForm, mapNoteToFields, applyAutofill, detectFormType, applyFormAutofill } from '../lib/fieldMapper';
import { getProfileById } from '../lib/form-profiles';
import { persistFillLog } from '../lib/fillLog';
import type { ExtensionMessage, ClinicalNote } from '../lib/schemas';

// The per-encounter id that scopes the evaluation cache, so a bundle is
// generated once per evaluation instance and reused across its sub-pages.
// Credible deployments expose this as either `fvid` or `visittemp_id` in the
// form frame URL — accept whichever is present.
function getEncounterId(): string | null {
  try {
    const params = new URL(window.location.href).searchParams;
    return params.get('fvid') ?? params.get('visittemp_id');
  } catch {
    return null;
  }
}

export default defineContentScript({
  matches: [
    'https://*.crediblebh.com/*',
    'https://*.thecrediblesolution.com/*',
    'https://*.crediblebh.com/webforms/questions.asp*',
    'http://localhost/*',
  ],
  allFrames: true,
  main() {
    // ── On load: detect legacy Credible SOAP form ────────────────────────────
    if (detectCredibleForm()) {
      chrome.runtime.sendMessage({
        type: 'RECORDING_STARTED', // reuse as "form detected" signal
        payload: { formDetected: true, url: window.location.href },
      });
    }

    // ── On load: detect Community Healthcore form type and broadcast ─────────
    const detected = detectFormType();
    if (detected.confidence > 0) {
      chrome.runtime.sendMessage({
        type: 'FORM_DETECTED',
        payload: detected,
      });
    }

    // ── Listen for messages from background / side panel ─────────────────────
    chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender, sendResponse) => {

        // ── Legacy SOAP autofill ────────────────────────────────────────────
        if (message.type === 'AUTOFILL_REQUEST') {
          try {
            const { note } = message.payload as { note: ClinicalNote };
            const fields = mapNoteToFields(note);
            const count = applyAutofill(fields);
            sendResponse({ type: 'AUTOFILL_COMPLETE', payload: { count } });
          } catch (err) {
            sendResponse({ type: 'ERROR', error: String(err) });
          }
          return true;
        }

        // ── Form detection request from side panel ──────────────────────────
        if (message.type === 'DETECT_FORM_REQUEST') {
          try {
            const result = detectFormType();
            // Also capture the page body text for formContext
            const formContext = (document.body.innerText ?? '').trim().slice(0, 8000);
            const fvid = getEncounterId();
            // The bundle TYPE comes from the matched profile (stable across
            // deployments), not from a deployment-specific fvid->bundle map.
            const bundle = getProfileById(result.formType)?.bundle;
            sendResponse({
              type: 'FORM_DETECTED',
              payload: { ...result, formContext, fvid: fvid ?? undefined, bundle },
            });
          } catch (err) {
            sendResponse({ type: 'ERROR', error: String(err) });
          }
          return true;
        }

        // ── Form Assistant autofill ─────────────────────────────────────────
        if (message.type === 'AUTOFILL_FORM_REQUEST') {
          try {
            const { formType, fields } = message.payload as {
              formType: string;
              fields: Record<string, string>;
            };
            const result = applyFormAutofill(formType, fields);
            const logEntry = {
              formType,
              ...result,
              frameUrl: window.location.href,
              ts: Date.now(),
            };
            persistFillLog(logEntry).catch(() => {});
            sendResponse({ type: 'AUTOFILL_FORM_COMPLETE', payload: logEntry });
          } catch (err) {
            sendResponse({ type: 'ERROR', error: String(err) });
          }
          return true;
        }
      }
    );
  },
});
