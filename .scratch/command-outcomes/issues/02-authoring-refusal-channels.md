# 02 — Graph and Reference refusals through command outcomes

Status: ready-for-agent
Blocked by: 01

**What to build:** Move the Graph cluster's Authoring-refusal notice onto `graph-edit`, and `createReferenceFrom` onto `reference-create` with its continuation. Map reports belong to tickets 06–09's `MapAuthoringCommands`, which returns their complete title and message for command outcomes to hold. See `../spec.md`.

**Why:** The Graph and Reference Resource call sites each hand-roll narrow → describe → set. Map outcome ownership was sharpened after this ticket was filed and now moves with the complete Map Edit behind one interface.

## Build

- [ ] `graphRefusal` and `referenceRefusal` are deleted from App.
- [ ] `createReferenceFrom` keeps its offset maths (`Placement.growth`, ADR 0093) and hands the continuation to `continueAt`.
- [ ] Their `refusedUnder` lines go; the reset covers them through the table.

## Tests

- [ ] `command-outcomes.test.ts` gains the two channels' titles and describers.
- [ ] One `Application` test proves a refused Graph edit and Reference Resource creation render and dismiss through command outcomes.

## Done when

- [ ] `rg "setGraphRefusal|setReferenceRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments
