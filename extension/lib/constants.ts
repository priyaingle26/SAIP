// ─── SAIP Backend Configuration ─────────────────────────────────────────────
// Update SAIP_BASE_URL to match your deployed backend URL.

export const SAIP_BASE_URL =
  (import.meta.env?.VITE_SAIP_API_URL as string) || 'http://localhost:8000';

export const SAIP_ENDPOINTS = {
  transcribe: `${SAIP_BASE_URL}/transcribe`,
  generate: `${SAIP_BASE_URL}/generate`,
  generateFormAnswers: `${SAIP_BASE_URL}/generate-form-answers`,
  encounters: `${SAIP_BASE_URL}/encounters`,
  encounter: (id: string) => `${SAIP_BASE_URL}/encounters/${id}`,
  notes: (id: string) => `${SAIP_BASE_URL}/notes/${id}`,
  login: `${SAIP_BASE_URL}/auth/login`,
  me: `${SAIP_BASE_URL}/auth/me`,
} as const;

// ─── Supported EHR Domains ───────────────────────────────────────────────────

export const SUPPORTED_EHR_DOMAINS = [
  'crediblebh.com',
  'thecrediblesolution.com',
  'localhost', // development/test
] as const;

// ─── Storage Keys ────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  authToken: 'saip_auth_token',
  currentUser: 'saip_current_user',
  currentEncounter: 'saip_current_encounter',
  encounters: 'saip_encounters',
} as const;

// ─── Credible EHR Field Selectors (Phase 1) ──────────────────────────────────
// These selectors target Credible BH's standard note form fields.
// Add/adjust based on the specific Credible version in use.

export const CREDIBLE_SELECTORS = {
  subjective: [
    '#subjectiveField',
    'textarea[name="subjective"]',
    'textarea[data-field="subjective"]',
    '#txtSubjective',
    '.subjective-field textarea',
  ],
  objective: [
    '#objectiveField',
    'textarea[name="objective"]',
    'textarea[data-field="objective"]',
    '#txtObjective',
    '.objective-field textarea',
  ],
  assessment: [
    '#assessmentField',
    'textarea[name="assessment"]',
    'textarea[data-field="assessment"]',
    '#txtAssessment',
    '.assessment-field textarea',
  ],
  plan: [
    '#planField',
    'textarea[name="plan"]',
    'textarea[data-field="plan"]',
    '#txtPlan',
    '.plan-field textarea',
  ],
  chiefComplaint: [
    '#chiefComplaintField',
    'textarea[name="chief_complaint"]',
    '#txtChiefComplaint',
  ],
  mentalStatusExam: [
    '#mentalStatusField',
    'textarea[name="mental_status"]',
    '#txtMSE',
  ],
  riskAssessment: [
    '#riskField',
    'textarea[name="risk_assessment"]',
    '#txtRisk',
  ],
  interventions: [
    '#interventionsField',
    'textarea[name="interventions"]',
    '#txtInterventions',
  ],
  goals: ['#goalsField', 'textarea[name="goals"]', '#txtGoals'],
} as const;

// ─── Form Detection Rules ─────────────────────────────────────────────────────
// Maps page-text keywords → form type name.
// Rules are checked in order; first match wins.

export const FORM_DETECTION_RULES: Array<{ keywords: string[]; formType: string }> = [
  { keywords: ['DA(R)P', 'DARP', 'Counseling Progress Note'], formType: 'Counseling Progress Note' },
  { keywords: ['ECI Progress Note', 'ECI Service Delivery'], formType: 'ECI Service Delivery Note' },
  { keywords: ['SOAP NOTE', 'FAYS'], formType: 'FAYS SOAP Note' },
  { keywords: ['Service & Outcome', 'IDD Case Management'], formType: 'IDD Case Management Note' },
  { keywords: ['Psychiatric Evaluation', 'Psych Eval'], formType: 'Psych Eval' },
  { keywords: ['Person-Centered Recovery Plan', 'Person Centered Recovery Plan'], formType: 'Person Centered Recovery Plan' },
  { keywords: ['SIRP Note', 'Psych Rehab', 'Psychosocial Rehab'], formType: 'Psychosocial Rehab Note' },
  { keywords: ['SIRP Note', 'Skills Training'], formType: 'Skills Training Note' },
  { keywords: ['E&M', 'EPT', 'Evaluation and Management'], formType: 'E&M EPT' },
];

// ─── Form Field Definitions (Label-Based Autofill) ────────────────────────────
// Maps schema field keys → known EHR label text that appears next to the textarea.
// The autofill resolver scans DOM labels and finds the nearest input/textarea.

export const FORM_FIELD_DEFINITIONS: Record<string, Record<string, string[]>> = {
  'Counseling Progress Note': {
    modality: ['MODALITY', 'Mode of Contact', 'Type of Contact'],
    participants: ['PARTICIPANTS', 'Who was present', 'Attendance'],
    methodsUsed: ['METHODS USED DURING SESSION', 'Methods Used', 'Techniques Used'],
    materialsUsed: ['MATERIAL USED DURING SESSION', 'Materials Used', 'Handouts'],
    data: ['DATA', 'Data/Observation', 'Session Data'],
    assessment: ['ASSESSMENT', 'Clinical Assessment', 'Clinician Assessment'],
    response: ['RESPONSE', 'Client Response', 'Response to Intervention'],
    plan: ['PLAN', 'Treatment Plan', 'Next Steps'],
  },

  'ECI Service Delivery Note': {
    language: ['LANGUAGE', 'Primary Language', 'Language of Service'],
    presentDuringVisit: ['PRESENT DURING VISIT', 'Who was Present', 'Attendees'],
    ifspOutcomes: ['IFSP OUTCOMES', 'IFSP Goals', 'Outcome Addressed'],
    jointPlanningReflection: ['JOINT PLANNING', 'Joint Planning & Reflection', 'Planning Notes'],
    observationPractice: ['OBSERVATION AND PRACTICE', 'Observation/Practice', 'Observed Skills'],
    reflectionFeedback: ['REFLECTION AND FEEDBACK', 'Feedback Provided', 'Reflection'],
    nextVisitDate: ['NEXT VISIT DATE', 'Follow-Up Date', 'Next Appointment'],
  },

  'FAYS SOAP Note': {
    participants: ['PARTICIPANTS', 'Who was present', 'Attendees'],
    focusOfContact: ['FOCUS OF CONTACT', 'Focus Area', 'Session Focus'],
    subjective: ['SUBJECTIVE', 'Subjective (S)', 'Client Report'],
    objective: ['OBJECTIVE', 'Objective (O)', 'Clinician Observation'],
    assessment: ['ASSESSMENT', 'Assessment (A)', 'Clinical Assessment'],
    plan: ['PLAN', 'Plan (P)', 'Next Steps'],
  },

  'IDD Case Management Note': {
    summaryOfVisit: ['SUMMARY OF VISIT', 'Visit Summary', 'Session Summary'],
    servicesProvided: ['SERVICES PROVIDED', 'Services Rendered', 'Support Provided'],
    clientSatisfaction: ['CLIENT SATISFACTION', 'Consumer Satisfaction', 'Satisfaction Level'],
    outcome: ['OUTCOME', 'Visit Outcome', 'Results'],
    progress: ['PROGRESS', 'Progress Toward Goals', 'Goal Progress'],
    monitoringServices: ['MONITORING SERVICES', 'Services Monitored', 'Oversight Provided'],
  },

  'Person Centered Recovery Plan': {
    strengths: ['STRENGTHS', 'Client Strengths', 'Identified Strengths'],
    barriers: ['BARRIERS', 'Challenges', 'Obstacles'],
    goal: ['GOAL', 'Recovery Goal', 'Long-Term Goal'],
    goalProgress: ['GOAL PROGRESS', 'Progress Toward Goal', 'Goal Status'],
    objective: ['OBJECTIVE', 'Short-Term Objective', 'Measurable Objective'],
    objectiveProgress: ['OBJECTIVE PROGRESS', 'Progress Toward Objective', 'Objective Status'],
    interventions: ['INTERVENTIONS', 'Services and Interventions', 'Planned Interventions'],
    dischargePlan: ['DISCHARGE PLAN', 'Discharge Criteria', 'Transition Plan'],
  },

  'Psych Eval': {
    presentingProblems: ['PRESENTING PROBLEMS', 'Chief Complaint', 'Reason for Referral'],
    familyHistory: ['FAMILY HISTORY', 'Family Psychiatric History', 'Family Background'],
    suicideRisk: ['SUICIDE RISK', 'Suicidal Ideation', 'SI/HI'],
    homicideRisk: ['HOMICIDE RISK', 'Homicidal Ideation', 'HI'],
    medicalConditions: ['MEDICAL CONDITIONS', 'Medical History', 'Medical Problems'],
    reviewOfSystems: ['REVIEW OF SYSTEMS', 'Systems Review', 'ROS'],
    substanceUse: ['SUBSTANCE USE', 'Substance Abuse History', 'Drug and Alcohol'],
    traumaHistory: ['TRAUMA HISTORY', 'Trauma/Abuse History', 'ACEs'],
    relationships: ['RELATIONSHIPS', 'Social Relationships', 'Support System'],
    mentalStatusComments: ['MENTAL STATUS', 'MSE', 'Mental Status Exam', 'Mental Status Comments'],
    medications: ['MEDICATIONS', 'Current Medications', 'Medication List'],
    treatmentPlan: ['TREATMENT PLAN', 'Plan of Care', 'Recommendations'],
    referrals: ['REFERRALS', 'Referral Made', 'Community Resources'],
  },

  'Psychosocial Rehab Note': {
    modality: ['MODALITY', 'Service Modality', 'Type of Contact'],
    participants: ['PARTICIPANTS', 'Who was present', 'Group/Individual'],
    methodsUsed: ['METHODS USED', 'Techniques Utilized', 'Interventions Used'],
    materialsUsed: ['MATERIALS USED', 'Handouts/Materials', 'Resources Used'],
    behaviorRelatedToRecovery: ['BEHAVIOR RELATED TO RECOVERY', 'Recovery-Related Behavior', 'Behavioral Observations'],
    servicesProvided: ['SERVICES PROVIDED', 'Services Rendered', 'Activities Completed'],
    progressTowardGoals: ['PROGRESS TOWARD GOALS', 'Goal Progress', 'Treatment Goal Progress'],
    nextSessionPlan: ['NEXT SESSION PLAN', 'Plan for Next Session', 'Follow-Up Plan'],
    currentDiagnosis: ['CURRENT DIAGNOSIS', 'Diagnosis', 'DSM Diagnosis'],
  },

  'Skills Training Note': {
    modality: ['MODALITY', 'Service Modality', 'Type of Contact'],
    participants: ['PARTICIPANTS', 'Who was present', 'Group/Individual'],
    methodsUsed: ['METHODS USED', 'Training Methods', 'Skill-Building Techniques'],
    materialsUsed: ['MATERIALS USED', 'Training Materials', 'Resources Used'],
    behaviorRelatedToRecovery: ['BEHAVIOR RELATED TO RECOVERY', 'Recovery-Related Behavior', 'Skill Demonstration'],
    servicesProvided: ['SERVICES PROVIDED', 'Skills Trained', 'Training Provided'],
    progressTowardGoals: ['PROGRESS TOWARD GOALS', 'Skill Progress', 'Goal Attainment'],
    nextSessionPlan: ['NEXT SESSION PLAN', 'Plan for Next Session', 'Skills to Practice'],
    currentDiagnosis: ['CURRENT DIAGNOSIS', 'Diagnosis', 'DSM Diagnosis'],
  },

  'E&M EPT': {
    chiefComplaint: ['CHIEF COMPLAINT', 'Reason for Visit', 'CC'],
    historyPresentIllness: ['HISTORY OF PRESENT ILLNESS', 'HPI', 'History of Present Illness'],
    suicideRisk: ['SUICIDE RISK', 'Suicidal Ideation', 'SI/HI Risk'],
    medicalConditions: ['MEDICAL CONDITIONS', 'Medical History', 'Medical Problems'],
    reviewOfSystems: ['REVIEW OF SYSTEMS', 'ROS', 'Systems Review'],
    mentalStatusComments: ['MENTAL STATUS', 'MSE', 'Mental Status Exam'],
    substanceUse: ['SUBSTANCE USE', 'Substance Abuse', 'Drug and Alcohol Use'],
    medications: ['MEDICATIONS', 'Current Medications', 'Medication List'],
    plan: ['PLAN', 'Treatment Plan', 'Clinical Plan'],
    treatmentComments: ['TREATMENT COMMENTS', 'Additional Comments', 'Clinical Comments'],
  },
};
