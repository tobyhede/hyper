# Nothing claims an automatic view is read-only

Status: resolved
Type: task

Four comments and a test name still assert ADR 0013's rule that an automatic view cannot be edited. ADR 0025 removed the rule outright — every view is editable, and editing an automatic one converts its arrangement into a Layout — and the app has had no read-only view since ticket `04` shipped. These are false sentences sitting next to correct code, which is the shape of staleness that costs the most: a reader trusts the comment over the code.

`packages/graph/src/grid.ts` and `packages/react-flow-adapter/src/elk/elk-strategy.ts` carry the same sentence. `packages/app/src/view.ts` is worse than stale — it says `ResolvedView.layout`'s presence *is* the permission to edit, and nothing reads it that way; its only consumers take the id and title for the save path. `packages/app/src/components/GraphView.tsx` misdescribes its own `editable` prop the same way, as does `App.tsx` where the value is computed.

`packages/app/test/view.test.ts` has a test named *"resolves the built-in grid, which is automatic and so read-only"*. The assertions are still right and still worth having; only the name asserts a superseded rule.

## Answer

Done, comments and one test name only — no behaviour change, and `pnpm e2e` unchanged at 34, which is the guard that proves it.

The substantive part was saying what `editable` actually means, because "having a Layout is the permission to edit" was wrong twice over. The value is `liveNodes !== null`, which means *the layout has resolved and the store has taken it* — a readiness gate, false for exactly one frame and true from then on, for every view including `graph` and `grid`. That is already 0025's behaviour; it was arrived at by 0017's route and described in 0013's words.

`ResolvedView.layout` is likewise not a permission. What it answers is whether a save writes to a Layout the author named or to one the app has to mint, which is the only question anything asks of it.
