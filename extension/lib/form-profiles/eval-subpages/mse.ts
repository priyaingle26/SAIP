import type { FormProfile } from '../types';
import { MSE_SIGNATURES } from '../mseSignatures';

// Confirmed live (docs/form-fingerprints/cbh3/mse.json, 2026-06-17). Shared
// across Psych Eval and E&M EPT bundles — same sub-page, different
// category_id per bundle (form-profile-registry spec, "Reusable sub-page
// profiles" scenario). LANGUAGE/COGNITIVE ATTENTION/PSYCHOMOTOR/
// MUSCULOSKELETAL still need the tail fingerprint capture (task 8.2).
export const MSE: FormProfile = {
  id: 'Mental Status Exam',
  displayName: 'Mental Status Exam',
  detection: {
    anchors: ['ORIENTATION', 'RAPPORT', 'HALLUCINATIONS'],
    supporting: ['MOOD', 'AFFECT', 'INSIGHT', 'JUDGEMENT'],
    categoryIds: [27098],
  },
  fields: [
    ...MSE_SIGNATURES.map((sig) => ({
      key: sig.key,
      type: 'mse-group' as const,
      labels: [sig.label],
      options: sig.options,
    })),
    { key: 'mseMuscleStrength', type: 'radio', labels: ['Muscle Strength / Tone'], options: ['WNL', 'Atrophy', 'Abnormal Movements'] },
    { key: 'mseGaitStation', type: 'radio', labels: ['Gait and Station'], options: ['No Difficulty', 'Restlessness', 'Staggered', 'Shuffling', 'Unstable'] },
    { key: 'mseComments', type: 'textarea', labels: ['MSE Comments', 'Mental Status Comments', 'Mental Status Exam Comments'] },
  ],
};
