# Accepted decisions

Every accepted ADR, one line each. The line states what the decision **binds** —
the thing that must change if the decision is reversed. It is not a summary of
the document.

Read this first. Open an ADR when you are about to change what it binds.

- A retired decision moves to [`superseded/`](superseded/). It stays readable,
  and a live ADR that points at one still resolves. It is history, not a rule.
- [ADR 0016](0016-every-entity-carries-a-durable-uuid-beside-its-authored-id.md)
  is the one rejected decision. It is kept because its argument will be made
  again.
- An ADR binds structure. A test binds behaviour. `CONTEXT.md` binds words. Where
  an ADR body describes an arrangement of controls, the tests and `CONTEXT.md`
  are what hold, not the prose.

`test/unit/adr-status-blocks.test.ts` holds the status blocks to their
convention: one-word `Status:`, reciprocal `Refines`/`Refined by` and
`Supersedes`/`Superseded by`, one superseder per ADR, and a superseded ADR filed
under `superseded/`.


## Domain model and intake

| ADR | Binds |
| --- | --- |
| [0001](0001-recursive-spaces.md) | A Card may hold another Space, so Spaces nest. |
| [0004](0004-cards-are-the-graph.md) | Cards are the graph. Nothing sits between a Card and its position. |
| [0007](0007-routes-are-the-only-structure.md) | Cards and Graphs are the only structure. There are no separately authored edges. |
| [0010](0010-space-is-the-root-loaded-by-loadspace.md) | `loadSpace` is the one intake, and the root value is a Space. |
| [0020](0020-a-card-is-a-markdown-file-with-frontmatter.md) | A Card is one Markdown file. The directory is the inventory. |
| [0038](0038-a-point-has-one-type.md) | `LayoutPosition` is the one representation of a point. |
| [0051](0051-card-kinds-own-everything-beyond-the-title.md) | A Card kind owns everything past the Title. |
| [0009](0009-alias-resolution-is-lazy-and-single-hop.md) | An Alias resolves lazily and in one hop. |
| [0039](0039-an-alias-delegates-content-authoring-to-its-target.md) | An Alias gives content authoring to its Target. |
| [0046](0046-an-occurrence-authors-its-own-title-and-target.md) | An occurrence authors its own Title and Target in the pane that opens it. |
| [0070](0070-an-open-alias-shows-immutable-target-content-read-only.md) | An Alias keeps its Target for life and shows that content read-only. |
| [0068](0068-a-space-card-shows-a-space-view.md) | A Space Card shows one selected Space View of another Space. |
| [0074](0074-space-card-references-own-the-target-space.md) | The Space Cards referencing a Space own its lifetime. Deleting the last one deletes the Space. |
| [0076](0076-multi-space-edits-coordinate-per-space-sessions-behind-space-card-lifecycle.md) | Multi-Space edits coordinate per-Space sessions behind the Space Card lifecycle. |

## Layout, View and Graph

| ADR | Binds |
| --- | --- |
| [0002](0002-layout-view-separation.md) | A Layout and a View are different entities. |
| [0005](0005-layout-is-a-strategy.md) | A strategy arranges Cards and returns no separate arranged-result type. |
| [0014](0014-layout-is-the-authored-data-strategy-is-the-behaviour.md) | A Layout is authored data. A LayoutStrategy is behaviour. |
| [0031](0031-views-and-layouts-are-selected-and-conversion-keeps-no-provenance.md) | The reader selects a View or a Layout. A conversion keeps no provenance. |
| [0040](0040-layouts-own-card-membership-and-routes.md) | A Layout owns its Card membership and its Graphs. |
| [0045](0045-a-view-takes-cards-and-graphs-and-returns-a-layout.md) | A View takes Cards and Graphs and returns a Layout. |
| [0015](0015-a-space-may-have-no-routes.md) | A Space may hold no Graph. It then cannot present. |
| [0003](0003-routes-may-conflict.md) | Graphs are independent, and their orders may disagree. |
| [0032](0032-routes-may-contain-cycles.md) | A Graph may contain a cycle. |
| [0041](0041-graph-is-the-first-public-name-for-route.md) | Graph is the first-public name for Route. |
| [0072](0072-canvas-renderer-identity-is-the-space-view-id.md) | A canvas renderer is identified by the UUID of its Space View. |
| [0075](0075-computed-views-are-read-only-and-create-layout-converts.md) | Computed Views are read-only; Create Layout is their sole transition to authored state. |

## Editing and persistence

| ADR | Binds |
| --- | --- |
| [0035](0035-space-authoring-owns-the-edit-lifecycle.md) | Space Authoring owns the full Edit lifecycle. |
| [0042](0042-interaction-drafts-stay-local-and-space-replacement-invalidates-them.md) | An interaction draft stays local, and a Space replacement discards it. |
| [0057](0057-errors-cross-seams-as-stable-identities.md) | An error crosses a seam as a stable identity, not as prose. |
| [0028](0028-activating-a-route-is-not-an-edit.md) | To activate a Graph is not an Edit. |
| [0030](0030-postgres-is-the-live-write-model.md) | PostgreSQL is the live write model. Files are imported and exported. |
| [0018](0018-a-new-space-is-a-single-centered-card.md) | A new Space is one centred Card. |
| [0054](0054-the-unreleased-prototype-rolls-forward.md) | The prototype is unreleased, so a format change rolls forward and adds no migration. |
| [0056](0056-the-repository-is-the-only-source-of-state.md) | The repository is the only source of state. Every artifact is derived. |

## HTTP

| ADR | Binds |
| --- | --- |
| [0034](0034-the-http-application-is-fetch-native.md) | The HTTP application is Fetch-native. |
| [0069](0069-entities-have-durable-web-addresses.md) | Every Space, Card, Graph and Space View has a durable URL built from its Id. |

## Canvas and camera

| ADR | Binds |
| --- | --- |
| [0024](0024-presenting-is-traversing-a-route.md) | To present is to traverse a Graph. There is no deck. |
| [0027](0027-presenting-is-the-graph-canvas-under-camera-control.md) | Presenting uses the same canvas under camera control. There is no second surface. |
| [0043](0043-a-camera-command-is-issued-never-awaited.md) | A camera command is issued and never awaited. |
| [0044](0044-the-presenting-move-is-one-fitview-call.md) | The presenting move is one `fitView` call. |
| [0033](0033-route-authoring-uses-spatial-route-coloured-handles.md) | Graph authoring uses spatial handles coloured as the active Graph. |

## UI foundation

| ADR | Binds |
| --- | --- |
| [0047](0047-a-shadcn-component-is-the-default-and-a-hand-roll-is-a-deviation.md) | A shadcn component is the default. A hand-roll is a recorded deviation. |
| [0050](0050-base-ui-and-lucide-are-the-ui-foundation.md) | Base UI and Lucide are the UI foundation. Do not mix Radix and Base UI. |
| [0052](0052-stable-ladle-stories-are-production-parity-evidence.md) | A stable Ladle story is production-parity evidence and owes two tests. |
| [0063](0063-markdown-source-editing-uses-codemirror-behind-a-hyper-owned-component.md) | CodeMirror sits behind one component that `@project/ui` owns. |
| [0067](0067-ui-owns-the-markdown-editor-lazy-boundary.md) | `@project/ui` owns the lazy split point that loads that editor. |
| [0053](0053-the-workspace-command-surface-is-a-sidebar-and-the-canvas-takes-one-choice.md) | The Space command surface is a Sidebar, and the canvas takes one choice from it. |
| [0048](0048-escape-and-commit-are-decided-by-the-surface-not-the-field.md) | The surface decides Escape and commit. The field does not. |
| [0036](0036-a-card-selects-on-click-and-no-click-opens-it.md) | A Card selects on a click. No click opens it. |
| [0064](0064-opening-a-card-expands-it-in-place.md) | To open a Card is a Layout-owned Edit that grows the Card in place. |
| [0065](0065-a-card-title-edits-on-one-activation.md) | A Card Title edits on one activation. |
| [0066](0066-open-size-survives-closing.md) | A Layout keeps the Open Size after a Close. |
| [0073](0073-a-card-rail-is-a-toolbar.md) | A Card rail is one `role="toolbar"` with roving tabindex. |

## Toolchain

| ADR | Binds |
| --- | --- |
| [0061](0061-typescript-7-is-the-compiler-and-typescript-6-is-a-bridge.md) | `tsc` is TypeScript 7. The name `typescript` is a TypeScript 6 bridge. |
| [0062](0062-the-narrowing-assertions-we-have-are-the-most-we-will-have.md) | The narrowing assertions in the tree are a ceiling. Nothing new joins them. |
| [0071](0071-native-typed-array-codecs-set-the-platform-floor.md) | Native Typed Array codecs set the platform floor. |
