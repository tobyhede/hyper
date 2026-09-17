# 01 — The session registry edits snapshots through `SnapshotEdit`

Status: done
Blocked by: none

**What to build:** Create `SnapshotEdit` in `@project/graph` with the two operations the session registry needs — `createInDiagram` and `deleteFromSpace` — and route Space Thing creation and deletion through them, deleting `removeSpaceThing` and `addSpaceThing`. See `../spec.md` for the design.

**Why:** The registry's private copy of the removal and creation rules has diverged from Authoring's: it skips reclaim, skips the Alias guard and skips stepping off an occupied point. One pure module both callers reach is the fix, not a third patch.

## Red first

Write each as a failing test at the registry's existing seam (`packages/persistence/test/session-registry.test.ts` or `space-thing-lifecycle.test.ts`) before touching the implementation. A test that will not fail against `main` means the finding was wrong — strike it from this ticket and say so in Comments rather than claiming it fixed.

- [x] **Delete reclaims.** Deleting an **Open** Space Thing from its containing Space returns every Thing it displaced to where it was before it opened, in every Diagram of that Space (ADR 0084). Today `removeSpaceThing` (`session-registry.ts:295`) filters positions without `Placement.reclaim`.
- [x] **Delete refuses an Alias Target.** Deleting a Space Thing that an Alias in the same Space targets is refused with a `thing-has-aliases` refusal naming the Aliases, and nothing is committed and no Space is deleted. Today it reaches intake and returns `aggregate-refused` (`validate.ts:256` `unresolved-alias-target`).
- [x] **Create steps off an occupied point.** Creating a Space Thing at a point another Thing in the Diagram already occupies places it diagonally off that point, exactly as a menu-created Markdown Thing lands (`freeAnchor`, `space-authoring.ts:530`). Today `addSpaceThing` (`:312`) writes the given point.

## Build

- [x] `packages/graph/src/snapshot-edits.ts` exports `SnapshotEdit` with `createInDiagram` and `deleteFromSpace` over `SpaceSnapshot`, answering `completed(snapshot) | unchanged | refused(code)`. `graph` declares the refusal union for these two operations; it carries codes and typed context only, no wording.
- [x] `createInDiagram` adds the Thing to `things` and positions it closed in the named Diagram, `exact` or `avoidingOverlap`. The step-off rule moves here from `space-authoring.ts` `freeAnchor`; Authoring keeps its own copy until ticket 03.
- [x] `deleteFromSpace` is kind-agnostic: refuses `thing-not-found` and `thing-has-aliases`; otherwise removes the Thing from `things` and, in **every** Diagram, reclaims its room, removes its position and removes its incident Edges. It does not touch `defaultDiagram`, `activeGraph`, titles or other Spaces — the cross-Space cascade stays in the registry.
- [x] Offered from `packages/graph/src/index.ts` as `SnapshotEdit` (and its outcome and refusal types), with `test/unit/graph-package-surface.test.ts` updated.
- [x] The registry calls `SnapshotEdit.deleteFromSpace` in both places `removeSpaceThing` ran (`:1167` staging, `:1209` update) and `SnapshotEdit.createInDiagram` where `addSpaceThing` ran (`:912`, `:1106`). A refusal maps into `SpaceThingRefusal` (add `thing-has-aliases` there) before any Space is opened or deleted. `removeSpaceThing` and `addSpaceThing` are deleted.
- [x] `app` presents the new `SpaceThingRefusal` code through `describeSpaceThingRefusal`, reusing the `thing-has-aliases` wording Authoring already has.
- [x] Property tests in `packages/graph/test/snapshot-edits.property.test.ts` over generated snapshots: deleting any Thing leaves a snapshot `loadSpaceSnapshot` accepts whenever no Alias targets it; delete after open leaves every other Thing where delete before open would have; `avoidingOverlap` never lands on an occupied point; a Thing an Alias targets is always refused.

## Done when

- [x] The three red tests pass, and no registry test asserts the old behaviour.
- [x] `pnpm verify` is green. `pnpm e2e` is run because Space Thing creation and deletion are canvas-visible, and `test/e2e/` is grepped for anything asserting a Space Thing's landing point. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments

- The three red tests were all reproduced against the pre-fix code exactly as the ticket predicted (see run log below); none needed to be struck.
- `test/e2e/` and `packages/app/e2e/` were grepped for "Space Thing" and for position/freeAnchor/reclaim/centreAnchor assertions. The one relevant test (`packages/app/e2e/space-thing.spec.ts`, "an Open Space Thing shows the selections it was created with") already documents that `freeAnchor` steps only on an *exact* point collision and relies on `centreAnchor()` not exactly coinciding with the fixture's existing Thing, so it is unaffected by routing creation through `SnapshotEdit.createInDiagram`. No e2e test asserted the old (non-stepping, non-reclaiming) behaviour.
- Deviation from the ticket's literal text: `removeSpaceThing`/`addSpaceThing` are deleted as named functions; in their place is one small `completedSnapshot(outcome, label)` helper that unwraps a `SnapshotEditOutcome` to a `SpaceSnapshot` or throws on a broken invariant (never expected in practice, since every call site already asked `derive` to refuse first). This is not a re-implementation of the membership rules — those now live only in `SnapshotEdit` — just an outcome-unwrap used at all four call sites.
