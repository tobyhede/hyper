# One active route, which a Layout may name

Building ADR 0026, plus the write-side rule ADR 0028 adds to it.

## What the ADRs decide

**ADR 0026** — a space has one **active route**. "Selected" and "active" were never two concepts; the highlight is how active is shown. A Layout carries two optional, independent pointers into its space's routes:

- `routes` — the subset it *shows*. A filter. Absent means every route.
- `activeRoute` — which visible route is active when the Layout opens. Must be one of the visible ones. Absent, the **first visible route** is active.

Filtering is authored view scope; activating never changes what is visible. Changing the active route is a dedicated interaction — the `RouteSelector` already is one.

**ADR 0028** — that fallback is a read, never a write. The app writes `activeRoute` explicitly on every real save (a drag, an auto-arrange, a drawn edge, a created card), so a file the app wrote does not depend on route order. Activating a route is **not** an edit: it does not convert an algorithmic layout and does not dirty the space. It reaches the file only by riding along with the next real save. A route minted by editing (ADR 0021) is set active in the same write that creates the Layout.

## Shape of the work

The rename runs first and alone — `workflow.md`: a rename conflicts with everything, so every ticket completed before it adds new surface in the old vocabulary.

`01` rename → `02` schema → `03` validation → `04` resolution → `05` save. `06` is the minted-route case and is blocked on ADR 0021, which is not built.

## What stays green

The fixture declares no layouts, so it takes the absent-filter, absent-`activeRoute` path: every route visible, the first active. That is today's behaviour exactly, so `pnpm e2e` should stay green **and unchanged** through `01`–`04` — the guard that proves those are behaviour-preserving. New coverage lands as unit tests.
