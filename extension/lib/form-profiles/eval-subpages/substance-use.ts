import type { FormProfile } from '../types';

// AUDIT-C / CRAFFT scored grids are out of scope (see scored-instruments.ts
// comment) — never declared as fields here. Tobacco status + free-text
// comments are the safe, narrative-driven targets ("Partial" in
// docs/FORM-AUTOFILL-ARCHITECTURE.md §1.8). Needs live verification (8.1).

export const SUBSTANCE_USE_ADULT: FormProfile = {
  id: 'Adult Substance Use',
  displayName: 'Adult Substance Use (AUDIT-C)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['AUDIT-C', 'Substance Use'],
    supporting: ['Tobacco'],
    categoryIds: [27080],
  },
  fields: [
    { key: 'tobaccoStatus', type: 'dropdown', labels: ['Tobacco'] },
    { key: 'substanceUseComments', type: 'textarea', labels: ['Comments', 'Substance Use'] },
  ],
};

export const SUBSTANCE_USE_CHILD: FormProfile = {
  id: 'Child Substance Use',
  displayName: 'Child Substance Use (CRAFFT)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['CRAFFT', 'Substance Use'],
    supporting: ['Tobacco'],
    categoryIds: [27081],
  },
  fields: [
    { key: 'tobaccoStatus', type: 'dropdown', labels: ['Tobacco'] },
    { key: 'substanceUseComments', type: 'textarea', labels: ['Comments', 'Substance Use'] },
  ],
};
