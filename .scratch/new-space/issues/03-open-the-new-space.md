# 03 — Open a new space when there is nothing else to open

Status: open
Type: task
Blocked by: 02

The behaviour change, and the one carrying a real design question.

**Decided: the app opens a new empty space unless it is given a path to a space
file.** So `SPACE_BASE_ONLY` does not grow a third meaning — "which space opens"
turns on whether a path was supplied, and e2e supplies one pointing at the
fixture.

What is left to settle here is how the path reaches the app. It is a dev-server
input, because the server is the only thing that can read a file, and the client
must not send one (an endpoint taking a path from the browser is an
arbitrary-file-write primitive — the same reason the save endpoint fixes its
target in config). The plugin already resolves a fixed pair of paths; this
generalises that to one supplied path.

Whichever wins, the human's own saved arrangement must keep opening. Someone who
dragged cards yesterday must not be handed a blank new space today.

## Acceptance

- e2e: a fresh run shows one card, no route selector, Present disabled (ADR
  0015), and the card is draggable.
- e2e: the existing suite still drives the fixture and is otherwise unchanged —
  that is the guard that this did not quietly retarget every test.
- `pnpm verify` and `pnpm e2e` green.
