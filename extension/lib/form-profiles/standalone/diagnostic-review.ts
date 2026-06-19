import type { FormProfile } from '../types';

// E&M "Diagnostic Review" sub-page. Mostly diagnostic/testing administrative data
// not present in a clinical transcript — the AI leaves those blank for review.
// Match by question label text.
const ADAPTIVE_LEVELS = ['Mild', 'Moderate', 'Not Intellectually Disabled', 'Profound', 'Severe'];

export const DIAGNOSTIC_REVIEW: FormProfile = {
  id: 'Diagnostic Review',
  displayName: 'Diagnostic Review',
  detection: {
    anchors: ['Diagnostic Review', 'Reason for Action', 'Current Diagnosis on File'],
    supporting: ['Adaptive Behavioral Level', 'Axis Level', 'IQ Test Type'],
  },
  fields: [
    {
      key: 'reasonForAction',
      type: 'dropdown',
      labels: ['Reason for Action'],
      options: ['Admission or Provisional', 'Death', 'Discharge (MH Campus Only)', 'Reevaluation'],
    },
    {
      key: 'axisLevel',
      type: 'checkbox-group',
      labels: ['R69 Axis Level'],
      options: ['Axis Level 1', 'Axis Level 2', 'Axis Level 3'],
    },
    { key: 'currentAdaptiveLevel', type: 'dropdown', labels: ['Current Adaptive Behavioral Level'], options: ADAPTIVE_LEVELS },
    { key: 'potentialAdaptiveLevel', type: 'dropdown', labels: ['Potential Adaptive Behavioral Level'], options: ADAPTIVE_LEVELS },
    { key: 'iqTestScore', type: 'text', labels: ['IQ Test Score'] },
    { key: 'iqTestType', type: 'dropdown', labels: ['IQ Test Type'] },
    { key: 'iqTestDate', type: 'date', labels: ['IQ Test Date'] },
    { key: 'sqTestScore', type: 'text', labels: ['SQ Test Score'] },
    { key: 'sqTestType', type: 'dropdown', labels: ['SQ Test Type'] },
    { key: 'sqTestDate', type: 'date', labels: ['SQ Test Date'] },
  ],
};
