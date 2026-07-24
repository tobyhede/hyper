# 02 — `newSpace()`: one card, centered

Status: open
Type: task
Blocked by: 04

ADR 0018, as a value. No intake change yet — this is the thing 03 goes on to
open.

A new space is one card and no routes. It renders and cannot be presented (ADR
0015), and it gets a Layout when it opens (ADR 0017), so the card is draggable
from the first frame.

- **Where "centered" lives is the question.** `ViewController` already runs
  `fitView`, which frames whatever is on screen — so a single card is centred in
  the viewport wherever its coordinates put it, and the ADR's objection to the
  origin may already be satisfied without placing anything. Check before adding a
  Layout to say it: a position nobody needs is authored content nobody wrote.
- The card needs a title and empty content. It is the author's first card, so it
  should read as an invitation rather than a placeholder with instructions in it
  — and its title is what the graph draws (ADR 0006).
- Relies on 04: the space itself needs an id, and this one is minted rather
  than authored. Its card can carry a written id for now — generation is 01.

## Acceptance

- Unit tests: the value passes `spaceFileSchema` and loads through `loadSpace`;
  it has exactly one card and no routes.
- `pnpm verify` green.
