# A completed reconnection leaves the Edge focused but not selected

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
