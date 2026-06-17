import type { FormProfile } from '../types';

// Confirmed live (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.4) — replaces the old
// 6-field "IDD Case Management Note" schema, which didn't match the real DOM
// (only 2 textareas + 3 dropdowns exist).
export const IDD_SERVICE_OUTCOME: FormProfile = {
  id: 'IDD Service & Outcome',
  displayName: 'IDD Service & Outcome',
  detection: {
    anchors: ['Service & Outcome', 'SUMMARY OF VISIT', 'MONITORING SERVICES'],
    supporting: ['IDD Case Management', 'Provided To', 'Provided At'],
  },
  fields: [
    { key: 'providedTo', type: 'dropdown', labels: ['Provided To'] },
    { key: 'providedAt', type: 'dropdown', labels: ['Provided At'] },
    { key: 'contactType', type: 'dropdown', labels: ['Contact Type'] },
    { key: 'summaryOfVisit', type: 'textarea', labels: ['SUMMARY OF VISIT'] },
    { key: 'monitoringServices', type: 'textarea', labels: ['MONITORING SERVICES'] },
  ],
};
