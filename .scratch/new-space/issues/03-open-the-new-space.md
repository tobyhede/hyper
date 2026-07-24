# 03 — Open a new space when there is nothing else to open

Status: open
Type: task
Blocked by: 02

The behaviour change, and the one carrying a real design question.

**Decide first: how does the fixture stay what e2e drives?** Today the app always
has a space file, so "nothing to open" does not exist as a state. Making a fresh
run get a one-card space means "which space opens" grows a third answer, and
`SPACE_BASE_ONLY` — currently "read the base, not the local override" — is not
that answer. Restate the flag deliberately or add a separate one; do not let it
drift into meaning "load the fixture" by accident.

Options worth weighing rather than assuming:

- The fixture stops being what `pnpm dev` serves and becomes an e2e-only input,
  selected by the same switch Playwright already sets.
- `space.local.json` remains the "your work" file, and its *absence* is what
  "nothing to open" means — the fixture then has to be reachable some other way.

Whichever wins, the human's own saved arrangement must keep opening. Someone who
dragged cards yesterday must not be handed a blank new space today.

## Acceptance

- e2e: a fresh run shows one card, no route selector, Present disabled (ADR
  0015), and the card is draggable.
- e2e: the existing suite still drives the fixture and is otherwise unchanged —
  that is the guard that this did not quietly retarget every test.
- `pnpm verify` and `pnpm e2e` green.
