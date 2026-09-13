# The tracked fixture and the example

`fixture/` is the complete `hyper.json` aggregate `pnpm dev:fixture` loads, and
the one Playwright drives. It is a **test bed**, not the product demo — the
narrative demo lives in `example/` and is kept as a single Space directory.

This file sits here rather than in `fixture/` on purpose. A space is a directory
(ADR 0020) and every `.md` beside its space file is a thing, so a `README.md` in
there would be scanned as one and fail to parse for want of frontmatter.

The fixture is Meta-rooted. `hyper.json` names Meta; ordinary Spaces live in
sibling `<space-uuid>/` directories. Each Space is a directory: `space.json`
holding structure — `version`, `id`, `title`, `diagrams` and `defaultDiagram` —
and one markdown file per thing, either beside it or under `things/`. The Meta
Space uses both locations so the two-location scan is exercised by the Space
the app actually opens.

`defaultDiagram` is the opening canvas (ADR 0079). A selected Diagram draws only
the Graphs it owns. Cycle refusal is an aggregate-intake test, not an invalid
fixture. Current titles, membership and counts live in the directory and in the
tests that read it — `packages/app/test/space-files.test.ts`,
`test/unit/tracked-fixture-aggregate.test.ts`, the e2e helpers in
`e2e/graph.ts`. This file does not repeat them.

Meta holds three Diagrams: two disconnected collections that share no Things —
one of them the opening canvas, with several Graphs over a shared spine and a
member no Edge reaches — and a third Diagram of Space Things. That third
Diagram is how ordinary Spaces hang off Meta: a converging reference, depth
three, every ordinary Space reachable. Positions are **authored** (ADR 0014).

`example/` is one connected collection, so its Graphs are owned by a **single**
Diagram. Nothing renders it, so its positions are a plain deterministic grid.

The fixture's shape exists to exercise the behaviours the e2e suite covers:

- **Multiple graphs over a shared spine.** Several Graphs share Things. Each
  Thing declares four shared anchors, one on each side — graph-independent
  (ADR 0087) — so overlapping Graphs stay told apart by colour.
- **Independent collections.** Two bands, no Edge between them.
- **Aliases on a Graph (ADR 0009).** An Alias shows its Target's content under
  its own Title at a distinct position, keeping the fixture acyclic. Graphs
  themselves may contain cycles.
- **Open shows source (ADR 0011).** A body carries a Markdown marker so opening
  it can prove the source survives rather than rendering.
- **A heading in a body is just a heading (ADR 0020).** Title and a leading
  body heading are two different things and both are drawn once. Asserted while
  presenting, which is the one surface that draws markdown *rendered* (ADR 0011).
- **Open off the selected Graph.** A Thing on the other collection still opens.
- **Scroll inside the frame (issue 05).** One body is long enough to overflow
  the 16:9 panel at a small viewport.
- **A Title on more than one line (ADR 0083).** One Title is three lines so the
  Title ladder is drawn by the Space the app and Playwright actually load.
- **A Diagram member no Edge reaches.** Placed on the opening Diagram, on none
  of its Graphs — the state Add Thing and the Things list both author.
- **Linked Spaces.** Space Things on Meta, with a converging reference and
  depth three, so Enter, switching and presentation have ordinary Spaces to
  reach.

Graphs here are **lines**: each non-terminal Thing has one Edge out. That is the
degenerate graph, not a separate kind (ADR 0024). Forks and merges are legal
and are covered by unit and property tests rather than here.
