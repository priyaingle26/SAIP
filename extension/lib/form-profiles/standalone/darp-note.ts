import type { FormProfile } from '../types';

// Confirmed live (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.1).
export const DARP_NOTE: FormProfile = {
  id: 'Counseling Progress Note',
  displayName: 'DA(R)P Note',
  detection: {
    anchors: ['DA(R)P', 'DARP', 'METHODS USED DURING SESSION'],
    supporting: ['MODALITY', 'MATERIAL USED DURING SESSION', 'PLAN FOR THE NEXT SESSION'],
  },
  fields: [
    { key: 'modality', type: 'radio', labels: ['Modality'], options: ['Individual', 'Family', 'Couple'] },
    { key: 'participants', type: 'checkbox-group', labels: ['Who was present'], options: ['Client', 'Others'] },
    { key: 'methodsUsed', type: 'textarea', labels: ['METHODS USED DURING SESSION'] },
    { key: 'materialsUsed', type: 'textarea', labels: ['MATERIAL USED DURING SESSION'] },
    { key: 'data', type: 'textarea', labels: ['DATA'] },
    { key: 'assessment', type: 'textarea', labels: ['ASSESSMENT'] },
    { key: 'response', type: 'textarea', labels: ['RESPONSE'] },
    { key: 'plan', type: 'textarea', labels: ['PLAN'] },
  ],
};
