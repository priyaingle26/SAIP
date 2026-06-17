import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8) — only the narrative
// textarea is targeted for now; the Yes/No radios and HIV/Hep B checkboxes
// need live verification (task 8.1) before they can be safely auto-filled.
export const MEDICAL_CONDITIONS: FormProfile = {
  id: 'Medical Conditions',
  displayName: 'Medical Conditions',
  detection: {
    anchors: ['MEDICAL CONDITIONS'],
    supporting: ['Medical History', 'Medical Problems'],
    categoryIds: [27088, 27105],
  },
  fields: [
    { key: 'medicalConditions', type: 'textarea', labels: ['MEDICAL CONDITIONS', 'Medical History'] },
  ],
};
