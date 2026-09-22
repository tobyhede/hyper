# 10 — Creation through `createInMap`

Status: done
Blocked by: 03

**What to build:** Space Authoring's `created-resource`, `created-reference` and `create-and-connect` arms create through `SnapshotEdit.createInMap`, which also takes on the Reference Resource Target rule. Authoring still mints the Resource and its document, and still appends the Edge for `create-and-connect`. See `../spec.md`.

**Why:** `createInMap` already places a Space Resource for the session registry (ticket 01), and Authoring keeps its own copy of the step-off rule. With both callers on the module, a Resource created from any kind or menu lands by the same rule. Checking the Target in the module completes the rule `deleteFromSpace`'s `resource-has-references` already enforces from the deletion side.

## Build

- [x] `createInMap` refuses `reference-target-not-found` and `reference-target-must-own-content`, each carrying `targetId`, for a Reference Resource document whose Target the snapshot does not hold or whose Target is itself a Reference Resource. Checked against the snapshot, not the loaded Space.
- [x] The session registry's mapping of `createInMap`'s refusal handles the two new codes. It only ever creates Space Resources, so they are unreachable there; say so in the mapping rather than widening `SpaceResourceRefusal`.
- [x] `created-resource` and `created-reference` call `createInMap` with `avoidingOverlap`; `create-and-connect` calls it with `exact` at the drop point, then appends the Edge to the Active Graph as today. `createResource` stops appending to `snapshot.resources` — the module does that, and doing both adds the Resource twice.
- [x] `freeAnchor` and `STACK_STEP` are deleted from `space-authoring.ts`.
- [x] `referenceTargetRefusal` is deleted. Its `edited-resource` call is dead: a changed Target is already refused as `reference-target-immutable`, and an unchanged Target already passed intake.

## Tests

- [x] Property tests in `packages/graph/test/snapshot-edits.property.test.ts`: a Reference Resource whose Target is missing or is itself a Reference Resource is always refused and changes nothing; `exact` keeps the aimed point; every completed snapshot passes `loadSpaceSnapshot`.
- [x] In `space-authoring-operations.test.ts`, `Add Reference Resource` keeps the title tests and one test per Target refusal code, now as mapping tests; any test restating the Target rule beyond that goes.
- [x] `packages/app/e2e/space-resource.spec.ts` is re-read for the landing-point assumption ticket 01 recorded; nothing there should change.

## Done when

- [x] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments

- **A refused creation now spends a minted id.** `createResource` mints before `createInMap` can refuse, because the module needs the id to add the Resource; the old `referenceTargetRefusal` ran before minting. Nothing observes the lost id — no Authoring test sequences a refused creation before a completed one — and ids carry no meaning beyond uniqueness (ADR 0016).
- **`createResource` answers the new id or the derivation's answer**, so each of the three arms returns the refusal as it did before; `writePlacement` survives for `settled-resource-movement` alone.
- **The Space Resource Target case moved to the module.** Authoring's "creates a Reference Resource whose Target is a Space Resource" restated the Target rule; the completion property now generates Markdown and Space Resource Targets alike, and the nested Space Resource names a Space other than its own, which intake refuses.
- **Kept in `Add Reference Resource`**: the two title tests and one mapping test per Target code.
- `packages/app/e2e/space-resource.spec.ts` was re-read: its one landing-point comment names `freeAnchor`'s exact-collision rule, which is unchanged and now lives only in `graph`. Nothing there changed.
