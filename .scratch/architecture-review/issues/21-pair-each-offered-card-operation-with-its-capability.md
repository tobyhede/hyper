# Each offered Resource operation carries its own capability

Status: resolved
Tags: Improvement
Blocked by: none

Surfaced by: the 9 September 2026 architecture review, candidate 4 (the top
recommendation), then settled by a grilling loop. Sibling issue 20 collapsed the
question “may this be authored now” into one module; this ticket simplifies how
one answer crosses the props seam. The 21 September audit confirms the refactor
is still justified and refreshes the implementation locations and evidence.

## The defect

`ResourceNodeData` (`packages/react-flow-adapter/src/projection.ts`) carries two
operations as a boolean beside an independently optional callback:

| Flag                     | Operation             | Both written in              |
| ------------------------ | --------------------- | ---------------------------- |
| `titleEditingEnabled`    | `onBeginTitleEditing` | `decorateSharedResourceNode` |
| `resourceEditingEnabled` | `onEditResource`      | `decorateSharedResourceNode` |

The owner is now `packages/app/src/canvas-resource-decoration.ts`, extracted
from `canvas-resource-authoring.ts`. It writes each pair under identical
conditions: membership in the working Space and `authorOnCanvas`, plus
`!bodyEditing` for beginning a title edit.

The type permits the flag and operation to disagree. `ResourceNode.tsx`
reconciles the pair at four sites: Open/Close forwarding for the Markdown,
Reference Resource and Space Resource fronts, and begin-title-edit forwarding.
Deleting the flags removes that disagreement and the reconciliation rather
than moving a decision to another module. It improves depth by shrinking the
interface and locality by leaving ordinary availability with the composition.

The same data already carries `titleEditor`, `bodyEditor` and `resize` as single
optional objects containing the operations each needs. Their presence is the
capability; there is no separate flag to reconcile. Open/Close and begin-title-edit
need only one function each, so they need no wrapper object.

### The story harness retains a wrong default

`packages/app/stories/support/ReactFlowCanvas.tsx` writes:

```ts
resourceEditingEnabled: resourceEditingEnabled ?? source.data.kind === 'markdown',
onEditResource: onOpenChange ?? (() => 'completed'),
```

The operation is always supplied, but the flag defaults off for other kinds.
That kind restriction is wrong under ADR 0070: Reference Resources Open and
Close through the same operation as Markdown Resources.

This is a latent default defect, not evidence that every current Reference or
Space specimen lacks Open. The sole Reference use of `CanvasResourceNodeSpecimen`
in `resource.stories.tsx` explicitly enables the flag. The Enter Space story
renders `CanvasResource` directly and supplies `onOpenChange`. Removing the bad
default and the Reference override together should preserve that story's
controls. Do not assume several story snapshots must change.

## What to build

Delete `titleEditingEnabled` and `resourceEditingEnabled` from `ResourceNodeData`.
For ordinary authorable Resources, the presence of `onBeginTitleEditing` and
`onEditResource` is the capability. Keep both callback names and introduce no
new type. The dormant embedded `readOnly` exception below remains deliberate.

- `packages/react-flow-adapter/src/projection.ts`: delete both flags. Move the
  explanation that Open/Close applies across kinds onto `onEditResource`,
  adjusting prose so it no longer describes a separate gate.
- `packages/app/src/canvas-resource-decoration.ts`: remove both flag names from
  `CanvasResourceDataPatch` and the local `Pick` in `decorateSharedResourceNode`.
  Remove the flag assignments and leave the callback conditions as the whole
  availability answer.
- `packages/react-flow-adapter/src/ResourceNode.tsx`: each of the three
  Open/Close conjunctions becomes `data.onEditResource !== undefined`.
  Begin-title-edit forwarding checks only
  `data.onBeginTitleEditing !== undefined`.
- `packages/app/stories/support/ReactFlowCanvas.tsx`: rename the specimen's
  `resourceEditingEnabled` knob for the operation it withholds and conditionally
  supply that operation. Delete the kind-derived default rather than moving it
  onto the callback. Remove `titleEditingEnabled` from the data construction.
- `packages/app/stories/components/resource.stories.tsx`: remove the Reference
  specimen override that only compensates for the harness default.
- Update explanatory comments and test fixtures that describe the removed
  pairs. Do not remove unrelated historical mentions merely because they use
  the same spelling.

### The two residual second opinions go with them

`ResourceNode` also holds two `data.bodyEditor === undefined` terms:

- The begin-title-edit term is subsumed by composition's Space-wide
  `!bodyEditing` condition, which withholds the callback from every Resource.
- The title-editor selection term is unreachable in production. `Caret` in
  `canvas-resource-authoring.ts` is one nullable title/body union, so the hook
  cannot supply both editors simultaneously. Remove only the body-editor term;
  retain `!data.readOnly` when selecting `titleEditor`.

The hook decorates its input projection anew; it does not reuse its previously
decorated output as the next input. The audit found no stale callback path that
makes either term load-bearing. If implementation reveals one, report the
composition defect rather than restoring a second availability opinion here.

## Decided

Settled by the grilling loop of 9 September 2026; current evidence clarified by
the 21 September audit. These decisions are not reopened.

1. **Scope is the two flag/operation pairs.** `connectionAuthoringEnabled` and
   `readOnly` stay. Neither has a matching operation in `ResourceNodeData`;
   connection authoring also uses React Flow's `isConnectable`. Do not introduce
   an all-or-nothing authoring aggregate.

2. **Presence is the capability; no wrapper object.** The editor and resize
   objects carry several things that must travel together. Each operation here
   is one function, so an object would add a name and pair nothing.

3. **`readOnly` suppresses the dormant embedded Resource's visible controls.**
   `SpaceCanvas`'s retained embedding spreads existing node data, sets
   `readOnly: true`, and supplies callbacks that resume the embedded session.
   It does not explicitly switch either flag off; the flags are not the
   suppression to rely on today. `ResourceNode` forwards `readOnly` to
   `CanvasResource`, which withholds Open/Close and begin-title-edit controls.
   Preserve that behavior and assert it with callbacks supplied.

4. **The callbacks keep both consumers.** `SpaceCanvas` keyboard handlers call
   `embedded.data.onEditResource?.(true)` and
   `embedded.data.onBeginTitleEditing?.()` directly. They must still resume a
   dormant session. Splitting keyboard operations into a second transport was
   rejected; `readOnly` already distinguishes visible controls from those
   commands.

5. **No `CONTEXT.md` change and no new canonical “capability” term.** Availability
   already names the domain question. This change concerns how an answer
   travels between modules, not a new domain concept.

6. **No ADR.** The change reverses cheaply and introduces no trade-off requiring
   a new decision record.

7. **Availability assertions are rewritten, not deleted.** There are now seven
   flag assertions in `canvas-resource-authoring.test.tsx` and six in
   `canvas-resource-decoration.test.ts`. Preserve the rules through callback
   presence/absence assertions. Consolidate duplicates where those assertions
   already exist; only the representable disagreement disappears.

8. **Rename the story knob.** A knob named after a deleted property would keep
   a second vocabulary for the same operation. ADR 0052 requires the catalogue
   to remain evidence for the actual interface.

9. **The sequencing prerequisite is complete.** `layout-only-v1/04` is `done`.
   Its Space Resource selection work was separate and no longer blocks this
   ticket.

10. **Keep this separate from Map-scoped derivation.** The original review's
    candidate 2 concerned `canvas-projection.ts`; these changes share no
    decision with that candidate.

## Tests

- Add explicit cases in `packages/react-flow-adapter/test/ResourceNode.test.tsx`
  with `readOnly: true` and supplied callbacks: no Open control when Closed,
  no Close control when Open, and no begin-title-edit affordance. Before
  removing the flags, set them true in these fixtures so the test proves
  `readOnly`, not absent flags. Verify the cases fail when the relevant
  `readOnly` forwarding to `CanvasResource` is removed; restore that forwarding.
- Preserve the existing test that an active title editor disappears when the
  Resource becomes read-only.
- Remove flags from the adapter test props builder and migrate fixtures to
  supply or withhold callbacks. Remove flag-without-operation repair cases;
  retain meaningful absence-of-operation coverage.
- Rewrite the seven hook assertions and six decoration assertions described in
  Decided #7. Keep evidence for body editing, working-Space membership and
  authoring withdrawal at the composition interface.
- **Explicitly retire or reframe the impossible simultaneous-editor fixture.**
  `ResourceNode.test.tsx`'s “does not offer or mount title editing while the
  Markdown body owns the caret” test (lines 440–457 at audit) supplies both
  `titleEditor` and `bodyEditor`. Removing the second guard would mount the
  title textbox and fail this assertion. The production Caret cannot produce
  that input. Do not restore the guard to satisfy it; preserve the real
  availability rule in the composition tests instead. This consequence was
  established by inspection, not by a mutation run during the audit.
- Preserve dormant embedding keyboard behavior and the existing Ladle proofs
  for read-only suppression and the Open Reference Resource's Close control.
  Add no new test solely to exercise a deleted unreachable guard.

## Verification bar

- `pnpm verify`
- `pnpm e2e` — application behavior and its expectations should remain unchanged.
- `pnpm e2e:ladle` — the harness and Resource stories change; this separate job
  is run by neither `verify` nor `e2e`.

All three remain required after implementation. Do not pre-authorize snapshot
or behavioral expectation updates: identify an actual changed specimen and
explain why the change restores production parity before changing its proof.

## Answer

Both flags are deleted and both apply as designed. Files touched, one line each:

- `packages/react-flow-adapter/src/projection.ts` — deleted `titleEditingEnabled`
  and `resourceEditingEnabled` from `ResourceNodeData`; moved the "Reference
  Resource Opens through the same operation" prose onto `onEditResource`'s own
  doc comment.
- `packages/app/src/canvas-resource-decoration.ts` — removed both flag names
  from `CanvasResourceDataPatch` and the local `Pick` in
  `decorateSharedResourceNode`; deleted the two flag assignments, leaving the
  existing `onEditResource`/`onBeginTitleEditing` callback conditions as the
  whole availability answer.
- `packages/react-flow-adapter/src/ResourceNode.tsx` — the three Open/Close
  conjunctions (Markdown, Reference Resource, Space Resource fronts) now read
  `data.onEditResource !== undefined`; begin-title-edit forwarding now reads
  only `data.onBeginTitleEditing !== undefined` (the `!data.bodyEditor`
  half of that guard is deleted, subsumed by composition's Space-wide
  `!bodyEditing`); the `titleEditor` selection guard drops its `bodyEditor
  === undefined` term and keeps `!data.readOnly`; rewrote the stale
  flag-and-operation doc comment above `canvasResourceOptionalProps`.
- `packages/app/stories/support/ReactFlowCanvas.tsx` — renamed
  `CanvasResourceNodeSpecimen`'s `resourceEditingEnabled` knob to
  `openOperationEnabled` (default `true`, no kind check), and the specimen now
  conditionally assigns `data.onEditResource` from that knob instead of
  unconditionally assigning the operation behind an independently wrong
  kind-derived flag.
- `packages/app/stories/components/resource.stories.tsx` — removed the
  `OpenReference` story's `resourceEditingEnabled` override, which existed
  only to compensate for the harness's kind-derived default; the story now
  gets the Open operation from the corrected specimen default.
- `packages/app/test/canvas-resource-decoration.test.ts` — migrated the six
  flag assertions (Decided #7): two were straight duplicates of an adjacent
  callback-presence assertion and were deleted, one (`resourceEditingEnabled`
  stayed `true` while a body caret is live) became
  `expect(patch.onEditResource).toBeTypeOf('function')`, and the remaining
  three duplicates were dropped in favour of the `onEditResource`/
  `onBeginTitleEditing` presence checks already beside them.
- `packages/app/test/canvas-resource-authoring.test.tsx` — migrated the seven
  hook-level flag assertions the same way: four were duplicates of an adjacent
  operation-presence assertion and were deleted; three needed a new
  presence/absence assertion on `onEditResource` or `onBeginTitleEditing`
  where nothing else in the test covered that fact yet.
- `packages/react-flow-adapter/test/ResourceNode.test.tsx` — removed both
  flags from the `Overrides` type and the `props()` builder; removed every
  flag from fixture call sites, keeping the callbacks; consolidated the
  "flag raised over a missing operation" describe block down to its one
  still-meaningful case (title unrenameable with no operation supplied) and
  merged its duplicate Open-control case into the existing "offers no
  affordance on a Resource with no Open operation supplied" test; retired the
  "does not offer or mount title editing while the Markdown body owns the
  caret" test with an explanatory comment (see below) instead of adapting it;
  added a new `describe('ResourceNode readOnly suppresses controls despite a
  supplied operation')` block with the three readOnly regression cases the
  ticket asks for.
- `packages/react-flow-adapter/test/projection-types.test.ts` — added two
  `expectTypeOf` assertions pinning that `titleEditingEnabled` and
  `resourceEditingEnabled` no longer extend `keyof ResourceNodeData`, beside
  the existing (differently-named) negative check.
- `docs/agents/rendering.md` — rewrote the bullet that documented the
  flag-and-operation reconciliation, since it described exactly the mechanism
  this ticket deleted; it now states the presence-only rule and names the
  surviving `readOnly` suppression path.

**The impossible simultaneous-editor fixture was retired, not reframed.**
`ResourceNode.test.tsx`'s "does not offer or mount title editing while the
Markdown body owns the caret" supplied `titleEditor` and `bodyEditor` together,
which production's `Caret` (one nullable title/body union) cannot produce.
Reframing it to a reachable combination (`bodyEditor` alone, no `titleEditor`)
would have proved nothing about the deleted guard, because `ResourceNode`'s
`state === 'editing'` branch already keys off `titleEditor`'s own presence, not
`bodyEditor`. The test is replaced with a comment pointing at
`canvas-resource-authoring.test.tsx`'s "withholds competing Resource edits
while a body caret is live", which is the composition-seam test that actually
proves the real rule (title editing withheld Space-wide while a body caret is
live).

**readOnly regression tests: red, then green, both actually run.** The three
new cases in `ResourceNode.test.tsx` (`readOnly` withholding Open, Close, and
begin-title-edit despite a supplied operation) were run against a deliberately
broken tree — both `readOnly={data.readOnly}` forwards to `CanvasResource` in
`ResourceNode.tsx` changed to `readOnly={false}` — and all three failed red:

```
FAIL … withholds the Open control from a read-only Closed Resource
FAIL … withholds the Close control from a read-only Open Resource
FAIL … withholds the begin-title-edit affordance from a read-only Resource
Tests  3 failed | 45 skipped (48)
```

Each failure showed the withheld control rendered anyway (`Open Resource A`,
`Close Resource A`, `Edit Title A`, respectively) — i.e. exactly the
regression a reintroduced flag-based gate would hide, since these fixtures
supply the operation. The forwarding was then restored and the same three
cases, and the full 48-test file, passed green. No `.bak` or stray file was
left behind; `git diff` on `ResourceNode.tsx` shows only the intended
production edit.

**No stale reference left behind.** A repo-wide grep for `titleEditingEnabled`
and `resourceEditingEnabled` after the change finds them only where expected:
the negative `expectTypeOf` assertions in `projection-types.test.ts`, and one
unrelated historical mention in `authoring-availability.ts` that predates and
is unrelated to these two fields (it documents a different, already-retired
prop of the same name that once carried `soleAuthoringSurface` directly onto
the canvas, before this module existed to consolidate that question — left
untouched as accurate history).

**Verification, actually run on the finished tree:**

- `pnpm verify` — green. `verify:static` (toolchain, both typechecks, UI
  catalogue, lint, anti-slop, format) all green; `test:coverage` reports
  **237 test files passed, 3011 tests passed, 13 skipped** (exit code 0).
- `pnpm e2e` — green, **227 passed** (2.8m), including the Reference Resource
  Open/Close and Space Resource Open/Close specs the flag removal touches
  (`editing.spec.ts`, `overview.spec.ts`, `space-resource.spec.ts`).
- `pnpm e2e:ladle` — green, **115 passed** (40.6s), including
  `resource-expand.spec.ts`'s "Open Reference Resource story renders Target
  Markdown read-only under the Reference Resource Title" — the Ladle proof
  that exercises the corrected `OpenReference` story and harness default.

No behavioral expectation was changed to make a test pass; every changed
assertion follows directly from the callback-presence rule the ticket
specifies, and the one story specimen whose default changed (kind-derived →
unconditional) is exactly the "latent default defect" the ticket names, fixed
by deleting the wrong default rather than by adjusting a proof around it.

No remaining blockers.

## Comments

### Audit, 21 September 2026

Recommendation: **Strong; retain ready-for-agent**. Both pairs and their four
adapter reconciliations remain. Removed the completed blocker, refreshed names
and ownership, added the decoration tests and impossible-editor fixture to the
migration work, and corrected the story and dormant-read suppression claims.
The settled two-pair design and rejected alternatives remain intact.

Observed: **83 tests passed across 3 files**:

```sh
pnpm exec vitest run packages/react-flow-adapter/test/ResourceNode.test.tsx packages/app/test/canvas-resource-decoration.test.ts packages/app/test/canvas-resource-authoring.test.tsx
```

These are existing-behavior audit results, not completion of the implementation
verification bar. Full verify, application E2E and Ladle E2E were not run in the
audit. No implementation changes have been made for this ticket.

### Amendments the audit made to settled decisions

The audit above was never committed on its own: it first landed in the commit that closes this ticket, so its Comment's "No implementation changes have been made for this ticket" was true when written and not of the commit that carries it. It also amended three settled points, and the implementation relied on the first. Recorded here so the change to decisions marked "not reopened" is visible; the original wording is `git show 0ae8f235:<this file>`.

- **Decided #7.** Original: "The seven flag assertions are rewritten, not deleted. … Only the *divergence* becomes unrepresentable; the rules do not. Deleting them would lose four availability rules to a refactor meant to remove a repair." The audit dropped the last sentence and added "Consolidate duplicates where those assertions already exist", under which the implementation deleted duplicate assertions. The rules themselves stay pinned by callback presence and absence in `canvas-resource-authoring.test.tsx` and `canvas-resource-decoration.test.ts`.
- **Decided #3.** Original: "Two remain, which is already one opinion too many." Dropped by the audit; `readOnly` still suppresses in both `ResourceNode` and `CanvasResource`.
- **Verification bar.** Original: "That is the fix, not a regression, but the story snapshots move with it." The audit replaced this with "Do not assume several story snapshots must change." The implementation changed no snapshot files, because the only Reference specimen already raised the retired flag.
