# 05 — Space Thing creation and linking refuse when their Diagram goes during the wait

Status: ready-for-agent
Blocked by: 04

**What to build:** Move Space Thing create and link onto the coordination's `prepare`/`plan` shape, with `SnapshotEdit.createInDiagram` refusing `diagram-not-found` itself. See `../spec.md`, "Coordinated operations decide after their last wait".

**Why:** Both check that the containing Diagram exists in `derive` and never again. `createInDiagram` does not refuse a missing Diagram, so if it is gone when the closure runs, the Thing is added to the Space on no Diagram and the operation reports `completed`.

## Red first

- [ ] **Create refuses a Diagram deleted during the wait.** Delete the containing Diagram while the coordination reads the aggregate; creation answers `diagram-not-found` and adds no Thing. First establish whether anything can delete that Diagram outside the lifecycle turn — if nothing can, the test cannot fail: strike it here and record why in Comments. The `createInDiagram` refusal lands either way.
- [ ] **Link refuses the same way**, under the same caveat.

## Build

- [ ] `SnapshotEdit.createInDiagram` refuses `diagram-not-found`, added to `graph`'s refusal union with a property test: creation into a Diagram the snapshot lacks is always refused and changes nothing.
- [ ] Create and link run `createInDiagram` inside `plan`, and map its refusal into `SpaceThingRefusal`. The `derive`-time Diagram checks become early exits in `prepare`.
- [ ] Link still refuses a missing Diagram before initializing its target Space or minting any id (ADR 0079); `refuses %s when its containing Diagram is absent` stays green with an empty id source.

## Done when

- [ ] The red tests pass or are struck with a reason.
- [ ] `pnpm verify` is green. `pnpm e2e` is run because Space Thing creation is canvas-visible. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments
