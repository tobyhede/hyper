# Roll the tracked fixture forward to two Layouts

Status: ready-for-agent
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

Two Layouts rather than one is deliberate: it is the only place in the tree
where the flatten crosses a Layout boundary, and one Layout would leave that
rule untested by everything the E2E suite drives.

Declaring Layouts changes what the Layout selector offers — it had none and now
has two — so the toolbar and overview assertions need revisiting rather than
forcing back to their old shape.

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

- [ ] The fixture is a version 1 Space with two Layouts owning four Graphs
      between them.
- [ ] Each Layout's position keys are exactly the Cards its Graphs connect, and
      every owned Edge endpoint is one of them.
- [ ] First paint is visually unchanged from the current fixture.
- [ ] `defaultView` is absent and the Space opens in Flow.
- [ ] An E2E proves the Flow view draws all four Graphs across the two Layouts,
      with the Active Graph emphasised and the rest still drawn.
- [ ] Selecting either Layout draws its own Graphs and only those.
- [ ] The AGENTS.md sentence about why ELK renders the fixture is corrected.
