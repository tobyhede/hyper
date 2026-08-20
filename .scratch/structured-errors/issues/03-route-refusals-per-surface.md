# 03 — Route Authoring refusals once per surface

**What to build:** Replace the global refusal-placement result and scattered JSX
branches with a pane-specific presentation adapter that maps an
`AuthoringRefusal` once into field-local and form-level errors.

**Why:** ADR 0057 makes field attribution a fact about the surface conducting
the interaction, not a property of the domain refusal. The current New Alias
follow-up widens the pane to the complete refusal union, but then treats every
non-Target placement as form copy. That makes an impossible
`card-title-required` example look supported while placing it away from the
Title control, and leaves the component responsible for both interpreting the
refusal and wiring its fields.

**Status:** done

- [x] Give each authoring surface one pure, exhaustive presentation adapter
  returning its complete error bag, shaped like
  `{ fields: { title?: string, target?: string }, form?: string }` where those
  are the fields that surface actually owns.
- [x] Keep stable refusal identity and context in Authoring; do not add form
  fields, React ids or display prose to `AuthoringRefusal`.
- [x] Derive the error bag during render rather than storing a second copy of
  refusal state.
- [x] Bind each field error through `data-invalid` on `Field`, `aria-invalid`
  and composed `aria-describedby` on its control, and an adjacent `FieldError`.
- [x] Reserve the form channel for expected refusals no field on that surface
  can correct; no expected refusal throws from an event handler.
- [x] Replace the synthetic New Alias test that blesses a Title refusal as form
  copy with observable field-local and form-level behavior tests.
- [x] Keep `CardSearchCombobox` responsible for composing the description ids
  it owns with the caller's error id.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.

Research: [Structured authoring refusals in React forms](../react-form-error-research.md).

Follow-up to: [01 — Structure Space Authoring refusals](01-structure-authoring-refusals.md).

## Answer

`authoring-refusal.ts` now keeps the exhaustive refusal catalogue private to
application presentation and exposes one error-bag adapter per pane shape:
Markdown editing owns Title, while Alias editing and creation own Title and
Target. Components receive `{ fields, form }`, bind the field entries through
the existing shadcn `Field` composition, and render only the form entry outside
the field group. No expected refusal throws from Add Alias, and no derived error
bag is stored as a second source of state.

The shared `CardSearchCombobox` now composes its empty-list description with a
caller's error description rather than replacing it. Component tests cover the
picker once at its shared seam, while New Alias and Open Card tests prove Title,
Target and form feedback through their accessible controls.

Verification on 2026-08-20:

- `pnpm verify` — passed: 129 test files, 1,301 tests passed and 8 skipped.
- `pnpm e2e` — passed: 98 tests.
- `pnpm e2e:ladle` — passed: 13 tests.

One preceding `pnpm test` run timed out in
`test/unit/raw-http-request.test.ts`; its isolated rerun passed in 9 ms, and the
same test passed in the subsequent coverage run.
