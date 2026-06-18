import { CREDIBLE_SELECTORS } from './constants';
import { ALL_PROFILES, getProfileById } from './form-profiles';
import { MSE_SIGNATURES } from './form-profiles/mseSignatures';
import type { FieldDef, FormProfile } from './form-profiles/types';
import type { ClinicalNote, FormField, DetectedForm } from './schemas';

// ─── Find first matching selector on the current page ────────────────────────
function resolveSelector(candidates: readonly string[]): string | null {
  for (const sel of candidates) {
    if (document.querySelector(sel)) return sel;
  }
  return null;
}

// ─── Map a ClinicalNote to legacy SOAP FormFields ────────────────────────────
export function mapNoteToFields(note: ClinicalNote): FormField[] {
  const fields: FormField[] = [];
  const mapping: Array<{ key: keyof typeof CREDIBLE_SELECTORS; value: string | undefined }> = [
    { key: 'subjective', value: note.subjective },
    { key: 'objective', value: note.objective },
    { key: 'assessment', value: note.assessment },
    { key: 'plan', value: note.plan },
    { key: 'chiefComplaint', value: note.chiefComplaint },
    { key: 'mentalStatusExam', value: note.mentalStatusExam },
    { key: 'riskAssessment', value: note.riskAssessment },
    { key: 'interventions', value: note.interventions },
    { key: 'goals', value: note.goals },
    { key: 'subjective', value: note.raw },
  ];
  for (const { key, value } of mapping) {
    if (!value) continue;
    const selector = resolveSelector(CREDIBLE_SELECTORS[key]);
    if (selector) fields.push({ selector, value, label: key });
  }
  return fields;
}

// ─── Inject values into DOM fields ───────────────────────────────────────────
export function applyAutofill(fields: FormField[]): number {
  let count = 0;
  for (const field of fields) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(field.selector);
    if (!el) continue;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) nativeSetter.call(el, field.value);
    else el.value = field.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    count++;
  }
  return count;
}

// ─── Detect legacy SOAP form ──────────────────────────────────────────────────
export function detectCredibleForm(): boolean {
  return [...CREDIBLE_SELECTORS.subjective, ...CREDIBLE_SELECTORS.objective].some(
    (sel) => !!document.querySelector(sel)
  );
}

// =============================================================================
// FORM ASSISTANT — Type-Aware Credible BH Autofill Engine
// =============================================================================
// Credible BH renders forms with three id prefixes whose ROLE must be
// resolved at runtime, not assumed (see docs/FORM-AUTOFILL-ARCHITECTURE.md §8.2):
//   qnotes_NNNNNN  = rich-text textarea (narrative)
//   q_NNNNNN       = generic question field — checkbox / text / multi-select
//                    group, depending on what's actually in the DOM
//   x_NNNNNN       = scored button-group widget (PHQ-9 etc.) — never filled
//
// Labels are NOT linked via <label for="">; they are text in the same table
// row/cell as the field. Every finder below locates fields by nearby text,
// not by id, so the engine is portable across Credible deployments.
// =============================================================================

// ─── Detect form type from page content (weighted profile scoring) ──────────
function getCategoryIdFromUrl(): number | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('category_id');
    return raw ? Number.parseInt(raw, 10) : null;
  } catch {
    return null;
  }
}

export function detectFormType(): DetectedForm {
  // Optional deployment fast-path: an exact category_id match short-circuits
  // keyword scoring (form-detection spec, "category_id mapping configured").
  const categoryId = getCategoryIdFromUrl();
  if (categoryId !== null) {
    const fastMatch = ALL_PROFILES.find((p) => p.detection.categoryIds?.includes(categoryId));
    if (fastMatch) return { formType: fastMatch.id, confidence: 0.97 };
  }

  const pageText = [
    document.title,
    ...Array.from(document.querySelectorAll('h1,h2,h3,h4,label,th')).map((el) => el.textContent ?? ''),
    document.body.innerText.slice(0, 5000),
  ]
    .join(' ')
    .toUpperCase();

  let best: { profile: FormProfile; score: number } | null = null;
  let secondScore = 0;

  for (const profile of ALL_PROFILES) {
    const anchorHits = profile.detection.anchors.filter((kw) => pageText.includes(kw.toUpperCase())).length;
    const supportHits = profile.detection.supporting.filter((kw) => pageText.includes(kw.toUpperCase())).length;
    const score = anchorHits * 3 + supportHits;

    if (!best || score > best.score) {
      secondScore = best ? best.score : 0;
      best = { profile, score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best || best.score === 0) return { formType: 'Unknown', confidence: 0 };

  const tie = best.score === secondScore;
  const confidence = tie ? Math.min(0.5 + best.score * 0.08, 0.45) : Math.min(0.5 + best.score * 0.08, 0.97);

  return { formType: best.profile.id, confidence };
}

// ─── Set native value + fire framework events ─────────────────────────────────
function setNativeValue(el: HTMLElement, value: string): void {
  if (el instanceof HTMLSelectElement) {
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
    if (nativeSetter) nativeSetter.call(el, value);
    else (el as HTMLInputElement).value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// ─── Get text near an element (label text in Credible) ───────────────────────
// Credible renders labels as plain text in the same <td>/<tr>, either before
// or after the field, never via <label for="">. Search order: direct text
// siblings → sibling <td>s → full row text (covers label-before-field too).
function getAdjacentText(el: HTMLElement): string {
  // Check next siblings first (label after input, e.g. radio/checkbox options).
  // Use >= 2 so short values like "No" and "NA" are not skipped.
  let next = el.nextSibling;
  while (next) {
    const t = next.textContent?.trim();
    if (t && t.length >= 2) return t;
    next = next.nextSibling;
  }

  // Check previous siblings (label before input, e.g. textarea labels).
  let prev = el.previousSibling;
  while (prev) {
    const t = prev.textContent?.trim();
    if (t && t.length >= 2) return t;
    prev = prev.previousSibling;
  }

  const parentCell = el.closest('td, th') as HTMLElement | null;
  if (parentCell) {
    let siblingCell = parentCell.nextElementSibling as HTMLElement | null;
    while (siblingCell) {
      const t = siblingCell.textContent?.trim();
      if (t && t.length >= 2) return t;
      siblingCell = siblingCell.nextElementSibling as HTMLElement | null;
    }
    // Also check the preceding row for labels that sit above the input.
    const row = parentCell.closest('tr');
    const prevRow = row?.previousElementSibling as HTMLElement | null;
    if (prevRow) {
      const t = (prevRow.innerText ?? '').replace(/\s+/g, ' ').trim();
      if (t.length >= 2) return t;
    }
  }

  const row = el.closest('tr') as HTMLElement | null;
  if (row) {
    const rowText = (row.innerText ?? '').replace(/\s+/g, ' ').trim();
    if (rowText.length >= 2) return rowText;
  }

  const parent = el.parentElement;
  if (parent) {
    const parentText = Array.from(parent.childNodes)
      .filter((n) => n !== el)
      .map((n) => n.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (parentText.length >= 2) return parentText;
  }

  return '';
}

// ─── Generic "find element by nearby label text" finder ─────────────────────
function findElementByLabel<T extends HTMLElement>(
  selector: string,
  labelCandidates: string[],
  predicate?: (el: T) => boolean
): T | null {
  const elements = Array.from(document.querySelectorAll<T>(selector));
  for (const el of elements) {
    if (predicate && !predicate(el)) continue;
    const text = getAdjacentText(el).toUpperCase();
    if (labelCandidates.some((c) => text.includes(c.toUpperCase()))) return el;
  }
  return null;
}

// ─── Find the smallest element whose text contains a question keyword ────────
// Credible renders radio/checkbox option groups inside their own inner tables
// that contain only the option labels ("Yes/No/NA"), NOT the question text.
// To scope a group to its question we locate the question text element directly
// and then take the first group that follows it in document order. Picking the
// smallest matching element keeps the anchor tight (the question cell itself).
function findTextAnchor(keywords: string[]): HTMLElement | null {
  const kws = keywords.map((k) => k.toUpperCase());
  const els = Array.from(
    document.querySelectorAll<HTMLElement>('td,th,label,span,div,p,b,strong,li,h1,h2,h3,h4')
  );
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of els) {
    const text = (el.textContent ?? '').toUpperCase();
    if (kws.some((k) => text.includes(k)) && text.length < bestLen) {
      best = el;
      bestLen = text.length;
    }
  }
  return best;
}

// ─── Restrict inputs to the group (shared name/id) following a question anchor ─
// Credible option groups share one name/id across all options. Once we find the
// first input after the question anchor, we keep only its same-named siblings.
function groupAfterAnchor<T extends HTMLInputElement>(elements: T[], anchor: HTMLElement | null): T[] {
  if (!anchor) return elements;
  const firstAfter = elements.find(
    (el) => (anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  );
  if (!firstAfter) return elements;
  const groupName = firstAfter.name || firstAfter.id;
  return elements.filter((el) => (el.name || el.id) === groupName);
}

// ─── Build label map using the q_ → qnotes_ Credible pattern ─────────────────
// Only treats a q_ checkbox as an "enable checkbox" when a paired qnotes_
// textarea actually exists — MSE-style q_ ids (which share one id across many
// checkboxes and have no qnotes_ pair) are naturally excluded here.
function buildCredibleLabelMap(): Map<string, HTMLTextAreaElement> {
  const map = new Map<string, HTMLTextAreaElement>();

  const checkboxes = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][id^="q_"]')
  );

  for (const cb of checkboxes) {
    const qId = cb.id;
    const notesId = 'qnotes_' + qId.slice(2);
    const ta = document.getElementById(notesId) as HTMLTextAreaElement | null;
    if (!ta || ta.tagName !== 'TEXTAREA') continue;

    const text = getAdjacentText(cb).toUpperCase().trim();
    if (text) map.set(text, ta);
  }

  return map;
}

function findTextareaByLabel(
  candidates: string[],
  labelMap: Map<string, HTMLTextAreaElement>
): HTMLTextAreaElement | null {
  for (const [mapLabel, ta] of labelMap.entries()) {
    for (const candidate of candidates) {
      if (mapLabel.includes(candidate.toUpperCase())) return ta;
    }
  }
  return null;
}

// ─── Plain <textarea> finder (no q_/qnotes_ pairing) ─────────────────────────
// Used for forms like Recovery Plan Review's "If yes, specify:" field.
function fillPlainTextarea(labels: string[], value: string): boolean {
  const ta = findElementByLabel<HTMLTextAreaElement>(
    'textarea',
    labels,
    (el) => !el.id.startsWith('qnotes_')
  );
  if (!ta) return false;
  setNativeValue(ta, value);
  return true;
}

// ─── Plain text input finder ──────────────────────────────────────────────────
function fillText(labels: string[], value: string): boolean {
  const input = findElementByLabel<HTMLInputElement>('input[type="text"]', labels);
  if (!input) return false;
  setNativeValue(input, value);
  return true;
}

// ─── Dropdown (<select>) finder ───────────────────────────────────────────────
function fillDropdown(labels: string[], value: string): boolean {
  const select = findElementByLabel<HTMLSelectElement>('select', labels);
  if (!select) return false;
  setNativeValue(select, value);
  return true;
}

// ─── Select radio button by value text ───────────────────────────────────────
// Scopes to the radio group that follows the question text (groupKeywords),
// then matches the option whose adjacent label equals/contains the target value
// (exact match preferred so "No"/"NA" don't collide).
function selectRadio(groupKeywords: string[], targetValue: string): boolean {
  const valueLower = targetValue.toLowerCase().trim();
  if (!valueLower) return false;

  const allRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const anchor = findTextAnchor(groupKeywords);
  const candidates = groupAfterAnchor(allRadios, anchor);

  let match =
    candidates.find((r) => getAdjacentText(r).toLowerCase().trim() === valueLower) ??
    candidates.find((r) => getAdjacentText(r).toLowerCase().includes(valueLower)) ??
    candidates.find((r) => r.value.toLowerCase() === valueLower);

  // Numeric fallback: a value like "3" on an N-option radio (e.g. PHQ-9 Q10
  // difficulty) selects the Nth option in order (0-based) when no text matched.
  if (!match && /^\d+$/.test(valueLower)) {
    const idx = parseInt(valueLower, 10);
    if (idx >= 0 && idx < candidates.length) match = candidates[idx];
  }

  if (!match) return false;
  match.checked = true;
  match.dispatchEvent(new Event('click', { bubbles: true }));
  match.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// ─── Select a scored button-group widget (x_ 0/1/2/3) by value ──────────────
// Credible renders scored items (PHQ-9 etc.) as a group of <input type="button"
// class="p-push-btn"> sharing one name/id, with value="0".."3". The question
// text shares the button's table row. We locate the group whose row text matches
// the field label, then click the button whose value equals the score. Clicking
// runs Credible's own inline onclick (selection highlight + score auto-compute),
// so we click exactly once (a second click would toggle it back off).
// Locate (but do NOT click) the scored-widget button for one question row.
// Credible PHQ-style widgets render 4 push-buttons per row that share the same
// id/name (e.g. x_516210) with values "0".."3"; selection is a color toggle
// driven by an inline jQuery onclick. We match the row by its question text and
// return the button whose value equals the wanted score. Clicking is deferred to
// fireScoredClicksSequentially() — see below.
function findScoredButton(labels: string[], value: string): HTMLInputElement | null {
  const wanted = value.trim();
  if (!/^\d+$/.test(wanted)) return null; // scored widgets expect a numeric value

  const buttons = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="button"][id^="x_"]')
  );
  if (!buttons.length) return null;

  const groups = new Map<string, HTMLInputElement[]>();
  for (const b of buttons) {
    const key = b.name || b.id;
    const arr = groups.get(key) ?? [];
    arr.push(b);
    groups.set(key, arr);
  }

  const upperLabels = labels.map((l) => l.toUpperCase());
  for (const groupButtons of groups.values()) {
    const row = groupButtons[0].closest('tr');
    const rowText = (row?.innerText ?? row?.textContent ?? '').toUpperCase();
    if (!upperLabels.some((l) => rowText.includes(l))) continue;
    return groupButtons.find((b) => b.value.trim() === wanted) ?? null;
  }
  return null;
}

// Is this scored button already the selected one in its row? Selection is shown
// by a distinct background color, so the selected button's color differs from its
// (identical-colored) row siblings. Deployment-agnostic: we don't assume a
// specific color — we find the majority (unselected) color among the row's
// buttons and treat any button differing from it as selected.
function isScoredButtonSelected(btn: HTMLInputElement): boolean {
  const colorOf = (b: HTMLInputElement) => getComputedStyle(b).backgroundColor;
  let group: HTMLInputElement[] = [];
  if (btn.name) {
    group = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `input[type="button"][name="${CSS.escape(btn.name)}"]`,
      ),
    );
  }
  if (group.length < 2) return false; // can't compare — assume not selected

  const counts = new Map<string, number>();
  for (const b of group) counts.set(colorOf(b), (counts.get(colorOf(b)) ?? 0) + 1);
  let unselected = '';
  let max = -1;
  for (const [color, n] of counts) if (n > max) { max = n; unselected = color; }

  return colorOf(btn) !== unselected;
}

// Click scored buttons ONE AT A TIME with a gap. Each button's inline onclick
// runs an animated jQuery color toggle + a heavy Calcfields() recalculation;
// firing many in the same synchronous burst makes the page read stale colors and
// mis-toggle (fills one row but corrupts the rest). Staggering lets each row's
// handler settle before the next click. We also SKIP buttons already selected,
// because the onclick toggles — re-clicking a selected value would deselect it
// (e.g. on a second "fill" pass over already-filled rows). Fire-and-forget: the
// autofill counts are already known synchronously from findScoredButton().
async function fireScoredClicksSequentially(targets: HTMLInputElement[]): Promise<void> {
  for (const btn of targets) {
    try {
      if (isScoredButtonSelected(btn)) continue; // already set — clicking would toggle it OFF
      btn.focus();
      btn.click(); // triggers the page's inline onclick (selection + scoring)
    } catch {
      /* element detached — skip */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ─── Tick participant checkboxes (Client/Individual + Others) ────────────────
// Handles the DA(R)P / SIRP "Others (please identify)" pattern: an extra
// qnotes_ textarea is filled with the names when "Others" is selected.
function applyParticipantCheckboxes(value: string): number {
  const valueLower = value.toLowerCase();
  let filled = 0;

  // Names beyond Client/Individual — only then should "Others" be ticked.
  const extraNames = valueLower.replace(/client|individual/g, '').replace(/[,;]/g, '').trim();

  const allCheckboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

  for (const cb of allCheckboxes) {
    const cbText = getAdjacentText(cb).toLowerCase();

    // Classify "Others" FIRST and skip the Client branch: the Others label
    // ("Others ... relationship(s) to Client") itself contains the word
    // "Client", so it would otherwise be wrongly ticked by the Client branch.
    const isOthers = cbText.includes('other') || cbText.includes('please identify');
    if (isOthers) {
      if (extraNames.length > 0) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (cb.id.startsWith('q_')) {
          const ta = document.getElementById('qnotes_' + cb.id.slice(2)) as HTMLTextAreaElement | null;
          if (ta) setNativeValue(ta, value.replace(/client|individual,?\s*/gi, '').trim());
        }
        filled++;
      }
      continue;
    }

    if (
      (cbText.includes('client') || cbText.includes('individual')) &&
      (valueLower.includes('client') || valueLower.includes('individual'))
    ) {
      if (!cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      filled++;
    }
  }
  return filled;
}

// ─── Flat (non-q_) checkbox group finder ──────────────────────────────────────
// Used by FAYS participants, Recovery Plan modifications, ROS systems — ticks
// every checkbox whose adjacent text matches a token in the AI's value.
function applyCheckboxGroup(value: string, labels?: string[]): number {
  const tokens = value
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return 0;

  // Credible renders these as a shared-id/name group (all options share one
  // q_NNNNNN id). Scope to the group following the question anchor when labels
  // are provided; otherwise consider every checkbox on the page.
  const allBoxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
  const anchor = labels ? findTextAnchor(labels) : null;
  const checkboxes = groupAfterAnchor(allBoxes, anchor);

  let filled = 0;
  for (const cb of checkboxes) {
    const cbText = getAdjacentText(cb).toLowerCase().trim();
    if (!cbText) continue;
    if (tokens.some((tok) => tok.length > 1 && (cbText === tok || cbText.includes(tok) || tok.includes(cbText)))) {
      if (!cb.checked) {
        cb.checked = true;
        cb.dispatchEvent(new Event('click', { bubbles: true }));
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      filled++;
    }
  }
  return filled;
}

// ─── MSE-style grouped multi-select (shared q_ id) ────────────────────────────
// MSE checkboxes share ONE q_NNNNNN id across all options in a category
// (docs/FORM-AUTOFILL-ARCHITECTURE.md §8.3). Group first, then identify each
// group by its option-set overlap with MSE_SIGNATURES; ties (INSIGHT/
// JUDGEMENT/LANGUAGE share an identical option set) resolve by DOM order.
interface MseGroup {
  id: string;
  elements: HTMLInputElement[];
  optionTexts: string[];
}

function buildMseGroups(): MseGroup[] {
  const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][id^="q_"]'));
  const byId = new Map<string, HTMLInputElement[]>();
  for (const cb of checkboxes) {
    const arr = byId.get(cb.id) ?? [];
    arr.push(cb);
    byId.set(cb.id, arr);
  }

  const groups: MseGroup[] = [];
  for (const [id, elements] of byId.entries()) {
    // A real "enable checkbox" (q_ paired with qnotes_) is a single-element
    // group with no qnotes_ sibling distinction needed here — MSE groups are
    // identified by having MULTIPLE checkboxes sharing the same id.
    if (elements.length < 2) continue;
    groups.push({ id, elements, optionTexts: elements.map((el) => getAdjacentText(el)) });
  }
  return groups;
}

function matchMseGroupToSignature(
  groups: MseGroup[]
): Map<string, MseGroup> {
  // key = MSE_SIGNATURES[i].key -> best-matching DOM group
  const assigned = new Map<string, MseGroup>();
  const usedGroupIds = new Set<string>();

  // Score every (signature, group) pair by option overlap, highest first.
  const candidates: Array<{ sigKey: string; group: MseGroup; score: number; tiebreak: number }> = [];
  for (const sig of MSE_SIGNATURES) {
    if (!sig.options.length) continue;
    for (const group of groups) {
      const lowerOptions = group.optionTexts.map((t) => t.toLowerCase());
      const score = sig.options.filter((opt) => lowerOptions.some((t) => t.includes(opt.toLowerCase()))).length;
      if (score > 0) {
        candidates.push({ sigKey: sig.key, group, score, tiebreak: sig.tiebreakOrder ?? 0 });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.tiebreak - b.tiebreak);

  for (const c of candidates) {
    if (assigned.has(c.sigKey) || usedGroupIds.has(c.group.id)) continue;
    assigned.set(c.sigKey, c.group);
    usedGroupIds.add(c.group.id);
  }

  return assigned;
}

function applyMseGroups(fields: FieldDef[], values: Record<string, string>): { filled: number; missed: string[] } {
  const groups = buildMseGroups();
  const matched = matchMseGroupToSignature(groups);

  let filled = 0;
  const missed: string[] = [];

  for (const field of fields) {
    const value = values[field.key];
    if (!value || !value.trim()) continue;

    const group = matched.get(field.key);
    if (!group) {
      missed.push(field.key);
      continue;
    }

    const tokens = value
      .split(/[,;]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    let any = false;
    for (const el of group.elements) {
      const text = getAdjacentText(el).toLowerCase();
      if (tokens.some((tok) => tok.length > 1 && text.includes(tok))) {
        if (!el.checked) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        any = true;
      }
    }

    if (any) filled++;
    else missed.push(field.key);
  }

  return { filled, missed };
}

// ─── Scored widget detection (PHQ-9, AUDIT-C, CRAFFT, C-SSRS) ─────────────────
// x_NNNNNN button-group widgets are patient-administered scored values and
// are NEVER auto-filled (proposal.md patient-safety decision). Recognized and
// reported as "manual entry required" instead.
function detectScoredWidgets(): string[] {
  const buttons = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="button"][id^="x_"]'));
  return Array.from(new Set(buttons.map((b) => b.id)));
}

// ─── Main autofill entry point ────────────────────────────────────────────────
export interface AutofillResult {
  filled: number;
  missed: string[];
  manualRequired: string[];
  labelsSeen: string[];
}

/**
 * @param confirmedProfileValues Optional map of field_key → value sourced from
 *   patient profile fields with provenance='confirmed'.  Confirmed values take
 *   precedence over AI-generated values for the same key, and a scored-widget
 *   field that is successfully filled from a confirmed value is removed from
 *   manualRequired.  This is the generic mechanism: no form-specific logic.
 */
export function applyFormAutofill(
  formType: string,
  fields: Record<string, string>,
  confirmedProfileValues?: Record<string, string>,
): AutofillResult {
  const profile = getProfileById(formType);
  if (!profile) {
    return { filled: 0, missed: Object.keys(fields), manualRequired: [], labelsSeen: [] };
  }

  // Merge: confirmed values from the patient profile override AI-generated ones
  const effectiveFields: Record<string, string> = confirmedProfileValues
    ? {
        ...fields,
        ...Object.fromEntries(
          Object.entries(confirmedProfileValues).filter(([, v]) => v?.trim()),
        ),
      }
    : fields;

  const textareaLabelMap = buildCredibleLabelMap();

  console.log(
    '[SAIP] Credible textarea field map:',
    Object.fromEntries(Array.from(textareaLabelMap.entries()).map(([k, v]) => [k.slice(0, 60), v.id]))
  );

  let filled = 0;
  const missed: string[] = [];
  const scoredClicks: HTMLInputElement[] = [];   // scored buttons to click sequentially after the loop

  // mse-group fields are matched as a batch (grouping is computed once).
  const mseFields = profile.fields.filter((f) => f.type === 'mse-group');
  if (mseFields.length) {
    const result = applyMseGroups(mseFields, effectiveFields);
    filled += result.filled;
    missed.push(...result.missed);
  }

  for (const field of profile.fields) {
    if (field.type === 'mse-group') continue; // handled above

    const value = effectiveFields[field.key];
    if (!value || !value.trim()) continue;

    let ok = false;
    switch (field.type) {
      case 'textarea': {
        const ta = findTextareaByLabel(field.labels, textareaLabelMap);
        if (ta) {
          setNativeValue(ta, value);
          ok = true;
        }
        break;
      }
      case 'plain-textarea':
        ok = fillPlainTextarea(field.labels, value);
        break;
      case 'text':
        ok = fillText(field.labels, value);
        break;
      case 'dropdown':
        ok = fillDropdown(field.labels, value);
        break;
      case 'radio':
        ok = selectRadio(field.labels, value);
        break;
      case 'scored-widget': {
        // Resolve the target button now (so filled/missed counts are accurate),
        // but defer the actual click to a staggered pass after the loop.
        const btn = findScoredButton(field.labels, value);
        ok = !!btn;
        if (btn) scoredClicks.push(btn);
        break;
      }
      case 'checkbox-group':
        if (field.key === 'participants') {
          ok = applyParticipantCheckboxes(value) > 0;
        } else {
          ok = applyCheckboxGroup(value, field.labels) > 0;
        }
        break;
    }

    if (ok) filled++;
    else missed.push(field.key);
  }

  // Fire the scored-widget clicks sequentially (fire-and-forget). Counts above
  // are already final; the page updates over the next ~250ms × N.
  if (scoredClicks.length) {
    void fireScoredClicksSequentially(scoredClicks);
  }

  // A scored widget needs manual entry only if we did NOT fill it. Each clicked
  // button's id/name is its widget group id (e.g. x_516210), so widgets we filled
  // are excluded from manualRequired — preventing the bogus "N scored items need
  // manual entry" banner when they were in fact auto-filled.
  const filledWidgetIds = new Set(scoredClicks.map((b) => b.id || b.name));
  const manualRequired = detectScoredWidgets().filter((id) => !filledWidgetIds.has(id));

  const labelsSeen = Array.from(textareaLabelMap.keys());

  return { filled, missed, manualRequired, labelsSeen };
}
