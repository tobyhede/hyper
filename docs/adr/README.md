# Accepted decisions

Every accepted ADR, one line each. The line states what the decision **binds** —
the thing that must change if the decision is reversed. It is not a summary of
the document.

Read this first. Open an ADR when you are about to change what it binds.

Each section is one feature stream: the decisions that shaped one part of the
product, read in the order they were made. File a new ADR under the stream whose
decisions it builds on. A superseded ADR belongs to the stream of the ADR that
replaced it, and an unlisted one to the stream of the ADR it refines. `pnpm
spaces` draws each stream as its own Map.

The lines use the current vocabulary (`CONTEXT.md`). An ADR body keeps the words
of its day, because an accepted ADR is not rewritten: Resource was Card and then
Thing, Map was Layout and then Diagram, Graph was Route, and Reference Resource
was Alias. A `Renames:` link marks an ADR that changed only those words.

- A retired decision moves to [`superseded/`](superseded/). It stays readable,
  and a live ADR that points at one still resolves. It is history, not a rule.
- [ADR 0016](0016-every-entity-carries-a-durable-uuid-beside-its-authored-id.md)
  is the one rejected decision. It is kept because its argument will be made
  again.
- An ADR binds structure. A test binds behaviour. `CONTEXT.md` binds words. Where
  an ADR body describes an arrangement of controls, the tests and `CONTEXT.md`
  are what hold, not the prose.

`test/unit/adr-status-blocks.test.ts` holds the status blocks to their
convention: one-word `Status:`, reciprocal `Refines`/`Refined by`,
`Renames`/`Renamed by` and `Supersedes`/`Superseded by`, one superseder per ADR,
and a superseded ADR filed under `superseded/`.

## Space and Resource model

| ADR | Binds |
| --- | --- |
| [0004](0004-cards-are-the-graph.md) | Resources are the graph. Nothing sits between a Resource and its position. |
| [0010](0010-space-is-the-root-loaded-by-loadspace.md) | `loadSpace` is the one intake, and the root value is a Space. |
| [0020](0020-a-card-is-a-markdown-file-with-frontmatter.md) | A Resource is one Markdown file. The directory is the inventory. |
| [0051](0051-card-kinds-own-everything-beyond-the-title.md) | A Resource kind owns everything past the Title. |
| [0083](0083-a-card-title-is-title-lines.md) | A Resource Title is one or more Title Lines, and the first line is the Resource's name. |
| [0106](0106-an-image-resource-owns-a-url-not-bytes.md) | An Image Resource owns a URL, not bytes. The host stores images at `/images/<sha256>`, named for what they are and outside the aggregate. The repo-state rule is deliberately waived for the picture. |

## Layout strategies

| ADR | Binds |
| --- | --- |
| [0038](0038-a-point-has-one-type.md) | `MapPosition` is the one representation of a point. |
| [0002](0002-layout-view-separation.md) | A Map and a View are different entities; ADR 0079 takes the View out of the domain. |
| [0005](0005-layout-is-a-strategy.md) | A strategy arranges Resources and returns no separate arranged-result type. |
| [0014](0014-layout-is-the-authored-data-strategy-is-the-behaviour.md) | A Map is authored data. A LayoutStrategy is behaviour. |
| [0086](0086-automatic-arrangement-is-an-edit-not-a-render-path.md) | An automatic arrangement is an Edit over a Map. No strategy runs at render but the positioned one. |

## Map ownership, selection and first open

| ADR | Binds |
| --- | --- |
| [0040](0040-layouts-own-card-membership-and-routes.md) | A Map owns its Resource membership and its Graphs. |
| [0079](0079-v1-exposes-only-layouts-and-first-open-initializes-one.md) | An authored Map is the only selectable and addressable canvas context, and first working load initializes one. |
| [0080](0080-new-spaces-start-complete-and-layoutless-stored-spaces-are-repaired.md) | New Spaces persist their first Resource in a complete Map; first working load repairs stored Spaces that have no Map without placing their Resources. |
| [0028](0028-activating-a-route-is-not-an-edit.md) | To activate a Graph is not an Edit. |
| [0018](0018-a-new-space-is-a-single-centered-card.md) | A new Space is one centred Resource. |

## Graph semantics

| ADR | Binds |
| --- | --- |
| [0007](0007-routes-are-the-only-structure.md) | Resources and Graphs are the only structure. There are no separately authored edges. |
| [0108](0108-graph-identity-is-unique-within-the-space.md) | A Graph id is unique across its Space, although one Map owns the Graph. Lookup, the Graph URL and render keys resolve it without a Map. |
| [0015](0015-a-space-may-have-no-routes.md) | A Space may hold no Graph. It then cannot present. |
| [0003](0003-routes-may-conflict.md) | Graphs are independent, and their orders may disagree. |
| [0032](0032-routes-may-contain-cycles.md) | A Graph may contain a cycle. |

## Edge drawing and authoring

| ADR | Binds |
| --- | --- |
| [0087](0087-an-edge-attaches-to-the-anchor-that-faces-its-neighbour.md) | An Edge attaches to one of a Resource's four anchors, on the side facing its neighbour, chosen while drawing. |
| [0110](0110-an-edge-faces-across-the-larger-gap-between-two-resources.md) | The facing side is on the axis with the larger gap between the two rects, and the centre difference on that axis alone picks the direction. A self-Edge keeps its fixed loop. |
| [0100](0100-graphs-sharing-a-pair-of-things-run-in-parallel-lanes.md) | Edges joining the same two Resources are drawn as parallel lanes (their shape: ADR 0103); the Active Graph connects on the centre with its head shape; the others run below it and stop short (their heads: ADR 0105). |
| [0103](0103-a-lane-is-offset-along-its-curve.md) | A lane is the Edge's curve offset along its normal at a constant distance, over one span of the curve per pair judged at its reach, with one cubic bridge from each end of the span to the lane's point beside its anchor, and the translate only where a pair has no span; its ends and arrowheads stay where a translate puts them and its label sits at the offset midpoint; self-Edges keep their own rule. |
| [0104](0104-an-edge-may-carry-a-title.md) | An Edge may carry an optional one-line Title, never minted, and `titleHidden: true`; its identity stays `(from, to)` within its Graph. |
| [0105](0105-a-graphs-edges-share-one-head-shape.md) | A Graph carries one head shape (`arrow`, `vee`, `dot`, `diamond`, default `arrow`), drawn at every drawn Edge's head, including those that stop short (refines 0100); no `none`, no tail shape, no per-Edge override; the legend's line marks end in it. |
| [0033](0033-route-authoring-uses-spatial-route-coloured-handles.md) | Graph authoring uses spatial handles coloured as the Active Graph. |
| [0090](0090-seeking-handles-reveal-by-proximity-and-eligibility.md) | Seeking-end authoring handles reveal only on Resources near the pointer that `edgeEligibility` would accept. |

## Presenting and camera

| ADR | Binds |
| --- | --- |
| [0024](0024-presenting-is-traversing-a-route.md) | To present is to traverse a Graph. There is no deck. |
| [0027](0027-presenting-is-the-graph-canvas-under-camera-control.md) | Presenting uses the same canvas under camera control. There is no second surface. |
| [0043](0043-a-camera-command-is-issued-never-awaited.md) | A camera command is issued and never awaited. |
| [0044](0044-the-presenting-move-is-one-fitview-call.md) | The presenting move is one `fitView` call. |

## Opening and editing a Resource

| ADR | Binds |
| --- | --- |
| [0063](0063-markdown-source-editing-uses-codemirror-behind-a-hyper-owned-component.md) | CodeMirror sits behind one component that `@project/ui` owns. |
| [0067](0067-ui-owns-the-markdown-editor-lazy-boundary.md) | `@project/ui` owns the lazy split point that loads that editor. |
| [0036](0036-a-card-selects-on-click-and-no-click-opens-it.md) | A Resource selects on a click. No click opens it. |
| [0064](0064-opening-a-card-expands-it-in-place.md) | To open a Resource is a Map-owned Edit that grows the Resource in place. |
| [0065](0065-a-card-title-edits-on-one-activation.md) | A Resource Title edits on one activation. |
| [0066](0066-open-size-survives-closing.md) | A Map keeps the Open Size after a Close. |
| [0084](0084-displacement-is-applied-by-the-edit-that-causes-it.md) | Opening and closing move their neighbours once, as an Edit. Nothing is derived at render. |
| [0093](0093-a-thing-makes-room-on-one-axis-once-clear-of-the-collapsed-subject.md) | A Resource makes room on one axis, `x` first, once clear of the subject's collapsed rect. |

## Reference Resources

| ADR | Binds |
| --- | --- |
| [0009](0009-alias-resolution-is-lazy-and-single-hop.md) | A Reference Resource resolves its Target lazily and in one hop. |
| [0039](0039-an-alias-delegates-content-authoring-to-its-target.md) | A Reference Resource gives content authoring to its Target. |
| [0046](0046-an-occurrence-authors-its-own-title-and-target.md) | A Reference Resource authors its own Title; ADR 0070 fixes its Target for life and ADR 0089 removes the pane that chose it. |
| [0070](0070-an-open-alias-shows-immutable-target-content-read-only.md) | A Reference Resource keeps its Target for life and shows that content read-only. |
| [0089](0089-creating-a-thing-completes-on-activation.md) | Creating a Resource completes on activation. A Target comes from context, never from a pane. |

## Space Resources

| ADR | Binds |
| --- | --- |
| [0001](0001-recursive-spaces.md) | A Resource may hold another Space, so Spaces nest. |
| [0068](0068-a-space-card-shows-a-space-view.md) | A Space Resource shows another Space through the selection it carries; ADR 0079 makes that selection a Map and a Graph. |
| [0074](0074-space-card-references-own-the-target-space.md) | The Space Resources referencing a Space own its lifetime. Deleting the last one deletes the Space. |

## Edit lifecycle and multi-Space coordination

| ADR | Binds |
| --- | --- |
| [0076](0076-multi-space-edits-coordinate-per-space-sessions-behind-space-card-lifecycle.md) | Multi-Space Edits coordinate per-Space sessions behind the Space Resource lifecycle. |
| [0097](0097-a-multi-space-edit-is-judged-against-what-it-commits.md) | A multi-Space Edit is derived and judged with `decideCommit` against the stored Spaces plus its participants' working Spaces. |
| [0099](0099-the-barrier-waits-only-for-commits-in-flight.md) | The coordination barrier pauses, then awaits only in-flight commits; one recovery rule covers both deletion cascades, reading stored and working state. |
| [0035](0035-space-authoring-owns-the-edit-lifecycle.md) | Space Authoring owns the full Edit lifecycle. |
| [0042](0042-interaction-drafts-stay-local-and-space-replacement-invalidates-them.md) | An interaction draft stays local, and a Space replacement discards it. |
| [0057](0057-errors-cross-seams-as-stable-identities.md) | An error crosses a seam as a stable identity, not as prose. |
| [0091](0091-context-deletion-relocates-every-space-thing.md) | Deleting a Map or Graph atomically relocates every Space Resource that selected it. |

## Repository and aggregate lifecycle

| ADR | Binds |
| --- | --- |
| [0030](0030-postgres-is-the-live-write-model.md) | PostgreSQL is the live write model. Files are imported and exported. |
| [0077](0077-the-meta-space-starts-from-one-replaceable-default-aggregate.md) | The Meta Space starts from one deterministic, editable aggregate. The CLI hard reset that restores it is decided but not built (`.scratch/v1-release/issues/16`); today `hyper <path> --dangerous-truncate` (ADR 0094) replaces the aggregate from a directory. |
| [0078](0078-the-server-side-repository-owns-meta-lifecycle.md) | The server-side repository owns Meta lifecycle; its browser seam does not expose lifecycle administration. |
| [0094](0094-dangerous-truncate-replaces-whatever-is-stored.md) | `--dangerous-truncate` replaces whatever is stored, valid or not, still authorized by the Meta identity it read. |
| [0095](0095-sql-databases-share-one-space-repository.md) | PostgreSQL and SQLite share one Space repository and differ only through a small `SqlStore`; revisions are decimal TEXT on both. |
| [0096](0096-the-aggregate-lifecycle-decision-stays-inside-each-repository.md) | Initialization and replacement decide their outcome inside each repository; there is no pure lifecycle decision beside `decideCommit`. |
| [0088](0088-aggregate-names-the-meta-rooted-collection.md) | Aggregate names the complete Meta-rooted collection of Spaces. One Space plus its Resources is a snapshot. |
| [0098](0098-a-commit-outcome-is-named-once-on-both-sides-of-the-seam.md) | `CommitOutcome` is shared by both commit seams, its status codes are one table, and the identity rule is the store's alone. |

## URLs, HTTP and navigation

| ADR | Binds |
| --- | --- |
| [0034](0034-the-http-application-is-fetch-native.md) | The HTTP application is Fetch-native. |
| [0069](0069-entities-have-durable-web-addresses.md) | Every Space, Resource, Graph and Map has a durable URL built from its Id (ADR 0079 makes the addressable canvas context a Map). |
| [0111](0111-presentation-stays-within-one-space-until-cross-space-edges-are-decided.md) | A presentation URL names Space, Map, Graph and Resource only. The cross-Space query value waits for cross-Space Edges to be decided. |
| [0081](0081-navigation-answers-its-own-address-and-never-learns-what-a-url-is.md) | Navigation answers its own address. Deciding what URL that address deserves stays in `app`. |
| [0071](0071-native-typed-array-codecs-set-the-platform-floor.md) | Native Typed Array codecs set the platform floor. |

## UI foundation and command surfaces

| ADR | Binds |
| --- | --- |
| [0047](0047-a-shadcn-component-is-the-default-and-a-hand-roll-is-a-deviation.md) | A shadcn component is the default. A hand-roll is a recorded deviation. |
| [0050](0050-base-ui-and-lucide-are-the-ui-foundation.md) | Base UI and Lucide are the UI foundation. Do not mix Radix and Base UI. |
| [0052](0052-stable-ladle-stories-are-production-parity-evidence.md) | A stable Ladle story is production-parity evidence and owes two tests. |
| [0082](0082-the-space-command-surface-is-bound-by-what-it-owes-not-where-it-sits.md) | The Space command surface is bound by what it owes and takes no canvas space. Its shape is not an ADR question. |
| [0048](0048-escape-and-commit-are-decided-by-the-surface-not-the-field.md) | The surface decides Escape and commit. The field does not. |
| [0073](0073-a-card-rail-is-a-toolbar.md) | A Resource rail is one `role="toolbar"` with roving tabindex. |
| [0102](0102-a-resources-commands-float-in-react-flows-node-toolbar.md) | A Resource's commands float in React Flow's `NodeToolbar`, drawn while the Resource is the one selected or an edit is running, at the Dock's size. |

## Engineering discipline

| ADR | Binds |
| --- | --- |
| [0109](0109-nondeterminism-is-injected-once-at-composition.md) | A nondeterministic function is a required composition parameter, named at the composition root. Tests own a generator and never mock `crypto.randomUUID`. |
| [0054](0054-the-unreleased-prototype-rolls-forward.md) | The prototype is unreleased, so a document format change rolls forward with its fixtures and adds no versioned reader. Relational schema changes still go through `migrations/app/`. |
| [0056](0056-the-repository-is-the-only-source-of-state.md) | The repository is the only source of state. Every artifact is derived. ADR 0106 excepts an Image Resource's picture. |
| [0061](0061-typescript-7-is-the-compiler-and-typescript-6-is-a-bridge.md) | `tsc` is TypeScript 7. The name `typescript` is a TypeScript 6 bridge. |
| [0062](0062-the-narrowing-assertions-we-have-are-the-most-we-will-have.md) | The narrowing assertions in the tree are a ceiling. Nothing new joins them. |

## Vocabulary renames

| ADR | Binds |
| --- | --- |
| [0085](0085-thing-and-diagram-are-the-first-public-names-for-card-and-layout.md) | The first rename of Card and Layout, to Thing and Diagram; ADR 0101 renames them again, to Resource and Map. `LayoutStrategy` keeps its name. |
| [0092](0092-reference-thing-is-the-first-public-name-for-alias.md) | Alias is renamed Reference Thing, which ADR 0101 makes Reference Resource. Alias is retired. |
| [0101](0101-map-and-resource-are-the-first-public-names-for-diagram-and-thing.md) | Resource and Map are the first-public names for Thing and Diagram. Space and Graph are unchanged. |
| [0041](0041-graph-is-the-first-public-name-for-route.md) | Graph is the first-public name for Route. |
