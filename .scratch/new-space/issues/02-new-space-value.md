# 02 — `newSpace()`: one card, centered

Status: open
Type: task
Blocked by: 04

ADR 0018, as a value. No intake change yet — this is the thing 03 goes on to
open.

A new space is one card and no routes. It renders and cannot be presented (ADR
0015), and it gets a Layout when it opens (ADR 0017), so the card is draggable
from the first frame.

**Centered is not authored — `fitView` does it.** Decided: a new space's card
carries no position, because the view already frames whatever is on screen and a
position nobody wrote is authored content nobody wrote. One catch, which must
land with this: the overview fit is `fitView({ duration: 400, padding: 0.2 })`
with no `maxZoom`, and React Flow's default max is 2 — so a single card would be
scaled to 2x and fill the screen. Padding does not help; padding reserves margin,
it does not cap zoom. Give the overview fit a `maxZoom` the way the presenting fit
already has one, so a lone card renders at natural size with room around it.

**Answered by ADR 0020.** A card is one file with its body inside it, so a new
card is a file with a title and an empty body — the question below is resolved
and kept only because it explains why the ticket stalled. Persisting that file
needs `card-files/03`.

~~**Blocked on a real question: what content does a new card have?** A markdown
card's `content` is a *required file path* to a `.md` file, and a space the app
mints has no such file — the writer only ever touches `space.local.json`, by
design. So the card points at nothing, and opening it renders `*Missing content
file: ...*`, which is precisely the "looks broken on first run" outcome ADR 0018
was written to avoid. The options are materially different and one of them is a
schema change; do not guess this.~~

- The card needs a title. It is the author's first card, so it should read as an
  invitation rather than a placeholder with instructions in it — and its title is
  what the graph draws (ADR 0006).
- Relies on 04: the space itself needs an id, and this one is minted rather
  than authored. Its card can carry a written id for now — generation is 01.

## Acceptance

- Unit tests: the value passes `spaceFileSchema` and loads through `loadSpace`;
  it has exactly one card and no routes.
- `pnpm verify` green.
