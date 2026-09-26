# Graph Edits through one authoring command interface

Status: resolved — tickets `01`–`05` all shipped. No live work remains here; the out-of-scope list below is what is left.

Graph Edits — create, rename, recolour and delete — move behind one Graph authoring module with two private adapters, one for the Command Dock over the Space on the canvas and one for an Open Space Resource over the target Space it embeds. It is the second instance of the shape `.scratch/command-outcomes/issues/06`–`09` gave Map Edits (`packages/app/src/map-authoring-commands.ts`), so the capability vocabulary that module declares under Map names moves into a shared module first and both instances spend it.

Grilled out of the 2026-09-24 architecture review (candidate 1, "Graph authoring commands, shaped like Map authoring"). No ADR and no `CONTEXT.md` change: like command outcomes and Map authoring, these are application constructs, not domain terms.

## Why

### Graph Edits have two implementations that already disagree

The Dock's Graph arm (`App.tsx`, the `graph:` literal of `dockChrome`, `runGraphEdit`, `renameChromeTitle`'s Graph branch) and the rail's (`space-resource-context-commands.ts`, `graphCommands`) each build the same four Edits and differ in:

- **Availability.** The Dock gates rename on `chromeTitleEdit` and everything else on one `editsDisabled` boolean beside always-present functions; the rail has `deleteDisabled` and reads no `available()` at all. Map commands are `offered` capabilities on both surfaces.
- **Reporting.** The Dock reports through command outcomes (`graph-edit`, `graph-delete`); the rail returns a sentence to its own local notice. Ticket 09 retired the rail's local sentence for Map Edits.
- **Survivor.** Delete passes `preferredGraphId: null` from the Dock and the Map's `activeGraph` from the rail.
- **Persistence ordering.** The rail waits for both Spaces, creates, waits for the target, then writes the Space Resource's selection (`coordinatedContextCreate`); the Dock waits for nothing, which is correct for it, but the difference is decided at the call site rather than behind an adapter.

`@project/ui` pays for the mismatch too: `SpaceResourceSelectors` converts two command shapes into one private `SelectorCommands`, and a Graph creation answers `continued: false` while a Map creation answers whether the caret moved.

### The Map module is the model

`map-authoring-commands.ts` answers every Map Edit as a `MapCapability { available, invoke }` in one `MapEditOutcome` vocabulary (completed, unchanged, unavailable, refused-with-a-complete-report), behind a private core and two private context adapters, and both surfaces spend it through `offered`. The deletion test holds for it (ticket 09's comment). Nothing else in the app uses the shape, so this is the moment it becomes a pattern rather than a one-off.

## Design

### Shared vocabulary (ticket 01)

A new module, `packages/app/src/authoring-commands.ts`, holds the context-neutral half of the Map module: `Capability<Invocation>`, `EditOutcome<Completed>`, `offered` and `renameDraftAnswer`. `MapCapability`/`MapEditOutcome` are renamed onto them at every caller, including command outcomes' reported channels. No behaviour changes.

### The Graph module

- **Where:** `packages/app/src/graph-authoring-commands.ts`, a sibling of the Map module, not nested inside it and not merged with it.
- **Shape:** Map-scoped creation and Graph-addressed rename, recolour and delete — `map(mapId)` answering `create` and `graph(graphId)`, the latter answering `rename`, `recolor` and `delete`. Each is a `Capability`; rename and recolour are synchronous (an inline editor holds a refused draft open), create and delete answer promises.
- **Completed outcomes carry identities.** A creation answers `{ mapId, graphId }` of the Graph it made; a deletion answers the surviving `{ mapId, graphId }`. Each surface keeps its current continuation behaviour — making the rail continue into a new Graph's name is a separate UI decision.
- **Contexts are shared, constructors are not.** Each module has its own public constructor per context (`topLevelGraphAuthoringCommands` beside `topLevelMapAuthoringCommands`, and the embedded pair), built over one private definition of each context — what it addresses, how it completes an Edit, and its before/after waits — shared by both modules so the two cannot drift.
- **Addressing.** Top level: the Active Graph of the selected Map only; any other id answers `unavailable`, as a Map other than the selected one does. Embedded: any Graph of any Map of the target while `spaces.entry(target.id) === target`.
- **Rules inside the module.** The last Graph of a Map is unavailable for deletion (ADR 0079), checked at read and again at invocation. Every Space Resource that selects the deleted Graph is repointed in the same Edit (ADR 0076).
- **Survivor rule (mirrors ticket 08).** Prefer the Active Graph the context shows when it is not the one going; otherwise the Map's `activeGraph ?? graphs[0]` among the survivors — so the lifecycle and reconciliation land on one survivor. The Dock's `navigation.activateGraph` follow-up is removed if removing it fails nothing, as ticket 08's `selectMap` follow-up was.
- **Availability is inherited, not fixed.** Top-level gates stay exactly as today: rename on `chromeTitleEdit`; recolour, create and delete on `entityEdits`. Aligning Graph create with Map create's `addResource && chromeTitleEdit` is out of scope. As for Map commands, the general-availability answer is the last render's; the live recheck covers Space state only (Graph existence, addressing, entry identity). Making availability live is separate work that would fix Map and Graph together.

### Reports

- The Graph channels become **reported**, as the Map channels are: Graph authoring owns the complete title and message, command outcomes owns lifetime, staleness and dismissal.
- A new **`graph-create`** channel splits creation out of `graph-edit`, with Map creation's three titles mirrored: "Graph not created", "Graph not saved", "Graph not selected".
- `graph-edit` keeps rename and recolour under "Graph unchanged"; `graph-delete` keeps "Graph not deleted".
- **The rail says no local sentence** for a Graph refusal; the containing canvas's command outcomes say it (ticket 09's rule for Maps).
- **A refused rename is said twice**, inline where the editor holds the draft and as the `graph-edit` notice — ticket 09's deliberate exception for Map rename, now applied to Graph rename on both surfaces. Today the Dock's Graph rename is inline only.
- A throw is a break: it reaches the reporter and is never dressed as a refusal.

### What stays outside

Which Graph is active, Copy link, where the caret goes, and how a report is drawn stay with the surfaces. The module imports no continuation, React or DOM.

### Tests

- `authoring-commands.test.ts` holds `offered` and `renameDraftAnswer` once.
- `graph-authoring-commands.test.ts` runs one contract suite per capability against both adapters (completed, unchanged, unavailable when withdrawn or vanished, refused with the complete report held and dismissed by command outcomes, last Graph, survivor, stale embedded target), plus what each context addresses.
- App-mount Graph tests whose rule the contract covers are removed — `graph-delete-notice.test.tsx` and the Graph cases of `space-resource-context-commands.test.ts` are the candidates. Tests that prove a surface's distinct treatment stay.

## Tickets

1. Move the shared capability vocabulary into its own module.
2. Graph rename and recolour through both context adapters.
3. Graph creation through both context adapters.
4. Graph deletion through both context adapters.
5. Contract the old Graph command interface.

## Out of scope

- Live general availability (the review's "availability as a live source").
- The rail continuing into a new Graph's name.
- Aligning Graph create's Dock gate with Map create's.
- The drawn-colour rule for a Graph with no stored colour (review candidate 2).
