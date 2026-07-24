# 04 — A space carries an id

Status: resolved
Type: task

The immediate path, and the one thing genuinely missing: cards, routes and
layouts all have an `id`; the space itself has no field for one.

- `spaceFileSchema` gains `id`. **Required** for now — optionality is ticket 01,
  deliberately deferred, and a required field is the thing that becomes optional
  later without breaking anyone who already wrote one.
- `Space` carries it through from the file, alongside `title`.
- The fixture gets one. Every other entity in it is already named; this is a
  one-line edit plus the schema.
- `serializeLayout` spreads the space file, so a saved `space.local.json` keeps
  the id for free — worth an assertion rather than an assumption.

Not in this ticket: generating an id when absent (01), and using the id to
address a space by URI (out of scope, but this is what that will want).

## Acceptance

- Unit tests: a space file without an id fails to parse; one with an id loads and
  `space.id` is populated; a serialized-and-reloaded file keeps its id.
- `pnpm verify` green. `pnpm e2e` unchanged — this is additive and no behaviour
  moves.

## Answer

`spaceFileSchema` gains a required `id`, `Space` carries it, and both space files
on disk name themselves — `layout-fixture` and `demo`.

Required, deliberately: it is the direction that becomes optional later without
stranding files that already carry one (ADR 0019). The field comment says so, and
the schema test that asserts the requirement names itself as the assertion that
will change when generation lands.

The cost was churn, and it was the expected kind: twelve inline space files
across ten test modules plus the two real ones. Every one is a literal `id: 's'`
rather than anything meaningful, because in those tests the id is a required
field and not the subject.

Three tests, each mutation-checked against exactly one mutation: making the
schema field optional kills the requires-an-id test; having `loadSpace` drop the
id kills both the carries-it-through test and the save-and-reload test in
`persist`. That last one exists because `serializeLayout` preserves the id only
by spreading the base file — nothing states it, so losing it would make a saved
space anonymous and no other test would notice.

`pnpm verify` green — 163 tests (4 new). `pnpm e2e` green — 19, unchanged, which
is the guard that this was additive.
