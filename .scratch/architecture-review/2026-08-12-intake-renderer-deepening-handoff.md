# Deepen Space intake and the renderer seam — implementation handoff

Status: accepted architecture handoff

Validated against: local `main` and `origin/main` at `00e7962` (PR #57,
first-public aggregate)

## Outcome

Deepen two modules after the first-public version 1 aggregate has landed:

1. `@project/graph` Space intake becomes the only interface for validated,
   contextual entity lookup. It hides its coordinated indexes, resolves Graph
   ownership and each Layout's Active Graph once, and reports ownership-era
   diagnostics.
2. `packages/app/src/view.ts` becomes `renderer.ts`: one composed resolver returns
   a discriminated View or Layout renderer, gives it an explicit Card/Graph
   subject, and enforces ADR 0045 conversion with composition-injected Graph
   identity minting.

This is an architecture follow-up to package 2, not another aggregate migration.
The document shape remains version 1, Graphs remain Layout-owned, and persistence,
HTTP, import, export and PostgreSQL storage shapes do not change.

## Starting state and authority

PR #57 already built ADR 0040/0045 and supersedes the old assumption that this
handoff must implement package 2. In particular, current `origin/main` already
has:

- version 1 schemas with non-empty Layout-owned Graph collections;
- the derived `space.graphs` flatten;
- Space-wide Graph-id uniqueness and Layout-local Edge closure;
- View conversion and fresh empty Graph policy for Flow/Grid;
- import, export, HTTP, repository, fixture and PostgreSQL migrations;
- handle-id production centralised in `@project/graph`;
- placement ownership reconciled with Layout-owned Graph authoring;
- `continueInRenderer(selection, activeGraphId)` as one Navigation operation.

Do not replay `.scratch/first-public-aggregate/issues/01`–`08`. They are the
implementation history of the baseline this work deepens.

Use this authority order:

1. `CONTEXT.md` for domain language.
2. ADR 0040 and ADR 0045 for ownership and View conversion.
3. Current `AGENTS.md` constraints, especially the fallback-band and package
   surface rules.
4. This handoff for the follow-up interface and sequence.

## Workspace baseline

The checkout has been reconciled. Local `main` and `origin/main` both point to
merge commit `00e7962`; the earlier checkout at `baef066` is no longer the
working base.

The colliding untracked `.scratch/first-public-aggregate/` notes were moved aside
before the fast-forward and compared with the tracked versions from upstream.
Their `spec.md` was identical, and the upstream issue notes retain the plans
while adding the resolved outcomes, corrections and verification evidence. No
content from the pre-sync copies needs to be integrated.

Begin implementation from `00e7962` or a later descendant. If `main` advances,
revalidate the affected interfaces before following this handoff rather than
assuming its file-level starting state is unchanged.

## Settled architecture

### 1. Space intake

Keep the two intake entry points:

```ts
loadSpace(input, cardFiles)
loadSpaceSnapshot(input)
```

They retain their distinct parsing adapters and converge on one private intake
core. The core validates aggregate relationships and constructs the runtime
`Space`.

The public runtime shape becomes conceptually:

```ts
interface ResolvedLayout {
  /** Exact authored value in space.layouts. */
  readonly layout: Layout;
  /** Exact owned Graph: authored choice or first-Graph fallback. */
  readonly activeGraph: Graph;
}

interface OwnedGraph {
  /** Exact nested value also present in space.graphs. */
  readonly graph: Graph;
  /** Canonical contextual value also returned by lookup.layout. */
  readonly owner: ResolvedLayout;
}

interface SpaceLookup {
  card(id: CardId): Card | undefined;
  layout(id: UUID): ResolvedLayout | undefined;
  graph(id: GraphId): OwnedGraph | undefined;
}

interface Space {
  readonly id: UUID;
  readonly title: string;
  readonly cards: readonly Card[];
  readonly layouts: readonly Layout[];
  /** Layout order, then each Layout's authored Graph order. */
  readonly graphs: readonly Graph[];
  readonly defaultView: BuiltInViewId | UUID | undefined;
  readonly lookup: SpaceLookup;
  // private compiler-only intake brand
}
```

Required guarantees:

- `space.graphs` retains the exact Graph values nested under Layouts; it never
  clones or stores them separately.
- `space.lookup.card/layout/graph` is O(1).
- contextual results are canonical and stable within one `Space`:

  ```ts
  space.lookup.layout(id) === space.lookup.layout(id)
  space.lookup.graph(id) === space.lookup.graph(id)
  space.lookup.graph(graphId)?.owner === space.lookup.layout(ownerId)
  ```

- `ResolvedLayout.activeGraph` is the exact owned Graph named by authored
  `layout.activeGraph`, otherwise the Layout's first Graph.
- resolving the fallback does not fill the authored optional field. Snapshot and
  export projection preserve absence.
- private Maps and their mutation capability do not appear on `Space`.
- `lookup` is an ordinary enumerable runtime property. `Space` is already a
  runtime value and is never the persistence representation.
- a private unique-symbol brand makes `Space` nominally intake-only at compile
  time. Keep it compiler-only; do not add an enumerable runtime brand.
- TypeScript readonly interfaces are sufficient. Do not recursively freeze
  authored values or arrays.

Remove the old parallel interface:

- `cardsById`
- `graphsById`
- `layoutsById`
- `layoutByGraphId`
- `getCard`
- `getGraph`
- `getGraphOwner`
- `getLayout`

`resolveContentCard(space, cardId)` stays as a separate domain operation. It
uses `space.lookup.card` internally because Alias content resolution is behavior,
not identity lookup.

All other `@project/graph` modules use `space.lookup` for entity resolution and
the ordered arrays for bulk iteration. No privileged internal Map interface.

Export `Space`, `SpaceLookup`, `ResolvedLayout`, and `OwnedGraph` from the
curated `@project/graph` index. Update the surface test in the same change.

### 2. Ownership-era diagnostics

Keep the compact error interface:

```ts
interface SpaceReferenceError {
  readonly kind: SpaceReferenceErrorKind;
  readonly ref: string;
  readonly message: string;
}
```

Hard-cut the obsolete filter/peer-Graph vocabulary:

```text
layout-position-unknown-card  -> layout-member-missing-card
layout-unknown-graph          -> split below
unresolved-graph-edge         -> split below
```

Add/use:

```text
layout-member-missing-card
layout-active-graph-missing
layout-active-graph-outside-layout
graph-edge-missing-card
graph-edge-card-outside-layout
```

Retain still-current kinds such as duplicate Card/Layout/Graph ids, duplicate
Graph Edge, unresolved default View, and Alias errors.

Root-cause rules:

- An Edge endpoint naming no Space Card earns only
  `graph-edge-missing-card`.
- An Edge endpoint naming an existing Space Card outside its owning Layout earns
  only `graph-edge-card-outside-layout`.
- An explicit Active Graph naming no Space Graph earns only
  `layout-active-graph-missing`.
- An explicit Active Graph owned by another Layout earns only
  `layout-active-graph-outside-layout`.
- Independent aggregate errors accumulate; cascading diagnoses for the same
  failed reference do not.

A repeated Graph id anywhere in the Space remains one domain failure:
`duplicate-graph-id`. Emit one error per repeated id, not one error for every
later occurrence. Its message names every occurrence in authored order with its
Layout and Graph index. The same kind covers two occurrences within one Layout
and occurrences across Layouts.

Diagnostic output is deterministic for the same input. Preserve authored
encounter order within repeated facts, but do not make the validator's global
category pass order semantic. Tests match `kind`/`ref`; exact wording is asserted
only where the wording carries required owner/location context.

### 3. Renderer module

Rename `packages/app/src/view.ts` to `renderer.ts`. The larger module resolves
either an application-supplied View or an authored Layout; retaining the old
filename would name the whole after only one variant.

Use direct authored values in the subject:

```ts
interface RendererSubject {
  readonly cards: readonly Card[];
  readonly graphs: readonly Graph[];
}

interface ViewConversion {
  readonly graphs: readonly [Graph, ...Graph[]];
}

interface ResolvedViewRenderer {
  readonly kind: 'view';
  readonly id: BuiltInViewId;
  readonly title: string;
  readonly subject: RendererSubject;
  readonly strategy: LayoutStrategy;
  readonly defaultActiveGraph: Graph | null;
  readonly convert: (rendered: Placement) => ViewConversion;
}

interface ResolvedLayoutRenderer {
  readonly kind: 'layout';
  readonly resolvedLayout: ResolvedLayout;
  readonly subject: RendererSubject;
  readonly strategy: LayoutStrategy;
}

type ResolvedRenderer = ResolvedViewRenderer | ResolvedLayoutRenderer;

interface RendererResolverDependencies {
  readonly newGraphId: () => GraphId;
}

type ResolveRenderer = (
  space: Space,
  selection?: RendererSelection,
) => ResolvedRenderer;

function createRendererResolver(
  dependencies: RendererResolverDependencies,
): ResolveRenderer;
```

Subject rules:

- Flow/Grid select all `space.cards` and the derived `space.graphs` flatten.
- A Layout renderer selects Layout members in stable `space.cards` order and
  its owned Graphs in authored order.
- subject values are exact values from the source `Space`, not ids, clones or
  synthetic authored entities.
- reject duplicate subject identities or values that are not the canonical
  values resolved from the source `Space`.
- do not brand `RendererSubject`; it is a transparent value.
- subject selection and View Graph policies are pure.

`defaultActiveGraph` is used only when Navigation opens or explicitly selects a
View renderer. A Layout's default is already available through
`resolvedLayout.activeGraph`. `continueInRenderer` preserves the Active Graph
provided by the completed Edit and must not silently apply a renderer default.

Remove `visibleGraphIds`, `activeGraphId` from the resolved-renderer interface,
and `viewShowsGraph`. Graph membership is
`renderer.subject.graphs.some(graph => graph.id === graphId)`.

Keep `RendererSelection` closed over `BuiltInViewId` and Layout UUIDs. Public
View registration is future work because persisted View ids and missing-plugin
behavior are not decided. Build Flow and Grid through a private immutable
registry now so several definitions exercise one internal module shape without
creating a hypothetical public seam.

Each private View definition supplies:

- title;
- a pure subject selector;
- a `createStrategy` factory;
- a pure identity-free Graph policy.

Keep icons out of the framework-neutral module. The UI may continue mapping the
closed built-in ids to icons.

### 4. Conversion and nondeterminism

Compose one resolver in `createApp` and give that same `ResolveRenderer`
function to App rendering, Navigation and Space Authoring. Do not let each
collaborator call a global resolver or compose its own identity source.

Record this standing principle in `AGENTS.md` beside the functional-core rule:

> Inject nondeterminism once when composing a module, not through each domain
> operation. A module that mints identities, reads time or otherwise depends on
> a nondeterministic in-process function receives it at composition so tests can
> supply a deterministic one; its operational interface stays in domain
> language. Do not hide nondeterminism behind global mocking, and do not
> manufacture a port or adapter seam for one in-process implementation.

Conversion is synchronous. It receives the completed rendered Placement and
returns only fresh Graphs. Space Authoring already owns the Placement and uses
it to construct the new Layout.

Private policies operate on identity-free Graph content:

```ts
type GraphWithoutId = Omit<Graph, 'id'>;

type ViewGraphPolicy = (
  space: Space,
  subject: RendererSubject,
  placement: Placement,
) => readonly [GraphWithoutId, ...GraphWithoutId[]];
```

Conversion order is fixed:

1. Verify Placement keys exactly equal the subject Card ids.
2. Run the pure View Graph policy.
3. Verify non-empty output, duplicate Edges and Edge closure against Placement.
4. Mint every Graph id through the composition-supplied `newGraphId`.
5. Reject an id already used by a source Space Graph or repeated in this output.
6. Return identified Graphs.

Validate policy output before minting any identity. Never retry a colliding
identity source silently.

Flow and Grid each explicitly choose one neutrally titled, uncoloured, empty
Graph on conversion. This does not require an input Graph: either View renders a
new Space with zero Graphs, and the empty Graph exists only when an Edit creates
a Layout whose Graph collection must be non-empty.

The shared renderer module adds ids only. The View policy owns title, colour and
Edges. A future View may copy or prune Graph content while the shared module
still makes source-id reuse unrepresentable.

Use one exported `RendererInvariantError` with stable reasons:

```text
renderer-not-found
invalid-subject
placement-does-not-match-subject
empty-graph-output
graph-edge-outside-placement
duplicate-graph-edge
graph-id-not-fresh
```

These are programming/composition defects and throw. They are not author
refusals and Space Authoring must not convert them to `no-edit`.

Resolve the renderer at completion execution time. A queued completion retains
its completed interaction facts, rendered Placement and replacement epoch, not
an old `ResolvedRenderer`. If an earlier Edit converted the View, the later Edit
applies to the resulting Layout; a replaced Space is discarded through the
existing epoch rule.

### 5. Neutral titles

`packages/app/src/titles.ts` already exists on the baseline. Deepen its interface
from the generic helper used ad hoc by callers into the shared deterministic
policy for neutral authored titles:

```ts
nextCardTitle(...)
nextLayoutTitle(...)
nextGraphTitle(...)
```

Keep the `<Prefix> N` arithmetic private. Renderer policies and Space Authoring
call the named functions. Do not inject this deterministic rule.

## Deliberate temporary exception: fallback Cards

The merged baseline intentionally retains the omitted-Card fallback band until
package 5 builds Cards View, Add to Layout and Remove from Layout together.

Therefore this handoff must **not** make a selected Layout's canvas projection
omit fallback Cards yet. Introduce the exact `RendererSubject.cards` and use it
for:

- View conversion validation;
- renderer invariants;
- the eventual package-5 cutover.

Migrate Graph projection immediately to `renderer.subject.graphs`, but leave the
existing fallback-Card projection behavior standing. Document the one deferred
read beside it. Package 5 will replace the projection's Card source with
`renderer.subject.cards` when it removes the fallback band and its guards.

Do not add a second subject field such as `projectedCards`; that would turn the
temporary workaround into another interface.

## Implementation sequence

Every step below is a green commit. This is a refactor over an already migrated
aggregate, so there is no reason for a deliberately red branch.

### Step 0 — establish the latest baseline

- Branch from `origin/main` at `00e7962` or later.
- Preserve/reconcile the old untracked scratch copies before switching the
  working tree.
- Run `pnpm verify` and `pnpm e2e` before editing.
- Do not start or touch the human's server on port 5173.

Gate: the baseline bars pass.

### Step 1 — deepen Space intake and diagnostics

Primary files:

- `packages/graph/src/space.ts`
- `packages/graph/src/lookup.ts`
- `packages/graph/src/validate.ts`
- `packages/graph/src/index.ts`
- every caller of `getCard`, `getGraph`, `getGraphOwner`, `getLayout`, or public
  `*ById` Maps
- graph package surface and intake tests

Work:

1. Build canonical `ResolvedLayout` values and then canonical `OwnedGraph`
   values in the private intake core.
2. Close private Maps over the three lookup methods and put one `lookup` value
   on `Space`.
3. Add the compiler-only intake brand.
4. Migrate all package and app callers to `space.lookup`.
5. Keep `resolveContentCard` and rewrite it through lookup.
6. Remove public Maps and shallow `get*` operations in the same commit.
7. Apply the diagnostic hard cut and root-cause suppression.
8. Export the contextual interface types and update the curated surface test.
9. Replace direct `validateReferences` aggregate tests with loader-contract
   tests. Keep private helper tests only when behavior is independent of intake.

Gate: `pnpm verify` and `pnpm e2e` green.

### Step 2 — rename and deepen the renderer module

Primary files:

- `packages/app/src/view.ts` -> `packages/app/src/renderer.ts`
- `packages/app/src/titles.ts`
- `packages/app/src/App.tsx`
- `packages/app/src/navigation.ts`
- `packages/app/src/space-authoring.ts`
- `packages/app/src/canvas-projection.ts`
- app renderer, Navigation, authoring and projection tests
- `AGENTS.md`

Work:

1. Add named neutral-title operations.
2. Add the composition-time nondeterminism principle.
3. Create the private built-in View registry.
4. Implement `createRendererResolver` and the discriminated renderer variants.
5. Validate exact subject values and stable subject ordering.
6. Implement identity-free policies and the shared conversion order.
7. Add `RendererInvariantError` and reason codes.
8. Compose one resolver in `createApp` and inject it into Navigation and Space
   Authoring.
9. Replace `ResolvedView`, global `resolveView`, `convertView`, `ConvertedLayout`,
   `visibleGraphIds`, and `viewShowsGraph`.
10. Make canvas Graph projection consume exact subject Graphs.
11. Preserve fallback Card projection under the documented temporary exception.
12. Preserve the combined `continueInRenderer(selection, activeGraphId)`
    operation and existing install ordering.

Gate: `pnpm verify`, `pnpm e2e`, and `pnpm build` green.

### Step 3 — replace tests at the new interfaces

This normally lands with Steps 1 and 2; keep it separate only if review size
requires it. Do not layer a new suite over old internal-interface tests.

Space intake shared contract runs against both loaders and proves:

- flatten order and exact Graph identity;
- canonical lookup stability;
- Graph owner and resolved Active Graph identity;
- authored Active Graph absence preservation;
- missing versus outside-Layout endpoint diagnostics;
- missing versus outside-Layout Active Graph diagnostics;
- one duplicate-Graph-id error naming every occurrence;
- independent error accumulation without cascades.

Property tests prove:

- `space.graphs` is the identity-preserving Layout/Graph flatten;
- every Graph lookup returns its unique canonical owner;
- every resolved Active Graph belongs to its Layout;
- every accepted Edge endpoint is a Layout member;
- no duplicate Graph id is accepted;
- valid input permutations preserve authored Layout and Graph order.

Renderer tests go only through a composed deterministic resolver and prove:

- View versus Layout discrimination;
- exact Card/Graph subjects and order;
- Layout canonical `ResolvedLayout` reuse;
- default Active Graph behavior when opening/selecting;
- conversion is unavailable on the Layout variant;
- exact Placement membership;
- output closure and duplicate-Edge refusal;
- all Graph ids are fresh against source and siblings;
- invalid policy output consumes no identities;
- repeated conversion mints fresh results;
- Flow/Grid render with zero input Graphs and return one empty Graph only on
  conversion;
- an emphasised View Graph does not alter conversion policy;
- queued completion re-resolves and does not create competing Layouts.

Delete direct tests of `validateReferences`, `get*`, `convertView`, private View
policies and private registry shape when their behavior is covered through the
new module interfaces.

Gate: `pnpm verify` green with coverage thresholds preserved or improved.

### Step 4 — documentation and final integration

- Reconcile `AGENTS.md` package-layout descriptions with `Space.lookup` and
  `ResolvedRenderer`.
- Keep `CONTEXT.md` unchanged unless implementation discovers a real domain-term
  ambiguity. This refactor is using already-decided language.
- Do not rewrite the completed first-public aggregate tickets as though they had
  originally used this interface.
- Update active implementation handoff text only where it describes a current
  code interface that no longer exists.
- Scan for removed names and stale vocabulary.

Required scan:

```text
cardsById
graphsById
layoutsById
layoutByGraphId
getCard(
getGraph(
getGraphOwner(
getLayout(
ResolvedView
resolveView
convertView
ConvertedLayout
visibleGraphIds
viewShowsGraph
```

Qualified historical discussion in accepted records may remain; current code,
tests and standing guidance may not.

Final gate:

```text
pnpm verify
pnpm e2e
pnpm build
```

No PostgreSQL run is required because this handoff changes no stored, imported,
exported or HTTP shape. If implementation unexpectedly touches persistence or
wire projection, stop and re-scope rather than silently widening the bar.

## Proof and test placement

| Concern | Authoritative proof |
| --- | --- |
| Shape/cardinality | `@project/core` schema tests already on baseline |
| Aggregate ownership/indexing | shared loader contract + graph properties |
| Lookup consumer behavior | callers through `space.lookup` |
| Alias content semantics | `resolveContentCard` tests |
| Renderer subject/conversion | composed resolver examples + properties |
| Queue/replacement ordering | Space Authoring interface tests |
| Navigation defaults/continuation | Navigation interface tests |
| Canvas Graph projection | canvas projection unit/property tests |
| Browser behavior | existing database-free Playwright suite |

## Non-goals

- No document-version or persistence migration.
- No public View registration interface.
- No arbitrary persisted View ids or missing-plugin policy.
- No Cards View, Add to Layout, Remove from Layout, or fallback-band deletion.
- No semantic-Edit-core redesign beyond adapting it to `ResolveRenderer`; that
  is candidate 3 and follows this work.
- No Graph management, Edge lifecycle or deletion features.
- No runtime deep freezing.
- No owner-qualified Graph ids or handle ids.
- No compatibility aliases for removed runtime interfaces.

## Baseline verification recorded while writing

Validated in an isolated worktree at `origin/main` `00e7962`, then fast-forwarded
into the local `main` checkout at the same commit:

- `pnpm verify`: passed — 96 test files, 952 tests.
- `pnpm e2e`: passed — 72 Chromium tests.

The Vitest run emitted an existing Radix Select warning in the passing
`card-authoring.test.tsx` conversion case: controlled/uncontrolled state changed.
It is not caused by this planned refactor. Preserve visibility of the warning;
do not claim this work introduced or fixed it without separate evidence.
