# V1 Definition of Done

V1 is done when an author can build, edit, navigate and present a multi-Space
technical presentation without editing source files or losing authored work.

## Spaces and persistence

- [ ] The application has one permanent Meta Space that opens when no other Space
      is named.
- [ ] First repository initialization creates that Meta Space with deterministic,
      editable Default Content: a Closed Markdown Card, an Open Markdown Card, an
      Open Space Card and an Alias, with the Space Card targeting a three-Card
      example Space with a small Graph.
- [ ] Loading an initialized repository never adds, repairs or replaces Default
      Content, including after the author empties or heavily edits the Meta Space.
- [ ] An ordinary Space is created only by creating its first Space Card and can
      be opened independently at its canonical URL.
- [x] The first request for a stored or imported layoutless Space's complete
      working state durably initializes it in one atomic persisted Edit —
      creating `Layout 1` and `Graph 1`, selecting `Graph 1` as that Layout's
      Active Graph and persisting the Layout as `defaultLayout` — before
      returning the complete working state; listing, import completion, export
      and reference checks never initialize a Space. The loader mints both and
      names the Active Graph at
      [`working-space.ts:37`](../../packages/persistence/src/working-space.ts#L37)
      and writes them in the single commit at
      [`:76`](../../packages/persistence/src/working-space.ts#L76); the seven
      cases at
      [`working-space.test.ts:57`](../../packages/persistence/test/working-space.test.ts#L57)
      cover initialization, adopting an existing Layout, the no-op on an already
      initialized Space, a concurrent winner, a retried conflict, a deletion and
      a refusal that names no Space; and
      [`space-http-app.test.ts:371`](../../packages/http/test/space-http-app.test.ts#L371)
      proves the collection listing commits nothing while the one working read
      commits once. That negative half is proved for listing alone: import
      completion, export and reference checks reach no loader that could
      initialize, because `createWorkingSpaceLoader` is called only from the
      single-Space working read and the two application openers. **The persisted key is still `defaultRenderer`, not
      `defaultLayout`** — the comment at
      [`working-space.ts:54`](../../packages/persistence/src/working-space.ts#L54)
      says so and
      [`layout-only-v1/03`](../layout-only-v1/issues/03-make-layout-the-only-v1-canvas-selection.md)
      owns the rename, so the behaviour this line describes holds while its name
      is ahead of the code. Owner
      [`layout-only-v1/02`](../layout-only-v1/issues/02-initialize-layoutless-space-on-first-working-load.md).
- [ ] Every successful Edit is saved through the unified authored commit path
      over HTTP/PostgreSQL and survives reload.
- [ ] Save failure and revision conflict are visible and recoverable without
      discarding the working Space.
- [ ] Canonical CLI import and export preserve the complete Meta-rooted aggregate,
      every V1 entity and every authored selection.
- [ ] A confirmed or forced CLI hard reset atomically destroys the complete
      repository and regenerates the same canonical Meta Space and Default
      Content used by first initialization; cancellation and failure preserve the
      previous aggregate.

## Cards

- [ ] Markdown, Space and Alias Cards can be created, renamed and deleted.
- [ ] A Card can be added to or removed from the selected Layout without deleting
      it from the Space.
- [x] A right Cards drawer lists every Card absent from the selected Layout in
      alphabetical order; Cards can be dragged from it into the Layout or added
      by keyboard. The drawer is handed only the Cards outside the selected
      Layout at [`App.tsx:1022`](../../packages/app/src/App.tsx#L1022) and sorts
      them by Title with stable Space order as the tie-breaker at
      [`CardsDrawer.tsx:113`](../../packages/app/src/components/CardsDrawer.tsx#L113),
      opening on the right at
      [`:155`](../../packages/app/src/components/CardsDrawer.tsx#L155); drag
      begins at
      [`:132`](../../packages/app/src/components/CardsDrawer.tsx#L132) and drops
      at transformed canvas coordinates in
      [`editing.spec.ts:1578`](../../packages/app/e2e/editing.spec.ts#L1578),
      while [`:1370`](../../packages/app/e2e/editing.spec.ts#L1370) adds by
      pointer, [`:1513`](../../packages/app/e2e/editing.spec.ts#L1513) adds by
      keyboard and moves focus to the placed Card, and
      [`:1389`](../../packages/app/e2e/editing.spec.ts#L1389) empties the list
      one Card at a time to prove it lists absence. Owner
      [`v1-release/02`](issues/02-complete-the-cards-view.md).
- [ ] A Card in a Layout can be moved, Opened, Closed and Resized.
- [ ] Cards can be connected, reconnected and disconnected in the Active Graph.
- [ ] Destructive Card actions identify whether they affect one Layout or the
      whole Space and require confirmation where data would be lost.

## Markdown Cards

- [ ] Opening renders the Markdown body in place.
- [ ] Edit, Save and Cancel author the Markdown source in the Open Card.

## Alias Cards

- [x] Creation chooses one immutable Markdown Target — the Target picker offers
      Markdown Cards, choosing one *is* the completion, and no Target control
      survives it:
      [`editing.spec.ts:2888`](../../packages/app/e2e/editing.spec.ts#L2888).
      What creation chose then cannot change: a changed Target is refused
      `alias-target-immutable` at
      [`space-authoring.ts:980`](../../packages/app/src/space-authoring.ts#L980).
      Owner
      [`alias-cards/06`](../alias-cards/issues/06-open-alias-shows-target-content-read-only.md).
- [x] Opening renders the Target content read-only in place — pointer, Enter and
      Space each Open the Alias on its Target's Markdown with no source textbox,
      no Edit control and no Target picker, before and after reload:
      [`overview.spec.ts:405`](../../packages/app/e2e/overview.spec.ts#L405).
      Owner
      [`alias-cards/06`](../alias-cards/issues/06-open-alias-shows-target-content-read-only.md).
- [x] Editing changes the Alias's own Title and Layout state, not Target content
      — a rename completes and leaves the Target's own document untouched at
      [`space-authoring.test.ts:473`](../../packages/app/test/space-authoring.test.ts#L473),
      while a changed Target is refused without moving the working Space at
      [`:520`](../../packages/app/test/space-authoring.test.ts#L520) against the
      guard at
      [`space-authoring.ts:980`](../../packages/app/src/space-authoring.ts#L980);
      the same Alias Resizes, Closes, reopens at its remembered Open Size and
      renames inline as ordinary Layout state at
      [`overview.spec.ts:432`](../../packages/app/e2e/overview.spec.ts#L432) and
      [`:497`](../../packages/app/e2e/overview.spec.ts#L497). Owner
      [`alias-cards/06`](../alias-cards/issues/06-open-alias-shows-target-content-read-only.md).

## Space Cards

- [ ] Creation can reference an existing Space or atomically create a new Space.
- [ ] The target Space reference is immutable; the selected Layout and Graph are
      editable on the Space Card.
- [ ] Opening renders the selected target context in place without changing the
      target Space's own selections.
- [ ] Entering adopts the target Space's complete working surface; the author can
      return to the containing Space or another open Space without losing work.
- [ ] The target Space can be opened independently in a new tab and edited there.
- [ ] Multiple Space Cards may reference one Space and reference cycles are
      refused.
- [ ] Deleting a Space Card preserves its target while another Space Card still
      references it.
- [ ] Deleting the last Space Card that references an ordinary Space deletes that
      Space and cascades through any newly unreferenced descendant Spaces.

## Layouts

- [x] Layouts can be explicitly created, renamed, selected and deleted — one
      browser test does all four and reloads after each, watching selection
      follow creation and then follow deletion onto a survivor:
      [`editing.spec.ts:628`](../../packages/app/e2e/editing.spec.ts#L628),
      creating at [`:640`](../../packages/app/e2e/editing.spec.ts#L640),
      renaming at [`:652`](../../packages/app/e2e/editing.spec.ts#L652) and
      deleting at [`:663`](../../packages/app/e2e/editing.spec.ts#L663);
      selecting an existing Layout by title is the shared gesture at
      [`e2e/graph.ts:128`](../../packages/app/e2e/graph.ts#L128) the rest of the
      suite uses. Owner
      [`layout-only-v1/01`](../layout-only-v1/issues/01-add-empty-layouts.md).
- [x] Add Layout creates and selects an empty Layout with one empty Active Graph
      in a single Edit; existing Cards stay in the Cards View until added — the
      `created-layout` derivation at
      [`space-authoring.ts:849`](../../packages/app/src/space-authoring.ts#L849)
      mints the Layout, one empty `Graph 1` and an empty Placement, selects both
      and copies nothing, and
      [`editing.spec.ts:628`](../../packages/app/e2e/editing.spec.ts#L628)
      proves the created Layout is selected, holds no Card, opens the Cards
      drawer and cost exactly one revision, through reload. Owner
      [`layout-only-v1/01`](../layout-only-v1/issues/01-add-empty-layouts.md).
- [ ] An authored Layout is the only selectable and addressable canvas context; a
      selected Layout draws only its own Cards and the Graphs it owns. **This
      behaviour line is not what the scope decision below records.** The V1 scope
      decision is ticked because ADR 0079 is accepted; this line stays open until
      [`layout-only-v1/03`](../layout-only-v1/issues/03-make-layout-the-only-v1-canvas-selection.md)
      removes Computed Views and `defaultRenderer` from the tree. A decided ADR
      is not evidence that the code follows it.
- [x] A working Space always has a durable default Layout, so deleting its last
      Layout is refused — the `deleted-layout` derivation refuses
      `space-must-keep-layout` before touching anything at
      [`space-authoring.ts:884`](../../packages/app/src/space-authoring.ts#L884),
      and
      [`space-authoring-operations.test.ts:783`](../../packages/app/test/space-authoring-operations.test.ts#L783)
      asserts both the refusal code and that the working state is the identical
      object it was before. Owner
      [`layout-only-v1/01`](../layout-only-v1/issues/01-add-empty-layouts.md).
- [x] Each Layout independently owns Card membership, positions, Open/Closed
      state, Open Size, Graphs and Active Graph — each is a field of the Layout
      itself, never of the Space, at
      [`schema.ts:197`](../../packages/core/src/schema.ts#L197), with
      Open/Closed and Open Size carried per placement at
      [`:170`](../../packages/core/src/schema.ts#L170); behaviourally,
      [`space-authoring-operations.test.ts:1317`](../../packages/app/test/space-authoring-operations.test.ts#L1317)
      removes a Card and its incident Edges from one Layout and asserts the other
      Layout is deep-equal at
      [`:1360`](../../packages/app/test/space-authoring-operations.test.ts#L1360).
      Owner
      [`layout-only-v1/01`](../layout-only-v1/issues/01-add-empty-layouts.md).
- [x] Deleting a Layout does not delete its Cards from the Space — the
      `deleted-layout` derivation at
      [`space-authoring.ts:879`](../../packages/app/src/space-authoring.ts#L879)
      replaces `document.layouts` and the selected-Layout key alone, carrying
      `snapshot.cards` through untouched, and
      [`space-authoring-operations.test.ts:774`](../../packages/app/test/space-authoring-operations.test.ts#L774)
      asserts the surviving Space holds exactly the Cards it held before.
      Owner
      [`layout-only-v1/01`](../layout-only-v1/issues/01-add-empty-layouts.md).

## Graphs and Edges

- [ ] Graphs can be created, renamed, activated and deleted while every Layout
      retains at least one Graph.
- [ ] A Graph colour can be selected and is used consistently for its Edges,
      handles and presentation chrome.
- [ ] The Active Graph is visually distinct and receives newly drawn Edges.
- [ ] Forks, merges, cycles and self-Edges remain valid authoring states.
- [ ] Edge selection exposes reconnect and delete controls after both creation
      and reconnection.

## Presentation

- [ ] An author can start and exit presenting the Active Graph.
- [ ] Advance, fork choice and Back traverse the visited Graph correctly.
- [ ] Cycles and self-Edges remain traversable.
- [ ] Keyboard and pointer controls expose the same available traversal moves.

## URL addressing

- [ ] Every Space, Layout, Card and Graph has a durable canonical URL.
- [ ] Contextual Card and Graph URLs preserve their Layout context.
- [ ] Presentation URLs address the exact current presentation point within one
      Space.
- [ ] Direct navigation, reload, Back and Forward restore the addressed state
      without producing an Edit.
- [x] Copy-link commands expose canonical and contextual meanings — the Sidebar
      offers the pair for the Active Graph at
      [`SpaceSidebar.tsx:738`](../../packages/app/src/components/SpaceSidebar.tsx#L738)
      and for a Card in the footer at
      [`:754`](../../packages/app/src/components/SpaceSidebar.tsx#L754),
      and the two browser tests read the clipboard back and assert the exact
      distinct URLs:
      [`space-routing.spec.ts:255`](../../packages/app/e2e/space-routing.spec.ts#L255)
      for the Card and
      [`:328`](../../packages/app/e2e/space-routing.spec.ts#L328) for the Graph.
      Owners
      [`entity-url-addressability/04:14`](../entity-url-addressability/issues/04-address-cards-canonically-and-in-a-space-view.md)
      and
      [`entity-url-addressability/05:13`](../entity-url-addressability/issues/05-address-graphs-canonically-and-in-a-space-view.md),
      both already ticked and both resolved.
- [ ] Malformed destinations return 400; unresolved or incompatible destinations
      return 404.

## Product design and accessibility

- [ ] The application uses one coherent visual theme; no surface remains as an
      accidental mixture of dark and light treatments.
- [ ] Icons, labels, colour, spacing, focus, selected, disabled, empty, loading,
      saving, conflict and error states form one consistent system.
- [ ] Colour is not the only indication of Active Graph, selection, failure or
      available action.
- [ ] Every production surface has keyboard operation, visible focus and an
      accessible name.
- [ ] Desktop and narrow-screen command surfaces support the complete V1 workflow.
- [ ] Every stable production surface has meaningful Ladle states and matching
      application parity evidence.

## Release gate

- [ ] The untagged End-to-end checkpoint has supplied observed canonical-journey
      feedback; reaching it is not the `v1.0.0` release.
- [ ] No known defect blocks creating, editing, saving, reopening, importing,
      exporting or presenting the V1 authored aggregate.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass on the required Node
      version.
- [ ] PostgreSQL integration proves an Edit survives a fresh application host.
- [ ] The Ladle CI check is required to merge.
- [ ] The README describes the V1 workflow, supported Card kinds and deliberate
      exclusions.

## V1 scope decisions

- [x] Space deletion is part of V1 and occurs when the last referencing Space
      Card is deleted; the Meta Space is permanent.
- [x] An authored Layout is the only selectable and addressable canvas context in
      V1. Computed Views, the union term Space View and the persisted
      `defaultRenderer` selection are retired rather than hidden, Add Layout
      creates an empty Layout, and first working load initializes a layoutless
      Space — [ADR 0079](../../docs/adr/0079-v1-exposes-only-layouts-and-first-open-initializes-one.md).
      This closes the *decision*, not the code: the behaviour line under Layouts
      above stays open until
      [`layout-only-v1/03`](../layout-only-v1/issues/03-make-layout-the-only-v1-canvas-selection.md)
      lands, and this tick is not evidence for it.

## Deferred beyond V1

### Product features

- Special visual treatment distinguishing first and repeat visits in cycles.
- Undo and redo.
- Browser-facing export and backup; CLI export is sufficient for V1.
- Browser-facing reset and merge-style seeding; V1 has only complete CLI hard
  reset and first-run initialization.
- Migration or compatibility for pre-V1 repository state and generated artifacts.
- Computed Views, and any automatic Layout strategy as a selectable or
  addressable canvas context. Automatic strategies remain non-addressable
  capabilities for explicit operations or later work.
- A canvas that flattens Graphs across Layouts.
- Cross-Space Edge authoring and reconnection.
- Presentation traversal across Space boundaries.
- Cross-Space presentation-point URLs.
- Aliases targeting Space Cards.
- Jump from an Alias to its Target.
- Cross-fade animation when Cards Open and Close.
- Conflict-specific focus restoration, provided no authored draft is lost.

### Engineering initiatives

- Typing skills and their comparative evaluation harness.
- Mutation-testing follow-ups.
- Rename Card to Box.
- Layout-strategy capability declaration.
- Catalogue-walk architecture follow-up.
- Remaining non-blocking TypeScript assertion cleanup.
- React Flow registry declaration.
- Themed zoom control.
