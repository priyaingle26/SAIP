// ─── Form Profile registry ───────────────────────────────────────────────────
// Aggregates every declarative form profile. Detection and filling both read
// from here exclusively — adding a form means adding a profile file and one
// entry below, never touching fieldMapper.ts (form-profile-registry spec).

import type { FormProfile } from './types';

import { DARP_NOTE } from './standalone/darp-note';
import { ECI_NOTE } from './standalone/eci-note';
import { FAYS_SOAP_NOTE } from './standalone/fays-soap';
import { IDD_SERVICE_OUTCOME } from './standalone/idd-service-outcome';
import { RECOVERY_PLAN_REVIEW } from './standalone/recovery-plan-review';
import { SIRP_PSYCHOSOCIAL_REHAB } from './standalone/sirp-psychosocial-rehab';
import { SIRP_SKILLS_TRAINING } from './standalone/sirp-skills-training';

import { PSYCH_EVAL_MAIN } from './eval-subpages/psych-eval-main';
import { EM_EPT_PATIENT_HISTORY } from './eval-subpages/em-ept-patient-history';
import { MSE } from './eval-subpages/mse';
import { REVIEW_OF_SYSTEMS } from './eval-subpages/review-of-systems';
import { MEDICAL_CONDITIONS } from './eval-subpages/medical-conditions';
import { TRAUMA_HISTORY } from './eval-subpages/trauma-history';
import { BMI_EVAL } from './eval-subpages/bmi-eval';
import { PHQ9_ADULT, PHQ9_ADOLESCENT, SUICIDE_HOMICIDE_RISK } from './eval-subpages/scored-instruments';
import { SUBSTANCE_USE_ADULT, SUBSTANCE_USE_CHILD } from './eval-subpages/substance-use';

export const STANDALONE_PROFILES: FormProfile[] = [
  DARP_NOTE,
  ECI_NOTE,
  FAYS_SOAP_NOTE,
  IDD_SERVICE_OUTCOME,
  RECOVERY_PLAN_REVIEW,
  SIRP_PSYCHOSOCIAL_REHAB,
  SIRP_SKILLS_TRAINING,
];

// Order matters slightly for readability only — scoring is independent per
// profile, so specificity (e.g. PHQ9_ADOLESCENT before PHQ9_ADULT) doesn't
// depend on this list's order.
export const EVAL_SUBPAGE_PROFILES: FormProfile[] = [
  PSYCH_EVAL_MAIN,
  EM_EPT_PATIENT_HISTORY,
  MSE,
  REVIEW_OF_SYSTEMS,
  MEDICAL_CONDITIONS,
  TRAUMA_HISTORY,
  BMI_EVAL,
  PHQ9_ADOLESCENT,
  PHQ9_ADULT,
  SUICIDE_HOMICIDE_RISK,
  SUBSTANCE_USE_ADULT,
  SUBSTANCE_USE_CHILD,
];

export const ALL_PROFILES: FormProfile[] = [...STANDALONE_PROFILES, ...EVAL_SUBPAGE_PROFILES];

export const ALL_FORM_PROFILE_IDS: string[] = ALL_PROFILES.map((p) => p.id);

export function getProfileById(id: string): FormProfile | undefined {
  return ALL_PROFILES.find((p) => p.id === id);
}

// Evaluation bundle id -> Credible's fvid for that bundle (deployment-
// specific; confirmed for this deployment in docs/FORM-AUTOFILL-ARCHITECTURE.md §7.0).
export const BUNDLE_FVID_MAP: Record<string, number> = {
  'psych-eval': 3070,
  'em-ept': 3071,
};

export function isEvalSubpageProfile(id: string): boolean {
  return EVAL_SUBPAGE_PROFILES.some((p) => p.id === id);
}

export function getBundleIdFromFvid(fvid: string | number): string | undefined {
  const fvidNum = typeof fvid === 'string' ? Number.parseInt(fvid, 10) : fvid;
  return Object.entries(BUNDLE_FVID_MAP).find(([, v]) => v === fvidNum)?.[0];
}

// All sub-page profiles belonging to a bundle: those explicitly tagged with
// this bundle id, plus "shared" sub-pages (MSE, ROS, Medical Conditions, BMI)
// that have no `bundle` of their own because they're reused across bundles
// (form-profile-registry spec, "Reusable sub-page profiles" scenario).
// Scored-instrument profiles (empty `fields`) are excluded — never generated.
export function getProfilesForBundle(bundleId: string): FormProfile[] {
  return EVAL_SUBPAGE_PROFILES.filter(
    (p) => (p.bundle === bundleId || p.bundle === undefined) && p.fields.length > 0 && !p.scored
  );
}
