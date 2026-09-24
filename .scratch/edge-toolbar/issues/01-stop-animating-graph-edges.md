# 01 — Stop animating Graph Edges

Status: ready-for-human

**What to build:** `projectGraphEdges` (`packages/react-flow-adapter/src/projection.ts`) sets `animated: false` on every Edge, with the reason beside it; `projection.test.ts` asserts no Edge is animated, emphasised or not.

**Why:** React Flow's marching dash kept the emphasised Graph in constant motion, competing with every Resource for attention. Emphasis is already carried by stroke width, opacity and paint order. The line becomes solid, since `animated` is also what dashed it.

The change is made in the working tree of `prototype/edge-toolbar` and must land on its own branch off `main`, not with the prototype. Before claiming done, run `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` on their own. In the prototype session, `verify` and `e2e:ladle` passed. The full `e2e` run, taken while `verify` was also running, had six timeouts in `dock-interactions.spec.ts` and `space-resource.spec.ts`; those two files alone then passed all 43 tests.
