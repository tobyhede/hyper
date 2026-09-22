# 03 — Space Authoring writes a Map's identity, not its content

Status: ready-for-agent
Blocked by: none (01, 02 and 05 are done)

**What to build:** A prefactor with no behaviour change. `updatePositionedMap` narrows to the fields that are a Map's identity rather than its content — title, `kind`, `activeGraph` and the Space's `defaultMap` — and `deriveCompletedEdit` stops handing it the Map's positions and Graphs whole. Each arm that changes positions or Graphs writes them into the working snapshot itself; the tail folds only the Map's identity over the result. See `../spec.md`.

**Why:** Today the tail writes `completedPlacement` and `ownedGraphs` over the Map whatever the arm did. Once an arm calls a `SnapshotEdit` operation, which answers a whole snapshot, that tail would overwrite what the module wrote — for Delete from Space, putting the deleted Resource's position back in the Map the Edit is drawing. Removing that write first makes each of 08–11 a local change to one arm.

This replaces the original single ticket 03, which an audit on 2026-09-22 found stale in vocabulary (Thing/Diagram/Alias), wrong about what `updatePositionedMap` writes, and without a decision on how the module's snapshot composes with the tail. The work is now split across 03 and 08–11.

## Build

- [ ] `updatePositionedMap` takes a Map id, title, and Active Graph, and writes the Map's title, `kind: 'positioned'`, `activeGraph` (carrying the stored one through when the Edit names none, as today) and the Space's `defaultMap`. It no longer takes or writes `positions` or `graphs`, and a Map it does not find is not appended — the module or the arm that creates a Map owns that.
- [ ] Every arm of `deriveCompletedEdit` that changes the Map's positions or Graphs writes them into `snapshot` before the tail, in the Map being edited (the resolved Map, which is the embedded Map when `embeddedMapId` is given). The membership arms still use their current helpers; only where the write happens moves.
- [ ] `sameSnapshot(previousSnapshot, next)` still answers `unchanged` for an Edit that changed nothing, including a settled drag that landed where it started.
- [ ] No test in `space-authoring-operations.test.ts`, `snapshot.test.ts`, `displacement.property.test.ts` or `authoring-placement-copy.test.ts` changes its assertions. `snapshot.test.ts`'s `updatePositionedMap` cases change only their inputs.

## Done when

- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable: no component or story changes.

## Comments
