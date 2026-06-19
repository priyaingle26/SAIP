import type { FormProfile } from '../types';

export const IDD_CASEMGT_SHORT: FormProfile = {
  id: 'IDD CASE MGT Short Note',
  displayName: 'IDD CASE MGT Short Note',
  detection: {
    anchors: ['IDD CASE MGT Short Note', 'DESCRIPTION OF SERVICE(S) PROVIDED', 'SUMMARY NEEDS / ISSUES IDENTIFIED'],
    supporting: ['RECOMMENDATIONS / REFERRALS / PLAN', 'Provided To', 'Contact Type'],
  },
  fields: [
    { key: 'providedTo', type: 'dropdown', labels: ['Provided To'] },
    { key: 'providedAt', type: 'dropdown', labels: ['Provided At'] },
    { key: 'contactType', type: 'dropdown', labels: ['Contact Type'] },
    { key: 'descriptionOfServices', type: 'textarea', labels: ['DESCRIPTION OF SERVICE(S) PROVIDED'] },
    { key: 'summaryNeeds', type: 'textarea', labels: ['SUMMARY NEEDS', 'SUMMARY NEEDS / ISSUES IDENTIFIED'] },
    { key: 'recommendations', type: 'textarea', labels: ['RECOMMENDATIONS / REFERRALS / PLAN'] },
  ],
};
