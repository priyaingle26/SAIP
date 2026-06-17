import type { FormProfile } from '../types';
import { SIRP_SHARED_FIELDS } from './sirp-shared';

// See sirp-psychosocial-rehab.ts — identical DOM structure, same caveat.
export const SIRP_SKILLS_TRAINING: FormProfile = {
  id: 'Skills Training Note',
  displayName: 'SIRP Note — Skills Training',
  // Identical detection signal to Psychosocial Rehab — see comment there.
  detection: {
    anchors: ['SIRP Note', 'PERTINENT EVENT/BEHAVIOR RELATED TO RECOVERY'],
    supporting: ['METHODS USED DURING TRAINING SESSION'],
  },
  fields: SIRP_SHARED_FIELDS,
};
