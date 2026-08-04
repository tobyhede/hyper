# The app's two spaces

`fixture/` is the abstract space `pnpm dev:fixture` loads, and the one Playwright drives.
It is a **test bed**, not the product demo — the narrative demo lives in
`example/` and is kept for when real space-loading exists. Tests assert
*behaviour* against this shape; nothing asserts on card prose beyond the few
markers listed below.

This file sits here rather than in `fixture/` on purpose. A space is a directory
(ADR 0020) and every `.md` beside its space file is a card, so a `README.md` in
there would be scanned as one and fail to parse for want of frontmatter.

Each space is a directory: `space.json` holding structure — `version`, `id`,
`title`, `routes` — and one markdown file per card, either beside it or under
`cards/`. The fixture uses both locations (`a.md` at the top, the rest in
`cards/`) so the two-location scan is exercised by the space the app actually
loads.

Two **disconnected collections** in one space, sharing no cards, which ELK lays
out as separate bands:

```
Collection 1   Long   A → B → C → D → A′
               Mid    A → B → C → D
               Short  A → B → C
Collection 2   Echo   E → F → G → H → E′
```

Each collection returns to its start via an **alias** (`A′` of `A`, `E′` of `E`).
That deliberately exercises alias rendering while keeping this fixture acyclic
and laid out as clean forward paths. Routes themselves may contain cycles; an
alias is useful when the author wants a separately titled and positioned Card
showing the same content (ADR 0009, ADR 0032).

Every route here is a **line**: each card has one edge out. That is the
degenerate graph, not a separate kind (ADR 0024), and it keeps the fixture's
overlay counts easy to read. Forks and merges are legal and are covered by unit
and property tests rather than here.

Between them the shape exercises every behaviour the e2e suite covers:

- **Multiple routes over a shared spine (collection 1).** Long, Mid, Short run
  down `A → B → C`, then Mid and Long carry on. Each has its own in/out handle on
  every shared card, so the three paths stay separable — the compatible-overlay
  case.
- **Independent collections / disconnected components.** Two bands, no edge
  between them.
- **Aliases on a route (ADR 0009).** `A′` / `E′` show `A` / `E`'s content under
  their own titles and at distinct positions.
- **Card description (ADR 0006, card-display/03).** `A` carries a `description`
  ("Where every route begins"), drawn under its title in the graph node; the other
  cards have none, so the node renders with and without one.
- **Open shows source (ADR 0011).** `A`'s body carries `**A**`, so opening it can
  prove the Markdown markers survive rather than rendering bold.
- **A heading in a body is just a heading (ADR 0020).** `C`'s body opens with
  `# Where Short ends`. Under the old split — title in the space file, body in a
  separate markdown file — a leading heading repeated the title and rendered
  twice, and a rule forbade it. Now that both live in one file, a title and a
  body heading are two different things and both are drawn once. Asserted while
  presenting, which is the one surface that draws markdown *rendered* (ADR 0011).
- **Open off the selected route.** `E` is in the other collection, so selecting a
  collection-1 route and opening `E` proves any card opens regardless of the
  selection.
- **Scroll inside the frame (issue 05).** `D` is long enough to overflow the 16:9
  panel at a small viewport.
- **Overlay counts.** 10 cards, 13 edges (4 + 3 + 2 + 4), 26 handles, 4 routes.

The counts above are shape-dependent: change a route and the e2e counts change
with it, deliberately.
