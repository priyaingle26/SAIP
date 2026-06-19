import type { FormProfile } from '../types';

// E&M "IDD ONLY" sub-page (MR supplement). Diagnostic/testing administrative data
// not present in a clinical transcript — the AI leaves those blank for review.
// Match by question label text.
const LEVELS = ['Zero', 'One', 'Two', 'Three', 'Four'];

export const IDD_ONLY: FormProfile = {
  id: 'IDD ONLY',
  displayName: 'IDD ONLY (MR Supplement)',
  detection: {
    anchors: ['ICAP LON', 'ICAP LOS', 'MR SUPPLEMENT'],
    supporting: ['Adaptive Behavioral Level', 'Sensory Impairment'],
  },
  fields: [
    { key: 'currentAdaptiveLevel', type: 'radio', labels: ['Current Adaptive Behavioral Level'], options: LEVELS },
    { key: 'potentialAdaptiveLevel', type: 'radio', labels: ['Potential Adaptive Behavioral Level'], options: LEVELS },
    { key: 'adaptiveLevelDate', type: 'date', labels: ['Adaptive Behavioral Level Date'] },
    { key: 'icapLon', type: 'radio', labels: ['ICAP LON'], options: ['1', '5', '6', '8', '9'] },
    { key: 'icapLos', type: 'radio', labels: ['ICAP LOS'], options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Any'] },
    { key: 'icapDate', type: 'date', labels: ['ICAP Date'] },
    { key: 'iqScore', type: 'text', labels: ['IQ Score'] },
    { key: 'iqTestType', type: 'text', labels: ['IQ Test Type'] },
    { key: 'iqTestDate', type: 'date', labels: ['IQ Test Date'] },
    { key: 'sqScore', type: 'text', labels: ['SQ Score'] },
    { key: 'sqTestType', type: 'text', labels: ['SQ Test Type'] },
    { key: 'sqTestDate', type: 'date', labels: ['SQ Test Date'] },
    { key: 'mobility', type: 'text', labels: ['Mobility'] },
    { key: 'sensoryImpairment', type: 'text', labels: ['Sensory Impairment'] },
  ],
};
