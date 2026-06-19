import type { FormProfile } from '../types';

// E&M EPT Patient History sub-page. The page contains vitals, history source
// radio, Chief Complaint and HPI plain textareas, followed by a full C-SSRS
// section. Detection must outscore the Suicide/Homicide Risk profile whose
// anchors (Suicide, Homicide Risk, C-SSRS, Columbia Suicide) all appear on this
// page too — so we use anchors that are UNIQUE to the Patient History page and
// absent from the standalone C-SSRS page.
// Chief Complaint and HPI use plain <textarea> (no q_/qnotes_ pairing).
export const EM_EPT_PATIENT_HISTORY: FormProfile = {
  id: 'E&M EPT - Patient History',
  displayName: 'E&M EPT — Patient History',
  bundle: 'em-ept',
  detection: {
    // "History Information and Report Obtained From" is the label of the radio
    // group that only appears on the Patient History page, not on the standalone
    // C-SSRS page — this makes this profile win decisively.
    anchors: ['History Information and Report Obtained From', 'Chief Complaint', 'History of Present Illness'],
    supporting: ['Patient History', 'History of Present Illness', 'Source of History'],
    categoryIds: [27091],
  },
  fields: [
    {
      key: 'historySource',
      type: 'radio',
      labels: ['History Information and Report Obtained From', 'History source', 'Source of History'],
      options: [
        'Patient',
        'Patient / LAR / Parent',
        'Patient / Other Family',
        'Patient / Other Advocate',
        'Patient / Other Mental Health Provider',
        'Patient / Records Review (Summarize in HPA)',
      ],
    },
    // Chief Complaint and HPI are plain <textarea> elements (not q_/qnotes_ paired)
    { key: 'chiefComplaint', type: 'plain-textarea', labels: ['Chief Complaint'] },
    { key: 'historyPresentIllness', type: 'plain-textarea', labels: ['History of Present Illness', 'HPI'] },
    // Summary of SI/HI Risk — plain textarea at the bottom of the C-SSRS section
    { key: 'riskAssessmentSummary', type: 'plain-textarea', labels: ['Summary of SI/HI Risk', 'Summary of SI'] },
  ],
};
