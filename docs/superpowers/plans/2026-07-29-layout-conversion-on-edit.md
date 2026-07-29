# Layout Conversion on Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep automatic placement as runtime-only state until the first completed edit, then persist the arrangement already on screen without moving any other card.

**Architecture:** The existing editor store remains the single owner of React Flow's live nodes and the nullable authoritative Layout placement. It also retains each node's position at the start of a drag, because React Flow sends moving and settled updates in separate callbacks and the settled callback commonly repeats the last moving coordinates. A small pure composition helper prepares a persistence snapshot from a completed editor revision; `App` advances its submission watermark only after preparation succeeds and immediately before handing the snapshot to the existing `SpaceSession`.

**Tech Stack:** Node 24+, pnpm 9, TypeScript strict mode, React 18, Zustand 5, React Flow 12, Vitest 2, fast-check 3, Playwright 1.49.

## Global Constraints

- Execute this plan in a fresh worktree on a new branch from local `main`; use `superpowers:using-git-worktrees` at execution time.
- Suggested branch: `positioned-layout-12-convert-on-edit`; suggested worktree: `.worktrees/positioned-layout-12-convert-on-edit`.
- The plan is currently untracked in the source checkout. Commit this plan to local `main` before creating the execution worktree, and do not sweep unrelated changes into that commit.
- Loading an automatic view may compute and retain live node geometry, but it must not create authored positions, increment the completed-edit revision, or submit persistence.
- Loading a positioned view may initialize the editor from the Layout's already-authored, possibly sparse positions; this is a read, not an edit, and leaves the revision at zero.
- A first completed movement in an automatic view promotes every card currently on screen, with the edited card's settled coordinates. Once authored positions exist, they remain authoritative and may be sparse.
- Detect completed movement against the per-node gesture origin. Never compare a settled callback only with the immediately preceding live-node frame.
- A settled-only callback falls back safely to that node's pre-callback live position.
- A click, or a drag that returns to its gesture origin, is not an edit: it leaves automatic-view positions null, leaves the revision unchanged, and submits nothing.
- Auto-arrange remains an explicit edit, replaces authored placement with the strategy's possibly sparse `layoutPositions` map, increments the revision, and clears any retained drag origins. Issue 15's no-op Auto-arrange decision remains out of scope.
- Keep runtime nodes, authored positions, completed-edit revision and drag origins in the existing editor store. Do not add an edit mode, a second store, or strategy-specific behavior.
- Keep `updatePositionedLayout` non-nullable. The new composition helper owns narrowing before it calls that function.
- Do not implement issue 13's post-conversion rendering switch, ADR 0021 structural create/delete/connect commands, or PostgreSQL adapter work.
- Use `import type` for type-only imports and extensionless relative imports.
- Do not start, stop, restart, or drive the human's development server on ports 5173/5174.
- Run `pnpm verify` and `pnpm e2e` before resolving issue 12.

## File Map

- Modify `packages/app/src/editor.ts`: distinguish live arrangement from nullable authored placement; retain and consume per-node drag origins.
- Modify `packages/app/test/editor.test.ts`: model separate React Flow callbacks and add example plus property coverage for conversion invariants.
- Create `packages/app/src/completed-edit.ts`: pure preparation of a snapshot for one not-yet-submitted completed editor revision.
- Create `packages/app/test/completed-edit.test.ts`: exercise automatic and positioned edits through the pure preparation seam and the real memory-backed `SpaceSession`.
- Modify `packages/app/src/App.tsx`: initialize existing Layout positions, use the preparation helper, and order the submission watermark safely.
- Modify `packages/app/e2e/editing.spec.ts`: retain the real-pointer first-drag scenario and prove Auto-arrange advances persistence.
- Modify `.scratch/positioned-layout/issues/12-conversion-fires-on-the-edit-not-on-the-first-frame.md`: record the implemented answer and exact verification evidence.

---

### Task 1: Establish the isolated execution baseline

**Files:**
- Verify: `docs/superpowers/plans/2026-07-29-layout-conversion-on-edit.md`
- No production or test files change in this task.

**Interfaces:**
- Consumes: local `main` containing this exact plan.
- Produces: clean worktree branch `positioned-layout-12-convert-on-edit` at local `main`.

- [x] **Step 1: Prove the plan is present on local `main` before branching**

From the source checkout, run:

```bash
git status --short
git ls-tree -r --name-only main -- docs/superpowers/plans/2026-07-29-layout-conversion-on-edit.md \
  | rg '^docs/superpowers/plans/2026-07-29-layout-conversion-on-edit\.md$'
```

Expected: `git status --short` contains no unexplained changes, and the second command prints the plan path exactly once. If it prints nothing, stop: the plan is not on `main`. In the known starting state, add only this plan, inspect the staged diff, and commit it before continuing:

```bash
git add docs/superpowers/plans/2026-07-29-layout-conversion-on-edit.md
git diff --cached --check
git diff --cached -- docs/superpowers/plans/2026-07-29-layout-conversion-on-edit.md
git commit -m "Plan layout conversion on edit"
```

Do not include any other tracked or untracked file in that commit. Repeat the `git ls-tree` check after committing.

- [x] **Step 2: Create the isolated worktree**

Invoke `superpowers:using-git-worktrees`. Its native-git fallback is:

```bash
git worktree add .worktrees/positioned-layout-12-convert-on-edit \
  -b positioned-layout-12-convert-on-edit main
cd .worktrees/positioned-layout-12-convert-on-edit
git status --short
git merge-base --is-ancestor main HEAD
```

Expected: the worktree is clean, checked out on `positioned-layout-12-convert-on-edit`, and the ancestry check exits zero. If the branch or worktree already exists, inspect it rather than deleting or overwriting it.

- [x] **Step 3: Install and verify the clean baseline**

Run:

```bash
pnpm install --frozen-lockfile
pnpm test
```

Expected: installation succeeds without changing `pnpm-lock.yaml`, and the existing Vitest suite passes before implementation begins.

---

### Task 2: Record drag origins and convert only on completed movement

**Files:**
- Modify: `packages/app/test/editor.test.ts`
- Modify: `packages/app/src/editor.ts`

**Interfaces:**
- Consumes: `CardFlowNode[]` supplied to `EditorState.syncNodes(projected)` after a strategy resolves.
- Produces: `createEditorStore(initialPositions?: ReadonlyMap<string, LayoutPoint> | null): EditorStore`.
- Produces: `EditorState.positions: ReadonlyMap<string, LayoutPoint> | null`; null means an automatic view has not yet been converted, while a non-null value is authoritative authored placement and may be sparse.
- Produces internally: `EditorState.dragOrigins: ReadonlyMap<string, LayoutPoint>`, keyed by node id for gestures currently in flight.
- Produces internally: `positionsForEdit(nodes, positions): Map<string, LayoutPoint>`; when positions are null it copies all current live nodes, otherwise it clones the existing possibly sparse authored map.
- Preserves: `EditorState.changeNodes(changes): void`, `EditorState.arrange(positions): void`, `EditorState.moved`, and monotonically increasing `EditorState.revision`.
- Guarantees: a positive revision always carries non-null authoritative positions; no in-flight gesture increments the revision.

- [x] **Step 1: Replace the test drag helper with separate callback helpers**

In `packages/app/test/editor.test.ts`, import fast-check and `LayoutPoint`, then replace the batched `drag` helper with helpers that match React Flow's callback lifecycle:

```ts
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { LayoutPoint } from '@project/graph';
import type { NodeChange } from '@xyflow/react';

function moving(id: string, x: number, y: number): NodeChange<CardFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: true }];
}

function settled(id: string, x: number, y: number): NodeChange<CardFlowNode>[] {
  return [{ type: 'position', id, position: { x, y }, dragging: false }];
}

function completeDrag(
  store: ReturnType<typeof createEditorStore>,
  id: string,
  x: number,
  y: number,
): void {
  store.getState().changeNodes(moving(id, x, y));
  store.getState().changeNodes(settled(id, x, y));
}

function authoredPositions(
  store: ReturnType<typeof createEditorStore>,
): ReadonlyMap<string, LayoutPoint> {
  const positions = store.getState().positions;
  if (positions === null) throw new Error('Expected authored positions');
  return positions;
}
```

The final settled callback deliberately repeats the moving callback's coordinates. Do not retain a helper that sends moving and settled changes in one `changeNodes` call; that shape masks the bug this task fixes.

- [x] **Step 2: Write failing examples for automatic-view conversion**

Replace the initial and first-sync expectations with `positions === null`, `dragOrigins.size === 0`, and `revision === 0`. Add these focused tests:

```ts
it('converts when settlement repeats the last moving frame', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);

  store.getState().changeNodes(
    moving('00000000-0000-4000-8000-000000000002', 500, 400),
  );
  expect(store.getState().positions).toBeNull();
  expect(store.getState().revision).toBe(0);
  expect(store.getState().dragOrigins.get('00000000-0000-4000-8000-000000000002')).toEqual({
    x: 10,
    y: 20,
  });

  store.getState().changeNodes(
    settled('00000000-0000-4000-8000-000000000002', 500, 400),
  );
  expect(authoredPositions(store)).toEqual(
    new Map([
      ['00000000-0000-4000-8000-000000000002', { x: 500, y: 400 }],
      ['00000000-0000-4000-8000-000000000003', { x: 300, y: 20 }],
    ]),
  );
  expect(store.getState().dragOrigins.size).toBe(0);
  expect(store.getState().revision).toBe(1);
});

it('does not convert when a drag returns to its gesture origin', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);
  store.getState().changeNodes(
    moving('00000000-0000-4000-8000-000000000002', 500, 400),
  );
  store.getState().changeNodes(
    settled('00000000-0000-4000-8000-000000000002', 10, 20),
  );

  expect(store.getState().positions).toBeNull();
  expect(store.getState().dragOrigins.size).toBe(0);
  expect(store.getState().revision).toBe(0);
  expect(store.getState().moved).toBe(false);
});

it('uses the pre-callback position for a settled-only change', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);
  store.getState().changeNodes(
    settled('00000000-0000-4000-8000-000000000002', 500, 400),
  );

  expect(authoredPositions(store).get('00000000-0000-4000-8000-000000000002')).toEqual({
    x: 500,
    y: 400,
  });
  expect(store.getState().revision).toBe(1);
});
```

- [x] **Step 3: Write failing examples for later edits, Auto-arrange and projection changes**

Add these cases:

```ts
it('records a subsequent drag against its own origin after conversion', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);
  completeDrag(store, '00000000-0000-4000-8000-000000000002', 500, 400);
  completeDrag(store, '00000000-0000-4000-8000-000000000003', 700, 450);

  expect(authoredPositions(store)).toEqual(
    new Map([
      ['00000000-0000-4000-8000-000000000002', { x: 500, y: 400 }],
      ['00000000-0000-4000-8000-000000000003', { x: 700, y: 450 }],
    ]),
  );
  expect(store.getState().revision).toBe(2);
});

it('makes direct Auto-arrange the first authored edit and clears gesture origins', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);
  store.getState().changeNodes(
    moving('00000000-0000-4000-8000-000000000002', 90, 80),
  );
  const arranged = new Map([
    ['00000000-0000-4000-8000-000000000002', { x: 0, y: 0 }],
  ]);

  store.getState().arrange(arranged);

  expect(authoredPositions(store)).toEqual(arranged);
  expect(authoredPositions(store).has('00000000-0000-4000-8000-000000000003')).toBe(false);
  expect(store.getState().dragOrigins.size).toBe(0);
  expect(store.getState().revision).toBe(1);
});

it('converts exactly the current projection after cards were added and removed', () => {
  const store = createEditorStore();
  store.getState().syncNodes(PROJECTED);
  store.getState().syncNodes([
    node('00000000-0000-4000-8000-000000000003', 300, 20),
    node('00000000-0000-4000-8000-000000000004', 600, 20),
  ]);

  completeDrag(store, '00000000-0000-4000-8000-000000000003', 350, 90);

  expect(authoredPositions(store)).toEqual(
    new Map([
      ['00000000-0000-4000-8000-000000000003', { x: 350, y: 90 }],
      ['00000000-0000-4000-8000-000000000004', { x: 600, y: 20 }],
    ]),
  );
});
```

Also add a positioned-view initialization test. It proves an existing Layout remains sparse and does not count as a new edit:

```ts
it('starts a positioned view from its existing sparse authored placement', () => {
  const initial = new Map([
    ['00000000-0000-4000-8000-000000000002', { x: 10, y: 20 }],
  ]);
  const store = createEditorStore(initial);
  store.getState().syncNodes(PROJECTED);

  expect(authoredPositions(store)).toEqual(initial);
  expect(authoredPositions(store).has('00000000-0000-4000-8000-000000000003')).toBe(false);
  expect(store.getState().revision).toBe(0);
});
```

- [x] **Step 4: Migrate every old nullable assertion, then verify the migration is exhaustive**

Update every existing editor test according to the state it exercises:

- Before layout, after automatic first sync, during a first in-flight drag, after an ignored pre-layout change, after an ignored pre-layout arrange, and after a no-op first settlement: assert `positions` is exactly null.
- After a real completed edit, positioned initialization, or Auto-arrange: use `authoredPositions(store)` before `.get`, `.has`, `.keys` or map equality.
- Preserve existing assertions for node identity, re-sync position retention, refreshed styling, unowned changes, `moved`, sparse Auto-arrange replacement and revision counts.
- Change the old batched drag calls to `completeDrag` so every test exercises separate moving and settled callbacks.

Run this scan:

```bash
rg -n 'getState\(\)\.positions\.(size|get|has|keys)' packages/app/test/editor.test.ts
```

Expected: no output. A remaining direct dereference means a nullable-state migration was missed.

- [x] **Step 5: Add focused fast-check properties**

Add the following generators and properties to `packages/app/test/editor.test.ts`:

```ts
const coordinateArb = fc.integer({ min: -10_000, max: 10_000 });
const liveNodesArb = fc.uniqueArray(
  fc.record({ id: fc.uuid(), x: coordinateArb, y: coordinateArb }),
  { selector: ({ id }) => id, minLength: 1, maxLength: 12 },
);

describe('editor conversion properties', () => {
  it('promotes every current live node and overlays the first completed movement', () => {
    fc.assert(
      fc.property(
        liveNodesArb,
        fc.nat(),
        fc.integer({ min: 1, max: 1000 }),
        (rows, rawIndex, delta) => {
          const projected = rows.map(({ id, x, y }) => node(id, x, y));
          const target = projected[rawIndex % projected.length]!;
          const destination = { x: target.position.x + delta, y: target.position.y - delta };
          const store = createEditorStore();
          store.getState().syncNodes(projected);

          store.getState().changeNodes(moving(target.id, destination.x, destination.y));
          expect(store.getState().positions).toBeNull();
          store.getState().changeNodes(settled(target.id, destination.x, destination.y));

          const expected = new Map<string, LayoutPoint>(
            projected.map((candidate): [string, LayoutPoint] => [
              candidate.id,
              candidate.id === target.id ? destination : { ...candidate.position },
            ]),
          );
          expect(authoredPositions(store)).toEqual(expected);
          expect(store.getState().revision).toBe(1);
          expect(store.getState().dragOrigins.size).toBe(0);
        },
      ),
    );
  });

  it('never converts a drag that returns to its generated origin', () => {
    fc.assert(
      fc.property(
        liveNodesArb,
        fc.nat(),
        fc.integer({ min: 1, max: 1000 }),
        (rows, rawIndex, delta) => {
          const projected = rows.map(({ id, x, y }) => node(id, x, y));
          const target = projected[rawIndex % projected.length]!;
          const store = createEditorStore();
          store.getState().syncNodes(projected);

          store
            .getState()
            .changeNodes(moving(target.id, target.position.x + delta, target.position.y));
          store.getState().changeNodes(settled(target.id, target.position.x, target.position.y));

          expect(store.getState().positions).toBeNull();
          expect(store.getState().revision).toBe(0);
          expect(store.getState().dragOrigins.size).toBe(0);
        },
      ),
    );
  });
});
```

- [x] **Step 6: Run the focused suite and verify red**

Run:

```bash
pnpm exec vitest run packages/app/test/editor.test.ts
```

Expected: failures show that the current store seeds positions on first sync, has no drag-origin state, and misses a completed move when moving and settled callbacks carry the same final position.

- [x] **Step 7: Implement nullable authored placement and drag-origin tracking**

In `packages/app/src/editor.ts`, replace the module and field comments with this contract:

```ts
/**
 * The editor store is the single owner of React Flow's live node array and the
 * authoritative authored placement, when one exists.
 *
 * Live nodes absorb every intermediate React Flow change so controlled dragging
 * follows the pointer. `positions` is different: it is null while an automatic
 * arrangement remains runtime-only, or a possibly sparse Layout map after an
 * existing Layout is opened or an edit authors one. `revision` advances only for
 * completed edits. `dragOrigins` retains gesture starts across React Flow's
 * separate moving and settled callbacks.
 */
```

Change the state and factory declarations:

```ts
export interface EditorState {
  nodes: CardFlowNode[] | null;
  /** Authoritative, possibly sparse Layout placement; null before conversion. */
  positions: ReadonlyMap<string, LayoutPoint> | null;
  /** Gesture starts retained until each node receives a settled callback. */
  dragOrigins: ReadonlyMap<string, LayoutPoint>;
  moved: boolean;
  /** Number of completed placement edits; initial synchronization is not one. */
  revision: number;
  syncNodes: (projected: readonly CardFlowNode[]) => void;
  arrange: (positions: ReadonlyMap<string, LayoutPoint>) => void;
  changeNodes: (changes: NodeChange<CardFlowNode>[]) => void;
}

function positionsForEdit(
  nodes: readonly CardFlowNode[],
  positions: ReadonlyMap<string, LayoutPoint> | null,
): Map<string, LayoutPoint> {
  return new Map(positions ?? positionsOf(nodes));
}

export function createEditorStore(
  initialPositions: ReadonlyMap<string, LayoutPoint> | null = null,
): EditorStore {
  return create<EditorState>((set) => ({
    nodes: null,
    positions: initialPositions === null ? null : new Map(initialPositions),
    dragOrigins: new Map(),
    moved: false,
    revision: 0,
```

The first `syncNodes` branch must retain nodes without creating positions:

```ts
if (state.nodes === null) {
  return { nodes: [...projected] };
}
return { nodes: reconcile(state.nodes, projected) };
```

Change `arrange` to clear gesture state and preserve sparse replacement semantics:

```ts
return {
  nodes,
  positions: new Map(positions),
  dragOrigins: new Map(),
  moved: false,
  revision: state.revision + 1,
};
```

- [x] **Step 8: Implement settlement against the gesture origin**

In `changeNodes`, retain the current owned-change filter. Replace the settlement logic after `applyNodeChanges` with this map-based implementation; do not use repeated `nodes.find` scans:

```ts
const beforeById = new Map(state.nodes.map((node) => [node.id, node.position]));
const nodes = applyNodeChanges(relevant, state.nodes);
const afterById = new Map(nodes.map((node) => [node.id, node.position]));
const positionChanges = relevant.filter(
  (change): change is NodePositionChange => change.type === 'position',
);
const dragOrigins = new Map(state.dragOrigins);

for (const change of positionChanges) {
  if (change.dragging !== true || dragOrigins.has(change.id)) continue;
  const origin = beforeById.get(change.id);
  if (origin !== undefined) dragOrigins.set(change.id, { x: origin.x, y: origin.y });
}

const settled = positionChanges.filter((change) => change.dragging === false);
if (settled.length === 0) return { nodes, dragOrigins };

const movedIds: string[] = [];
for (const change of settled) {
  const origin = dragOrigins.get(change.id) ?? beforeById.get(change.id);
  const after = afterById.get(change.id);
  dragOrigins.delete(change.id);
  if (
    origin !== undefined &&
    after !== undefined &&
    (origin.x !== after.x || origin.y !== after.y)
  ) {
    movedIds.push(change.id);
  }
}

if (movedIds.length === 0) return { nodes, dragOrigins };

const positions = positionsForEdit(nodes, state.positions);
for (const id of movedIds) {
  const after = afterById.get(id);
  if (after !== undefined) positions.set(id, { x: after.x, y: after.y });
}
return {
  nodes,
  positions,
  dragOrigins,
  moved: true,
  revision: state.revision + 1,
};
```

Why `positionsForEdit(nodes, ...)` is deliberate:

- For an automatic view, null positions cause the first completed movement to capture every current on-screen card, including projection additions and excluding removals; moved coordinates are then explicitly overlaid.
- For a positioned view or later edit, non-null positions are cloned rather than densified, preserving sparse authored semantics except for cards actually moved.
- `dragOrigins` answers whether a gesture moved. The live node map answers what is on screen. These are separate questions.

- [x] **Step 9: Run focused tests, typechecks and mutation review**

Run:

```bash
pnpm exec vitest run packages/app/test/editor.test.ts
pnpm typecheck
pnpm typecheck:packages
```

Expected: all editor examples and properties pass, and both TypeScript programs pass.

Review these concrete mutations without committing them:

- Removing `dragOrigins` and comparing `beforeById` with `afterById` makes the separate-callback test fail.
- Seeding positions in `syncNodes` makes the automatic-load and in-flight-null tests fail.
- Failing to delete an origin on settlement makes the away/return and subsequent-drag tests fail.
- Building a null map from only moved ids makes the first-conversion property and projection add/remove test fail.
- Merging Auto-arrange into existing positions makes the sparse replacement test fail.

- [x] **Step 10: Commit the independently green editor behavior**

```bash
git add packages/app/src/editor.ts packages/app/test/editor.test.ts
git diff --cached --check
git commit -m "Convert automatic placement on completed drag"
```

---

### Task 3: Prepare completed-edit snapshots and verify the app/session seam

**Files:**
- Create: `packages/app/src/completed-edit.ts`
- Create: `packages/app/test/completed-edit.test.ts`
- Modify: `packages/app/src/App.tsx`

**Interfaces:**
- Consumes: `SpaceSnapshot`, a submission watermark, `EditorState.revision`, nullable `EditorState.positions`, and the resolved Layout target.
- Produces: `preparePlacementSubmission(base, submittedRevision, edit, target): PlacementSubmission | null`.
- Produces: `PlacementSubmission = { revision: number; snapshot: SpaceSnapshot }` only for a positive not-yet-submitted revision with non-null positions.
- Preserves: `updatePositionedLayout(base, layoutId, title, positions, activeRouteId)` as the non-nullable persistence transformation.
- Preserves: `SpaceSession.submit(snapshot)` as the only persistence call.

- [x] **Step 1: Write failing automatic-view composition coverage**

Create `packages/app/test/completed-edit.test.ts` with these imports, fixtures and local helpers:

```ts
import { describe, expect, it } from 'vitest';
import { uuidSchema, type Layout, type SpaceSnapshot } from '@project/core';
import type { SpaceSessionState } from '@project/persistence';
import { MemorySpaceBackend, openSpaceSession } from '@project/persistence';
import type { NodeChange } from '@xyflow/react';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { createEditorStore } from '../src/editor';
import { preparePlacementSubmission } from '../src/completed-edit';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_A = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const ROUTE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DEFAULT_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000021');
const OTHER_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000022');

const automaticSnapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: {
    version: 2,
    title: 'Space',
    routes: [{ id: ROUTE_ID, title: 'Main', edges: [{ from: CARD_A, to: CARD_B }] }],
  },
  cards: [
    { id: CARD_A, document: { title: 'A', kind: 'markdown', body: 'A' } },
    { id: CARD_B, document: { title: 'B', kind: 'markdown', body: 'B' } },
  ],
};

const defaultLayout: Layout = {
  id: DEFAULT_LAYOUT_ID,
  title: 'Authored Layout',
  kind: 'positioned',
  positions: { [CARD_A]: { x: 10, y: 20 } },
  routes: [ROUTE_ID],
};
const otherLayout: Layout = {
  id: OTHER_LAYOUT_ID,
  title: 'Other Layout',
  kind: 'positioned',
  positions: { [CARD_B]: { x: 900, y: 700 } },
};
const positionedSnapshot: SpaceSnapshot = {
  ...automaticSnapshot,
  document: {
    ...automaticSnapshot.document,
    layouts: [defaultLayout, otherLayout],
    defaultView: DEFAULT_LAYOUT_ID,
  },
};

function node(id: string, x: number, y: number): CardFlowNode {
  return {
    id,
    type: 'card',
    position: { x, y },
    className: 'rf-card-node',
    data: {
      cardId: id,
      title: id,
      sourceHandles: [],
      targetHandles: [],
      active: false,
      showContent: false,
      activeRouteId: null,
      emphasis: 'equal',
    },
  };
}

const projected = [node(CARD_A, 10, 20), node(CARD_B, 300, 20)];

const moving = (id: string, x: number, y: number): NodeChange<CardFlowNode>[] => [
  { type: 'position', id, position: { x, y }, dragging: true },
];
const settled = (id: string, x: number, y: number): NodeChange<CardFlowNode>[] => [
  { type: 'position', id, position: { x, y }, dragging: false },
];

const waitForSettled = (
  getState: () => SpaceSessionState,
  subscribe: (listener: () => void) => () => void,
): Promise<SpaceSessionState> => {
  const current = getState();
  if (current.persistence.kind === 'settled') return Promise.resolve(current);
  return new Promise((resolve) => {
    const unsubscribe = subscribe(() => {
      const state = getState();
      if (state.persistence.kind !== 'settled') return;
      unsubscribe();
      resolve(state);
    });
  });
};
```

Add the automatic-view test:

```ts
describe('completed placement composition', () => {
  it('submits nothing on automatic load, then persists all visible cards on first edit', async () => {
    const loaded = { snapshot: automaticSnapshot, revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const session = openSpaceSession(backend, loaded);
    const editor = createEditorStore();
    editor.getState().syncNodes(projected);

    expect(
      preparePlacementSubmission(
        session.getState().working,
        0,
        { revision: editor.getState().revision, positions: editor.getState().positions },
        {
          layoutId: DEFAULT_LAYOUT_ID,
          layoutTitle: 'Layout',
          activeRouteId: ROUTE_ID,
        },
      ),
    ).toBeNull();
    expect(session.getState().acknowledgedRevision).toBe(0n);

    editor.getState().changeNodes(moving(CARD_A, 500, 400));
    editor.getState().changeNodes(settled(CARD_A, 500, 400));
    const prepared = preparePlacementSubmission(
      session.getState().working,
      0,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: DEFAULT_LAYOUT_ID,
        layoutTitle: 'Layout',
        activeRouteId: ROUTE_ID,
      },
    );
    if (prepared === null) throw new Error('Expected a prepared submission');
    session.submit(prepared.snapshot);
    await waitForSettled(session.getState, session.subscribe);

    expect(session.getState().acknowledgedRevision).toBe(1n);
    await expect(backend.loadSpace(SPACE_ID)).resolves.toMatchObject({
      revision: 1n,
      snapshot: {
        document: {
          defaultView: DEFAULT_LAYOUT_ID,
          layouts: [
            {
              id: DEFAULT_LAYOUT_ID,
              activeRoute: ROUTE_ID,
              positions: {
                [CARD_A]: { x: 500, y: 400 },
                [CARD_B]: { x: 300, y: 20 },
              },
            },
          ],
        },
      },
    });
  });
});
```

This test proves loading submits nothing and the first completed edit sends one valid snapshot containing every visible card, the correct active route and the new default view. A revision of exactly `1n` is the one-commit assertion.

- [x] **Step 2: Write failing positioned-view composition coverage**

Add the positioned-view test at top level in the same file:

```ts
it('preserves an existing Layout and unrelated Layouts when its first edit persists', async () => {
  const loaded = { snapshot: positionedSnapshot, revision: 0n, exportedRevision: null };
  const backend = new MemorySpaceBackend([loaded]);
  const session = openSpaceSession(backend, loaded);
  const editor = createEditorStore(new Map(Object.entries(defaultLayout.positions)));
  editor.getState().syncNodes(projected);

  expect(
    preparePlacementSubmission(
      session.getState().working,
      0,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: defaultLayout.id,
        layoutTitle: defaultLayout.title,
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toBeNull();

  editor.getState().changeNodes(moving(CARD_A, 700, 500));
  editor.getState().changeNodes(settled(CARD_A, 700, 500));
  const prepared = preparePlacementSubmission(
    session.getState().working,
    0,
    { revision: editor.getState().revision, positions: editor.getState().positions },
    {
      layoutId: defaultLayout.id,
      layoutTitle: defaultLayout.title,
      activeRouteId: ROUTE_ID,
    },
  );
  if (prepared === null) throw new Error('Expected a prepared submission');
  expect(
    preparePlacementSubmission(
      session.getState().working,
      prepared.revision,
      { revision: editor.getState().revision, positions: editor.getState().positions },
      {
        layoutId: defaultLayout.id,
        layoutTitle: defaultLayout.title,
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toBeNull();
  session.submit(prepared.snapshot);
  await waitForSettled(session.getState, session.subscribe);

  const persisted = await backend.loadSpace(SPACE_ID);
  expect(persisted?.revision).toBe(1n);
  expect(persisted?.snapshot.document.defaultView).toBe(DEFAULT_LAYOUT_ID);
  expect(persisted?.snapshot.document.layouts).toEqual([
    otherLayout,
    {
      id: defaultLayout.id,
      title: defaultLayout.title,
      kind: 'positioned',
      positions: { [CARD_A]: { x: 700, y: 500 } },
      routes: [ROUTE_ID],
      activeRoute: ROUTE_ID,
    },
  ]);
});
```

- [x] **Step 3: Add the invariant test and verify the composition suite is red**

Add this top-level test to `packages/app/test/completed-edit.test.ts`:

```ts
it('rejects a completed revision that has no authored placement', () => {
  expect(() =>
    preparePlacementSubmission(
      automaticSnapshot,
      0,
      { revision: 1, positions: null },
      {
        layoutId: DEFAULT_LAYOUT_ID,
        layoutTitle: 'Layout',
        activeRouteId: ROUTE_ID,
      },
    ),
  ).toThrow('A completed editor revision must carry authored positions.');
});
```

Run:

```bash
pnpm exec vitest run packages/app/test/completed-edit.test.ts
```

Expected: the suite fails because `../src/completed-edit` does not exist. This is the red state before production implementation.

- [x] **Step 4: Write the pure preparation helper**

Create `packages/app/src/completed-edit.ts` with this complete interface and implementation:

```ts
import type { RouteId, SpaceSnapshot, UUID } from '@project/core';
import type { LayoutPoint } from '@project/graph';
import { updatePositionedLayout } from './snapshot';

export interface CompletedPlacementEdit {
  readonly revision: number;
  readonly positions: ReadonlyMap<string, LayoutPoint> | null;
}

export interface PlacementTarget {
  readonly layoutId: UUID;
  readonly layoutTitle: string;
  readonly activeRouteId: RouteId | null;
}

export interface PlacementSubmission {
  readonly revision: number;
  readonly snapshot: SpaceSnapshot;
}

export function preparePlacementSubmission(
  base: SpaceSnapshot,
  submittedRevision: number,
  edit: CompletedPlacementEdit,
  target: PlacementTarget,
): PlacementSubmission | null {
  if (edit.revision === 0 || edit.revision === submittedRevision) return null;
  if (edit.positions === null) {
    throw new Error('A completed editor revision must carry authored positions.');
  }
  return {
    revision: edit.revision,
    snapshot: updatePositionedLayout(
      base,
      target.layoutId,
      target.layoutTitle,
      edit.positions,
      target.activeRouteId,
    ),
  };
}
```

The invariant test from Step 3 keeps impossible editor state from advancing the caller's watermark.

- [x] **Step 5: Run the composition test and verify green**

Run:

```bash
pnpm exec vitest run packages/app/test/completed-edit.test.ts
```

Expected: automatic and positioned composition cases persist one complete, valid snapshot apiece; load and duplicate-revision cases submit nothing; invariant coverage passes.

- [x] **Step 6: Initialize existing authored positions in App**

In `packages/app/src/App.tsx`, replace the editor creation comment and call with:

```ts
// Live nodes hold whichever arrangement is on screen. A positioned view also
// supplies its already-authored, possibly sparse Layout map; an automatic view
// starts null and is promoted only by a completed edit (ADR 0025).
const initialPositions =
  view.layout === null ? null : new Map(Object.entries(view.layout.positions));
const useEditorStore = createEditorStore(initialPositions);
```

Import `preparePlacementSubmission` from `./completed-edit`.

Replace the stale toolbar comment above the Auto-arrange button with:

```tsx
{/* Disabled until the live arrangement resolves. That is when runtime nodes
  are available to drag or replace; an automatic view still has no authored
  placement until either action completes (ADR 0025). */}
```

- [x] **Step 7: Prepare before advancing the submission watermark**

Replace the completed-edit comment and effect with:

```ts
// A completed edit prepares one complete snapshot. Preparation narrows nullable
// authored placement before the local watermark advances; an invariant failure
// therefore cannot mark an unsubmitted revision as submitted. Route activation
// does not increment the editor revision and remains outside persistence.
useEffect(() => {
  const prepared = preparePlacementSubmission(
    spaceSession.getState().working,
    submittedRevision.current,
    { revision, positions: useEditorStore.getState().positions },
    {
      layoutId: persistLayoutId,
      layoutTitle: persistLayoutTitle,
      activeRouteId: useSpaceStore.getState().activeRouteId,
    },
  );
  if (prepared === null) return;
  submittedRevision.current = prepared.revision;
  spaceSession.submit(prepared.snapshot);
}, [revision]);
```

The order of the final three lines is load-bearing: positions are narrowed and the snapshot is constructed first, the watermark advances second, and `submit` follows immediately. Do not assign `submittedRevision.current` before preparation.

- [x] **Step 8: Run focused integration, regression and type checks**

Run:

```bash
pnpm exec vitest run \
  packages/app/test/editor.test.ts \
  packages/app/test/completed-edit.test.ts \
  packages/app/test/snapshot.test.ts \
  packages/app/test/Workspace.test.tsx
pnpm typecheck
pnpm typecheck:packages
```

Expected: all focused tests and both TypeScript programs pass. The existing snapshot tests remain green, proving `updatePositionedLayout` stayed non-nullable and still preserves route scope and unrelated Layouts.

- [x] **Step 9: Commit the independently green composition change**

```bash
git add \
  packages/app/src/App.tsx \
  packages/app/src/completed-edit.ts \
  packages/app/test/completed-edit.test.ts
git diff --cached --check
git commit -m "Persist completed layout conversions"
```

---

### Task 4: Extend browser coverage and complete verification

**Files:**
- Modify: `packages/app/e2e/editing.spec.ts`
- Modify: `.scratch/positioned-layout/issues/12-conversion-fires-on-the-edit-not-on-the-first-frame.md`
- No other production files change in this task.

**Interfaces:**
- Consumes: the editor conversion and submission preparation contracts from Tasks 2 and 3.
- Produces: real-pointer coverage of first automatic conversion and browser evidence that Auto-arrange persists.
- Produces: a resolved local issue with exact verification counts.

- [x] **Step 1: Preserve the real-pointer first-drag test and strengthen its persistence assertion**

Keep `a dragged card stays where it is dropped, and nothing else moves` as a Playwright pointer interaction; do not replace it with programmatic node changes. Add these assertions around its existing drag:

```ts
const persistence = page.getByTestId('persistence-status');
await expect(persistence).toHaveAttribute('data-revision', '0');

await dragBy(page, a, 0, 260);

await expect(persistence).toHaveText('Persisted');
await expect(persistence).toHaveAttribute('data-revision', '1');
```

This proves loading alone does not persist and the real first gesture does.

- [x] **Step 2: Make Auto-arrange prove a second persistence revision**

In `auto-arrange puts a dragged card back, and it stays draggable`, bind the status element and assert the sequence:

```ts
const persistence = page.getByTestId('persistence-status');
await expect(persistence).toHaveAttribute('data-revision', '0');

await dragBy(page, a, 0, 260);
await expect(persistence).toHaveAttribute('data-revision', '1');

await page.getByTestId('auto-arrange-button').click();
await expect(persistence).toHaveText('Persisted');
await expect(persistence).toHaveAttribute('data-revision', '2');
```

Retain the existing position equality and post-arrange draggability assertions. The later drag may advance persistence again; the required Auto-arrange assertion is revision `2` immediately after the button action settles.

- [x] **Step 3: Run focused browser verification**

Run only Playwright's isolated server, never the human's server:

```bash
pnpm exec playwright test packages/app/e2e/editing.spec.ts
```

Expected: all editing scenarios pass on the Playwright-managed port 5273, including the real-pointer first conversion and Auto-arrange revision assertions.

- [x] **Step 4: Run the complete repository verification**

Run:

```bash
pnpm verify
```

Expected: root typecheck, all per-package typechecks, lint, format check and coverage tests pass. Record the exact test-file and test counts printed by Vitest.

- [x] **Step 5: Run the complete browser suite**

Run:

```bash
pnpm e2e
```

Expected: fixture, new-space and invalid-space projects pass on Playwright's ports 5273–5275. Record the exact passed-test count.

- [x] **Step 6: Resolve issue 12 with the verified answer**

In `.scratch/positioned-layout/issues/12-conversion-fires-on-the-edit-not-on-the-first-frame.md`, change `Status: open` to `Status: resolved` and append an `## Answer` section containing these facts:

- An automatic strategy still prepares the complete arrangement in live React Flow nodes during load, but initial synchronization leaves authored positions null and revision zero.
- A positioned view initializes from its existing, possibly sparse Layout without advancing the revision.
- Moving callbacks retain per-node gesture origins; the separate settled callback compares against that origin, clears it, and only a real completed move advances the revision.
- The first automatic-view conversion captures every card currently on screen and overlays edited coordinates without moving any other card.
- A drag returning to its origin and a settled no-op do not convert or submit.
- Auto-arrange remains an explicit authored edit, may replace placement with a sparse map, clears drag origins and persists.
- Snapshot preparation narrows positions and builds the snapshot before `App` advances its submission watermark.
- Include the exact `pnpm verify` and `pnpm e2e` counts recorded in Steps 4 and 5.

- [x] **Step 7: Review scope and commit browser plus issue capture**

Run:

```bash
git diff --check
git status --short
git diff --stat main...HEAD
```

Expected: the branch contains only the editor behavior, its example/property/composition/browser tests, the small snapshot-preparation helper, App wiring and the resolved issue. It contains no issue-13 rendering switch, structural editing, strategy-specific logic, PostgreSQL work or unrelated formatting.

Commit:

```bash
git add \
  packages/app/e2e/editing.spec.ts \
  .scratch/positioned-layout/issues/12-conversion-fires-on-the-edit-not-on-the-first-frame.md
git diff --cached --check
git commit -m "Verify layout conversion on edit"
```

- [x] **Step 8: Confirm final branch state**

Run:

```bash
git status --short
git log --oneline main..HEAD
```

Expected: the worktree is clean and the branch contains three focused implementation commits: editor conversion, persistence composition, and browser verification/issue capture.
