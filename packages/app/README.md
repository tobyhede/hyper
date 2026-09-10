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
`title`, `diagrams` and `defaultDiagram` — and one markdown file per
card, either beside it or under `cards/`. The fixture uses both locations
(`a.md` at the top, the rest in `cards/`) so the two-location scan is exercised
by the space the app actually loads.

Two **disconnected collections** in one space, sharing no cards, which ELK lays
out as separate bands — and, because a Graph is a nested owned value of the
Diagram that holds it (ADR 0040), **two Diagrams**:

```
Collection 1   Long   A → B → C → D → A′
               Mid    A → B → C → D
               Short  A → B → C
               T      a member no Edge reaches
Collection 2   Echo   E → F → G → H → E′
```

Each Diagram's position keys are its Card membership, and every Edge it owns is
closed over that membership — which is why the split follows the collections
rather than being drawn anywhere else. Membership is the wider of the two: `T`
is a member of Collection 1 that no Edge reaches, which is what Add Card leaves
behind and what `packages/app/test/space-files.test.ts` counts rather than
forbids. Between them the two hold every Card once, so nothing is left over and
nothing is in both.

Their positions are **authored**, as placement always is (ADR 0014): a plain
hand-set grid, two rows of a Diagram apiece, so selecting a Diagram draws its Cards
where the space file put them and first paint moves nothing.

`defaultDiagram` names **Collection 1**, so that is the Diagram the fixture opens
on (ADR 0079). A selected Diagram draws only the Graphs it owns, so Collection 2
is off the canvas until it is selected.

`example/` is one connected collection of seven Cards, so its three Graphs are
owned by a **single** Diagram. Nothing renders it, so its positions are a plain
deterministic grid rather than an ELK run.

Each collection returns to its start via an **alias** (`A′` of `A`, `E′` of `E`).
That deliberately exercises alias rendering while keeping this fixture acyclic
and laid out as clean forward paths. Graphs themselves may contain cycles; an
alias is useful when the author wants a separately titled and positioned Card
showing the same content (ADR 0009, ADR 0032).

Every Graph here is a **line**: each non-terminal Card has one Edge out. That is the
degenerate graph, not a separate kind (ADR 0024), and it keeps the fixture's
overlay counts easy to read. Forks and merges are legal and are covered by unit
and property tests rather than here.

Between them the shape exercises every behaviour the e2e suite covers:

- **Multiple graphs over a shared spine (collection 1).** Long, Mid, Short run
  down `A → B → C`, then Mid and Long carry on. Each has its own in/out handle on
  every shared card, so the three paths stay separable — the compatible-overlay
  case.
- **Independent collections / disconnected components.** Two bands, no edge
  between them.
- **Aliases on a Graph (ADR 0009).** `A′` / `E′` show `A` / `E`'s content under
  their own titles and at distinct positions.
- **Open shows source (ADR 0011).** `A`'s body carries `**A**`, so opening it can
  prove the Markdown markers survive rather than rendering bold.
- **A heading in a body is just a heading (ADR 0020).** `C`'s body opens with
  `# Where Short ends`. Under the old split — title in the space file, body in a
  separate markdown file — a leading heading repeated the title and rendered
  twice, and a rule forbade it. Now that both live in one file, a title and a
  body heading are two different things and both are drawn once. Asserted while
  presenting, which is the one surface that draws markdown *rendered* (ADR 0011).
- **Open off the selected Graph.** `E` is in the other collection, so selecting a
  collection-1 Graph and opening `E` proves any card opens regardless of the
  selection.
- **Scroll inside the frame (issue 05).** `D` is long enough to overflow the 16:9
  panel at a small viewport.
- **A Title on more than one line (ADR 0083).** `T`'s Title is three lines — one
  of each role — so the Card front's Title ladder is drawn by the space the app
  and Playwright actually load, and a regression in projection or clamping shows
  up on screen rather than only in a unit test.
- **A Diagram member no Edge reaches.** `T` again: it is placed on Collection 1
  and joins none of its Graphs, so it draws no graph handles and carries no
  Edges. That is the state Add Card and the Cards drawer both author.
- **Overlay counts.** 11 cards, 13 edges (4 + 3 + 2 + 4), 26 handles, 4 graphs
  across both Diagrams. A *selected* Diagram draws only the Graphs it owns: 9
  edges for Collection 1, 4 for Collection 2 — and 6 Cards on Collection 1,
  which is its 5 Edge endpoints plus `T`.

The counts above are shape-dependent: change a Graph and the e2e counts change
with it, deliberately.
