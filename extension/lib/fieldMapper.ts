import { CREDIBLE_SELECTORS, FORM_DETECTION_RULES, FORM_FIELD_DEFINITIONS } from './constants';
import type { ClinicalNote, FormField, DetectedForm } from './schemas';

// ─── Find first matching selector on the current page ────────────────────────
function resolveSelector(candidates: readonly string[]): string | null {
  for (const sel of candidates) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

// ─── Map a ClinicalNote to a list of resolved FormFields ─────────────────────
export function mapNoteToFields(note: ClinicalNote): FormField[] {
  const fields: FormField[] = [];

  const mapping: Array<{
    key: keyof typeof CREDIBLE_SELECTORS;
    value: string | undefined;
  }> = [
    { key: 'subjective', value: note.subjective },
    { key: 'objective', value: note.objective },
    { key: 'assessment', value: note.assessment },
    { key: 'plan', value: note.plan },
    { key: 'chiefComplaint', value: note.chiefComplaint },
    { key: 'mentalStatusExam', value: note.mentalStatusExam },
    { key: 'riskAssessment', value: note.riskAssessment },
    { key: 'interventions', value: note.interventions },
    { key: 'goals', value: note.goals },
    // Map raw text to subjective field as a fallback for MVP
    { key: 'subjective', value: note.raw },
  ];

  for (const { key, value } of mapping) {
    if (!value) continue;
    const selector = resolveSelector(CREDIBLE_SELECTORS[key]);
    if (selector) {
      fields.push({ selector, value, label: key });
    }
  }

  return fields;
}

// ─── Inject values into DOM fields and fire change events ────────────────────
export function applyAutofill(fields: FormField[]): number {
  let count = 0;
  for (const field of fields) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      field.selector
    );
    if (!el) continue;

    // Set value using native setter to work with React/Vue-controlled inputs
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, field.value);
    } else {
      el.value = field.value;
    }

    // Fire events so EHR framework picks up the change
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    count++;
  }
  return count;
}

// ─── Detect if the current page is a supported EHR note form ─────────────────
export function detectCredibleForm(): boolean {
  // Look for at least one known SOAP field
  const indicators = [
    ...CREDIBLE_SELECTORS.subjective,
    ...CREDIBLE_SELECTORS.objective,
  ];
  return indicators.some((sel) => !!document.querySelector(sel));
}

// =============================================================================
// FORM ASSISTANT — Form Detection & Label-Based Autofill
// =============================================================================

// ─── Detect form type from page content ──────────────────────────────────────
// Scans title, headings, labels, and body text for known keywords.
// Returns { formType, confidence } where confidence is 0–1.
export function detectFormType(): DetectedForm {
  const pageText = [
    document.title,
    ...Array.from(document.querySelectorAll('h1,h2,h3,h4,label,th')).map(
      (el) => el.textContent ?? ''
    ),
    document.body.innerText.slice(0, 5000), // limit scan to first 5k chars
  ]
    .join(' ')
    .toUpperCase();

  for (const rule of FORM_DETECTION_RULES) {
    const matchCount = rule.keywords.filter((kw) =>
      pageText.includes(kw.toUpperCase())
    ).length;

    if (matchCount > 0) {
      // Confidence scales with how many keywords matched
      const confidence = Math.min(0.6 + matchCount * 0.15, 0.99);
      return { formType: rule.formType, confidence };
    }
  }

  return { formType: 'Unknown', confidence: 0 };
}

// ─── Resolve a textarea/input element by scanning for its label text ─────────
// Walks every label/th/td/div in the DOM and looks for matching text.
// Then returns the nearest textarea or input sibling/child.
function resolveFieldByLabel(labelCandidates: string[]): HTMLElement | null {
  const allTextNodes = Array.from(
    document.querySelectorAll('label, th, td, div, span, p, strong, b')
  );

  for (const labelCandidate of labelCandidates) {
    const upper = labelCandidate.toUpperCase();

    for (const node of allTextNodes) {
      const nodeText = (node.textContent ?? '').trim().toUpperCase();
      if (!nodeText.includes(upper)) continue;

      // Search within parent and siblings for the nearest input/textarea
      const parent = node.parentElement;
      if (!parent) continue;

      // 1. Check within same parent
      const inParent = parent.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), select');
      if (inParent) return inParent;

      // 2. Check next sibling element
      let sibling = node.nextElementSibling as HTMLElement | null;
      while (sibling) {
        const inSibling = sibling.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), select')
          ?? (sibling.tagName === 'TEXTAREA' || sibling.tagName === 'INPUT' || sibling.tagName === 'SELECT'
            ? sibling
            : null);
        if (inSibling) return inSibling;
        sibling = sibling.nextElementSibling as HTMLElement | null;
      }

      // 3. Check grandparent's children
      const grandparent = parent.parentElement;
      if (grandparent) {
        const inGrandparent = grandparent.querySelector<HTMLElement>('textarea, input:not([type="hidden"]), select');
        if (inGrandparent) return inGrandparent;
      }
    }
  }

  return null;
}

// ─── Set a native value on an element and fire input/change events ────────────
function setNativeValue(el: HTMLElement, value: string): void {
  if (el instanceof HTMLSelectElement) {
    // Try to match by value or text
    const opt = Array.from(el.options).find(
      (o) => o.value === value || o.text.toLowerCase() === value.toLowerCase()
    );
    if (opt) el.value = opt.value;
  } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const lower = value.toLowerCase();
    el.checked = lower === 'true' || lower === 'yes' || lower === '1' || lower === el.value.toLowerCase();
  } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      (el as HTMLInputElement).value = value;
    }
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Apply label-based form autofill ─────────────────────────────────────────
// Takes the AI-generated fields dict and maps each key to a DOM element
// using FORM_FIELD_DEFINITIONS label text. Never auto-submits.
export function applyFormAutofill(
  formType: string,
  fields: Record<string, string>
): { filled: number; missed: string[] } {
  const defs = FORM_FIELD_DEFINITIONS[formType];
  if (!defs) return { filled: 0, missed: Object.keys(fields) };

  let filled = 0;
  const missed: string[] = [];

  for (const [fieldKey, value] of Object.entries(fields)) {
    if (!value || !value.trim()) continue;

    const labelCandidates = defs[fieldKey];
    if (!labelCandidates) {
      missed.push(fieldKey);
      continue;
    }

    const el = resolveFieldByLabel(labelCandidates);
    if (!el) {
      missed.push(fieldKey);
      continue;
    }

    setNativeValue(el, value);
    filled++;
  }

  return { filled, missed };
}

