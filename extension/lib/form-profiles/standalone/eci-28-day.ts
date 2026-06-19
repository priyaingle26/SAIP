import type { FormProfile } from '../types';

// ECI "Serv Del PN" sub-page (standalone Credible form). Records whether a visit
// was a 28-day visit, the reason for any deviation, and a free-text justification.
// Match by question label text, not ids.
export const ECI_28_DAY: FormProfile = {
  id: '28-Day',
  displayName: '28-Day',
  detection: {
    anchors: ['Was this a 28-day visit', '28-Day'],
    supporting: ['Justification', 'Program', 'Family'],
  },
  fields: [
    { key: 'was28DayVisit', type: 'radio', labels: ['Was this a 28-day visit'], options: ['Yes', 'No'] },
    { key: 'reason', type: 'radio', labels: ['Reason'], options: ['Program', 'Family', 'Other'] },
    { key: 'justification', type: 'plain-textarea', labels: ['Justification'] },
  ],
};
