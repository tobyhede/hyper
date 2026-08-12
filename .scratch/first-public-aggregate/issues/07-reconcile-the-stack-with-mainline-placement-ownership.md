# Reconcile the stack with mainline placement ownership

Status: resolved
Blocked by: 05

## Why this exists

It was not planned. PR #55, "Let Space Authoring own on-screen placement", merged
to `main` while tickets 02–05 were being built, and it rewrites the same module
ticket 03 rewrote. This ticket reconciles the two. It exists as its own step
because it is a design reconciliation, not the mechanical integration `06` was
scoped for, and `06` should not have to discover it.

## What the two sides did

**Mainline (#55)** reshaped how a completion carries its own inputs:

- Every `AuthoringCompletion` variant now carries the placement it was rendered
  from — `rendered: Placement` — instead of the editor installing placement
  ahead of reporting.
- `edited-card` carries its `document: CardDocument` on the completion.
- `ReportedCompletion` therefore loses its `cardDocuments` map.
- `installPlacement`/`installCardDocument` become
  `reportRendered`/`replacePlacement`, and `reportRendered` merges against a
  base that is `null` unless a Layout is selected.
- `initialPlacement` is gone from the dependencies.

**This stack (02, 03)** changed what a completion *means*:

- A Graph is a nested owned value of its Layout, so an Edit writes into a Graph
  that Layout owns rather than appending to a Space-level list.
- `createSpaceAuthoring` takes `currentSpace`, because which Layout an Edit
  writes and what it owns is the View's answer (ADR 0045).
- Conversion asks the View for the new Layout's content and mints a fresh empty
  Graph.
- `canConnect` and `canCreateConnectedCard` became conditional on a selected
  Layout, and `canConnect` gained a membership check.

The two are largely orthogonal in intent. They are not orthogonal in text.

## Why a plain merge is not enough

Git merges `space-authoring.ts` without a conflict and the result is wrong: it
takes mainline's `AuthoringCompletion` wholesale while keeping this stack's
dependency block, so `initialPlacement` survives beside the `replacePlacement`
that replaced it. Each hunk is individually reasonable; the whole is a shape
neither side designed.

`space-authoring.test.ts` conflicts in ten hunks, and those are the real work —
the tests are where the two APIs actually meet, and resolving them is deciding
which interface each behaviour is expressed through.

**Do the merge deliberately rather than resolving hunk by hunk.** Read both
sides first, decide the combined shape, then make the file say it.

## The combined shape

Mainline's direction wins on *how a completion is reported*: the completion
carries `rendered` and `document`, there is no `installCardDocument`, and
`initialPlacement` is gone. That is a newer decision about this module made
deliberately on `main`, and nothing in this stack contradicts it.

This stack wins on *what a completion means*: Layout-owned Graphs, the
`currentSpace` dependency, the View conversion boundary, and the two connection
predicates including the membership check.

Where they touch, both hold: a completion carries its own rendered placement
**and** the Edit it derives writes into a Graph the Layout owns.

## What must still be true afterwards

None of these is negotiable, and each is pinned by a test that must survive:

- The completion sequence is total: pure derivation before installation,
  `session.submit` first in the install window, the `installing` depth gate, and
  the `replacementEpoch` drain gate.
- The single `continueInRenderer(selection, activeGraphId)` call stays. Do not
  restore a separate `activateGraph` from Edit completion — the AGENTS.md bullet
  now records why, including the negative.
- Conversion produces a Layout owning exactly one fresh empty Graph, and an Edge
  drawn in the same gesture lands in it.
- A Graph with no Edges cannot be presented, and the control is disabled rather
  than dead.
- `canCreateConnectedCard` keeps the signature `connection-gesture.ts` consumes.

## Acceptance criteria

- [x] `origin/main` is merged into the stack, with the combined shape above
      rather than a hunk-by-hunk resolution.
- [x] ~~`initialPlacement` is gone~~; placement arrives through `replacePlacement`
      and `reportRendered`. `installPlacement` is what went; `initialPlacement`
      never left `main` and stays. See the Answer.
- [x] Every `AuthoringCompletion` carries its own `rendered`, and `edited-card`
      its `document`.
- [x] The `currentSpace` dependency and the View conversion boundary survive.
- [x] Every guarantee listed above still has a test, and the fault-injection
      coverage is no weaker than either side had.
- [x] `pnpm verify` green.
- [x] `pnpm e2e` green.
- [x] PostgreSQL integration green, and the database stopped afterwards.

## Answer

Merged as `ab8dd89`. The combined shape is the one this ticket describes, with
one correction below.

### The shape

Mainline owns *how* a completion reports itself. Every `AuthoringCompletion`
except `edited-card` carries `rendered: Placement`; `edited-card` carries its
`document: CardDocument`; `ReportedCompletion` is two fields, not three;
`installPlacement`/`installCardDocument` are gone in favour of
`replacePlacement`/`reportRendered`; and `reportRendered` merges against
`mergeBase()`, which is `null` unless a Layout is selected.

This stack owns *what* a completion means. `currentSpace`, the View conversion
boundary, the Layout-owned Graph an Edit writes into, `nextActiveGraphId` on
`CompletedEdit`, the single `continueInRenderer(selection, activeGraphId)`, and
both connection predicates including `connectable`'s membership check are
untouched.

### The one correction: `initialPlacement` did not go anywhere

The acceptance criterion "`initialPlacement` is gone" rests on a misreading, and
it is checkable: `git show origin/main:packages/app/src/space-authoring.ts`
declares `initialPlacement?: Placement | null` on `SpaceAuthoringDependencies`
and seeds `let placement = initialPlacement`, and `attachAuthoring` in mainline's
own test file still passes it. What PR #55 removed and replaced is
**`installPlacement` → `replacePlacement`**, which is the rename the "survives
beside the `replacePlacement` that replaced it" sentence is about.

So it stays. It is a construction seed for a value `createApp` already knows —
the opened Layout's own map — and deleting it would buy nothing but a
construct-then-mutate `createSpaceAuthoring` in `App.tsx` and at every test call
site. What the criterion was reaching for is true: the only *runtime* writers of
placement are `replacePlacement` and `reportRendered`, and no editor installs
anything ahead of reporting an Edit.

Mainline did move several individual test call sites off `initialPlacement` onto
`replacePlacementForTest`, because its `complete` helper needs the rendered map
in a `WeakMap` to hand back. Those moves are kept; they are not the dependency
going away.

### `connectable` reads the raw placement, not `mergeBase()`

Worth writing down because it looks like an oversight. `mergeBase()` answers
`null` on an Algorithmic View, so a membership check asked through it would
refuse every connection on a View — including the first one, which is the
gesture that converts. The predicate reads the installed `placement` field for
exactly the reason its own comment already gave: it is the only value that
answers on a View, and it is still the value the completion derives from, since
`complete` installs the completed placement before `deriveCompletedEdit` asks.

### The ten test conflicts

Eight are the same decision twice over — mainline renamed a mechanism, this
stack changed a fixture or an assertion, and both apply: `replacePlacementForTest`
and the `complete(authoring, …)` helper over this stack's version-1 snapshots,
`graphsOf` flatten, `currentSpace` dependency and Layout-owned expectations. Two
are substantive:

- **"treats unavailable placement, duplicate Edges and stale Card identities as
  no Edit"** keeps this stack's `positionedSnapshot` fixture and its comment,
  because the duplicate refusal is conditional on a selected Layout — on a View
  the Edge joins the empty Graph conversion mints and there is nothing to be a
  duplicate of. It takes mainline's name, *"requires rendered placement and
  treats duplicate Edges and stale Card identities as no Edit"*, because the
  placement half is now asserted through `canConnect` rather than through a
  completion with no geometry.
- **"refuses to connect with no active Graph while the Space already holds
  Graphs"** is dropped, not adapted. Its premise is a Layout whose `graphs`
  filter hides every Space-level Graph; ticket `01` deleted the filter and `02`
  deleted the collection, and under ADR 0040 a Layout always owns at least one
  Graph. The reachable remainder — a selected Layout the Space no longer holds —
  already has its own test.

Three further sweeps outside the conflict markers: three stack-authored tests
auto-merged cleanly onto the *old* interface (`installPlacement`, bare
`authoring.complete`) and were moved onto the new one.

### Fault-injection coverage

No weaker than either side. Kept: a throwing `submit` (three cases), a throwing
reporter, a throwing `acceptRemote`. Mainline's *"publishes what the
collaborators hold when activating the minted Graph throws"* is superseded by
this stack's *"…when adopting the written Layout throws"*, which injects into
`continueInRenderer` — the one call — while a second stub asserts `activateGraph`
throws if Edit completion ever reaches it at all. That is strictly stronger than
mainline's, not a substitution. The `reportedPlacement === null` refusal still
has a test, through `edited-card` in "binds a Card value to the completion that
reports it".

Net test count for the file: 42 on `main`, 43 on the stack, 44 merged.

### Bars

- `pnpm verify` — green. 96 test files, 950 tests, all files 93.87% statements.
- `pnpm e2e` — green. 72 passed in 54.1s.
- `pnpm postgres:up && pnpm test:integration:postgres` — green. 3 files, 52
  tests. Database stopped with `pnpm postgres:down` afterwards.

### Not done here

`CONTEXT.md`, the ADR build statuses, the handoff and the AGENTS.md branch note
remain ticket `06`'s. Nothing in this reconciliation changed a rule any of them
states — the AGENTS.md completion-sequence bullet already describes the single
`continueInRenderer`, and it describes it correctly after the merge.
