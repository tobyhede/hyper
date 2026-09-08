# A completed reconnection leaves the Edge focused but not selected

Status: resolved

Found while building issue 06's application evidence for "completion and focus
after reprojection". **Not caused by that change and not fixed by it** — the
code below is untouched by it — but it makes a stated intent in
`edge-authoring.ts` false, so it is written down rather than left in a test
comment.

## What happens

Complete a reconnection through the endpoint editor. Focus lands on the
reconnected Edge, exactly as `EdgeAuthoring.reconnect`'s focus request intends.
Its **selection does not survive**: no Edge carries `.react-flow__edge.selected`
afterwards, so the Edge the author is standing on offers no controls, and
Delete and Edit have to be reached by selecting it again.

`reconnect` in `packages/app/src/edge-authoring.ts` plainly means the opposite,
and says so:

> **The author stays on the Edge they edited**, which is the matrix's focus for
> a completed Reconnect and needs saying because nothing else supplies it.

It installs the new subject — `adapter.getState().selectEdge(reconnected)` —
immediately before requesting focus. So the selection is installed and then
lost.

## Measured

Against the tracked fixture, `Collection 1`, Graph `Long`: select `A→B`, Edit,
move `To` to `D`.

- focused element's `aria-label`: `Edge from A to D in Long` — the reconnected Edge
- `.react-flow__edge.selected`: **0**
- `Edit this Edge` control: **0**

## The lead

The render adapter folds selection additively (`docs/agents/rendering.md`): one
React Flow selection action produces two callback batches — the new subject
selected, then the other kind deselected — and the second batch clears the union
only when it still names the stored subject. The subject is compared by value
while React Flow knows an Edge by `<graphId>::<index>`, and **that index
re-indexes whenever a Graph's Edge list changes**. A completed reconnection
rewrites the list, so the deselection batch that follows it carries an id that
now resolves to a *different* Edge — plausibly the newly selected one, which
would clear the union that was just installed.

Unverified. It is the shape of the bug the index-based id is known to cause, not
a confirmed trace.

## Where it is not covered

`editing.spec.ts`'s "the Edge editor moves an endpoint and keeps the Edge in its
Graph" asserts the focus half, which holds. Nothing asserts the selection half,
which is why this survived.

## Answer

Fixed by minting a React Flow Edge id from the Edge's domain identity —
`` `${graph.id}::${edge.from}::${edge.to}` `` in `buildGraphRenderEdges`
(`packages/graph/src/graph-rendering.ts`) — in place of the Edge's position in
its Graph. That is the same triple `sameEdgeSubject` compares an Edge selection
by, and ADR 0032 makes it unique within a Graph.

**The lead above named the right cause and the wrong mechanism**, so it is worth
recording which. Traced in the browser by logging every `selectEdge` with its
stack: `changeEdges` is never reached with a selection change on this path at
all — React Flow emits no stale deselection here — and the writes are

1. `selectEdge(A→D)` from `reconnect`, and then
2. `selectEdge(A→B)` from `edge-authoring-react.tsx`'s `domAttributes.onFocus`,

which is the bridge that makes React Flow's Edge focus and the union agree. Both
Edges were drawn as `<graphId>::0`, so the element the *departed* Edge had
already been drawn as answered `CanvasContinuation`'s query for the reconnected
one — one commit before React Flow redrew it — and `.focus()` on it fired an
`onFocus` still closed over `A→B`. The Edge then drew focused, named `A→D`, and
selected nothing.

Keyed on the endpoints, the reconnected Edge is an element React Flow has never
drawn. The continuation stays owed (`staysOwed`) until it is, and the `onFocus`
that then fires writes the subject already stored.

Covered by:

- `packages/graph/test/graph-rendering.test.ts` — the id is minted from the
  endpoints, and removing an earlier Edge leaves the survivors' ids unchanged.
- `packages/app/test/edge-authoring-react.test.tsx` — "leaves the reconnected
  Edge selected, not only focused", which reproduces the whole sequence in the
  node environment on the real canvas harness.
- `packages/app/e2e/editing.spec.ts` — "the Edge editor moves an endpoint and
  keeps the Edge in its Graph" now asserts the selection half beside the focus
  half: one `.react-flow__edge.selected`, carrying the reconnected Edge's own
  label, with `Edit this Edge` visible.

One consequence came with it and is now handled. Because the reconnected Edge is
an element React Flow has never drawn, it is drawn a commit after the projection
that carries it — React Flow syncs the `edges` prop into its own store from an
effect and draws from that — so the focus continuation cannot be spent on the
render that publishes. Nothing re-rendered `CanvasContinuation` on that second
commit, which left the spend waiting on whatever unrelated render came along
next, and on nothing at all if none did. It now subscribes to React Flow's own
drawn Edges, so the render it needs is the one that draws. That gap was
invisible while a replaced Edge inherited its predecessor's element; it is a
property of the id change rather than of any one gesture.

The other thing the position-keyed id gave away is a guarantee: it was unique by
construction, and `<graphId>::<from>::<to>` is unique only because a Graph cannot
hold the same pair twice. `validateReferences`' `duplicate-graph-edge` and Space
Authoring's `edge-already-exists` are what hold that up, and
`buildGraphRenderEdges`' doc comment now names them.
