// ─── SAIP Backend Configuration ─────────────────────────────────────────────
// Update SAIP_BASE_URL to match your deployed backend URL.

export const SAIP_BASE_URL =
  (import.meta.env?.VITE_SAIP_API_URL as string) || 'http://localhost:8000';

export const SAIP_ENDPOINTS = {
  transcribe: `${SAIP_BASE_URL}/transcribe`,
  generate: `${SAIP_BASE_URL}/generate`,
  generateFormAnswers: `${SAIP_BASE_URL}/generate-form-answers`,
  generateEvaluation: `${SAIP_BASE_URL}/generate-evaluation`,
  // Extension-format encounter endpoints (extension_api.py)
  encounters: `${SAIP_BASE_URL}/ext-encounters`,
  encounter: (id: string) => `${SAIP_BASE_URL}/ext-encounters/${id}`,
  notes: (id: string) => `${SAIP_BASE_URL}/notes/${id}`,
  login: `${SAIP_BASE_URL}/auth/login`,
  me: `${SAIP_BASE_URL}/auth/me`,
  // Persistence endpoints
  formAnswers: (encounterId: string, formType: string) =>
    `${SAIP_BASE_URL}/form-answers?encounter_id=${encodeURIComponent(encounterId)}&form_type=${encodeURIComponent(formType)}`,
  evalCache: (encounterId: string, bundleId: string) =>
    `${SAIP_BASE_URL}/eval-cache?encounter_id=${encodeURIComponent(encounterId)}&bundle_id=${encodeURIComponent(bundleId)}`,
  autofillAudit: `${SAIP_BASE_URL}/autofill-audit`,
  autofillAuditForEncounter: (encounterId: string) =>
    `${SAIP_BASE_URL}/autofill-audit?encounter_id=${encodeURIComponent(encounterId)}`,
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
  evaluationCachePrefix: 'saip_eval_cache_',
  lastFillLog: 'saip_last_fill_log',
} as const;

// One evaluation bundle (Psych Eval, E&M EPT) generates once per `fvid` and
// is cached under this key for every sub-page to read from (design.md D7).
export function evaluationCacheKey(fvid: string): string {
  return `${STORAGE_KEYS.evaluationCachePrefix}${fvid}`;
}

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

// Form detection rules and field definitions now live in lib/form-profiles/
// (one declarative profile per form — see openspec/changes/credible-multiform-autofill).
