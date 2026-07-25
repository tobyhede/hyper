# A Layout filters its routes and marks one active; a Route does not belong to it

Status: superseded
Superseded by: 0026
Refines: 0002, 0005, 0013
Related: 0003

A Layout carries two optional, independent pointers into its space's routes:

- **`routes`** — the subset it *shows*. A filter. Absent means every route.
- **`activeRoute`** — which visible route opens *emphasized*. Absent means none
  (or the first). Must be one of the visible routes.

Both are references by id. A Route stays a peer of Layout under the Space, never
owned by one.

## Why two, not one

They answer different questions, and the shipped rule only survives if they stay
separate.

*Filtering* solves "one arrangement does not suit every route": cards placed
left-to-right for one narrative read badly for another that crosses them, so a
Layout arranged for some routes should not draw the ones it was not arranged for.
That is a per-Layout authored choice about what the view *contains*.

*Emphasis* is the initial selection: among the visible routes, one opens
highlighted and the rest dimmed, exactly as the overview already does. Selecting
another visible route moves the emphasis — it never changes what is visible.

Keeping them distinct is what preserves the rule *selection is emphasis, not
filtering*. Selection still only moves emphasis, and only ever within the visible
set; the filter is not selection but authored view scope, decided once by whoever
wrote the Layout. The overview that draws every route is then simply a Layout with
no filter. So the old rule narrows by a clause rather than breaking: selection is
emphasis, not filtering — *the filter is the Layout's, not the selection's*.

## Why not ownership

Making a Route *belong* to a Layout was the tempting shortcut and is wrong. A
Route is pure topology and order; it presents as a deck with zero geometry —
reveal.js needs no positions — so a Route must be able to exist with no Layout at
all. Ownership forbids that, and forces a route to be re-authored in every Layout
that wants it: the same duplication ADR 0004 refused for placement, one level up.
The dependency runs one way — geometry references topology, never the reverse: a
Layout is arranged *for* some routes and points at them; a Route knows nothing
about where it is drawn.

## Consequences

`spaceFileSchema`'s Layout gains optional `routes: string[]` and
`activeRoute: string`. `loadSpace` validates both against the space's route ids,
and checks that `activeRoute`, when present, is among `routes` (or among all
routes when `routes` is absent) — a dangling or out-of-set id is a reference error
of the kind it already raises. Absent both, a Layout shows every route with no
default emphasis, so existing spaces are unchanged. This mirrors `defaultView` (a
space names the Layout it opens in): a Layout names the routes it opens with, and
which one leads.

## The cost we accept

Two more self-references in the space file, so `loadSpace` gains two checks. And
"which routes show" now has an authored source (the Layout's filter) while "which
is emphasized" has an authored default plus a runtime override (selection). A
reader has to hold both — but they are genuinely two questions, and collapsing
them is what produced the contradiction this ADR started from.
