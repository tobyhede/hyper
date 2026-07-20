# An optional short description on a card

Status: open
Blocked by: 01

## Context

ADR 0006 says the graph draws a card's title "and later, optionally, a short description". Deferred out of issue 01 so that the display change and the schema change land separately.

## Task

Add an optional `description` to the card schema in `@project/core`, and render it under the title in the graph node when present.

Keep it short by construction — it exists to say what a card is when the title alone is too terse, not to be a second body. Content lives in the markdown file; if a description is growing paragraphs, that is a signal the card should be opened instead. Consider whether the schema should bound its length rather than leaving it to authors.

## Acceptance

- `description` is optional; every existing manifest still parses.
- A card with no description renders exactly as it does today.
- Card dimensions do not change with or without a description present (issue 02) — a description must not make cards non-uniform, or measurement comes back.
- `pnpm verify` and `pnpm e2e` green.
