# 03 — Space Resource creation through command outcomes

Status: ready-for-agent
Blocked by: 01

**What to build:** `createSpaceResource` (`App.tsx:507-554`) runs `spaceResources.create` through `run('space-resource-create', …, { continueAt })`. The module owns the refusal sentence (`describeSpaceResourceRefusal`), the break sentence (`describeSpaceResourceCreationBreak`) and the rename continuation at the minted `resourceId`. See `../spec.md`.

**Why:** It is the fullest copy of the pattern — narrow, describe, continue, and a try/catch to `reportBreak` — and the one whose continuation must name the id the lifecycle minted rather than the Resource that appeared.

## Build

- [ ] `spaceResourceRefusal` is deleted from App; `creatingSpaceResource` stays (pending flags are out of scope) and is still cleared in `finally`.
- [ ] Title minting (`nextSpaceTitle`), `resolveMap` and `centreAnchor` stay in App.
- [ ] `unchanged` requests no continuation, as today.

## Tests

- [ ] `command-outcomes.test.ts`: `continueAt` names the result's `resourceId`; a throw publishes the creation break sentence and reaches the reporter.
- [ ] `space-resource-authoring.test.tsx` keeps its "Space not created" assertions unchanged.

## Done when

- [ ] `rg "setSpaceResourceRefusal" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments
