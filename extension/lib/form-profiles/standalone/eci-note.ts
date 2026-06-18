import type { FormProfile } from '../types';

// From screenshots (docs/FORM-AUTOFILL-ARCHITECTURE.md §1.2) — needs live
// fingerprint verification (task 8.1). nextVisitDate is a date picker and is
// out of scope for this iteration (design.md Non-Goals).
export const ECI_NOTE: FormProfile = {
  id: 'ECI Service Delivery Note',
  displayName: 'ECI Progress Note',
  detection: {
    anchors: ['ECI Progress Note', 'SERVICE DELIVERY PROGRESS NOTE', 'IFSP'],
    supporting: ['JOINT PLANNING', 'OBSERVATION AND PRACTICE', 'REFLECTION'],
  },
  fields: [
    { key: 'language', type: 'dropdown', labels: ["family's native language"] },
    { key: 'presentDuringVisit', type: 'text', labels: ['Who was present during visit'] },
    { key: 'ifspOutcomes', type: 'textarea', labels: ['IFSP Outcomes Addressed'] },
    { key: 'jointPlanningReflection', type: 'textarea', labels: ['Joint Planning', 'Reflection'] },
    { key: 'observationPractice', type: 'textarea', labels: ['Observation and Practice'] },
    { key: 'reflectionFeedback', type: 'textarea', labels: ['Reflection/Feedback'] },
  ],
};
