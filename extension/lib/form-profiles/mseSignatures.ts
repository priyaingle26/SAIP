// ─── MSE option-set signatures ───────────────────────────────────────────────
// Confirmed live from docs/form-fingerprints/cbh3/mse.json (2026-06-17).
// Each MSE category is one q_NNNNNN id shared by all its option checkboxes.
// Because the q_ id is deployment-specific, categories are identified at
// runtime by the OVERLAP of their option text with this signature table, not
// by id. INSIGHT/JUDGEMENT/LANGUAGE share an identical option set and cannot
// be told apart by options alone — `tiebreakOrder` resolves them by the order
// their q_ ids appear in the DOM (matches the form's visual top-to-bottom
// layout in every Credible deployment seen so far).

export interface MseSignature {
  key: string;
  label: string;
  options: string[];
  /** Only present when this category's option set is ambiguous with others. */
  tiebreakOrder?: number;
}

export const MSE_SIGNATURES: MseSignature[] = [
  { key: 'orientation', label: 'ORIENTATION', options: ['Person', 'Place', 'Time', 'Situation'] },
  {
    key: 'rapport',
    label: 'RAPPORT',
    options: ['Appropriate', 'Hostile', 'Evasive', 'Distant', 'Inattentive', 'Guarded', 'Shy', 'Poor Eye Contact'],
  },
  {
    key: 'appearance',
    label: 'APPEARANCE',
    options: ['Appropriate', 'Poorly Dressed', 'Poorly Groomed', 'Disheveled', 'Body Odor'],
  },
  {
    key: 'mood',
    label: 'MOOD',
    options: ['WNL', 'Euthymic', 'Depressed', 'Anxious', 'Jocular', 'Labile', 'Irritable/Angry', 'Elation'],
    tiebreakOrder: 1,
  },
  {
    key: 'affect',
    label: 'AFFECT',
    options: ['Neutral', 'Euthymic', 'Depressed', 'Anxious', 'Irritable/angry', 'Blunted/flat', 'Labile', 'Euphoric'],
    tiebreakOrder: 2,
  },
  {
    key: 'speech',
    label: 'SPEECH',
    options: [
      'Normal', 'Increased Latency', 'Decreased Rate', 'Poverty', 'Hyperverbal', 'Incoherent',
      'Loud', 'Soft', 'Mute', 'Pressured', 'Mumbled', 'Slurred',
    ],
  },
  {
    key: 'thoughtContentProcess',
    label: 'THOUGHT CONTENT & PROCESS',
    options: [
      'Coherent', 'Disorganized', 'Delusional', 'Persecution', 'Reference', 'Paranoia',
      'Thought insertion', 'Broadcasting', 'Grandiose', 'Circumstantial', 'Tangential',
      'Perseveration', 'Loose Associations', 'Clanging', 'Word Salad', 'Impoverished',
      'Worthlessness', 'Loneliness', 'Guilt', 'Hopelessness', 'Accusatory', 'Grievance Collecting',
    ],
  },
  {
    key: 'hallucinations',
    label: 'HALLUCINATIONS',
    options: ['None', 'Auditory', 'Visual', 'Command', 'Tactile', 'Olfactory', 'Internal Sensations'],
  },
  {
    key: 'insight',
    label: 'INSIGHT',
    options: ['Excellent', 'Good', 'Fair', 'Poor', 'Grossly impaired'],
    tiebreakOrder: 1,
  },
  {
    key: 'judgement',
    label: 'JUDGEMENT',
    options: ['Excellent', 'Good', 'Fair', 'Poor', 'Grossly impaired'],
    tiebreakOrder: 2,
  },
  {
    key: 'language',
    label: 'LANGUAGE',
    options: ['Excellent', 'Good', 'Fair', 'Poor', 'Grossly impaired'],
    tiebreakOrder: 3,
  },
  {
    key: 'cognitiveAttention',
    label: 'COGNITIVE ATTENTION/CONCENTRATION',
    options: ['No Gross Deficits', 'Concentration Problems', 'Concrete', 'Abstract', 'Appropriate for Tested IQ', 'Inattentive / Easily Distracted', 'Limited Attention Span', 'Not formally examined'],
  },
  {
    key: 'psychomotor',
    label: 'PSYCHOMOTOR',
    options: ['Normal', 'Restless', 'Retardation', 'Fidgety', 'Hyperactive/Instrusive'],
  },
  {
    key: 'memory',
    label: 'MEMORY',
    options: ['Examined', 'Not examined', 'Unable to Assess'],
  },
  {
    key: 'memoryImmediate',
    label: 'Immediate',
    options: ['Good', 'Fair', 'Impaired'],
    tiebreakOrder: 1, // immediate, recent, past might share options
  },
  {
    key: 'memoryRecent',
    label: 'Recent',
    options: ['Good', 'Fair', 'Impaired'],
    tiebreakOrder: 2,
  },
  {
    key: 'memoryPast',
    label: 'Past',
    options: ['Good', 'Fair', 'Impaired'],
    tiebreakOrder: 3,
  },
];
