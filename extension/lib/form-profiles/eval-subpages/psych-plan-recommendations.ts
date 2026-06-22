import type { FormProfile } from '../types';

export const PSYCH_PLAN_RECOMMENDATIONS: FormProfile = {
  id: 'Plan / Recommendations (Psych Eval)',
  displayName: 'Plan / Recommendations',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Plan / Recommendations', 'Plan / Recommendations / Referrals', 'Check if referred to:'],
    supporting: ['Treatment Plan Comments', 'RETURN TO'],
  },
  fields: [
    { key: 'problem1', type: 'textarea', labels: ['Problem (1)', 'Problem'] },
    { key: 'status1', type: 'textarea', labels: ['Status'] },
    { key: 'plan1', type: 'textarea', labels: ['Plan'] },
    { key: 'treatmentPlanComments', type: 'textarea', labels: ['Treatment Plan Comments'] },
    {
      key: 'referredTo',
      type: 'checkbox-group',
      labels: ['Check if referred to:'],
      options: ['Skills Training', 'Counseling', 'General Physician'],
    },
    {
      key: 'returnTo',
      type: 'checkbox-group',
      labels: ['RETURN TO'],
      options: ['Nurse', 'NP', 'PA', 'Doctor', 'N/A - Discharged'],
    },
    { key: 'returnInWeeks', type: 'text', labels: ['In Weeks:', 'WEEKS'] },
  ],
};
