# Concentrate where Card creation continues

Status: resolved
Tags: Improvement
Related: `architecture-review/17`

## Problem

Space Card submission selected the new Card and then concealed its identity from
continuation, returning `cardId: null` so focus went to Add Card. Alias creation
published selection and naming instructions for App to interpret. Immediate Add
Card separately selected and set the naming prop. The `{ target, select, then }`
shape could not express selecting a Space Card while focusing the menu.

## Answer

`creation-continuation.ts` owns the selection, naming and focus policy for all
three creation paths. Callers publish the completed gesture and created identity.
App supplies committed-render availability and the selection and focus effects.
The module waits for pane closure and Card projection before delivery; naming
also waits for available authoring, and menu focus waits for an enabled control.

Markdown Cards and Aliases are selected and named. Space Cards are selected but
return focus to Add Card because their title was authored in the pane. Cancel
returns focus without changing selection. Repeated delivery of one request is
ignored; a fresh gesture carries a fresh request.

Naming remains pending until the canvas accepts it. The canvas used to ignore a
naming prop present on its first mount, which a failing regression test exposed.
It now installs the editor and acknowledges receipt after rendering. The request
is cleared so a subsequent remount does not replay completed naming.

## Scope and evidence

The user confirmed including immediate Add Card while leaving existing-Card
insertion, connected-Card creation and Edge focus outside this change. Their
projection and pointer-release timing rules remain separate.

Tests drive the continuation module's public operations for readiness, separate
selection and focus destinations, naming acknowledgement and repeated delivery.
Canvas authoring tests cover naming on mount. Existing application and browser
tests retain the actual keyboard, naming and focus evidence for each creation
path. Run `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle`.

This names surface coordination rather than a new domain term. No CONTEXT.md or
ADR change is needed; completed Edit and naming semantics remain ADR 0042's.
