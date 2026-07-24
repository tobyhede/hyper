# New space: what the app opens when there is nothing to open

Two decisions are recorded and neither is built. This is the work that closes the
gap between the ADRs and the code.

- **ADR 0018** — a new space is a single centered card. That is the default on
  load, not the bundled fixture and not an empty canvas.
- **ADR 0019** — ids are optional in the space file and generated on load,
  deterministically.

## Intake: what opens

**The app opens a new empty space, unless it is given a path to a space file.**
That is the whole rule. The fixture stops being what a fresh run shows and
becomes a space you point at — which is also how e2e keeps driving it, so the
question this spec previously left open is answered: `SPACE_BASE_ONLY` does not
have to grow a third meaning, because "which space opens" is now decided by
whether a path was supplied.

A **path**, not a query string, and not an id — there is no registry of spaces to
resolve an id against, and the file is the thing that exists. How the path
reaches the app is ticket 03's to settle; it is a dev-server input, since the
server is the only thing that can read a file.

## Sequencing: explicit ids now, optionality later

Spaces and cards carry ids, and those ids may be generated rather than authored.
But **generation is not the immediate path**. In the immediate term it is simpler
to give the fixture explicit ids and let optionality follow as its own feature:

- Every card, route and layout in the fixture already has an authored id. The
  only thing missing is an id for the **space itself**, which has no field for
  one at all.
- So the immediate work is a schema field and a fixture edit (ticket 04), not a
  generation algorithm.
- Ticket 01 — optional ids, generated on load — stays open and stops blocking
  everything else. It is a feature to follow, not a prerequisite.

This inverts the original order deliberately. Generation is the part with a real
design decision in it (derivation rule, collision strategy, what "stable" means
under insertion) and it is hard to reverse once ids are saved. Adding a field is
neither. There is no reason for the harder half to gate the easier one.

## Where the code is now

- A space file has **no `id` field at all**. The space itself is unnamed.
- `spaceFileSchema` **requires** `id` on every card, route and layout. Nothing is
  optional and nothing is generated (0019 unbuilt).
- `space.ts` loads whatever `virtual:space-file` serves, which is always the
  fixture or a `space.local.json` derived from it. There is no notion of "no
  space to open" (0018 unbuilt).

## Out of scope

Addressing spaces, cards and routes by URI. The router has exactly one route
(`/` → `App`). Worth doing when there is more than one space to navigate between;
designing it against a single fixture is designing against nothing. Note that a
space id (ticket 04) is a prerequisite it will want.
