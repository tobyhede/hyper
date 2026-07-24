# 04 — A space carries an id

Status: open
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
