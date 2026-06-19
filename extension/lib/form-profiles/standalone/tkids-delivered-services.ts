import type { FormProfile } from '../types';

// ECI "Serv Del PN" sub-page (standalone Credible form). Billing/service-coding
// page: the service-type code is a deployment-specific dropdown the clinician
// selects; co-visit is a Yes/No radio. Match by question label text, not ids.
export const TKIDS_DELIVERED_SERVICES: FormProfile = {
  id: 'T-KIDS Delivered Services',
  displayName: 'T-KIDS Delivered Services',
  detection: {
    anchors: ['T-KIDS Delivered Services', 'Delivered Service Type Code'],
    supporting: ['Co-Visit'],
  },
  fields: [
    {
      key: 'deliveredServiceTypeCode',
      type: 'dropdown',
      labels: ['Delivered Service Type Code'],
      options: [
        'Assistive Technology',
        'Audiology Services',
        'Nutrition',
        'Occupational Therapy',
        'Physical Therapy',
        'Specialized Skills Training',
        'Speech Language Therapy',
        'Vision Services',
      ],
    },
    { key: 'coVisit', type: 'radio', labels: ['Co-Visit'], options: ['Yes', 'No'] },
  ],
};
