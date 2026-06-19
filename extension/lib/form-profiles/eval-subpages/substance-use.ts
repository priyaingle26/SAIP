import type { FieldDef, FormProfile } from '../types';

// Adult (AUDIT-C) / Child (CRAFFT) substance-use sub-pages. The AUDIT-C and
// CRAFFT scored grids are wired in a follow-up pass once their live DOM is
// captured (button-widget vs radio). The tobacco screening block below is shared
// by both variants and matches by question label text.
const TOBACCO_FIELDS: FieldDef[] = [
  {
    key: 'tobaccoStatus',
    type: 'dropdown',
    labels: ['Tobacco Use Status'],
    options: ['Current User', 'Never Used', 'Past User'],
  },
  {
    key: 'tobaccoProducts',
    type: 'checkbox-group',
    labels: ['Tobacco products the patient uses'],
    options: ['Bidis', 'Chewing Tobacco', 'Cigars / Cigarillos', 'Cigarettes', 'Vaping', 'Hookah', 'Kreteks', 'Pipe', 'Snuff'],
  },
  {
    key: 'tobaccoFrequency',
    type: 'dropdown',
    labels: ['How frequently does the patient use tobacco'],
    options: ['1-5 times per day', '5-10 times per day', '10-15 times per day', '15-20 times per day', '20 or more times per day'],
  },
  {
    key: 'tobaccoWaking',
    type: 'dropdown',
    labels: ['How soon within waking'],
    options: ['Less than 30 minutes', 'Greater than 30 minutes'],
  },
  {
    key: 'tobaccoReadyQuit',
    type: 'dropdown',
    labels: ['How ready is the patient to quit'],
    options: ['In the next 30 days', 'In the next 6 months', 'Eventually', 'Not at all'],
  },
  {
    key: 'tobaccoCessationEducation',
    type: 'radio',
    labels: ['Tobacco cessation education'],
    options: ['Yes', 'No'],
  },
  {
    key: 'illegalDrugUse',
    type: 'radio',
    labels: ['illegal drugs or prescription drugs'],
    options: ['Yes', 'No'],
  },
  { key: 'illegalDrugList', type: 'plain-textarea', labels: ['If yes, list'] },
  { key: 'substanceUseComments', type: 'textarea', labels: ['Substance Use and Tobacco Screening Comments'] },
];

// AUDIT-C scored grid (live cbh3 DOM): each option is its own x_ button whose
// value is the option score 0-4, scoped to the question by text anchor →
// 'scored-options'. The Positive/Negative result is a plain radio.
const AUDIT_C_FIELDS: FieldDef[] = [
  { key: 'auditFrequency', type: 'scored-options', labels: ['How often do you have a drink containing alcohol'] },
  { key: 'auditTypicalDay', type: 'scored-options', labels: ['How many standard drinks containing alcohol'] },
  { key: 'auditBinge', type: 'scored-options', labels: ['How often do you have six or more drinks'] },
  {
    key: 'auditResult',
    type: 'radio',
    labels: ['positive or negative for unhealthy alcohol'],
    options: ['Positive', 'Negative'],
  },
];

export const SUBSTANCE_USE_ADULT: FormProfile = {
  id: 'Adult Substance Use',
  displayName: 'Adult Substance Use (AUDIT-C)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['AUDIT-C', 'Alcohol Use Disorders', 'Adult Substance Use'],
    supporting: ['AUDIT', 'Substance Use', 'Tobacco'],
    categoryIds: [27080],
  },
  fields: [
    ...AUDIT_C_FIELDS,
    ...TOBACCO_FIELDS,
  ],
};

// CRAFFT (live cbh3 DOM): Part A = 3 Yes/No radios + a summary Yes/No; Part B =
// 6 scored widgets (shared id per question, values 1=Yes / 0=No) → 'scored-widget'.
const CRAFFT_FIELDS: FieldDef[] = [
  { key: 'crafftA1', type: 'radio', labels: ['Drink any alcohol'], options: ['Yes', 'No'] },
  { key: 'crafftA2', type: 'radio', labels: ['marijuana or hashish'], options: ['Yes', 'No'] },
  { key: 'crafftA3', type: 'radio', labels: ['anything else to get high'], options: ['Yes', 'No'] },
  { key: 'crafftAAnyYes', type: 'radio', labels: ["answer 'Yes' to any questions in Part A"], options: ['Yes', 'No'] },
  { key: 'crafftB1', type: 'scored-widget', labels: ['ridden in a car driven by someone'] },
  { key: 'crafftB2', type: 'scored-widget', labels: ['use alcohol or drugs to relax'] },
  { key: 'crafftB3', type: 'scored-widget', labels: ['while you are by yourself'] },
  { key: 'crafftB4', type: 'scored-widget', labels: ['forget things you did while using'] },
  { key: 'crafftB5', type: 'scored-widget', labels: ['tell you that you should cut down'] },
  { key: 'crafftB6', type: 'scored-widget', labels: ['gotten in trouble while you were using'] },
];

export const SUBSTANCE_USE_CHILD: FormProfile = {
  id: 'Child Substance Use',
  displayName: 'Child Substance Use (CRAFFT)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['CRAFFT', 'Child Substance Use'],
    supporting: ['Substance Use', 'Tobacco'],
    categoryIds: [27081],
  },
  fields: [
    ...CRAFFT_FIELDS,
    ...TOBACCO_FIELDS,
  ],
};
