import type { FormProfile } from '../types';

const YN = ['Yes', 'No'];
const YN_NA = ['Yes', 'No', 'N/A'];

export const MEDICATION_MANAGEMENT: FormProfile = {
  id: 'Medication Management',
  displayName: 'Medication Management',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Medication Management', 'The listed vital signs and BMI were recorded and reviewed', "Client's Age:"],
    supporting: ['Pre-Existing Medications for Medication Reconciliation Reviewed this Visit', 'Lab Orders:'],
  },
  fields: [
    { key: 'medicationsList', type: 'textarea', labels: ['Medications:'] },
    { key: 'vitalSignsReviewed', type: 'radio', labels: ['Height; Current Weight; Blood Pressure; Temperature; Heart Rate:'], options: YN_NA },
    { key: 'clientAge', type: 'text', labels: ["Client's Age:"] },
    { key: 'pdmpReviewed', type: 'radio', labels: ['PDMP Database Reviewed'], options: YN_NA },
    { key: 'preExistingMedsReviewed', type: 'radio', labels: ['Pre-Existing Medications for Medication Reconciliation Reviewed this Visit'], options: YN },
    { key: 'labOrders', type: 'radio', labels: ['Lab Orders:'], options: ['Check Next Visit', "See Lab Requisition Today's Date"] },
  ],
};
