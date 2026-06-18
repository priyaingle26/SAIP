import type { FormProfile } from '../types';
import { SIRP_SHARED_FIELDS } from './sirp-shared';

// Title is identical to Skills Training ("SIRP Note") — cannot be
// auto-distinguished from the DOM. Manual override lets the clinician pick;
// either selection fills the same way (design.md D detection §"Structurally
// identical forms").
export const SIRP_PSYCHOSOCIAL_REHAB: FormProfile = {
  id: 'Psychosocial Rehab Note',
  displayName: 'SIRP Note — Psychosocial Rehab',
  // Same detection signal as Skills Training on purpose — the two forms are
  // textually indistinguishable, so they intentionally tie and fall through
  // to the manual-override dropdown (form-detection spec, "Structurally
  // identical forms" scenario). Default to this one when ties occur.
  detection: {
    anchors: ['SIRP Note', 'PERTINENT EVENT/BEHAVIOR RELATED TO RECOVERY'],
    supporting: ['METHODS USED DURING TRAINING SESSION'],
  },
  fields: SIRP_SHARED_FIELDS,
};
