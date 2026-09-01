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
- [ ] A right Cards drawer lists every Card absent from the selected Layout in
      alphabetical order; Cards can be dragged from it into the Layout or added
      by keyboard.
- [ ] A Card in a Layout can be moved, Opened, Closed and Resized.
- [ ] Cards can be connected, reconnected and disconnected in the Active Graph.
- [ ] Destructive Card actions identify whether they affect one Layout or the
      whole Space and require confirmation where data would be lost.

## Markdown Cards

- [ ] Opening renders the Markdown body in place.
- [ ] Edit, Save and Cancel author the Markdown source in the Open Card.

## Alias Cards

- [ ] Creation chooses one immutable Markdown Target.
- [ ] Opening renders the Target content read-only in place.
- [ ] Editing changes the Alias's own Title and Layout state, not Target content.

## Space Cards

- [ ] Creation can reference an existing Space or atomically create a new Space.
- [ ] The target Space reference is immutable; the selected Space View and Graph
      are editable on the Space Card.
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

- [ ] Layouts can be explicitly created, renamed, selected and deleted.
- [ ] Editing a Computed View creates a Layout without moving the Cards currently
      on screen.
- [ ] Each Layout independently owns Card membership, positions, Open/Closed
      state, Open Size, Graphs and Active Graph.
- [ ] Deleting a Layout does not delete its Cards from the Space.

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

- [ ] Every Space, Space View, Card and Graph has a durable canonical URL.
- [ ] Contextual Card and Graph URLs preserve their Space View context.
- [ ] Presentation URLs address the exact current presentation point within one
      Space.
- [ ] Direct navigation, reload, Back and Forward restore the addressed state
      without producing an Edit.
- [ ] Copy-link commands expose canonical and contextual meanings.
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
- [x] Layouts have an explicit Create Layout command in addition to conversion
      from a Computed View.

## Deferred beyond V1

### Product features

- Special visual treatment distinguishing first and repeat visits in cycles.
- Undo and redo.
- Browser-facing export and backup; CLI export is sufficient for V1.
- Browser-facing reset and merge-style seeding; V1 has only complete CLI hard
  reset and first-run initialization.
- Migration or compatibility for pre-V1 repository state and generated artifacts.
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
