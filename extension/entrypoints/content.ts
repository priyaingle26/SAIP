
import { detectCredibleForm, mapNoteToFields, applyAutofill, detectFormType, applyFormAutofill } from '../lib/fieldMapper';
import type { ExtensionMessage, ClinicalNote } from '../lib/schemas';

export default defineContentScript({
  matches: [
    'https://*.crediblebh.com/*',
    'https://*.thecrediblesolution.com/*',
    'http://localhost/*',
  ],
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
            sendResponse({
              type: 'FORM_DETECTED',
              payload: { ...result, formContext },
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
            sendResponse({ type: 'AUTOFILL_FORM_COMPLETE', payload: result });
          } catch (err) {
            sendResponse({ type: 'ERROR', error: String(err) });
          }
          return true;
        }
      }
    );
  },
});
