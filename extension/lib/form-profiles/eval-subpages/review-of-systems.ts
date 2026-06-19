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
      // Live system list (cbh3): the 12 checkboxes on the page.
      options: [
        'Constitutional', 'Eyes', 'Ears/Nose/Throat', 'Cardiovascular',
        'Respiratory', 'Gastrointestinal', 'Genitourinary', 'Musculoskeletal',
        'Integumentary', 'Neurological', 'Endocrine', 'Hematologic/Lymphatic',
      ],
    },
    {
      key: 'rosComments',
      type: 'textarea',
      labels: ['Current Review of Systems and Changes Noted', 'ROS Comments'],
    },
  ],
};
