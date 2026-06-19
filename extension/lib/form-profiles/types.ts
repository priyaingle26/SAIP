// ─── Form Profile types ──────────────────────────────────────────────────────
// A profile is the single declarative source of truth for one Credible form
// (or one reusable evaluation sub-page). Both detection and filling derive
// their behavior from it — adding a form means adding a profile, never
// touching the engine. See openspec/changes/credible-multiform-autofill.

export type FieldType =
  | 'textarea' // q_/qnotes_ rich-text widget
  | 'plain-textarea' // bare <textarea>, no q_ pairing
  | 'text' // <input type="text">
  | 'date' // <input type="date"> (value normalized to YYYY-MM-DD)
  | 'dropdown' // <select>
  | 'radio' // single-choice radio group
  | 'checkbox-group' // flat, non-q_ multi-select checkboxes
  | 'mse-group' // checkboxes sharing one q_ id, multi-select within the group
  | 'scored-widget' // x_ button-group sharing one id (0/1/2/3), one button clicked by value
  | 'scored-options'; // AUDIT-C style: each option is its own x_ button (unique id), value=score

export interface FieldDef {
  key: string;
  type: FieldType;
  labels: string[];
  /** For radio/dropdown/checkbox-group/mse-group: the known option labels. */
  options?: string[];
}

export interface DetectionConfig {
  /** High-weight keywords unique to this form (x3 in scoring). */
  anchors: string[];
  /** Lower-weight keywords also present on other forms (x1 in scoring). */
  supporting: string[];
  /** Optional deployment-specific category_id fast-path values. */
  categoryIds?: number[];
}

export interface FormProfile {
  id: string;
  displayName: string;
  /** Evaluation bundle id (e.g. 'psych-eval' | 'em-ept') for multi-page sub-pages. */
  bundle?: string;
  /** Scored clinical instrument (PHQ-9, C-SSRS). Excluded from bundle aggregation;
   *  filled only when the profile declares explicit scored-widget/radio fields. */
  scored?: boolean;
  detection: DetectionConfig;
  fields: FieldDef[];
}
