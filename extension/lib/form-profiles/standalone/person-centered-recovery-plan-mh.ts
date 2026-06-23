import type { FormProfile } from '../types';

// ─── Person-Centered Recovery Plan MH (Credible Plan Builder) ────────────────
// URL: /CrediblePlans/Builder/Index/... — top-level page, no iframe.
//
// Full form structure (from DOM inspection):
//   ① Plan Type header  → Plan Length (radio) + Plan Type (radio)
//   ② Program/LOC       → LOC (richtext) + Program/Level of Care (dropdown)
//   ③ Individual Strengths → Individual Strengths (richtext)
//   ④ Barriers to Recovery → Description (richtext)
//   ⑤ Recovery Goal     → Description (richtext) + dates + review status + documentation
//   ⑥ Recovery Objective → Description (richtext) + status + dates + review + documentation
//   ⑦ Intervention: Skills Training → description (richtext) + dropdown fields
//   ⑧ Intervention: Routine Case Mgmt → description (richtext) + dropdown fields
//   ⑨ Intervention: Peer-to-Peer  → description (richtext) + dropdown fields
//   ⑩ Intervention: E&M           → description (richtext) + dropdown fields
//   ⑪ Discharge Plan   → description (richtext)
//   ⑫ Acknowledgements → description (richtext)
//
// Note on repeated labels (Established Date, Status, Frequency, Duration,
// Intervention): these appear once per section. fillDate/fillDropdown fills
// the FIRST DOM occurrence. For now all goal/objective/intervention date+status
// fields are mapped to first-occurrence only. A future improvement could use
// DOM anchoring per section.

export const PERSON_CENTERED_RECOVERY_PLAN_MH: FormProfile = {
  id: 'person-centered-recovery-plan-mh',
  displayName: 'Person-Centered Recovery Plan MH',
  detection: {
    anchors: ['Select Length and Type Below', 'Credible Plan for'],
    supporting: [
      'Plan Length',
      'Individual Strengths',
      'Barriers to Recovery',
      'Recovery Goal',
      'Recovery Objective',
      'Discharge Plan',
      'Add Golden Thread',
      'Plan Type',
      'LOC',
      'Skills Training Intervention',
    ],
  },
  fields: [
    // ① Plan Type Header ───────────────────────────────────────────────────────
    {
      key: 'planLength',
      type: 'radio',
      labels: ['Plan Length:'],
      options: ['90 Days', '180 Days'],
    },
    {
      key: 'planType',
      type: 'radio',
      labels: ['Plan Type:'],
      options: ['Initial', 'Review', 'Revision'],
    },

    // ② Program / Level of Care ───────────────────────────────────────────────
    // LOC is a richtext description block under the "Program/Level of Care" section
    {
      key: 'loc',
      type: 'richtext',
      labels: ['LOC', 'Select LOC Below'],
    },
    {
      key: 'programLevelOfCare',
      type: 'dropdown',
      labels: ['Program/Level of Care:'],
    },

    // ③ Individual Strengths ──────────────────────────────────────────────────
    {
      key: 'individualStrengths',
      type: 'richtext',
      labels: ['Individual Strengths:', 'Strengths'],
    },

    // ④ Barriers to Recovery ──────────────────────────────────────────────────
    // "Description" CKEditor block under "Barriers to Recovery" header
    {
      key: 'barriersDescription',
      type: 'richtext',
      labels: ['Barriers to Recovery', 'Barriers'],
    },

    // ⑤ Recovery Goal ─────────────────────────────────────────────────────────
    // "Description" CKEditor block under "Recovery Goal" header
    {
      key: 'goalDescription',
      type: 'richtext',
      labels: ['Recovery Goal', 'Goal'],
    },
    // Dates appear as text inputs (MM/DD/YYYY), fillDate normalizes automatically
    {
      key: 'goalEstablishedDate',
      type: 'date',
      labels: ['Established Date:'],
    },
    {
      key: 'goalTargetDate',
      type: 'date',
      labels: ['Target Date:'],
    },
    {
      key: 'recoveryGoalReviewDate',
      type: 'date',
      labels: ['Recovery Goal Review Date:'],
    },
    {
      key: 'recoveryGoalReviewStatus',
      type: 'dropdown',
      labels: ['Recovery Goal Review Status:'],
    },
    {
      key: 'goalDocumentationOfProgress',
      type: 'richtext',
      labels: ['Documentation of Progress and/or any Challenges'],
    },

    // ⑥ Recovery Objective ────────────────────────────────────────────────────
    {
      key: 'objectiveDescription',
      type: 'richtext',
      labels: ['Recovery Objective', 'Objective'],
    },
    {
      key: 'objectiveStatus',
      type: 'dropdown',
      labels: ['Status:'],
    },
    {
      key: 'recoveryObjectiveReviewDate',
      type: 'date',
      labels: ['Recovery Objective Review Date:'],
    },
    {
      key: 'recoveryObjectiveReviewStatus',
      type: 'dropdown',
      labels: ['Recovery Objective Review Status:'],
    },

    // ⑦ Skills Training Intervention ──────────────────────────────────────────
    // Section header = "Skills Training Intervention", then Description (CKEditor)
    {
      key: 'skillsTrainingDescription',
      type: 'richtext',
      labels: ['Skills Training Intervention'],
    },
    {
      key: 'skillsTrainingIntervention',
      type: 'dropdown',
      labels: ['Intervention:'],
    },
    {
      key: 'skillsTrainingFrequency',
      type: 'dropdown',
      labels: ['Frequency:'],
    },
    {
      key: 'skillsTrainingDuration',
      type: 'dropdown',
      labels: ['Duration:'],
    },

    // ⑧ Routine Case Management Intervention ──────────────────────────────────
    {
      key: 'caseManagementDescription',
      type: 'richtext',
      labels: ['Routine Case Management Intervention'],
    },

    // ⑨ Peer-to-Peer Services Intervention ────────────────────────────────────
    {
      key: 'peerToPeerDescription',
      type: 'richtext',
      labels: ['Peer-to-Peer Services Intervention'],
    },

    // ⑩ E&M Intervention ──────────────────────────────────────────────────────
    {
      key: 'emDescription',
      type: 'richtext',
      labels: ['E&M Intervention'],
    },

    // ⑪ Discharge Plan ────────────────────────────────────────────────────────
    {
      key: 'dischargePlan',
      type: 'richtext',
      labels: ['Discharge Plan'],
    },

    // ⑫ Acknowledgements ─────────────────────────────────────────────────────
    {
      key: 'acknowledgements',
      type: 'richtext',
      labels: ['Acknowledgements'],
    },
  ],
};
