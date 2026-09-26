# 27 — Decide whether `ResourceNode`'s abstention from `updateNodeInternals` is load-bearing

**What to build:** Establish whether calling `useUpdateNodeInternals` from `ResourceNode` breaks anything today. Then either keep the `ResourceNode handle geometry` tests in `packages/react-flow-adapter/test/ResourceNode.test.tsx` with the evidence named, or delete them.

**Blocked by:** None — can start immediately.

**Status:** resolved — the abstention is load-bearing; the tests stay, with the failing browser tests named beside them (#304)

**Priority:** P3

**Why:** Two reasons were given for the rule, and neither holds.

- A forced remeasure would drop the declared anchors of Graphs the Resource is not yet on. That stopped being true when `ab39e5ea` (2026-09-11) removed per-Graph handles. Every Resource now renders all four sides in both roles.
- A mid-transition measurement would attach an Edge off-centre. React Flow already takes that measurement: `useResizeObserver` in `@xyflow/react` 12.11.2 calls `updateNodeInternals` with `force: true` on every resize. `updateNodeInternals` in `@xyflow/system` 0.0.79 rebuilds `handleBounds` from `getHandleBounds` whenever a node's size changes, forced or not.

Ticket 10 corrected the comments so they no longer claim either reason. The tests still pin the abstention. Under the comment rule, a decision called load-bearing needs something that fails when it is reversed.

- [x] Add the hook call to `ResourceNode` on a throwaway branch and run `pnpm e2e` and `pnpm e2e:ladle`. Record what fails, if anything.
- [x] If something fails, name that test beside the abstention tests. If nothing does, delete the abstention tests and the `updateNodeInternals` mock they need.

## Result

The abstention is load-bearing. Forcing a remeasure from `ResourceNode` breaks the canvas in the browser, so the `ResourceNode handle geometry` tests stay. The comments beside them, in `ResourceNode.tsx`, on the `editing.spec.ts` test and in `docs/agents/rendering.md` now name the failing tests instead of the two reasons above, which no longer hold. Why the call breaks things was not diagnosed. Only the symptoms are recorded here.

### Method

On a local throwaway commit over `cq-28-open-vocabulary` (`b6a47652`), never pushed, `ResourceNode` called the hook in an effect keyed on the Open state and the node's size:

```tsx
// `width` and `height` destructured from NodeProps
const updateNodeInternals = useUpdateNodeInternals();
const experimentOpen = data.open === true;
useEffect(() => {
  updateNodeInternals(id);
}, [id, experimentOpen, width, height, updateNodeInternals]);
```

This calls it on mount and on every Open or size transition, which is what the two abstention tests forbid. Both unit tests failed, as expected, and the other 51 in the file passed.

1. `pnpm e2e` (full suite, `HYPER_E2E_PORT_BASE=5700` because another worktree's run held 5300+): **26 failed, 207 passed**. That run overlapped another agent's E2E, so it was not taken at face value.
2. Six of the failures, rerun alone on an idle machine with the hook: **6 failed**. The same six on the unmodified commit: **6 passed**.
3. A narrower variant skipped the first effect run and called the hook only on Open transitions. Under StrictMode's double-invoked effects it still fires once per mount. The same six: **6 failed**.
4. `pnpm e2e:ladle` with the hook: **3 failed, 124 passed**. The three rerun alone with the hook: **3 failed**. On the unmodified commit: **3 passed**.

### What failed with the hook

`pnpm e2e` (26). The ones marked † were reproduced alone and pass without the hook.

- `editing.spec.ts`: opening a Resource displaces its neighbours once… † (the return drag leaves the subject 340 units off, `returned.x` 340 against 0); an Open Resource offers one resize control…; resizing into the complete Close range previews Closed geometry…; Delete Resource is withdrawn while the selected Resource is Open †; dragging from the Resources list uses transformed canvas coordinates…; drawing between existing Resources persists one active-Graph Edge…; an Edge drawn from the presented Resource is a move…; drawing an Edge into an explicitly created Map then refuses its duplicate; a second connection drawn in the same session resolves its handles † (hover on `A` is intercepted by Resource `E` until timeout); a duplicate Edge is marked invalid while the drag is still live; Create Reference is drawn unavailable on a Reference Resource…; Copy link to Target on a Reference Resource…
- `mobile-dock.spec.ts`: Delete Resource confirms at phone width with the pointer
- `overview.spec.ts`: a Reference Resource Opens on its Target Markdown read-only… † (the resize never commits: revision stays 5, expected 6)
- `presenting.spec.ts`: the camera closes in on the active resource, and pulls back on exit † (overview zoom 1, returned zoom 0.55); an authored fork offers both moves… (target handle not `:hover` in `connectHandles`)
- `space-resource.spec.ts`: editing inside an Open Space Resource saves the target…; a connect between two embedded Resources…; an embedded Resource can move, open with the keyboard and resize…; a Space Resource resizes to Close and remembers its Open Size; Space Resource canvas has equal top and side padding; Space Resource title footer follows its content; a selected Resource toolbar floats above its top-right corner… † (opening scale 1, expected < 0.9); portal framing survives Done, Close, reopen and reload…; portal zoom frames authored coordinates…; deleting the selected Map clears framing… Several of these time out with `.react-flow__pane` intercepting a click on the Resource rail's Edit button.

`pnpm e2e:ladle` (3), all reproduced alone and passing without the hook:

- `edge-toolbar.spec.ts`: hovering an Edge's line reveals its toolbar, held across the gap and released after it (toolbar not found)
- `command-dock.spec.ts`: a Markdown Resource's actions menu groups Create Reference, Connect, both copy links, then Remove and Delete (click timeout)
- `space-resource-embedded-map.spec.ts`: two Space Resources frame the same target independently (click timeout)
