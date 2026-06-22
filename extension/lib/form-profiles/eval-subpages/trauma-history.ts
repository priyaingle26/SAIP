import type { FormProfile } from '../types';

// Psych Eval subpage: Trauma, Abuse, Neglect, E
export const TRAUMA_HISTORY: FormProfile = {
  id: 'Trauma History',
  displayName: 'Trauma, Abuse, Neglect',
  bundle: 'psych-eval',
  detection: {
    anchors: ['TRAUMA, ABUSE, NEGLECT, EXPLOITATION', 'Trauma, Abuse, Neglect, E'],
    supporting: ['Sexual Abuse', 'Physical Abuse', 'Emotional Abuse', 'History of Neglect', 'Military Trauma'],
    categoryIds: [27082],
  },
  fields: [
    { key: 'traumaSexualAbuse', type: 'radio', labels: ['Sexual Abuse'], options: ['Yes', 'No'] },
    { key: 'traumaPhysicalAbuse', type: 'radio', labels: ['Physical Abuse'], options: ['Yes', 'No'] },
    { key: 'traumaEmotionalAbuse', type: 'radio', labels: ['Emotional Abuse'], options: ['Yes', 'No'] },
    { key: 'traumaHistoryNeglect', type: 'radio', labels: ['History of Neglect'], options: ['Yes', 'No'] },
    { key: 'traumaMilitary', type: 'radio', labels: ['Military Trauma'], options: ['Yes', 'No'] },
    { key: 'traumaWar', type: 'radio', labels: ['War Affected'], options: ['Yes', 'No'] },
    { key: 'traumaTerrorism', type: 'radio', labels: ['Terrorism Affected'], options: ['Yes', 'No'] },
    { key: 'traumaNaturalDisaster', type: 'radio', labels: ['Natural Disaster'], options: ['Yes', 'No'] },
    { key: 'traumaWitnessFamilyViolence', type: 'radio', labels: ['Witness to Family Violence'], options: ['Yes', 'No'] },
    { key: 'traumaWitnessCommunityViolence', type: 'radio', labels: ['Witness to Community Violence'], options: ['Yes', 'No'] },
    { key: 'traumaVictimCriminalActivity', type: 'radio', labels: ['Witness/Victim of Criminal Activity'], options: ['Yes', 'No'] },
    { key: 'traumaSignificantIssues', type: 'radio', labels: ['Are there significant issues as a result of reported trauma impacting current presenting problem'], options: ['Yes', 'Denies'] },
    { key: 'traumaHistory', type: 'textarea', labels: ['For any \'YES\' boxes checked', 'TRAUMA HISTORY', 'Trauma/Abuse History'] },
  ],
};
