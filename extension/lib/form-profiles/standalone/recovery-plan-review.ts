import type { FormProfile } from '../types';

// From screenshot (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.7). Uses NO q_/qnotes_
// pattern — "If yes, specify:" is a bare <textarea>, hence `plain-textarea`.
export const RECOVERY_PLAN_REVIEW: FormProfile = {
  id: 'Person Centered Recovery Plan',
  displayName: 'Recovery Plan Review',
  detection: {
    anchors: ['Recovery Plan Review', 'Person Centered Recovery Plan'],
    supporting: ['OUTCOME MEASURES', 'satisfied with the services'],
  },
  fields: [
    {
      key: 'modifications',
      type: 'checkbox-group',
      labels: ['the following modification', 'plan was updated to reflect'],
      options: [
        'Updated Strengths and/or Barriers',
        'New or Revised Objective(s)',
        'Change in Assignment (SAI)',
        'New or Revised Goal(s)',
        'New or Revised Intervention(s)',
      ],
    },
    {
      key: 'referralsRequired',
      type: 'radio',
      labels: ['require referral'],
      options: ['Yes', 'No', 'NA'],
    },
    { key: 'referralSpecify', type: 'plain-textarea', labels: ['If yes, specify'] },
    {
      key: 'satisfactionWithServices',
      type: 'radio',
      labels: ['satisfied with the services'],
      options: ['Yes', 'No', 'NA'],
    },
    { key: 'individualStatement', type: 'plain-textarea', labels: ['Individual statement in quotes'] },
  ],
};
