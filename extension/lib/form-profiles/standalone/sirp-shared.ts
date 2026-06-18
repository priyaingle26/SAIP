import type { FieldDef } from '../types';

// SIRP Psychosocial Rehab and SIRP Skills Training share identical field
// structure and labels (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.5/1.6) — only
// the page title context differs, and that can't be told apart from the DOM.
// Both profiles below reuse this field list rather than duplicating it.
export const SIRP_SHARED_FIELDS: FieldDef[] = [
  { key: 'modality', type: 'radio', labels: ['Modality'], options: ['Individual', 'Family', 'Couple'] },
  { key: 'participants', type: 'checkbox-group', labels: ['Who was present'], options: ['Individual', 'Others'] },
  { key: 'methodsUsed', type: 'text', labels: ['METHODS USED DURING TRAINING SESSION'] },
  { key: 'materialsUsed', type: 'text', labels: ['MATERIALS USED TO PROVIDE TRAINING'] },
  { key: 'behaviorRelatedToRecovery', type: 'textarea', labels: ['PERTINENT EVENT/BEHAVIOR RELATED TO RECOVERY'] },
  { key: 'servicesProvided', type: 'textarea', labels: ['SUMMARY OF ACTIVITIES/SERVICES PROVIDED'] },
  { key: 'progressTowardGoals', type: 'textarea', labels: ['PROGRESS/LACK OF PROGRESS IN ACHIEVING RECOVERY PLAN GOAL'] },
  { key: 'nextSessionPlan', type: 'textarea', labels: ['PLAN FOR THE NEXT SESSION'] },
  { key: 'currentDiagnosis', type: 'text', labels: ['Current Diagnosis'] },
];
