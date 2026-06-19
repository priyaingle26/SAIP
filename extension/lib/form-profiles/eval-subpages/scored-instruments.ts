import type { FieldDef, FormProfile } from '../types';

// Scored clinical instruments (PHQ-9, AUDIT-C, CRAFFT, C-SSRS). Each scored item
// is an x_ button-group (values 0-3) handled by the engine's `scored-widget`
// finder; the question text shares the button's table row, so labels are matched
// against that row text. `scored: true` keeps these out of bundle aggregation.
//
// CLINICAL NOTE: these encode the patient's own screening responses. Generated
// scores reflect only what the recorded encounter actually evidences (empty/0
// when not assessable) — they are a drafting aid and MUST be clinician-reviewed.

// PHQ-9 ADULT item order (label = a distinctive substring of the on-form row).
const PHQ9_ADULT_FIELDS: FieldDef[] = [
  { key: 'phqInterest', type: 'scored-widget', labels: ['Little interest in doing things'] },
  { key: 'phqMood', type: 'scored-widget', labels: ['Feeling down, depressed, or hopeless'] },
  { key: 'phqSleep', type: 'scored-widget', labels: ['Trouble falling asleep'] },
  { key: 'phqEnergy', type: 'scored-widget', labels: ['tired or having little energy'] },
  { key: 'phqAppetite', type: 'scored-widget', labels: ['Poor appetite or overeating'] },
  { key: 'phqSelfWorth', type: 'scored-widget', labels: ['Feeling bad about yourself'] },
  { key: 'phqConcentration', type: 'scored-widget', labels: ['Trouble concentrating'] },
  { key: 'phqPsychomotor', type: 'scored-widget', labels: ['Moving or speaking so slowly'] },
  { key: 'phqSelfHarm', type: 'scored-widget', labels: ['better off dead'] },
  {
    key: 'phqDifficulty',
    type: 'radio',
    labels: ['how difficult these problems made it'],
    options: ['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult'],
  },
  { key: 'phqDate', type: 'date', labels: ["Today's Date"] },
];

// PHQ-9 ADOLESCENT differs in wording/order and adds Yes/No screening questions.
const PHQ9_ADOLESCENT_FIELDS: FieldDef[] = [
  { key: 'phqMood', type: 'scored-widget', labels: ['Feeling down, depressed, irritable'] },
  { key: 'phqInterest', type: 'scored-widget', labels: ['Little interest or pleasure'] },
  { key: 'phqSleep', type: 'scored-widget', labels: ['Trouble falling asleep'] },
  { key: 'phqAppetite', type: 'scored-widget', labels: ['weight loss'] },
  { key: 'phqEnergy', type: 'scored-widget', labels: ['tired or having little energy'] },
  { key: 'phqSelfWorth', type: 'scored-widget', labels: ['Feeling bad about yourself'] },
  { key: 'phqConcentration', type: 'scored-widget', labels: ['Trouble concentrating on things like school'] },
  { key: 'phqPsychomotor', type: 'scored-widget', labels: ['Moving or speaking so slowly'] },
  { key: 'phqSelfHarm', type: 'scored-widget', labels: ['better off dead'] },
  {
    key: 'phqDepressedPastYear',
    type: 'radio',
    labels: ['felt depressed or sad most days'],
    options: ['Yes', 'No'],
  },
  {
    key: 'phqDifficulty',
    type: 'radio',
    labels: ['how difficult have these problems made it'],
    options: ['Not difficult at all', 'Somewhat difficult', 'Very difficult', 'Extremely difficult'],
  },
  {
    key: 'phqSuicidalPastMonth',
    type: 'radio',
    labels: ['serious thoughts about ending your life'],
    options: ['Yes', 'No'],
  },
  {
    key: 'phqEverAttempt',
    type: 'radio',
    labels: ['tried to kill yourself or made a suicide attempt'],
    options: ['Yes', 'No'],
  },
  { key: 'phqDate', type: 'date', labels: ["Today's Date"] },
];

export const PHQ9_ADULT: FormProfile = {
  id: 'PHQ-9 Adult',
  displayName: 'PHQ-9 Adult',
  scored: true,
  detection: {
    anchors: ['PHQ-9'],
    supporting: ['Adult'],
    categoryIds: [27076, 27092],
  },
  fields: PHQ9_ADULT_FIELDS,
};

export const PHQ9_ADOLESCENT: FormProfile = {
  id: 'PHQ-9 Adolescent',
  displayName: 'PHQ-9 Adolescent',
  scored: true,
  // The extra "ADOLESCENT" anchor gives this profile a higher score than
  // PHQ9_ADULT whenever both keywords are present on the page (form-detection
  // spec, "Specificity ordering" scenario) — independent of registry order.
  detection: {
    anchors: ['PHQ-9', 'ADOLESCENT'],
    supporting: [],
    categoryIds: [27077, 27093],
  },
  fields: PHQ9_ADOLESCENT_FIELDS,
};

// C-SSRS fields from live DOM (cbh3). x_ buttons with values "Y"/"N" (one shared
// id per question, two buttons per row). The engine's findScoredButton accepts
// any non-empty value string, so scored-widget type works for Y/N grids too.
const CSSRS_FIELDS: FieldDef[] = [
  {
    key: 'sourceOfHistory',
    type: 'radio',
    labels: ['Source of History'],
    options: [
      'Patient',
      'Patient / LAR / Parent',
      'Patient / Other Family',
      'Patient / Other Advocate',
      'Patient / Other Mental Health Provider',
      'Patient / Records Review (Summarize in HPA)',
    ],
  },
  { key: 'wishedDead', type: 'scored-widget', labels: ['wished you were dead'] },
  { key: 'thoughtsKillingSelf', type: 'scored-widget', labels: ['thoughts of killing yourself'] },
  { key: 'thinkingHowKillSelf', type: 'scored-widget', labels: ['how you might kill yourself'] },
  { key: 'intentionToAct', type: 'scored-widget', labels: ['intention of acting on them'] },
  { key: 'detailsAndIntent', type: 'scored-widget', labels: ['details of how to kill yourself'] },
  { key: 'suicidalBehavior', type: 'scored-widget', labels: ['prepared to do anything', 'done anything, started to do anything'] },
  { key: 'homicidalIdeation', type: 'scored-widget', labels: ['thoughts of killing someone else'] },
  { key: 'homicidalPlan', type: 'scored-widget', labels: ['details of how to kill them'] },
];

export const SUICIDE_HOMICIDE_RISK: FormProfile = {
  id: 'Suicide/Homicide Risk',
  displayName: 'Suicide/Homicide Risk (C-SSRS)',
  scored: true,
  detection: {
    anchors: ['Suicide', 'Homicide Risk', 'C-SSRS', 'Columbia Suicide'],
    supporting: ['Risk Assessment'],
    categoryIds: [27078],
  },
  fields: CSSRS_FIELDS,
};
