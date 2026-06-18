# SAIP — Project Guidance for Claude

## Git: commit messages

Keep commit messages **short and crisp** — a single concise summary line describing
what changed (a few extra bullet points only when the change genuinely needs them).
**Never include any Claude/AI attribution** — no "Generated with Claude", no
`Co-Authored-By: Claude`, no tool mentions. Plain, human-style messages only.

## Form autofill engine: keep it GENERIC, never hardcode per-case

The Credible EHR form-fill engine (`extension/lib/fieldMapper.ts` + the declarative
profiles in `extension/lib/form-profiles/`) must work across **many form types and
multiple Credible deployments**. Deployments differ in DOM ids, URL params
(`fvid` vs `visittemp_id`), category ids, and exact label wording.

### The one distinction that matters: profile vs. engine

- **Per-form / per-template specialization → put it in the PROFILE.** It is fine
  (and expected) to tailor anchors, labels, option lists, field keys, category ids,
  and quirks for an individual form template inside its file under
  `extension/lib/form-profiles/`. That only affects that one form.
- **Shared logic → keep the ENGINE (`fieldMapper.ts`) generic.** Engine code runs
  for *every* form, so it must never contain a special case for one template. If a
  form needs different behavior, express it as data in the profile and have the
  generic engine consume it.

So: customizing for an individual template = good, do it in the profile. Hardcoding
a form-specific case in the engine = bad, it can break the others.

**Rules:**

- **Do not hardcode a fix that only helps one form/field.** A change in
  `fieldMapper.ts` runs for *every* form. Before adding a special case, ask: "will
  this break or mis-fill another form?" Prefer a generic, structure-based solution.
- **Match by DOM structure and nearby label text, not by ids or magic values.**
  Credible ids (`q_478057`, value codes like `410430`) are per-form and per-
  deployment — never match on them. Labels live in sibling cells, not `<label for>`.
- **Scope groups to their question.** Radio/checkbox option groups share one
  `name`/`id` and sit in their own inner table without the question text. Use
  `findTextAnchor()` + `groupAfterAnchor()` to bind a group to its question, rather
  than scanning the nearest table for a keyword.
- **Deployment-specific values belong in profiles, not the engine.** Category ids,
  bundle membership, anchors, and option lists go in
  `extension/lib/form-profiles/`. The engine stays declarative-driven.
- **Bundle type comes from the matched profile** (`profile.bundle`), not from a
  hardcoded `fvid → bundle` map. The encounter/cache id (`getEncounterId`) accepts
  whatever the deployment uses (`fvid` or `visittemp_id`).
- **Scored clinical instruments (PHQ-9, etc.) are inferred from the conversation,
  then clinician-reviewed.** The form-answer and profile extraction prompts INFER
  0-3 symptom-frequency scores from how the patient describes a symptom — even
  without a formal questionnaire Q&A — using a fixed mapping (`not at all` → 0,
  `several days`/`sometimes` → 1, `more than half the days`/`often` → 2, `nearly
  every day`/`almost always` → 3); a symptom the patient never indicates stays an
  empty string (never fabricated). These inferred values are `provenance =
  'suggested'` and surface in the Review & Edit panel (form) or as a "Confirm"
  affordance (patient profile) — the clinician verifies before they are committed.
  Confirmed profile values (`provenance = 'confirmed'`) are passed as
  `confirmedProfileValues` to `applyFormAutofill` and fill the scored widget
  silently; when all scored-widget fields are covered by confirmed values,
  `manualRequired` is cleared. The scoring mapping lives in the shared extraction
  prompts (keyed on "Score 0-3" fields, so only scored instruments are affected),
  not per-form — keep general anti-fabrication (names/dates/exact numbers) intact.
- **When a label substring can collide** (e.g. the "Others" checkbox label contains
  the word "Client"), classify the more specific case first and `continue` — don't
  rely on loose `includes()` matches that overlap.

When verifying against a live form, capture the DOM (inspector) and adjust the
**profile** to the real structure; only change the **engine** when the fix is
genuinely generic across forms.

---

## Speaker diarization: problem analysis and proposed fix

### Why it doesn't work today

We capture a **single microphone stream**. The OpenAI Realtime API transcribes
everything it hears into one text stream with no speaker markers — the audio is a
mix of both voices and the API has no way to separate them acoustically.

After recording, `_label_transcript` sends the entire assembled transcript (one
concatenated string) to GPT-4o-mini and asks it to split it into speaker turns.
This is extremely hard because:

1. The LLM has no acoustic information — only the words themselves.
2. The transcript is one blob with all natural boundaries discarded.
3. In clinical conversations both parties often use similar short phrases, making
   text-only classification unreliable.

### The structural opportunity we are wasting

OpenAI's server-side VAD (Voice Activity Detection) already detects when speech
ends. Each `STREAM_COMPLETED` event IS one natural utterance — a speech boundary
detected acoustically. Currently `background.ts` concatenates all completed text
into one string, **throwing away this structure entirely**.

If instead we pass an ordered array of per-utterance strings to the finalize
endpoint, the LLM only needs to answer "Doctor or Patient?" for each short
utterance, not split a blob. This is a dramatically easier classification task.

### Options

| Option | Description | Accuracy | Effort | Risk |
|--------|-------------|----------|--------|------|
| **A — preserve VAD turn structure** | Track `completedTurns: string[]` in `background.ts`; send array to `/transcribe-finalize`; LLM classifies each turn individually | High | Low | None |
| **B — better labeling prompt** | Rewrite system prompt with clinical role signals: medical terminology → clinician, symptom descriptions → patient, alternating Q&A pattern | Medium | Very low | None |
| **C — acoustic diarization (pyannote / WhisperX)** | Process the webm blob with speaker diarization after recording ends; proper voice fingerprinting | Very high | High | New ML dep, pyannote license, slow |
| **D — two-microphone setup** | Separate device mic for patient | Perfect | Not feasible | Browser extension cannot do this |

### Recommendation: ship A + B together, leave C for later

**Option A** fixes the structural root cause with minimal code changes:
- `background.ts`: add `streamingTurns: string[]`, push each `STREAM_COMPLETED`
  text into it alongside assembling `streamingTranscript`.
- `apiClient.ts`: `finalizeStream` sends `turns_json` (JSON-serialized array) as an
  additional form field.
- `extension_api.py` `/transcribe-finalize`: accept optional `turns_json: str`
  form field; parse and pass to `_label_transcript`.
- `_label_transcript`: when turns array is provided, send numbered utterances
  (`Turn 1: …\nTurn 2: …`) so the LLM classifies each individually.

**Option B** is a one-file change (the system prompt in `_label_transcript`) and
stacks on top of A for free.

**Option C** is a future enhancement. The webm blob is always captured regardless
of streaming, so it can be added later without changing the extension.

### Files that change (A + B)

| File | Change |
|------|--------|
| `extension/entrypoints/background.ts` | Add `streamingTurns: string[]`; push on each `STREAM_COMPLETED`; pass to `finalizeStream` |
| `extension/lib/apiClient.ts` | `finalizeStream` adds `turns_json` form field |
| `ai-scribe/web-api/app/routers/extension_api.py` | `/transcribe-finalize` accepts `turns_json`; `_label_transcript` rewritten with clinical prompt + turn-aware path |

No schema changes needed. No new dependencies. The batch fallback path is
unchanged. If `turns_json` is absent (e.g. fallback from batch), labeling still
works on the raw transcript string.
