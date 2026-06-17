import type { FormProfile } from '../types';

// From PDF (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8/1.9) — needs live
// fingerprint verification (task 8.1) to confirm the exact 11 system labels.
export const REVIEW_OF_SYSTEMS: FormProfile = {
  id: 'Review of Systems',
  displayName: 'Review of Systems',
  detection: {
    anchors: ['REVIEW OF SYSTEMS'],
    supporting: ['ROS', 'Systems Review'],
    categoryIds: [27095],
  },
  fields: [
    {
      key: 'rosFindings',
      type: 'checkbox-group',
      labels: ['REVIEW OF SYSTEMS'],
      options: [
        'Constitutional', 'Eyes', 'ENT', 'Cardiovascular', 'Respiratory',
        'Gastrointestinal', 'Genitourinary', 'Musculoskeletal', 'Skin',
        'Neurological', 'Psychiatric',
      ],
    },
    { key: 'rosComments', type: 'textarea', labels: ['ROS Comments', 'Systems Review Comments'] },
  ],
};
