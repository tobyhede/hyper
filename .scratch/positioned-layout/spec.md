# Positioned layout

Status: open
Decision: ADR 0013 — editing requires a positioned layout

## Why

Placement is authored meaning, not a computed artifact. Three spike increments
(`.scratch/graph-editing/`) proved a global optimiser cannot honour "put it
*here*" — it reshuffles and the new card lands randomly. The fix is not a better
ELK configuration; it is that positions are content the author writes.

This increment makes that real in the app: a **positioned layout** the space
carries, drag that writes into it, ELK demoted to an automatic layout and to the
Auto-arrange command, and a way for the result to survive a reload.

## Model

A **layout strategy** is **automatic** (computes placement from cards and routes
alone — `elkStrategy`, `gridStrategy`) or **positioned** (reads a **Layout**: the
card→position map the author wrote). Only Layouts persist; automatic strategies
need no data and appear in the space file nowhere. The vocabulary split landed
between tickets 02 and 03 — ADR 0014, ticket 07.

Space file gains two optional fields:

```json
{
  "layouts": [
    {
      "id": "working",
      "title": "Working",
      "kind": "positioned",
      "positions": { "a": { "x": 0, "y": 0 }, "b": { "x": 320, "y": 0 } }
    }
  ],
  "defaultView": "working"
}
```

`layouts` is **optional** — a space can still be hand-authored with no
coordinates at all, and opens in an automatic view. `defaultView` records
*intent* ("open me like this"), never an algorithm's parameters; the moment it
carries ELK options, computed geometry is back in authored content.

Which view opens: `space.defaultView` → viewer default (no surface yet) →
built-in route-driven graph.

## Rules

- **Positions are sparse.** A layout may omit cards; it may not name cards that
  do not exist (a dangling position keyed by a deleted card is a reference error
  `loadSpace` rejects, same class as an unresolvable step target). Cards a layout
  omits are placed in a deterministic grid past the bounding box of the
  positioned ones — visibly unplaced, not stacked at the origin.
- **Automatic views are read-only.** Creating a card *is* placing it, so creation
  needs somewhere to write too. `nodesDraggable` is `kind === 'positioned'` and
  nothing tracks an edit mode.
- **Auto-arrange is the only crossing.** It runs an automatic layout once and
  writes the result into a positioned layout — an edit, not a cache. It is also
  the on-ramp: opening a hand-authored space for editing writes its first
  positioned layout, an explicit act with a visible result.
- **Structural vs placement.** A structural edit changes the space and shows in
  every layout; a placement edit changes only the active positioned layout. This
  increment ships placement edits only.
- **The strategy contract does not change.** `positionedStrategy(map)` sits in the
  same seam as `elkStrategy()`/`gridStrategy()`, reading positions where they compute
  them. If it needs a contract change, something has leaked.

## Scope

In: `positionedStrategy`; the schema and `loadSpace` check; view resolution;
controlled `GraphView` with drag write-back; Auto-arrange; the space-file writer.

Out: the **Draft** and every structural command (new/detached/copy/alias card,
connect, insert, delete) — `.scratch/graph-editing/commands.md` holds that
surface, and it needs a Draft because a route-less space fails `loadSpace`.
Also out: viewer-level default-view configuration (the field lands, nothing
resolves it yet), and the local-first question — `.scratch/local-first/findings.md`
is a survey of a problem this increment does not have (single writer, no merge).

## Verification

`pnpm verify` for every ticket; `pnpm e2e` for 03 onward. Tickets 01–03 are
additive and must leave e2e **green and unchanged** — that is the proof they are
behaviour-preserving. The `edges are drawn along ELK's routing` assertion becomes
a test of the ELK view rather than of the default view; it moves in 03.

## Tickets

1. `positionedStrategy` in `graph`
2. Space file: `layouts` + `defaultView`, `loadSpace` check, lookup
3. View resolution in the app
4. Controlled `GraphView` + drag write-back
5. Auto-arrange — command and on-ramp
6. Space-file writer (`space.local.json`)
7. `Layout`/`LayoutStrategy` rename — ran between 02 and 03, alone
