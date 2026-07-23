# 05 — Auto-arrange: command and on-ramp

Status: open
Type: task
Blocked by: 04

The only crossing from computed to authored. It runs an automatic layout once and
writes the result into a positioned layout's map — an edit, not a cache.

Two entry points, one operation:

- **Command** — in a positioned view, "Auto-arrange" overwrites the active map
  with what ELK computes. You keep editing from there.
- **On-ramp** — in an automatic view (which is read-only), the same action writes
  the space's *first* positioned layout from what is currently on screen and
  switches to it. This is how a hand-authored space becomes editable, and it is
  deliberate and visible rather than a stray drag silently minting a layout.

The on-ramp needs an id and a title for the layout it creates. Simplest that
isn't a lie: `working` / "Working". It also sets `defaultView` to the new layout,
because an arrangement that does not reopen is the derived-placement failure
wearing a different hat.

ELK's coordinates land as-is: `projectCardNodes` already carries
`LayoutCard.width`/`height` through and the adapter is on React Flow's native
top-left origin, so there is no `+size/2` compensation to apply. If you find
yourself adding one, `nodeOrigin` has drifted.

## Acceptance

- e2e: from the fixture (no `layouts`), Auto-arrange produces a positioned layout
  and cards become draggable; drag, Auto-arrange again, cards move to ELK's
  positions and stay draggable.
- Unit test that the on-ramp writes both the layout and `defaultView`.
- `pnpm verify` and `pnpm e2e` green.
