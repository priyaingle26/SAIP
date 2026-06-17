import type { FormProfile } from '../types';

// Confirmed live (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.3).
export const FAYS_SOAP_NOTE: FormProfile = {
  id: 'FAYS SOAP Note',
  displayName: 'FAYS SOAP Note',
  detection: {
    anchors: ['SOAP NOTE', 'FAYS', 'Family & Youth Success'],
    supporting: ['FOCUS OF CONTACT', 'SUBJECTIVE', 'OBJECTIVE'],
  },
  fields: [
    {
      key: 'participants',
      type: 'checkbox-group',
      labels: ['Who was present'],
      options: ['Youth', 'Primary Participating Caregiver', 'Secondary Participating Caregiver', 'Other family member/participants'],
    },
    { key: 'focusOfContact', type: 'textarea', labels: ['Focus of Contact'] },
    { key: 'subjective', type: 'textarea', labels: ['Subjective'] },
    { key: 'objective', type: 'textarea', labels: ['Objective'] },
    { key: 'assessment', type: 'textarea', labels: ['Assessment'] },
    { key: 'plan', type: 'textarea', labels: ['Plan'] },
  ],
};
