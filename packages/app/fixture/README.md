# Layout fixture

The abstract space `pnpm dev` loads, and the one Playwright drives. It is a
**test bed**, not the product demo — the narrative demo lives in `../example/`
and is kept for when real space-loading exists. Tests here assert *behaviour*
against this shape; nothing asserts on card prose.

Two **disconnected collections** in one space, sharing no cards, which ELK lays
out as separate bands:

```
Collection 1   Long   A → B → C → D → A′
               Mid    A → B → C → D
               Short  A → B → C
Collection 2   Echo   E → F → G → H → E′
```

Each collection returns to its start via an **alias** (`A′` of `A`, `E′` of `E`).
That is deliberate: a route may not revisit a card (ADR 0012) — a return is a
forward step to an alias, never a backward edge — so this fixture is acyclic by
construction and lays out as clean forward paths, no loops.

Between them the shape exercises every behaviour the e2e suite covers:

- **Multiple routes over a shared spine (collection 1).** Long, Mid, Short run
  down `A → B → C`, then Mid and Long carry on. Each has its own in/out handle on
  every shared card, so the three paths stay separable — the compatible-overlay
  case.
- **Independent collections / disconnected components.** Two bands, no edge
  between them.
- **Alias as return (ADR 0009, 0012).** `A′` / `E′` show `A` / `E`'s content under
  their own titles, and are how a route "comes back" without a revisit.
- **Card description (ADR 0006, card-display/03).** `A` carries a `description`
  ("Where every route begins"), drawn under its title in the graph node; the other
  cards have none, so the node renders with and without one.
- **Open shows source (ADR 0011).** `A`'s body carries `**A**`, so opening it can
  prove the Markdown markers survive rather than rendering bold.
- **Open off the selected route.** `E` is in the other collection, so selecting a
  collection-1 route and opening `E` proves any card opens regardless of the
  selection.
- **Scroll inside the frame (issue 05).** `D` is long enough to overflow the 16:9
  panel at a small viewport.
- **Overlay counts.** 10 cards, 13 edges (4 + 3 + 2 + 4), 26 handles, 4 routes.

The counts above are shape-dependent: change a route and the e2e counts change
with it, deliberately.
