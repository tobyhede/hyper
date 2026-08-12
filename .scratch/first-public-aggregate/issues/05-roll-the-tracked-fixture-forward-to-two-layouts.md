# Roll the tracked fixture forward to two Layouts

Status: resolved
Blocked by: 04

## What to build

The tracked abstract layout fixture becomes a version 1 Space with **two**
Layouts, because Graphs nest under Layouts now and a Space cannot otherwise hold
them.

The split follows the fixture's own structure — it is already two disconnected
collections sharing no Cards:

- One Layout owning **Long**, **Mid** and **Short** over the A→B→C→D→A′ spine,
  membership being those five Cards.
- One Layout owning **Echo** over E→F→G→H→E′, membership being those five.

Every Card is in exactly one collection, so both Layouts are closed with no Card
left over and no Card in both.

Seed both position maps from **one ELK run over the current fixture**, so first
paint is unchanged and the fixture keeps looking like what it looks like today.
Leave `defaultView` absent, so Flow still renders it.

"Unchanged first paint" is not something a reader can confirm by looking, and
there is no screenshot baseline in the suite, so **make it mechanical**: a test
asserting every seeded position matches what `elkStrategy` returns for the
fixture's Cards and Graphs, within a tolerance. That is the criterion — not a
claim in the commit message. It also survives as a regression net, so a later
change to the ELK options that would silently move the fixture fails here
instead of being noticed by eye or not at all.

Two Layouts rather than one is deliberate: it is the only place in the tree
where the flatten crosses a Layout boundary, and one Layout would leave that
rule untested by everything the E2E suite drives.

Declaring Layouts changes what the Layout selector offers — it had none and now
has two — so the toolbar and overview assertions need revisiting rather than
forcing back to their old shape.

## Two more Spaces roll forward with it

Ticket 04 found these; no earlier ticket owns them, and `pnpm test` stays red
until they land.

**`packages/app/example/space.json`** — the dormant narrative demo. Still
version 2, and `packages/app/test/space-files.test.ts` reads it beside the
fixture, so it is not as dormant as it looks. It carries three Graphs over one
connected collection of seven Cards and no Layouts, so it rolls forward as
**one** Layout owning all three — not two; the fixture's split follows its two
disconnected collections and this Space has one. Its position map need only
cover every member, since nothing renders this Space; a deterministic placement
is enough and an ELK run is not required.

**`packages/app/e2e/seed.ts`** — seeding a Layout now means naming the Graphs it
owns, which is exactly the shape this ticket defines. Ticket 04 deliberately
left it rather than guess ahead of that decision.

**AGENTS.md becomes wrong here.** Its standing line explains that ELK renders
the fixture *because the fixture declares no Layout*. After this the fixture
declares two, and the reason it still opens in Flow is the absent `defaultView`.
Correct that sentence in the same change; leaving it is a trap for the next
reader.

## Green bar

Shared branch. `pnpm verify` and `pnpm e2e` should both pass at the end of it —
`04` restored the typecheck and this restores the fixture-dependent tests it
listed. `06` is then confirmation across the bars this one cannot run cheaply
(PostgreSQL, the opt-in browser durability test) rather than a repair job.

## Acceptance criteria

- [x] The fixture is a version 1 Space with two Layouts owning four Graphs
      between them.
- [x] Each Layout's position keys are exactly the Cards its Graphs connect, and
      every owned Edge endpoint is one of them.
- [x] A test proves every seeded position matches `elkStrategy`'s output for the
      fixture within a tolerance, so "first paint is unchanged" is checked rather
      than asserted.
- [x] `defaultView` is absent and the Space opens in Flow.
- [x] An E2E proves the Flow view draws all four Graphs across the two Layouts,
      with the Active Graph emphasised and the rest still drawn.
- [x] Selecting either Layout draws its own Graphs and only those.
- [x] The AGENTS.md sentence about why ELK renders the fixture is corrected.
- [x] `packages/app/example/space.json` is version 1 with one Layout owning its
      three Graphs, and `space-files.test.ts` passes.
- [x] `e2e/seed.ts` seeds Layout-owned Graphs.
- [x] `pnpm test` is fully green — no fixture-dependent failures remain.

## Answer

### The seeded numbers came out of the test, not out of a text editor

`packages/app/test/fixture-placement.test.ts` loads the fixture, resolves the
view the absent `defaultView` gives it, takes the `strategyGraph`
`canvasProjection` builds and runs `elkStrategy()` over it — the exact seam the
canvas uses. The fixture was first written with membership keys and zeroed
positions, which loads and fails that test; a throwaway generator running the
same three calls wrote ELK's answer back into the two position maps, and was
deleted. So the numbers in `space.json` have one origin and the test compares
against it rather than restating it.

The run is over the **whole** fixture rather than per Layout, because what has
to stay unchanged is the Space-subject arrangement an author actually opens. The
two collections share no Cards, so ELK bands them and each Layout's half keeps
its band coordinates — which a second test asserts directly, so the split
reading as "two bands" is checked rather than assumed.

Tolerance is half a pixel, compared as `Math.abs(seeded - elk)` rather than
`toBeCloseTo`, so the failure message names the Card and the axis.

`example/` needs no ELK run — nothing renders it — so its one Layout is seeded
from `gridStrategy` through the same seam.

### The two Layouts are titled `Collection 1` and `Collection 2`

Not `Layout 1`/`Layout 2`. `nextNumberedTitle` mints the next `Layout N` above
the highest already taken, so numbering the fixture's own Layouts would have
moved every conversion in the e2e suite to `Layout 3` — for no gain, since the
titles the fixture wants are the ones its README already uses for the two
collections.

### The e2e suite needed more than count edits

Conversion produces a Layout owning one fresh **empty** Graph (ADR 0045), and a
selected Layout draws the Graphs it owns. So every fixture test that converted
and then counted `FIXTURE_EDGE_COUNT + n` was counting the flatten after the
renderer had stopped drawing it; those became `1` and `2`, with the reason
written beside them. Three needed real rework rather than a new number:

- **`edges follow a card that has been dragged`** had nothing left to watch —
  the Layout a drag produces holds no Edge. It now selects the fixture's own
  `Collection 1` and drags there, which is the first time in this suite a test
  could open an authored Layout without authoring it first (`selectLayout` in
  `e2e/graph.ts`).
- **`drawing an existing Edge from an Algorithmic View does not convert or
  persist`** was inverted by ticket `03`, not by the fixture: on an Algorithmic
  View the Edge joins the Graph conversion mints, so nothing is duplicated and
  it converts. It is now
  `drawing an Edge the emphasised Graph already holds converts rather than
  refusing`, and it goes on to draw the same Edge a second time in the resulting
  Layout, where the refusal does apply.
- **`a duplicate Edge is marked invalid while the drag is still live`** was the
  same inversion at gesture level, so it now converts and authors A→B before
  asserting that the second A→B is refused live.

Two smaller ones: the connection preview's colour is now read off the source
handle instead of a hard-coded blue, because the active Graph after a conversion
is the minted one and both surfaces are meant to agree; and the presented-Card
test has to author an Edge before presenting, since an empty Graph cannot be
presented at all.

Two assertions moved from `toBeVisible` to `toBeAttached`: A→B and the A→A
self-Edge are both dead-horizontal lines in the converted Layout, and a
zero-height SVG box reads as hidden — the same trap `overview.spec` already
documents for `edge-path`.

### `e2e/seed.ts` was already right; its consumer was not

Ticket `04` landed the Layout-owned-Graph seed. What was left was
`new-space.spec`'s expectation that a seeded Layout has no Graph — impossible
under ADR 0040, where creating a Layout creates its initial Active Graph. That
test now asserts the seeded `Graph 1` from the start and is renamed to say what
it proves: the Alt empty-drop authors the Layout's *first Edge* into the Graph
it already owns.

### Not done here

`CONTEXT.md`, the ADR build statuses and the handoff are ticket `06`'s, as is
the branch note at the top of AGENTS.md's "Decided" section. The one AGENTS.md
sentence this ticket owns — why ELK renders the fixture — is corrected, and
`packages/app/README.md` is updated because it documents the two fixture
directories this ticket rewrote. PostgreSQL integration was not run; it passed
on this commit already and `06` re-runs it.
