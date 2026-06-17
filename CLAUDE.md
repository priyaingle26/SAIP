# SAIP — Project Guidance for Claude

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
- **Scored clinical instruments are never auto-filled** (PHQ-9, C-SSRS, AUDIT-C,
  CRAFFT). Their profiles have empty `fields: []` by design (patient safety). Detect
  and flag them; do not generate or fill.
- **When a label substring can collide** (e.g. the "Others" checkbox label contains
  the word "Client"), classify the more specific case first and `continue` — don't
  rely on loose `includes()` matches that overlap.

When verifying against a live form, capture the DOM (inspector) and adjust the
**profile** to the real structure; only change the **engine** when the fix is
genuinely generic across forms.
