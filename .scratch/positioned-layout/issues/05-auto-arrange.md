# 05 — Auto-arrange: the command

Status: open
Type: task
Blocked by: 04

The only crossing from computed to authored. It runs an automatic strategy once
and writes the result into the active Layout's map — an edit, not a cache.

**The on-ramp half of this ticket is gone (ADR 0017).** A space with no Layout
gets one when it opens, so Auto-arrange no longer has to be pressed before a
hand-authored space can be edited. What is left is what the name says: in a
positioned view, "Auto-arrange" overwrites the active map with what the
automatic strategy computes, and you keep editing from there.

It still sets `defaultView` to the active Layout when the space does not already
name one — an arrangement that does not reopen is the derived-placement failure
wearing a different hat. Ticket 04 creates the Layout; this is the first thing
that gives the space a reason to *open* in it.

ELK's coordinates land as-is: `projectCardNodes` already carries
`LayoutCard.width`/`height` through and the adapter is on React Flow's native
top-left origin, so there is no `+size/2` compensation to apply. If you find
yourself adding one, `nodeOrigin` has drifted.

## Acceptance

- e2e: drag a card away, press Auto-arrange, the card returns to the strategy's
  position and stays draggable.
- Unit test that Auto-arrange replaces every position in the active map, rather
  than merging into it — a card dragged out of the way must not survive.
- `pnpm verify` and `pnpm e2e` green.
