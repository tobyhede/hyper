# New space: what the app opens when there is nothing to open

Two decisions are recorded and neither is built. This is the work that closes the
gap between the ADRs and the code.

- **ADR 0018** — a new space is a single centered card. That is the default on
  load, not the bundled fixture and not an empty canvas.
- **ADR 0019** — ids are optional in the space file and generated on load,
  deterministically.

They are separable and 0019 lands first: it is pure, testable on its own, and a
new space the app mints is exactly the case that wants generated ids.

## Where the code is now

- `spaceFileSchema` **requires** `id` on every card, route and layout. Nothing is
  optional and nothing is generated (0019 unbuilt).
- `space.ts` loads whatever `virtual:space-file` serves, which is always the
  fixture or a `space.local.json` derived from it. There is no notion of "no
  space to open" (0018 unbuilt).
- A space file has **no `id` field at all**. The space itself is unnamed.

## The question this spec does not answer

**How does the fixture stay what e2e drives once the app defaults to a new
space?** Today `SPACE_BASE_ONLY` means "read `space.json`, not
`space.local.json`" — both of which are the fixture. If a fresh run is supposed
to get a one-card space instead, then "which space opens" grows a third answer
and the flag's meaning has to be restated rather than extended by accident. Decide
this in ticket 03, not before: it is a real design question and guessing it is
what stalled this work last time.

Related but **out of scope**: addressing spaces, cards and routes by URI. The
router has exactly one route (`/` → `App`) and a space has no id, so that is its
own effort. It is worth doing when there is more than one space to navigate
between; designing it against a single hardcoded fixture is designing against
nothing.
