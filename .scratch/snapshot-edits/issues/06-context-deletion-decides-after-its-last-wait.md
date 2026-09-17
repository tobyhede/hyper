# 06 — Diagram and Graph deletion refuse when their successor goes during the wait

Status: ready-for-agent
Blocked by: 04

**What to build:** Move the registry's `deleteDiagram` and `deleteGraph` onto the coordination's `prepare`/`plan` shape, so the successor Diagram or Graph and every Space Thing reference rewrite are chosen from the Spaces as they stand after the last wait. Their rules stay in the registry. See `../spec.md`, "Coordinated operations decide after their last wait".

**Why:** Both choose a replacement in `derive` and apply it blindly later. If the replacement is removed during the wait, the edits point `activeGraph`, `defaultDiagram` and referencing Space Things at an id that no longer exists, and the author is told only `aggregate-refused`.

## Red first

- [ ] **Graph deletion refuses when its replacement Graph goes during the wait.** Remove the chosen replacement while the coordination reads the aggregate; the deletion answers a specific refusal rather than `aggregate-refused`, and nothing commits. If nothing can remove it outside the lifecycle turn, strike the test here and record why in Comments.
- [ ] **Diagram deletion refuses the same way**, under the same caveat.

## Build

- [ ] Both operations compute successor, keep-last and reference rewrites inside `plan`; the aggregate read moves to `prepare`.
- [ ] Any new refusal code is added to `SpaceThingRefusal` and worded in `app` beside the existing ones.
- [ ] Successor and keep-last rules are not moved out of the registry (spec, Out of scope).

## Done when

- [ ] The red tests pass or are struck with a reason; existing context-deletion tests stay green.
- [ ] `pnpm verify` is green. `pnpm e2e` is run because Diagram and Graph deletion are chrome-visible. `pnpm e2e:ladle` is not applicable unless a story changes.

## Comments
