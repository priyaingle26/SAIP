# Implementation Plan: Psychiatric Evaluation Bundle — Full Form Support

## Project Context

**Repo root**: `/Users/consultadd/Downloads/SAIP/SAIP/`

**Extension stack**: WXT + React + TypeScript (MV3 Chrome extension)
- Build: `cd extension && npm run build` → `.output/chrome-mv3/`
- Type check: `cd extension && npm run compile`

**Backend**: FastAPI (Python)
- File: `ai-scribe/web-api/app/routers/extension_api.py`
- Verify syntax: `python3 -c "import ast; ast.parse(open('ai-scribe/web-api/app/routers/extension_api.py').read()); print('OK')"`

**Architecture rules** (from `CLAUDE.md`):
- `extension/lib/form-profiles/` — one file per form (declarative data only)
- `extension/lib/fieldMapper.ts` — generic engine, NEVER add form-specific cases
- Every new form needs: (a) profile file, (b) entry in `index.ts`, (c) `FORM_SCHEMAS` entry in `extension_api.py`
- Detection is weighted keyword scoring: anchors × 3, supporting × 1; highest score wins

**Supported field types** (already in engine — do NOT modify `fieldMapper.ts`):
| Type | DOM element |
|---|---|
| `textarea` | q_/qnotes_ paired rich-text widget |
| `plain-textarea` | bare `<textarea>` |
| `text` | `<input type="text">` |
| `date` | `<input type="date">` — normalized to YYYY-MM-DD |
| `dropdown` | `<select>` |
| `radio` | single-choice radio group — matched by adjacent label text |
| `checkbox-group` | flat multi-select checkboxes |
| `mse-group` | MSE shared-id checkboxes — matched via MSE_SIGNATURES |
| `scored-widget` | x_ buttons sharing one id (0/1/2/3 or Y/N) |
| `scored-options` | AUDIT-C style — each option is its own x_ button, value = score |

---

## What Already Works — Do NOT Touch

These Psych Eval bundle sub-pages share identical DOM with already-implemented E&M profiles:
| Sub-page | Profile ID | File |
|---|---|---|
| PHQ-9 ADULT | `PHQ-9 Adult` | `eval-subpages/scored-instruments.ts` |
| PHQ-9 ADOLESCENT | `PHQ-9 Adolescent` | `eval-subpages/scored-instruments.ts` |
| Diagnostic Review | `Diagnostic Review` | `standalone/diagnostic-review.ts` |
| Child Substance Use | `Child Substance Use` | `eval-subpages/substance-use.ts` |

---

## Summary of All Changes

| # | File | Action |
|---|---|---|
| 1 | `eval-subpages/psych-eval-main.ts` | Add 2 missing fields |
| 2 | `mseSignatures.ts` | Fix cognitiveAttention options + add 4 Memory groups |
| 3 | `eval-subpages/mse.ts` | Add 4 new mse-group fields |
| 4 | `extension_api.py` | Add memory fields to `_MSE_FIELDS` + psych eval main fields |
| 5 | `standalone/plan-recommendations.ts` | Fix anchors + add problem2-4 + referredTo |
| 6 | `eval-subpages/substance-use.ts` | Fix label alias + add substanceUseDisposition |
| 7 | `eval-subpages/scored-instruments.ts` | Add SUICIDE_HOMICIDE_RISK_PSYCH export |
| 8 | `eval-subpages/physical-health-assess.ts` | **NEW FILE** |
| 9 | `eval-subpages/trauma-abuse-neglect.ts` | **NEW FILE** |
| 10 | `eval-subpages/relationships-home.ts` | **NEW FILE** |
| 11 | `eval-subpages/medication-management-psych.ts` | **NEW FILE** |
| 12 | `form-profiles/index.ts` | Register all 5 new profiles |
| 13 | `extension_api.py` | Add FORM_SCHEMAS for all new/updated profiles |

---

## CHANGE 1 — Update `psych-eval-main.ts`

**File**: `extension/lib/form-profiles/eval-subpages/psych-eval-main.ts`

The Psychiatric Evaluation main page has 2 fields not in the current profile:
- "Does the consumer have a history of swallowing foreign objects?" → Yes/No radio
- "If yes: What foreign objects have been swallowed?" → q_/qnotes_ textarea

Also the `sourceOfInformation` radio needs the options list added from the live form:

**Rewrite the file to**:
```ts
import type { FormProfile } from '../types';

export const PSYCH_EVAL_MAIN: FormProfile = {
  id: 'Psych Eval - Main',
  displayName: 'Psychiatric Evaluation',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Psychiatric Evaluation', 'Presenting Problem'],
    supporting: ['Community Healthcore', 'Source of Information'],
    categoryIds: [26965],
  },
  fields: [
    {
      key: 'sourceOfInformation',
      type: 'radio',
      labels: ['Source of Information', "Source(s) of Information"],
      options: [
        'Patient',
        'Patient / LAR / Parent',
        'Patient / Other Family',
        'Patient / Other Advocate',
        'Patient / Other Mental Health Provider',
        'Patient / Records Review (Summarize in HPA)',
      ],
    },
    { key: 'presentingProblems', type: 'textarea', labels: ['Presenting Problem'] },
    { key: 'familyHistory', type: 'textarea', labels: ['Family History', 'Other/Family History', 'past social and family history'] },
    {
      key: 'swallowingForeignObjects',
      type: 'radio',
      labels: ['history of swallowing foreign objects'],
      options: ['Yes', 'No'],
    },
    { key: 'foreignObjectsList', type: 'textarea', labels: ['What foreign objects have been swallowed'] },
  ],
};
```

---

## CHANGE 2 — Update `mseSignatures.ts`

**File**: `extension/lib/form-profiles/mseSignatures.ts`

**Two fixes needed:**

### Fix A — cognitiveAttention options (currently only 2, screenshot shows 8)
Find the `cognitiveAttention` entry and replace its `options` array:
```ts
{
  key: 'cognitiveAttention',
  label: 'COGNITIVE ATTENTION/CONCENTRATION',
  options: [
    'No Gross Deficits',
    'Concentration Problems',
    'Concrete',
    'Abstract',
    'Appropriate for Tested IQ',
    'Inattentive / Easily Distracted',
    'Limited Attention Span',
    'Not formally examined',
  ],
},
```

### Fix B — Remove `musculoskeletal` (empty options, non-functional) and add 4 Memory groups
Remove the `musculoskeletal` entry (empty options array, described as "unconfirmed").
Add these 4 entries **at the end** of the `MSE_SIGNATURES` array:
```ts
{
  key: 'memoryStatus',
  label: 'MEMORY',
  options: ['Examined', 'Not examined', 'Unable to Assess'],
},
{
  key: 'memoryImmediate',
  label: 'MEMORY - Immediate',
  options: ['Good', 'Fair', 'Impaired'],
  tiebreakOrder: 4,
},
{
  key: 'memoryRecent',
  label: 'MEMORY - Recent',
  options: ['Good', 'Fair', 'Impaired'],
  tiebreakOrder: 5,
},
{
  key: 'memoryPast',
  label: 'MEMORY - Past',
  options: ['Good', 'Fair', 'Impaired'],
  tiebreakOrder: 6,
},
```

**Why tiebreakOrder 4/5/6**: `memoryImmediate`, `memoryRecent`, `memoryPast` all have
identical option sets [Good, Fair, Impaired]. `insight`/`judgement`/`language` already
use tiebreakOrder 1/2/3 for their identical set [Excellent, Good, Fair, Poor, Grossly
impaired]. The matcher resolves ties by DOM order (top-to-bottom = visual order on form).

---

## CHANGE 3 — Update `mse.ts`

**File**: `extension/lib/form-profiles/eval-subpages/mse.ts`

The file auto-generates fields from `MSE_SIGNATURES` via a map. Since we added 4 new
signatures in Change 2, those fields appear automatically. No code change needed **unless**
`mseComments` label needs updating.

Check the current `mseComments` label: `['MSE Comments', 'Mental Status Comments']`.
The Psych Eval screenshot shows "Mental Status Exam Comments:" as the label. Update:
```ts
{ key: 'mseComments', type: 'textarea', labels: ['MSE Comments', 'Mental Status Comments', 'Mental Status Exam Comments'] },
```

Also update MSE detection anchors to include `'COGNITIVE ATTENTION'` and `'PSYCHOMOTOR'`
in supporting to improve Psych Eval detection:
```ts
detection: {
  anchors: ['ORIENTATION', 'RAPPORT', 'HALLUCINATIONS'],
  supporting: ['MOOD', 'AFFECT', 'INSIGHT', 'JUDGEMENT', 'COGNITIVE ATTENTION', 'PSYCHOMOTOR'],
  categoryIds: [27098],
},
```

---

## CHANGE 4 — Update `extension_api.py` — _MSE_FIELDS + Psych Eval main

**File**: `ai-scribe/web-api/app/routers/extension_api.py`

### 4A — Add Memory fields to `_MSE_FIELDS`
Search for `_MSE_FIELDS` dict definition. Add these 4 keys at the end (before closing `}`):
```python
"memoryStatus": "Memory examination status. One of: Examined, Not examined, Unable to Assess. Empty string if not stated.",
"memoryImmediate": "Immediate memory quality. One of: Good, Fair, Impaired. Empty string if not assessed.",
"memoryRecent": "Recent memory quality. One of: Good, Fair, Impaired. Empty string if not assessed.",
"memoryPast": "Past/remote memory quality. One of: Good, Fair, Impaired. Empty string if not assessed.",
```

These automatically propagate to `FORM_SCHEMAS["Mental Status Exam"]` since that schema
is built as `{**_MSE_FIELDS}`.

### 4B — Add 2 new fields to `FORM_SCHEMAS["Psychiatric Evaluation"]`
Find `FORM_SCHEMAS["Psychiatric Evaluation"]` (or `"Psych Eval - Main"` — check which
id is used as the key). Add:
```python
"swallowingForeignObjects": "Does the consumer have a history of swallowing foreign objects. One of: Yes, No. Empty string if not stated.",
"foreignObjectsList": "List of foreign objects swallowed, if history is positive. Empty string otherwise.",
```

---

## CHANGE 5 — Update `plan-recommendations.ts`

**File**: `extension/lib/form-profiles/standalone/plan-recommendations.ts`

### Problem
Current anchors include `'Lab Information Reviewed'` and `'Most Recent Lab Information'`
which do NOT appear on the Psych Eval Plan/Recommendations page — so detection fails.

### Fix: replace detection block
```ts
detection: {
  anchors: ['Plan / Recommendations / Referrals', 'Treatment Plan Comments'],
  supporting: ['Plan / Recommendations', 'RETURN TO', 'Skills Training', 'In Weeks'],
},
```

### Add fields for Problem blocks 2-4 and referredTo
After `plan1` and before `treatmentPlanComments`, insert:
```ts
{ key: 'problem2', type: 'textarea', labels: ['Problem (2)'] },
{ key: 'problem3', type: 'textarea', labels: ['Problem (3)'] },
{ key: 'problem4', type: 'textarea', labels: ['Problem (4)'] },
```

After `treatmentPlanComments`, add:
```ts
{
  key: 'referredTo',
  type: 'checkbox-group',
  labels: ['Check if referred to'],
  options: ['Skills Training', 'Counseling', 'General Physician'],
},
```

> **Note**: `status` and `plan` labels are identical across all 4 blocks — the engine
> fills only the first match. Block 1 fills correctly; blocks 2-4 status/plan require
> DOM disambiguation (future task). Problem (2)/(3)/(4) labels are distinct and WILL fill.

### Backend: add to `FORM_SCHEMAS["Plan / Recommendations"]`
```python
"problem2": "Second clinical problem being addressed. Empty string if not applicable.",
"problem3": "Third clinical problem. Empty string if not applicable.",
"problem4": "Fourth clinical problem. Empty string if not applicable.",
"referredTo": "Services referred to, comma-separated from: Skills Training, Counseling, General Physician. Empty string if none.",
```

---

## CHANGE 6 — Update `substance-use.ts`

**File**: `extension/lib/form-profiles/eval-subpages/substance-use.ts`

### Fix A — `illegalDrugList` label alias
The Psych Eval Adult Substance Use page uses label "Describe History of Substance Use"
instead of "If yes, list". Add the alias:
```ts
{ key: 'illegalDrugList', type: 'plain-textarea', labels: ['If yes, list', 'Describe History of Substance Use'] },
```

### Fix B — Add `substanceUseDisposition` field to `AUDIT_C_FIELDS`
Insert before `auditResult`:
```ts
{
  key: 'substanceUseDisposition',
  type: 'radio',
  labels: ['Substance Use Screening Disposition'],
  options: [
    'Screening indicates a need for further assessment',
    'Negative screening - no further action necessary',
  ],
},
```

### Backend: add to `FORM_SCHEMAS["Adult Substance Use"]`
```python
"substanceUseDisposition": "Substance use screening disposition. One of: Screening indicates a need for further assessment, Negative screening - no further action necessary. Empty string if not stated.",
```

---

## CHANGE 7 — Add `SUICIDE_HOMICIDE_RISK_PSYCH` to `scored-instruments.ts`

**File**: `extension/lib/form-profiles/eval-subpages/scored-instruments.ts`

The Psych Eval C-SSRS page (image 62) uses plain **radio** Yes/No buttons — different
from the E&M Patient History version which uses `x_` scored buttons. Both pages have
similar detection keywords, but the Psych Eval version has a unique section header:
**"Within Past 30 Days:"** — use this as a distinguishing anchor.

Add this block **before** the final line of the file:
```ts
// Psych Eval C-SSRS: Yes/No plain radios (not x_ scored buttons like E&M version).
// "Within Past 30 Days" is a unique section header on this page — anchor it here.
const CSSRS_PSYCH_FIELDS: FieldDef[] = [
  { key: 'wishedDead', type: 'radio', labels: ['wished you were dead'], options: ['Yes', 'No'] },
  { key: 'thoughtsKillingSelf', type: 'radio', labels: ['thoughts of killing yourself'], options: ['Yes', 'No'] },
  { key: 'thinkingHowKillSelf', type: 'radio', labels: ['how you might kill yourself'], options: ['Yes', 'No'] },
  { key: 'intentionToAct', type: 'radio', labels: ['intention of acting on them'], options: ['Yes', 'No'] },
  { key: 'detailsAndIntent', type: 'radio', labels: ['details of how to kill yourself and do you intend to carry out this plan'], options: ['Yes', 'No'] },
  { key: 'suicidalBehavior', type: 'radio', labels: ['prepared to do anything to end your life'], options: ['Yes', 'No'] },
  { key: 'homicidalIdeation', type: 'radio', labels: ['thoughts of killing someone else'], options: ['Yes', 'No'] },
  { key: 'homicidalPlan', type: 'radio', labels: ['details of how to kill them'], options: ['Yes', 'No'] },
  { key: 'riskAssessmentComments', type: 'textarea', labels: ['Risk Assessment Comments', 'Suicide / Homicide Risk Assessment Comments'] },
];

export const SUICIDE_HOMICIDE_RISK_PSYCH: FormProfile = {
  id: 'Suicide/Homicide Risk (Psych)',
  displayName: 'Suicide/Homicide Risk (C-SSRS) — Psych Eval',
  scored: true,
  detection: {
    anchors: ['Within Past 30 Days', 'Homicide Risk Assessment', 'Columbia Suicide'],
    supporting: ['Risk Assessment Comments', 'Suicide Risk Assessment', 'Within Past 90 Days'],
  },
  fields: CSSRS_PSYCH_FIELDS,
};
```

### Backend: add new schema entry in `extension_api.py`
Place after `FORM_SCHEMAS["Suicide/Homicide Risk"]`:
```python
FORM_SCHEMAS["Suicide/Homicide Risk (Psych)"] = {
    "wishedDead": "C-SSRS Item 1 (within past 30 days): patient wished they were dead or to go to sleep and not wake up. Return Y if endorsed, N if denied, empty string if not discussed.",
    "thoughtsKillingSelf": "C-SSRS Item 2: patient had actual thoughts of killing themselves. Return Y or N, empty string if not discussed.",
    "thinkingHowKillSelf": "C-SSRS Item 3: patient was thinking about HOW they might kill themselves. Return Y or N, empty string if not discussed.",
    "intentionToAct": "C-SSRS Item 4: patient had thoughts of killing themselves AND had some intention of acting. Return Y or N, empty string if not discussed.",
    "detailsAndIntent": "C-SSRS Item 5: patient started working out details of how to kill themselves and intends to carry out the plan. Return Y or N, empty string if not discussed.",
    "suicidalBehavior": "C-SSRS Item 6 (within past 90 days): patient done anything, started to do anything, or prepared to do anything to end their life. Return Y or N, empty string if not discussed.",
    "homicidalIdeation": "C-SSRS Homicide Item 1: patient had thoughts of killing someone else. Return Y or N, empty string if not discussed.",
    "homicidalPlan": "C-SSRS Homicide Item 2: patient worked out details of how to kill someone else. Return Y or N, empty string if not discussed.",
    "riskAssessmentComments": "Suicide/Homicide risk assessment narrative. Summarize risk factors, protective factors, and clinical impression from the encounter. Empty string if nothing relevant.",
}
```

---

## CHANGE 8 — New file: `physical-health-assess.ts`

**Create**: `extension/lib/form-profiles/eval-subpages/physical-health-assess.ts`

```ts
import type { FormProfile } from '../types';

export const PHYSICAL_HEALTH_ASSESS: FormProfile = {
  id: 'Physical Health Assess',
  displayName: 'Physical Health Assessment',
  bundle: 'psych-eval',
  detection: {
    anchors: ['PHYSICAL HEALTH ASSESSMENT SCREENING', 'Referral Determination'],
    supporting: ['Physical Health Assess', 'Special Precautions', 'REVIEW OF SYSTEMS', 'personal physician'],
  },
  fields: [
    {
      key: 'medicalConditionsPresent',
      type: 'radio',
      labels: ['present or history of any medical conditions'],
      options: ['Yes', 'No'],
    },
    { key: 'medicalConditionsDesc', type: 'textarea', labels: ['describe reported medical condition', 'current related medications'] },
    {
      key: 'physicalExamPast12Months',
      type: 'radio',
      labels: ['physical exam in the past 12 months'],
      options: ['Yes', 'No', 'Unknown'],
    },
    {
      key: 'pregnancyEvalNeeded',
      type: 'radio',
      labels: ['evaluation for pregnancy or prenatal care'],
      options: ['Yes', 'No'],
    },
    { key: 'allergiesList', type: 'text', labels: ['Allergies - List'] },
    { key: 'specialPrecautions', type: 'textarea', labels: ['Special Precautions'] },
    { key: 'physicianName', type: 'text', labels: ['Name of personal physician'] },
    { key: 'physicianPhone', type: 'text', labels: ['Phone Number'] },
    {
      key: 'referralDetermination',
      type: 'radio',
      labels: ['Referral Determination'],
      options: [
        'Referral Not Indicated',
        'Referral Indicated due to Acute or Chronic Complaint',
        'Referral Indicated due to Hx of Chronic Illness Not in Tx',
        'Referral Indicated due to No Physical Exam in Past 12 Months',
        'Referral Indicated due to Pregnancy or Prenatal Care Eval',
      ],
    },
    { key: 'physicalHealthReferrals', type: 'textarea', labels: ['Physical Health Screening Results Referral'] },
    {
      key: 'rosSystems',
      type: 'checkbox-group',
      labels: ['Systems reviewed for pertinent positive'],
      options: [
        'Constitutional', 'Eyes', 'Ears/Nose/Throat', 'Cardiovascular', 'Respiratory',
        'Gastrointestinal', 'Genitourinary', 'Musculoskeletal', 'Integumentary',
        'Neurological', 'Endocrine', 'Hematologic/Lymphatic',
      ],
    },
    { key: 'rosComments', type: 'textarea', labels: ['Current Review of Systems and Changes Noted'] },
  ],
};
```

### Backend entry for `extension_api.py`:
```python
"Physical Health Assess": {
    "medicalConditionsPresent": "Does the individual report a present or past history of medical conditions. One of: Yes, No. Empty string if not stated.",
    "medicalConditionsDesc": "Description of reported medical conditions including current related medications. Empty string if none.",
    "physicalExamPast12Months": "Has the consumer had a physical exam in the past 12 months. One of: Yes, No, Unknown. Empty string if not stated.",
    "pregnancyEvalNeeded": "Does the consumer require evaluation for pregnancy or prenatal care. One of: Yes, No. Empty string if not stated.",
    "allergiesList": "List of allergies including medication allergies. Empty string if none stated.",
    "specialPrecautions": "Special precautions noted. Empty string if none.",
    "physicianName": "Name of personal physician. Empty string if not stated.",
    "physicianPhone": "Phone number of personal physician. Empty string if not stated.",
    "referralDetermination": "Referral determination outcome. One of: Referral Not Indicated, Referral Indicated due to Acute or Chronic Complaint, Referral Indicated due to Hx of Chronic Illness Not in Tx, Referral Indicated due to No Physical Exam in Past 12 Months, Referral Indicated due to Pregnancy or Prenatal Care Eval. Empty string if not stated.",
    "physicalHealthReferrals": "Physical health screening results and referral narrative. Empty string if none.",
    "rosSystems": "Body systems reviewed, comma-separated, from: Constitutional, Eyes, Ears/Nose/Throat, Cardiovascular, Respiratory, Gastrointestinal, Genitourinary, Musculoskeletal, Integumentary, Neurological, Endocrine, Hematologic/Lymphatic. Empty string if not reviewed.",
    "rosComments": "Current review of systems narrative — pertinent positive/negative signs and symptoms and any changes noted. Empty string if none.",
},
```

---

## CHANGE 9 — New file: `trauma-abuse-neglect.ts`

**Create**: `extension/lib/form-profiles/eval-subpages/trauma-abuse-neglect.ts`

```ts
import type { FormProfile } from '../types';

export const TRAUMA_ABUSE_NEGLECT: FormProfile = {
  id: 'Trauma, Abuse, Neglect, E',
  displayName: 'Trauma, Abuse, Neglect, Exploitation (TANE)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['TRAUMA, ABUSE, NEGLECT, EXPLOITATION', 'Trauma, Abuse, Neglect'],
    supporting: ['Sexual Abuse', 'Military Trauma', 'Witness to Family Violence', 'Exploitation'],
  },
  fields: [
    { key: 'sexualAbuse', type: 'radio', labels: ['Sexual Abuse'], options: ['Yes', 'No'] },
    { key: 'physicalAbuse', type: 'radio', labels: ['Physical Abuse'], options: ['Yes', 'No'] },
    { key: 'emotionalAbuse', type: 'radio', labels: ['Emotional Abuse'], options: ['Yes', 'No'] },
    { key: 'historyOfNeglect', type: 'radio', labels: ['History of Neglect'], options: ['Yes', 'No'] },
    { key: 'militaryTrauma', type: 'radio', labels: ['Military Trauma'], options: ['Yes', 'No'] },
    { key: 'warAffected', type: 'radio', labels: ['War Affected'], options: ['Yes', 'No'] },
    { key: 'terrorismAffected', type: 'radio', labels: ['Terrorism Affected'], options: ['Yes', 'No'] },
    { key: 'exploitationVictimization', type: 'radio', labels: ['History of Exploitation'], options: ['Yes', 'No'] },
    { key: 'medicalTrauma', type: 'radio', labels: ['Medical Trauma'], options: ['Yes', 'No'] },
    { key: 'naturalDisaster', type: 'radio', labels: ['Natural Disaster'], options: ['Yes', 'No'] },
    { key: 'witnessToFamilyViolence', type: 'radio', labels: ['Witness to Family Violence'], options: ['Yes', 'No'] },
    { key: 'witnessToCommunityViolence', type: 'radio', labels: ['Witness to Community Violence'], options: ['Yes', 'No'] },
    { key: 'witnessVictimCriminalActivity', type: 'radio', labels: ['Witness/Victim of Criminal Activity'], options: ['Yes', 'No'] },
    {
      key: 'traumaSignificantIssues',
      type: 'radio',
      labels: ['significant issues as a result of reported trauma'],
      options: ['Yes', 'Denies'],
    },
    { key: 'traumaImpactNarrative', type: 'textarea', labels: ['negatively impacts their daily functioning'] },
  ],
};
```

### Backend entry:
```python
"Trauma, Abuse, Neglect, E": {
    "sexualAbuse": "History of sexual abuse reported by individual. One of: Yes, No. Empty string if not discussed.",
    "physicalAbuse": "History of physical abuse. One of: Yes, No. Empty string if not discussed.",
    "emotionalAbuse": "History of emotional abuse. One of: Yes, No. Empty string if not discussed.",
    "historyOfNeglect": "History of neglect. One of: Yes, No. Empty string if not discussed.",
    "militaryTrauma": "History of military trauma. One of: Yes, No. Empty string if not discussed.",
    "warAffected": "Affected by war. One of: Yes, No. Empty string if not discussed.",
    "terrorismAffected": "Affected by terrorism. One of: Yes, No. Empty string if not discussed.",
    "exploitationVictimization": "History of exploitation or victimization. One of: Yes, No. Empty string if not discussed.",
    "medicalTrauma": "History of medical trauma. One of: Yes, No. Empty string if not discussed.",
    "naturalDisaster": "Affected by natural disaster. One of: Yes, No. Empty string if not discussed.",
    "witnessToFamilyViolence": "Witness to family violence. One of: Yes, No. Empty string if not discussed.",
    "witnessToCommunityViolence": "Witness to community violence. One of: Yes, No. Empty string if not discussed.",
    "witnessVictimCriminalActivity": "Witness or victim of criminal activity. One of: Yes, No. Empty string if not discussed.",
    "traumaSignificantIssues": "Are there significant issues from trauma impacting the current presenting problem. One of: Yes, Denies. Empty string if not stated.",
    "traumaImpactNarrative": "Narrative describing how trauma negatively impacts daily functioning. Empty string if not stated.",
},
```

---

## CHANGE 10 — New file: `relationships-home.ts`

**Create**: `extension/lib/form-profiles/eval-subpages/relationships-home.ts`

```ts
import type { FormProfile } from '../types';

export const RELATIONSHIPS_HOME: FormProfile = {
  id: 'Relationships/Home',
  displayName: 'Relationships / Home',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Relationships/Home', 'Overall Quality of Interpersonal Relationships'],
    supporting: ['living situation', 'challenges'],
  },
  fields: [
    {
      key: 'interpersonalRelationships',
      type: 'textarea',
      labels: ['Overall Quality of Interpersonal Relationships'],
    },
  ],
};
```

### Backend entry:
```python
"Relationships/Home": {
    "interpersonalRelationships": "Narrative describing the overall quality of the patient's interpersonal relationships, living situation, and any challenges or concerns. Summarize from the transcript.",
},
```

---

## CHANGE 11 — New file: `medication-management-psych.ts`

**Create**: `extension/lib/form-profiles/eval-subpages/medication-management-psych.ts`

This is **distinct** from the E&M `standalone/medications.ts` (which has AIMS/antipsychotics/
benzodiazepines). The Psych Eval version is simpler.

```ts
import type { FormProfile } from '../types';

export const MEDICATION_MANAGEMENT_PSYCH: FormProfile = {
  id: 'Medication Management',
  displayName: 'Medication Management (Psych Eval)',
  bundle: 'psych-eval',
  detection: {
    anchors: ['Medication Management', 'Pre-Existing Medications for Medication Reconciliation'],
    supporting: ['Lab Orders', 'PDMP Database Reviewed', 'Vital Signs'],
  },
  fields: [
    { key: 'medications', type: 'textarea', labels: ['Medications'] },
    {
      key: 'vitalsReviewed',
      type: 'radio',
      labels: ['Height; Current Weight; Blood Pressure; Temperature; Heart Rate'],
      options: ['Yes', 'No', 'N/A'],
    },
    {
      key: 'pdmpDatabaseReviewed',
      type: 'radio',
      labels: ['PDMP Database Reviewed'],
      options: ['Yes', 'No', 'N/A'],
    },
    {
      key: 'medReconciliationReviewed',
      type: 'radio',
      labels: ['Pre-Existing Medications for Medication Reconciliation Reviewed'],
      options: ['Yes', 'No'],
    },
    {
      key: 'labOrders',
      type: 'radio',
      labels: ['Lab Orders'],
      options: ['Check Next Visit', "See Lab Requisition Today's Date"],
    },
  ],
};
```

### Backend entry:
```python
"Medication Management": {
    "medications": "List of current medications including dosage and frequency as discussed. Summarize from the transcript.",
    "vitalsReviewed": "Were vital signs (height, weight, blood pressure, temperature, heart rate) reviewed this visit. One of: Yes, No, N/A. Empty string if not stated.",
    "pdmpDatabaseReviewed": "Was the PDMP database reviewed this visit. One of: Yes, No, N/A. Empty string if not stated.",
    "medReconciliationReviewed": "Were pre-existing medications reviewed for medication reconciliation this visit. One of: Yes, No. Empty string if not stated.",
    "labOrders": "Lab orders disposition. One of: Check Next Visit, See Lab Requisition Today's Date. Empty string if not stated.",
},
```

---

## CHANGE 12 — Update `index.ts`

**File**: `extension/lib/form-profiles/index.ts`

### Add imports (with other eval-subpage imports):
```ts
import { PHYSICAL_HEALTH_ASSESS } from './eval-subpages/physical-health-assess';
import { TRAUMA_ABUSE_NEGLECT } from './eval-subpages/trauma-abuse-neglect';
import { RELATIONSHIPS_HOME } from './eval-subpages/relationships-home';
import { MEDICATION_MANAGEMENT_PSYCH } from './eval-subpages/medication-management-psych';
import { SUICIDE_HOMICIDE_RISK_PSYCH } from './eval-subpages/scored-instruments';
```

### Add to `EVAL_SUBPAGE_PROFILES` array (after `SUICIDE_HOMICIDE_RISK`):
```ts
SUICIDE_HOMICIDE_RISK_PSYCH,
PHYSICAL_HEALTH_ASSESS,
TRAUMA_ABUSE_NEGLECT,
RELATIONSHIPS_HOME,
MEDICATION_MANAGEMENT_PSYCH,
```

---

## CHANGE 13 — Backend: all new FORM_SCHEMAS in `extension_api.py`

All backend entries from Changes 4-12 should be added to the `FORM_SCHEMAS` dict in
`ai-scribe/web-api/app/routers/extension_api.py`. The dict already exists — just add
new keys. Place new entries after the existing `"Suicide/Homicide Risk"` entry.

The complete list of new schema keys:
- `"Suicide/Homicide Risk (Psych)"` (Change 7)
- `"Physical Health Assess"` (Change 8)
- `"Trauma, Abuse, Neglect, E"` (Change 9)
- `"Relationships/Home"` (Change 10)
- `"Medication Management"` (Change 11)

Plus updates to existing schemas:
- `_MSE_FIELDS` — add 4 memory keys (Change 4A)
- `FORM_SCHEMAS["Psychiatric Evaluation"]` or `"Psych Eval - Main"` — add 2 keys (Change 4B)
- `FORM_SCHEMAS["Plan / Recommendations"]` — add problem2/3/4 + referredTo (Change 5)
- `FORM_SCHEMAS["Adult Substance Use"]` — add substanceUseDisposition (Change 6)

---

## Build & Verify

```bash
# 1. Build extension
cd /Users/consultadd/Downloads/SAIP/SAIP/extension
npm run build
# Expected: "✔ Built extension in X ms"

# 2. Verify backend syntax
python3 -c "import ast; ast.parse(open('/Users/consultadd/Downloads/SAIP/SAIP/ai-scribe/web-api/app/routers/extension_api.py').read()); print('OK')"
# Expected: OK
```

After build:
1. Reload extension in Chrome (Extensions page → ↻)
2. Restart uvicorn backend
3. Open each Psych Eval sub-page in Credible → Scan → Generate → Fill
4. Check Debug Log for any "missed" field keys and tune labels if needed

### Expected detection confidence after changes:
| Form | Expected Profile ID | Min confidence |
|---|---|---|
| Psychiatric Evaluation | `Psych Eval - Main` | >80% |
| Suicide/Homicide Risk | `Suicide/Homicide Risk (Psych)` | >80% |
| Physical Health Assess | `Physical Health Assess` | >85% |
| Adult Substance Use | `Adult Substance Use` | >75% |
| Trauma, Abuse, Neglect, E | `Trauma, Abuse, Neglect, E` | >85% |
| Relationships/Home | `Relationships/Home` | >80% |
| Mental Status Exam | `Mental Status Exam` | >85% |
| Medication Management | `Medication Management` | >75% |
| Plan / Recommendations | `Plan / Recommendations` | >80% |

---

## DOM Needed Before Full Completion

These two items can't be finalized without live DOM:

### 1. Mental Status Exam — Memory section (needed to confirm 3 separate q_ ids)
Run on the Mental Status Exam page (frame selected = Credible form):
```js
JSON.stringify([...document.querySelectorAll('input[type=checkbox][id^="q_"]')].map(e=>({id:e.id,name:e.name,val:e.value,row:(e.closest('tr')?.innerText||'').replace(/\s+/g,' ').trim().slice(0,60)})),null,1)
```
If Immediate/Recent/Past have 3 different q_ ids → Memory signatures work.
If they share one id → only `memoryStatus` is addressable; remove the other 3 fields.

### 2. Adult Substance Use — AUDIT-C button structure confirmation
Run on the Adult Substance Use page:
```js
JSON.stringify([...document.querySelectorAll('input[type=button][id^="x_"]')].map(e=>({id:e.id,name:e.name,value:e.value,row:(e.closest('tr')?.innerText||'').replace(/\s+/g,' ').trim().slice(0,80)})),null,1)
```
Verify AUDIT-C uses unique-id x_ buttons (scored-options type) as in E&M version.
If structure matches → no profile change needed. If different → update `AUDIT_C_FIELDS` labels.

---

## Commit Message (per CLAUDE.md — no AI attribution)

```
Add Psychiatric Evaluation bundle form support

New profiles: Physical Health Assess, Trauma/Abuse/Neglect/Exploitation,
Relationships/Home, Medication Management, C-SSRS radio variant (Psych Eval)

Updated profiles: Psych Eval main (+swallowing fields), MSE (Memory groups +
cognitiveAttention options), Plan/Recommendations (fix anchors + problem 2-4),
Adult Substance Use (label alias + Screening Disposition)
```
