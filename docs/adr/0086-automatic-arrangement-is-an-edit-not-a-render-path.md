# Automatic arrangement is an Edit, not a render path

Status: accepted
Refines: 0005, 0014
Related: 0021, 0025, 0040, 0045, 0053, 0056, 0079, 0085

elkjs leaves the repository. The `LayoutStrategy` contract keeps the one direction that has a consumer — `positionedStrategy`, which reads a Diagram and answers the graph to draw — and loses the routing output that neither direction can use. `gridStrategy` stays, unused, because it is pure, costs nothing and keeps the contract honest — not because grid is the arrangement that returns. No strategy is privileged (ADR 0014, ADR 0040, ADR 0041).

What returns is ADR 0014's unbuilt half, not a new idea. An automatic arrangement becomes a **destructive authoring operation over an existing Diagram**: the author places Things, invokes a named tool, and the Diagram's positions are rewritten in one Edit, undoable like any other. It is not a second kind of canvas, not a second selectable context, and not something the renderer decides.

## Nothing can reach it

The application constructs exactly one strategy, in two places, and it is the same one: `positionedStrategy(Placement.fromDiagram(...))` at `App.tsx:518` and `EmbeddedDiagramAuthoring.tsx:68`. `elkStrategy` is imported by two files, both tests — `elk-strategy.test.ts` and `strategy-contract.test.ts`. `gridStrategy` likewise, by `packages/graph/test/layout.test.ts` and `packages/app/test/placement-rendering.test.tsx`.

There is no surface left that could select one. ADR 0053 deleted the three renderer selectors; ADR 0079 made an authored Diagram the only selectable and addressable canvas context and its obsolete canvas identities invalid input. So the tests are not the last consumer of a capability, they are the only one — and a test whose subject nothing else calls is checking that the capability still compiles.

## The contract has two directions and one of them is empty

ADR 0014 already named the asymmetry this deletion acts on:

> Auto-arrange is `LayoutGraph → Layout` while the positioned strategy is `Layout → LayoutGraph`, so the one crossing between computed and authored placement reads as a pair of type signatures pointing opposite ways rather than as a rule to remember.

Read in today's vocabulary (ADR 0085): the positioned direction takes a Diagram and answers the graph to draw, and it is the whole of what the application does. The other direction takes a graph and answers positions to *write into* a Diagram, and it has no consumer, because Auto-arrange was never built. `elkStrategy` and `gridStrategy` are both on the empty side.

Deleting the render-time wiring does not foreclose that direction. It removes the wrong home for it. A strategy consumed at render time computes an arrangement nobody authored and nothing persists, which is the placement-computed-at-render-time ADR 0014 exists to separate from authorship.

## Routing output can never be persisted, in either direction

A Diagram stores placements — a Thing and its position, and nothing else (`CONTEXT.md`, "Placement"). There is nowhere in the document for an Edge's waypoints. So routed edge geometry could only ever have been render-time, which is precisely the thing leaving; and a future Auto-arrange, whose output has to land in a Diagram, cannot want it either. `sections` and `ports` are not merely unused. They are unusable.

The code has been saying so. `positioned.ts:16` records that the strategy emits no edge sections, "leaving the render layer to spread handles evenly and draw a curve". `canvas-projection.ts` drops the laid-out graph from its edge options once a Thing has moved, and explains: "which is what a positioned view draws anyway, since it routes nothing." Both comments are correct, and together they mean **`RoutedEdge`'s routed-polyline branch has never executed in the application.** The bezier fallback is, and always has been, the only edge geometry the product draws.

## What this deletes

Staged across two tickets, because the deletion divides cleanly and only the first half is behaviour-free on inspection alone. `.scratch/edge-attachment/issues/01-remove-elkjs.md` takes elkjs out; `02-narrow-the-strategy-contract.md` narrows the contract behind it. The bullets say which owns each.

**Ticket 01 — built.**

- `packages/react-flow-adapter/src/elk/` entire — `elkStrategy`, `ElkEngine`, `elkPortId`, `PORT_ID_SEPARATOR`, `DEFAULT_ELK_LAYOUT_OPTIONS` — and the `elkjs` dependency.
- `elk-strategy.test.ts`, and `elkStrategy`'s row in `strategy-contract.test.ts`.
**Ticket 02 — not yet built; all four are still in the tree.**

- `LayoutStrategyEdgeSection`, `sections` on `LayoutStrategyEdge`, and `ports` on `LayoutStrategyThing`.
- `routedPoints` and `RoutedEdge`'s polyline branch. `RoutedEdge` keeps its name and draws the bezier it has always drawn.
- `resolveHandles`'s `portsById` parameter and its `port?.y ??` branch. The even spread over the Thing height stops being a fallback and becomes the rule.
- `canvas-projection.ts`'s `moved` special-case on `edgeOptions`, which selects between two results that are identical once no strategy routes.
**Ticket 01 — built.**

- Three of the eight handle rules in `docs/agents/rendering.md`: ELK port offsets driving handle positions, `FIXED_SIDE` over `FIXED_ORDER`, and the `<thingId>##<handleId>` namespacing.
- ADR 0085's three elkjs option-bag exemptions in the vocabulary guard, and the filename carve-out for `packages/react-flow-adapter/src/elk/layout.ts`. `packages/graph/src/layout.ts` keeps its name and the *shape* carve-out that protects it — the one for the `LayoutStrategy` compound, which is a different mechanism from a filename entry and was never elkjs's. It has no filename carve-out and never had one.

## What survives, and why none of it was elkjs's

Five of `rendering.md`'s eight handle rules survive, and the four that are React Flow's are untouched; the fifth is ADR 0033's scoping rule, which says the set belongs to the overview rather than to the domain and is the lead-in `rendering.md` counts the other four below. Handle ids must be distinguishable per Thing per side — ADR 0045 argues that on React Flow's grounds, its warning #008, not on elkjs's. A hidden handle uses `opacity: 0` or `visibility: hidden` and never `display: none`, because React Flow measures it. Handle geometry is declared and never re-measured, and `useUpdateNodeInternals` stays forbidden; that rule has E2E evidence behind it that unit tests provably cannot reproduce. And neither `toNode` nor the DOM alone answers "is this empty canvas", because `connectionRadius` resolves by distance to a handle.

`gridStrategy` survives too. The argument here is that a heavy dependency was wired into a render path no user can reach; that argument does not extend to a pure, dependency-free function sitting in the package where Auto-arrange will live. Keeping it also keeps `LayoutStrategy` an honest contract — one implementation on each side — rather than a type with an empty half.

## What this opens and does not answer

Every Edge in the product leaves a Thing's right side and enters the next one's left. What leaves here is the *argued* cause — `port.side === 'in' ? 'WEST' : 'EAST'` in `elk-strategy.ts`, mapping a handle to an elkjs port side, which is where the rule was reasoned about. What stays is the rule stated without an argument, in three live places: `projection.ts` declares `position: Position.Left` on every per-Graph target handle and `Position.Right` on every source, and `ThingNode.tsx` re-decides the same thing at render. So after this change **nothing in the codebase says *why* an Edge attaches where it does, while three places still say *that* it does.** The per-Graph `<graphId>::in` / `::out` ids survive on React Flow's grounds; their placement survives as an unexplained constant, which is what the next ticket has to answer and amend.

That is a real question and this ADR deliberately leaves it open. It is the question a floating-edge design answers, and it is better answered against the smaller tree this leaves than against one where an unreachable router still has an opinion.

## A removal, not a prohibition

elkjs comes back when Auto-arrange is built, attached to an Edit rather than to a render. Nothing here says an algorithm is the wrong way to place Things; it says the render path is the wrong place to run one. Re-adding the dependency is a line and a lockfile.

One negative from the superseded record must not be buried by this one, because it is easy to mistake for the same subject. ADR 0025 preserved it from ADR 0013: **do not seed or constrain elkjs to honour a drop point.** Three spike increments tried — append, then branch, then seeded and interactive — and each reshuffled the *existing* Things by global optimisation and placed the new one arbitrarily. The failure is structural rather than a matter of tuning, and the write-up is `.scratch/graph-editing/`.

The destructive form is clear of that finding, and for a stated reason: it is not incremental placement. The author arranges by hand, then asks for a rearrangement of everything, and a global optimisation is exactly what they asked for. ADR 0025 said the same from the other side — "re-running a strategy is Auto-arrange's job… and it stays an explicit act."

## What it cost

**The hard-won elkjs knowledge leaves the guidance file while the problems it solves remain true of elkjs.** `FIXED_ORDER` orders ports clockwise, so EAST runs top-to-bottom and WEST runs bottom-to-top, and handing both sides one list order crosses every Graph at every shared Thing; a bare handle id leaves elkjs unable to tell which Thing an Edge attaches to and mislays even single-Graph graphs. Both were found by debugging, not by reading. The arguments stay tracked in `.scratch/layout-seam/issues/01-namespace-elk-port-ids.md` and `04-elk-fixed-side-ports.md`, and whoever rebuilds this reads those rather than `rendering.md`. That is the trade: the guidance file stops describing code that exists, and two issues become the record.

**Nobody has looked at an automatic arrangement on this canvas for some time.** `gridStrategy` is pure and tested and has never been seen. The first Auto-arrange will therefore be the first algorithmic result anyone judges here since the tracked fixture was made, and the fixture's own appearance was elkjs-placed.

**ADR 0079's sentence about automatic strategies thins out.** "Layout strategies stay distinct from Diagrams: the positioned strategy draws an authored Diagram and automatic strategies remain non-addressable capabilities" stays true and stops saying much, since it now governs one unused function. It is not superseded; it is waiting for Auto-arrange to give it subjects again.

## What this does not touch

Which Things a Diagram owns, what a Graph is, how a Graph is drawn or coloured, the Active Graph's emphasis, the four Graph-independent authoring handles of ADR 0033, the Edge-authoring gesture, or `positionedStrategy`. No stored document changes shape, so no fixture, migration or space file moves.
