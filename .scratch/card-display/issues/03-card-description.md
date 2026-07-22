# An optional short description on a card

Status: resolved
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

## Answer

Resolved. Three decisions, taken with the reviewer:

- **On all card kinds**, beside `title`, not just markdown — a description is a
  card-level attribute (what the card *is*), not content-kind-specific. It is the
  card's own and is never inherited through an alias.
- **Bounded in the schema**: optional, `min 1`, `max CARD_DESCRIPTION_MAX_LENGTH`
  (120), and single-line (no newlines). The cap is exported as a named constant.
  Enforcing it turns "a description grew into a body" into a load-time error rather
  than letting the fixed-size card clip it silently.
- **Graph node only** (per ADR 0006). Opened and presented surfaces show content,
  so the caption is redundant there.

Rendered as a muted `.card__description` under the title in `CardNode`, clamped to
two lines; the card's fixed height + `overflow: hidden` already keep dimensions
uniform (issue 02), so the clamp is only tidiness. Threaded schema → `Card` →
`CardNodeData` (omitted when absent, matching the `aliasOf` pattern). Fixture card
`A` carries one so e2e asserts both the present and absent cases. No new ADR — the
description was already anticipated by ADR 0006; the design choices are recorded
here and in CONTEXT.md's Card entry.
