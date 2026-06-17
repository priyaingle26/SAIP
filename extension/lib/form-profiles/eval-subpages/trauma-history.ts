import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8) — Yes/No radios omitted
// pending live verification (task 8.1); narrative textarea is the safe target.
export const TRAUMA_HISTORY: FormProfile = {
  id: 'Trauma History',
  displayName: 'Trauma, Abuse, Neglect',
  bundle: 'psych-eval',
  detection: {
    anchors: ['TRAUMA HISTORY', 'Trauma, Abuse, Neglect'],
    supporting: ['ACEs'],
    categoryIds: [27082],
  },
  fields: [
    { key: 'traumaHistory', type: 'textarea', labels: ['TRAUMA HISTORY', 'Trauma/Abuse History'] },
  ],
};
