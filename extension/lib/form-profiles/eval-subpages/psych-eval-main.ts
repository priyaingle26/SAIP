import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8) — needs live fingerprint
// verification (task 8.1). Confirmed category_id from the bundle footer URL.
export const PSYCH_EVAL_MAIN: FormProfile = {
  id: 'Psych Eval - Main',
  displayName: 'Psychiatric Evaluation',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Psychiatric Evaluation', 'Presenting Problem'],
    supporting: ['Community Healthcore', 'Source of Information'],
    categoryIds: [26965],
  },
  fields: [
    { key: 'sourceOfInformation', type: 'radio', labels: ['Source of Information', 'Sources of Information'] },
    { key: 'presentingProblems', type: 'textarea', labels: ['Presenting Problem'] },
    { key: 'familyHistory', type: 'textarea', labels: ['Family History', 'Other/Family History', 'Other information / past social and family history for review at follow-up'] },
    {
      key: 'swallowingForeignObjects',
      type: 'radio',
      labels: ['Does the consumer have a history of swallowing foreign objects', 'swallowing foreign objects'],
      options: ['Yes', 'No'],
    },
    { key: 'foreignObjectsDetail', type: 'plain-textarea', labels: ['What foreign objects have been swallowed', 'If yes: What foreign objects'] },
  ],
};
