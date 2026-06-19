import type { FormProfile } from '../types';

// E&M "Medications" sub-page (Medication Usage Review). Mostly clinician/admin
// data; the AI fills only what the visit supports and leaves the rest blank for
// review. Match by question label text. NOTE: "Education on Risk" appears twice
// (under Benzodiazepine and under Controlled Meds) with an identical label, so
// only the first is reliably addressable without per-row DOM scoping.
const YN = ['Yes', 'No'];

export const MEDICATIONS: FormProfile = {
  id: 'Medications',
  displayName: 'Medications (Usage Review)',
  detection: {
    anchors: ['MEDICATION USAGE REVIEW', 'PDMP Database', 'AIMS Score'],
    supporting: ['Benzodiazepine', 'Controlled Meds', 'anti-psychotics'],
  },
  fields: [
    {
      key: 'aimsScore',
      type: 'radio',
      labels: ['AIMS Score'],
      options: ['Positive', 'Negative', 'N/A', 'Unable to perform due to visit type COVID 19'],
    },
    { key: 'aimsDateLastDone', type: 'date', labels: ['Date Last Done'] },
    { key: 'medReconciliationReviewed', type: 'radio', labels: ['Pre-Existing Medications for Medication Reconciliation Reviewed'], options: YN },
    { key: 'pdmpReviewed', type: 'dropdown', labels: ['PDMP Database Reviewed'] },
    { key: 'otcMedications', type: 'radio', labels: ['over the counter medications'], options: YN },
    { key: 'otcList', type: 'textarea', labels: ['If Yes, Please List'] },
    { key: 'onMultipleAntipsychotics', type: 'radio', labels: ['On more than 2 anti-psychotics'], options: YN },
    { key: 'benzodiazepineUsage', type: 'radio', labels: ['Benzodiazepine Usage'], options: YN },
    { key: 'educationOnRisk', type: 'radio', labels: ['Education on Risk'], options: ['Yes', 'No', 'N/A'] },
    { key: 'controlledMeds', type: 'radio', labels: ['Controlled Meds'], options: YN },
  ],
};
