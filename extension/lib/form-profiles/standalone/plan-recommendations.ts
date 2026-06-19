import type { FormProfile } from '../types';

// E&M "Plan / Recommendations" sub-page. NOTE: Problem/Status/Plan repeat as
// blocks (1)-(4); "Status" and "Plan" share an identical label across blocks, so
// only the first block is reliably addressable by label without per-row DOM
// scoping (a follow-up DOM pass can index the remaining rows).
export const PLAN_RECOMMENDATIONS: FormProfile = {
  id: 'Plan / Recommendations',
  displayName: 'Plan / Recommendations',
  detection: {
    anchors: ['Plan / Recommendations', 'Lab Information Reviewed', 'Most Recent Lab Information'],
    supporting: ['Treatment Plan Comments', 'RETURN TO'],
  },
  fields: [
    { key: 'labReviewed', type: 'radio', labels: ['Lab Information Reviewed'], options: ['Yes', 'No'] },
    { key: 'labComments', type: 'plain-textarea', labels: ['Comments'] },
    { key: 'labDateDrawn', type: 'date', labels: ['Date Drawn'] },
    { key: 'labWnl', type: 'radio', labels: ['WNL'], options: ['Yes', 'No', 'N/A - See Comments'] },
    { key: 'problem1', type: 'text', labels: ['Problem (1)'] },
    { key: 'status1', type: 'text', labels: ['Status'] },
    { key: 'plan1', type: 'textarea', labels: ['Plan'] },
    { key: 'treatmentPlanComments', type: 'textarea', labels: ['Treatment Plan Comments'] },
    {
      key: 'returnTo',
      type: 'checkbox-group',
      labels: ['RETURN TO'],
      options: ['Nurse', 'NP', 'PA', 'Doctor', 'N/A - Discharged'],
    },
    { key: 'returnInWeeks', type: 'text', labels: ['WEEKS'] },
  ],
};
