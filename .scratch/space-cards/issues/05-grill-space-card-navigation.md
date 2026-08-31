# 05 — Grill Space Card navigation

Status: superseded by `entity-url-addressability/08` and ADR 0068
Type: grilling

## Context

ADR 0058 deliberately left navigation mechanics undecided: "How a Space Card is navigated into... is not decided here... Both remain open follow-on work; the only constraint this decision places on them is that the reference stays a bare `spaceId`." Two candidate mechanics were floated during that grilling session and parked rather than chosen:

- **Take-over-view**: opening a Space Card replaces the whole canvas with the target Space, mirroring how opening any other Card already reads it in place (ADR 0006/0011/ADR 0024) — needs additional navigator controls (back/breadcrumb) since the parent Space is no longer on screen at all.
- **Infinite-canvas zoom**: zooming into a Space Card visually reveals its nested content in place, continuous pan/zoom, an added dimension.

Also raised and not settled: "open Card/space in a new tab." Today the app has exactly one route (`packages/app/src/router.tsx` defines only `/`) — nothing is URL-addressable, and Traversal history, the Active Graph and the opened Card are all in-memory Navigation state only. Giving a Space Card a new-tab affordance means the first URL-addressable content the app has ever had.

## Task

Walk the decision tree with the user (`/grilling`), covering at minimum:

- Take-over-view, infinite-canvas zoom, or both (one now, one later)?
- If take-over-view: what does "back" read — new Space-nesting state, separate from the existing per-Graph Traversal history (which is a different axis, ADR-CONTEXT's `Traversal history` entry)? Breadcrumb of the full ancestor chain, or a single back step?
- If infinite-canvas zoom: React Flow's sub-flow feature (`.scratch/react-flow-guidance/findings.md` §8) shares one store and one viewport and doesn't do hierarchy in ELK today — is that mechanism reused, or is this a bigger, separate rendering effort?
- Does "open in a new tab" ship now or get deferred? If now: what does a Space's route look like, and does it extend to every Card kind or only Space Cards?
- Does presenting (ADR 0024, ADR 0044) ever traverse *into* a nested Space, or does presenting stay bounded to one Space's Active Graph?

## Acceptance

- Shared understanding confirmed before any navigation code is written.
- `CONTEXT.md` updated if any term is coined (e.g. a name for the ancestor-chain/breadcrumb state, if one is decided).
- An ADR recorded if the mechanic choice is hard to reverse, surprising, and a real trade-off — per `docs/agents/workflow.md`'s bar.

## Not in scope here

Anything issues 03 and 04 already settled: what a Space Card references, ownership/cascade-delete, cycle rejection, WorkspaceSelection's retirement. This ticket is purely about how an author moves once a Space Card exists.

## Answer

ADR 0068 and `entity-url-addressability/08` now own the decision and delivery:
Open embeds the selected Space View, Enter adopts the target command surface,
an explicit Exit is the one thing that closes an entered Space, and independent
opening uses the target's canonical URL. Entering does not unwind — every Space
entered and not exited stays open, and entering an already-open Space focuses
its existing entry. ADR 0068 withdrew the earlier "Back or Escape returns to the
containing Space": Back is the browser's linear history under ADR 0069 rather
than a pop, and Escape keeps the meaning ADR 0048 gives it.
