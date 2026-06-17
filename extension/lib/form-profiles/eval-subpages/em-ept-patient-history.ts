import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.9) — needs live fingerprint
// verification (task 8.1). Vitals text inputs omitted for now (uncertain DOM
// structure); chief complaint / HPI narrative fields are the safe target.
export const EM_EPT_PATIENT_HISTORY: FormProfile = {
  id: 'E&M EPT - Patient History',
  displayName: 'E&M EPT — Patient History',
  bundle: 'em-ept',
  detection: {
    anchors: ['Chief Complaint', 'History of Present Illness'],
    supporting: ['Patient History', 'History source'],
    categoryIds: [27091],
  },
  fields: [
    { key: 'historySource', type: 'radio', labels: ['History source'] },
    { key: 'chiefComplaint', type: 'textarea', labels: ['Chief Complaint'] },
    { key: 'historyPresentIllness', type: 'textarea', labels: ['History of Present Illness', 'HPI'] },
  ],
};
