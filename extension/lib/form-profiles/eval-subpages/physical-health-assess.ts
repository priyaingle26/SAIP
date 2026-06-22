import type { FormProfile } from '../types';

// Physical Health Assessment Screening sub-page (Psychiatric Evaluation bundle).
// This page contains TWO sections:
//   1. PHYSICAL HEALTH ASSESSMENT SCREENING (medical conditions, physical exam, allergies, etc.)
//   2. REVIEW OF SYSTEMS (12 system checkboxes + comments textarea)
// Both sections are on the same page, so all fields are defined here together.
export const PHYSICAL_HEALTH_ASSESS: FormProfile = {
  id: 'Physical Health Assess',
  displayName: 'Physical Health Assessment Screening',
  detection: {
    anchors: [
      'Physical Health Assess',
      'PHYSICAL HEALTH ASSESSMENT SCREENING',
      'Does the individual report present or history of any medical conditions',
    ],
    supporting: [
      'Has the consumer had a physical exam in the past 12 months',
      'Name of personal physician',
      'Special Precautions',
      'REVIEW OF SYSTEMS',
    ],
  },
  fields: [
    // ── Section 1: Physical Health Assessment Screening ──────────────────────
    // "Does the individual report present or history of any medical conditions?" Yes/No
    {
      key: 'hasMedicalConditions',
      type: 'radio',
      labels: ['Does the individual report present or history of any medical conditions'],
      options: ['Yes', 'No'],
    },
    // "If yes, describe reported medical condition(s) including current related medications:"
    {
      key: 'medicalConditionsDetail',
      type: 'textarea',
      labels: [
        'If yes, describe reported medical condition(s) including current related medications',
        'describe reported medical condition',
      ],
    },
    // "Has the consumer had a physical exam in the past 12 months?" Yes/No/Unknown
    {
      key: 'physicalExamPast12Months',
      type: 'radio',
      labels: ['Has the consumer had a physical exam in the past 12 months'],
      options: ['Yes', 'No', 'Unknown'],
    },
    // "Does the consumer require evaluation for pregnancy or prenatal care?" Yes/No
    {
      key: 'pregnancyEvalRequired',
      type: 'radio',
      labels: ['Does the consumer require evaluation for pregnancy or prenatal care'],
      options: ['Yes', 'No'],
    },
    // "Allergies - List (including medication allergies):"
    { key: 'allergiesList', type: 'text', labels: ['Allergies', 'Allergies - List'] },
    // "Special Precautions" — q_/qnotes_ paired textarea
    { key: 'specialPrecautions', type: 'textarea', labels: ['Special Precautions'] },
    // "Name of personal physician:"
    { key: 'personalPhysicianName', type: 'text', labels: ['Name of personal physician', 'Personal physician'] },
    // "Physical Health Screening Results Referral(s):" — q_/qnotes_ paired textarea
    {
      key: 'physicalHealthReferrals',
      type: 'textarea',
      labels: [
        'Physical Health Screening Results Referral',
        'Physical Health Screening Results Refferal',
        'Referral(s)',
        'Refferal(s)',
      ],
    },

    // ── Section 2: Review of Systems ─────────────────────────────────────────
    // 12-system checkbox group
    {
      key: 'rosFindings',
      type: 'checkbox-group',
      labels: ['REVIEW OF SYSTEMS', 'Systems reviewed for pertinent positive/negative signs and symptoms'],
      options: [
        'Constitutional', 'Eyes', 'Ears/Nose/Throat', 'Cardiovascular',
        'Respiratory', 'Gastrointestinal', 'Genitourinary', 'Musculoskeletal',
        'Integumentary', 'Neurological', 'Endocrine', 'Hematologic/Lymphatic',
      ],
    },
    // "Current Review of Systems and Changes Noted" — q_/qnotes_ paired textarea
    {
      key: 'rosComments',
      type: 'textarea',
      labels: ['Current Review of Systems and Changes Noted', 'ROS Comments'],
    },
  ],
};
