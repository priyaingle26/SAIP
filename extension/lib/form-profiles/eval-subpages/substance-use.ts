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
    {
      key: 'illegalDrugUse',
      type: 'radio',
      labels: ['illegal drugs or prescription drugs'],
      options: ['Yes', 'No'],
    },
    { 
      key: 'illegalDrugList', 
      type: 'textarea', 
      labels: ['Describe History of Substance Use', 'If yes, list'] 
    },
    {
      key: 'substanceUseDisposition',
      type: 'radio',
      labels: ['Substance Use Screening Disposition'],
      options: ['Screening indicates a need for further assessment', 'Negative screening - no further action necessary'],
    },
  ],
};

// CRAFFT (live cbh3 DOM): Part A = 3 Yes/No radios + a summary Yes/No; Part B =
// 6 scored widgets (shared id per question, values 1=Yes / 0=No) → 'scored-widget'.
const CRAFFT_FIELDS: FieldDef[] = [
  { key: 'crafftA1', type: 'radio', labels: ['1. Drink any alcohol (more than a few sips)?', 'Drink any alcohol'], options: ['Yes', 'No'] },
  { key: 'crafftA2', type: 'radio', labels: ['2. Smoke any marijuana or hashish?', 'marijuana or hashish'], options: ['Yes', 'No'] },
  { key: 'crafftA3', type: 'radio', labels: ['3. Use anything else to get high?', 'anything else to get high'], options: ['Yes', 'No'] },
  { key: 'crafftAAnyYes', type: 'radio', labels: ["Did the individual answer 'Yes' to any questions in Part A?", "answer 'Yes' to any questions in Part A"], options: ['Yes', 'No'] },
  { key: 'crafftB1', type: 'scored-widget', labels: ['1. Have you ever ridden in a car driven by someone (including yourself) who was "high" or had been using alcohol or drugs?', 'ridden in a car driven by someone'], options: ['1', '0'] },
  { key: 'crafftB2', type: 'scored-widget', labels: ['2. Do you ever use alcohol or drugs to relax, feel better or fit in?', 'use alcohol or drugs to relax'], options: ['1', '0'] },
  { key: 'crafftB3', type: 'scored-widget', labels: ['3. Do you ever use alcohol or drugs while you are by yourself, or alone?', 'while you are by yourself'], options: ['1', '0'] },
  { key: 'crafftB4', type: 'scored-widget', labels: ['4. Do you ever forget things you did while using alcohol or drugs?', 'forget things you did while using'], options: ['1', '0'] },
  { key: 'crafftB5', type: 'scored-widget', labels: ['5. Do your family or friends ever tell you that you should cut down on your drinking or drug use?', 'tell you that you should cut down'], options: ['1', '0'] },
  { key: 'crafftB6', type: 'scored-widget', labels: ['6. Have you ever gotten in trouble while you were using alcohol or drugs?', 'gotten in trouble while you were using'], options: ['1', '0'] },
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
