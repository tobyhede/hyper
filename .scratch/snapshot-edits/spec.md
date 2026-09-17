# Thing membership Edits have one home, and Space Authoring stops keeping a second placement

The rules that turn a Space snapshot into the next one when a Thing joins, grows, shrinks or leaves a Diagram — Add, Open, Close, Resize, Remove from Diagram, Delete from Space — move into one pure `@project/graph` module, `SnapshotEdit`. Space Authoring and the session registry both call it. Before Authoring does, Authoring's retained copy of the selected Diagram's placement is deleted, because nothing in production needs it any more and it is where positions drift.

Grilled out of the 2026-09-16 architecture review (candidate 1, "One Space-snapshot Edit module in `graph`"). No ADR: this finishes what ADR 0084 and ADR 0086 already decided rather than deciding anything new. `CONTEXT.md` is unchanged — "Space snapshot" and every operation verb are already defined there.

## Why

### The rules have three homes, and one of them is wrong

Displacement and removal rules live in `app` (`space-authoring.ts:520-770`, `snapshot.ts` `withThingRemovedFromDiagrams`/`withoutIncidentEdges`) and are written a second time in `persistence` (`session-registry.ts` `removeSpaceThing` :295, `addSpaceThing` :312). `persistence` depends on `graph` and cannot import `app`, so `graph` is the only package both callers reach.

The persistence copy diverged. Each of these was found by reading, and **none has been reproduced** — ticket 01 opens with the failing test for each:

- **Deleting an Open Space Thing does not reclaim its room.** `removeSpaceThing` filters the Thing out of `positions` and drops incident Edges, but never calls `Placement.reclaim`. Both other removal paths do (commit `d6ba07bc` claimed to give the reclaim rule "one owner across all three removals"). Space Things can be Open (ADR 0070), so ADR 0084's round trip breaks: the Things it displaced stay displaced.
- **Deleting a Space Thing an Alias targets is not guarded.** Authoring refuses `thing-has-aliases` for every Thing it deletes, but Space Thing deletion goes to the registry (`thing-deletion.ts:93-101`), which never checks. ADR 0070 lets a Space Thing be an Alias Target. The dangling Alias fails intake (`validate.ts:256`, `unresolved-alias-target`), the aggregate wraps it as `invalid-space-snapshot`, and the registry answers the generic `aggregate-refused` — nothing is committed, but the author is told nothing useful.
- **A menu-created Space Thing stacks.** `addSpaceThing` writes the `centreAnchor()` it is handed (`App.tsx:451`, `:524`) exactly, while a menu-created Markdown Thing steps off an occupied point through `freeAnchor`. ADR 0089 made every kind one press; they should land the same way.

### Authoring keeps two placements, and the reasons for the second are gone

Space Authoring holds its own `Placement` (`let placement`, `install`, `reportRendered`, `replacePlacement`, `reconcilePlacement`, `authoredPlacement()`) beside the snapshot's Diagram `positions`, and every completed Edit writes that whole placement into the Diagram — including Edits that touch no position, such as renaming a Graph.

The copy existed for two reasons, both since removed:

1. **Render-time layout strategies** (ADR 0014). An automatic strategy computed positions at render, so they existed only in the rendered output; `reportRendered` fed them back and `placement-pending` gated authoring until a strategy resolved. ADR 0086 took strategies off the render path — the application builds only `positionedStrategy(Placement.fromDiagram(...))`.
2. **Drawn ≠ authored displacement** (ADR 0064). `Placement.drawn` and `authoredPoint` converted between them. ADR 0084 deleted both: a drawn coordinate is an authored one.

A read-only trace (not run) found the copy is vestigial:

- `reportRendered` is a no-op in production. It calls `Placement.next(placement, rendered, [])`, and `next` returns `authored` unchanged when `placed` is empty (`placement.ts:204`). The placement is never `null` in production — `compose-app.ts:161` opens it from `Placement.fromDiagram`.
- `connected-things` and `create-and-connect` pass `placed: []`, so their `rendered` is equally inert.
- `selectDiagram`, `created-diagram`, `deleted-diagram` and `acceptStoredSpace` install `fromDiagram` or empty; a completed Edit installs exactly what it wrote.
- The one live use is `settled-thing-movement`, which merges the moved Things' drop points — and `complete()` installs that merge **before** deriving (`space-authoring.ts:1903-1913`), so a refused or queued drag leaves the copy ahead of the Diagram.
- The embedded Diagram path already works the proposed way: `EmbeddedDiagramAuthoring.tsx:72` and `embedded-authoring.ts:116` read `fromDiagram` and pass no-ops for `reportRendered`/`replacePlacement`.

Where the copy does disagree with the Diagram, it looks like defects rather than behaviour. **Suspected, unreproduced** — ticket 02 opens with a failing test for each and strikes any that will not fail:

- **Coordinated Diagram delete** (`App.tsx:921`, `space-thing-context-commands.ts:94`). Navigation re-selects, `reconcilePlacement` fixes membership only, and the later `navigation.selectDiagram(result.diagramId)` is never followed by a placement replace — so Things shared with the deleted Diagram can be drawn at its positions.
- **Enter seeding** (`open-spaces.ts:428`). Same pattern: `navigation.selectDiagram` with no placement replace.
- **Embedded Edit in an unselected Diagram** (`space-authoring.ts:1869`). No install, and reconciliation is gated by `installing`; a `deleted-thing` cascade can leave a stale member that the next Edit writes into the snapshot, where intake refuses the reference.

## Design

### `SnapshotEdit` in `@project/graph`

- **Where:** `packages/graph/src/snapshot-edits.ts`, offered from the curated index as one `SnapshotEdit` value in the same shape as `Placement`, and added to `test/unit/graph-package-surface.test.ts`. `Placement` stays offered because the render path still reads it.
- **What it operates on:** `SpaceSnapshot` from `core` — the one representation both callers already hold. Not the loaded `Space` (the registry would parse every snapshot to edit it), not a bare `Placement` (callers would keep assembling snapshots, which is where the divergence came from).
- **Operations**, named for `CONTEXT.md`'s verbs: `createInDiagram`, `addToDiagram`, `open`, `close`, `resize`, `removeFromDiagram`, `deleteFromSpace`. Each arrives with its first real caller (ticket 01 or 03), not ahead of it.
- **Outcome:** `completed(snapshot) | unchanged | refused(code)`, never a throw for a domain rule (ADR 0057). `graph` declares its own small refusal union — `thing-has-aliases` carrying the Alias names, `thing-not-in-diagram`, `thing-already-in-diagram`, `thing-not-found`, `thing-not-open` and whatever else an operation actually refuses — and each caller maps those codes into `AuthoringRefusal` or `SpaceThingRefusal`. Wording stays in `app`.
- **Scope of change:** `things`, the target Diagram's `positions`, and Edges incident to the Thing. It does **not** touch `defaultDiagram`, `activeGraph`, the Diagram's title or `kind` — those come from Navigation and stay in Authoring's own write (`updatePositionedDiagram` in `app/src/snapshot.ts`).
- **Kinds:** `deleteFromSpace` is kind-agnostic. Routing a Space Thing to the registry because its deletion cascades across Spaces stays with the callers — Authoring keeps `space-thing-deletion-unsupported`, and the registry calls the same operation on the containing Space. `open` does read the Thing's kind, to choose `DEFAULT_SPACE_THING_OPEN_SIZE` or `DEFAULT_OPEN_SIZE`: that is a property of the Thing being opened, not routing.
- **Resize:** a resize to exactly `COLLAPSED_THING_SIZE` is a Close, and the module owns that. ADR 0066's 24-unit magnetic range is application-owned and stays in `app`, which already snaps a near miss to the exact size before completing.
- **Creation:** `createInDiagram` adds the Thing to `things` and positions it as one step, placed either `exact` (create-and-connect's aimed drop point) or `avoidingOverlap` (a menu creation, stepping diagonally off an occupied point — today's `freeAnchor`). The caller still mints the Thing. `createInDiagram` also refuses an Alias whose Target the snapshot does not hold (`alias-target-not-found`) or whose Target is itself an Alias (`alias-target-must-own-content`): with `deleteFromSpace`'s `thing-has-aliases` that is both halves of one rule, and a snapshot answers it without the loaded Space's lookup, so no Thing constraint stays outside the module.
- **Placement** becomes an implementation detail behind these operations, reached for `reclaim`, `displace`, `growth`, `place` and `remove`.

### Coordinated operations decide after their last wait

Reproduced by `refuses to delete a Space Thing an Alias came to target while the deletion was reading persistence` (`packages/persistence/test/session-registry.test.ts`), red against ticket 01: the registry checks an operation's rules in `derive`, waits on `backend.loadAggregate()`, then re-applies a closure to a `working` snapshot an Edit changed during the wait. `submit` publishes `working` while persistence is paused, so the wait is a real window. Delete then throws from `completedSnapshot`; creation and the Diagram and Graph deletions do not re-check at all.

- **Every coordinated operation is `prepare` then `plan`.** `prepare` is async and holds every wait — loading the aggregate, initializing a target Space, minting ids. `plan` is synchronous, reads the Spaces as they stand, runs the `SnapshotEdit` operations and answers the changes or a refusal. The coordination does its own aggregate read before `plan`, and nothing suspends between `plan` and installing its result; `plan`'s return type is not a Promise, so an `await` inside it does not compile.
- **`plan` is the decision.** A check in `prepare` is only an early exit that saves work — `link` still refuses a missing Diagram before initializing a target (ADR 0079) — and `plan` asks again.
- **The cascade is planned too.** Which target Spaces a Space Thing deletion removes is computed in `plan` from current Spaces, not carried from an earlier read.
- **One refusal path.** A refusal from `plan` is installed and answered as a value by the coordination, and each operation maps it the way it maps `aggregate-refused`. The `update` rebase closure and `completedSnapshot` are deleted.
- **Diagram and Graph deletion move onto the same shape.** `deleteDiagram` and `deleteGraph` plan their successor and reference rewrites in `plan`. Their rules stay in the registry — moving those is still review candidate 2 — but there is one coordination shape, not two.

### Authoring reads the Diagram, not a copy

- Authoring derives each Edit from `Placement.fromDiagram` of the selected Diagram in the working snapshot.
- Deleted: `install`, `reportRendered`, `replacePlacement`, `reconcilePlacement`, `authoredPlacement()`, `initialPlacement`, `openingPlacement`, the `placement-pending` refusal with its gate and its wording in `authoring-refusal.ts`, and the render adapter's calls to the first two.
- `App.tsx` builds its positioned strategy from `selectedDiagram`, already memoised on the working Space. Every Edit already changes that; a drag frame does not — so re-layout frequency is unchanged.
- `settled-thing-movement` carries the moved Things' drop points explicitly, applied over the Diagram's positions **at derivation**. That also stops a queued drag deriving against positions captured when it was requested. `connected-things` and `create-and-connect` stop carrying `rendered`.

### Behaviour that changes

- **A refused drag snaps back** to its stored position. Today it stays at a drop point nothing stored, and the next unrelated Edit authors it. Nothing was authored, so snapping back is the honest answer.
- **A queued drag must not snap back.** It will be authored; the render adapter's drag draft holds the drop point until the Edit is derived. Asserted by a failing render-adapter test before the change.

### Tests: replace, don't layer

- The membership rules are tested once, as properties over snapshots in `packages/graph/test`: every removal reclaims; Open then Close restores every position; a menu placement never lands on a taken point; deleting an Alias Target is refused; resize to Closed Size is Close.
- Tests in `space-authoring-operations.test.ts` that only restate those rules through full composition are deleted as their operation moves. Tests of completion outcomes, replacement epochs, queueing and ordering stay.
- Tests that seed geometry with `initialPlacement: null`, `replacePlacement` or `Placement.fromEntries` seed the snapshot's Diagram instead. The `render-adapter.test.ts` spy tests asserting install order are deleted.

## Tickets

| Ticket | Blocked by | Status |
|---|---|---|
| [01 — The session registry edits snapshots through `SnapshotEdit`](issues/01-registry-edits-through-snapshot-edit.md) | none | done |
| [02 — Space Authoring stops keeping its own placement](issues/02-remove-authorings-placement-copy.md) | none | ready-for-agent |
| [03 — Space Authoring edits snapshots through `SnapshotEdit`](issues/03-authoring-edits-through-snapshot-edit.md) | 01, 02, 05 | needs-triage |
| [04 — A Space Thing deletion refuses when an Alias arrives during its wait](issues/04-deletion-decides-after-its-last-wait.md) | none | done |
| [05 — Space Thing creation and linking refuse when their Diagram goes during the wait](issues/05-creation-decides-after-its-last-wait.md) | 04 | ready-for-agent |
| [06 — Diagram and Graph deletion refuse when their successor goes during the wait](issues/06-context-deletion-decides-after-its-last-wait.md) | 04 | ready-for-agent |
| [07 — The coordination has one shape](issues/07-one-coordination-shape.md) | 05, 06 | ready-for-agent |

04 opens with the red test already in the registry suite. 05 and 06 touch different operations and may run in parallel. 01 and 02 touch disjoint modules (`graph` + `persistence`, and `app`'s Authoring + render adapter) and may run in parallel.

## Out of scope

- Diagram and Graph context commands' rules — create/delete Diagram and Graph, their successor and keep-last rules (their coordination shape is in scope, above), and the dead `deleted-diagram`/`deleted-graph` Authoring arms (review candidate 2).
- Splitting `deriveCompletedEdit` into completion families, and one entry that routes deletion by Thing kind (review candidate 7).
- Edge operations (connect, reconnect, delete Edge) beyond removing Edges incident to a removed Thing.
