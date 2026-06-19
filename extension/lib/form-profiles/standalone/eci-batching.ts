import type { FormProfile } from '../types';

// ECI "Serv Del PN" sub-page (standalone Credible form). PM-only batching control:
// a single "Yes" checkbox under "Omit from TKIDS batch". Purely administrative —
// the AI leaves it empty unless the visit explicitly calls for omission.
export const ECI_BATCHING: FormProfile = {
  id: 'Batching (PM USE ONLY)',
  displayName: 'Batching (PM USE ONLY)',
  detection: {
    anchors: ['Batching (PM USE ONLY)', 'Omit from TKIDS batch'],
    supporting: [],
  },
  fields: [
    { key: 'omitFromBatch', type: 'checkbox-group', labels: ['Omit from TKIDS batch'], options: ['Yes'] },
  ],
};
