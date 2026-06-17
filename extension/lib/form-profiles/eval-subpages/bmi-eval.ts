import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8/1.9) — BMI radios/inputs
// are medical/vitals data and are skipped pending live verification (task
// 8.1); only the narrative comments field is targeted for now.
export const BMI_EVAL: FormProfile = {
  id: 'BMI Eval',
  displayName: 'Adult/Child Eval/Mgmt Exam',
  detection: {
    anchors: ['Eval/Mgmt Exam', 'BMI'],
    supporting: ['Body Mass Index'],
    categoryIds: [27096, 27097],
  },
  fields: [
    { key: 'bmiComments', type: 'textarea', labels: ['Comments'] },
  ],
};
