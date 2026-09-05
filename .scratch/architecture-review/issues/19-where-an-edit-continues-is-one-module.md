# Where an Edit continues is one module

Status: resolved
Tags: release/v1, Improvement
Blocked by: `architecture-review/17` — it builds two of this ticket's call sites,
and doing this first means writing them twice
Related: `architecture-review/18` (this narrows `onBegin`); ADR 0016 (composed
dependencies); ADR 0042 (a replacement discards every open Interaction draft);
ADR 0081 (`browser-location.ts` made the same split for the History API)

Surfaced by: the 5 September 2026 architecture review, candidate "Where focus
goes after an Edit has no module", graded Strong. Designed out in full through a
grilling session on the same day; every decision below was taken there rather
than left to the implementer.

## The problem

The domain has one rule and `CONTEXT.md` states it in several places: **an Edit
continues at the thing it produced.** Add Card puts the caret in the new Card's
Title. Cancelling a creation pane returns focus to Add Card. A rename begun from
an entity-actions menu returns to the Sidebar row. A Card addressed by URL is
centred and focused once its projection exists. Add to Layout focuses the Card it
just added. A completed Edge gesture selects the Card it reached.

There is no module that holds that rule. There are **six implementations in five
different mechanisms**:

| Mechanism | Site |
| --- | --- |
| a boolean ref plus an effect keyed on a disjunction | `App.tsx:706`, written at `:713`, `:780`, `:868`, read at `:718–721` |
| a state value, a projection poll, then a DOM query | `App.tsx:186`, `:343–358` |
| a component inside `ReactFlowProvider` doing `fitView` then the same DOM query | `components/CardDestinationFocus.tsx` (25 lines) |
| an attribute query with a `.closest('li')` walk | `entity-actions.tsx:131–133`, called at `:158` |
| a captured DOM closure **stored on React state** | `App.tsx:380`, `:442`, invoked at `:449`, wired at `SpaceSidebar.tsx:409`, `:796`, `:924` |
| a published one-shot the adapter spends | `edge-authoring.ts:261`, `:486`, `:672–676`; `edge-authoring-react.tsx:505–525` |

Each carries a paragraph of rationale explaining a timing hazard specific to
*it* — the button is disabled so focus lands on `<body>`; the element is
unmounted by the time the editor commits; React has not yet swapped the editing
branch back; React Flow's release would undo a selection made during it. Those
are the same hazard: **the continuation runs before the surface it targets
exists.** Six answers to one question, and no place a seventh caller would look.

Two of them are near-literal duplicates: `App.tsx:343–358` and
`CardDestinationFocus.tsx` both wait for the node to appear and then run
`document.querySelector('.react-flow__node[data-id=…]')?.focus()`.

**The last row is the one that got it right**, and it is the shape the rest
should take. It is also the proof that the rule is not being learned: Edge
Authoring publishes `focusRequest` as one-shot state, and `edge-authoring.test.ts`
— 672 lines of node-environment tests written precisely so transitions would not
need a React tree — mentions `focusRequest` **zero times**. All four of its focus
assertions live in `edge-authoring-react.test.tsx`. Even the exemplar's rule is
reachable only through a tree.

### There are two channels, not one

Edge Authoring emits continuations twice over. `focusRequest` on its state is one.
The `CardId | null` **return value** of `connect`, `createConnectedCard` and
`endPointerDrag` is the other — `connection-completion.ts:110` already names that
parameter `continueAt`, and `App.tsx:775–779` already uses the word in prose:
"there is no naming continuation to hand focus to".

The returns of `connect` (`edge-authoring-react.tsx:293`) and
`createConnectedCard` (`:327`) are **discarded at their call sites**. Only
`endPointerDrag`'s is read (`:334`), and what it does with it is select a Card a
frame later. Meanwhile `App.tsx:638–639` selects *and* opens a title editor.

So a completed gesture owes the author a subject plus something that happens
there — and three modules have now independently discovered that separately.

## Direction

One in-process deep module in `app`, `continuation.ts`, on the
`edge-authoring.ts` / `edge-authoring-react.tsx` pattern the package already
uses: framework-free state behind `createObservableState`, composed in
`compose-app.ts`, spent by thin React adapters. It holds **one** pending
continuation at a time, which is what makes the replacement-epoch guard honest —
six refs cannot each be keyed by the epoch, and today none of them is.

The interface is a request and a one-shot. A completing gesture says *continue
here, and do this when you arrive*; an adapter spends it exactly once, when the
target is present.

## What to build

### The state

One pending continuation, or none:

```
interface Continuation {
  readonly target: ContinuationTarget;
  /** Whether the canvas selection moves to this target. */
  readonly select: boolean;
  /** What happens once it is reached. */
  readonly then: 'nothing' | 'focus' | 'reveal' | 'rename';
}
```

**Two axes rather than one flat intent list.** The gestures genuinely differ
along both: creation is select **and** rename, an Edge drop is select **and**
nothing, Add to Layout is focus with no selection move. A flat
`select | focus | reveal | rename` union cannot say the first without a fifth
member, and then a sixth.

`reveal` is `fitView` on the target followed by focus — the Card-addressed-by-URL
case, and the only member that touches the camera.

### The targets

```
{ kind: 'card'; cardId }
{ kind: 'edge' } & EdgeSubject
{ kind: 'canvas' }
{ kind: 'sidebar-row'; entity: SpaceChromeTitleSubject }
{ kind: 'control'; name: 'add-card' | 'layout-header' }
```

The first three are `edge-authoring.ts`'s existing `FocusRequest`, which this
type replaces; delete `FocusRequest` and `takeFocusRequest`, and remove
`focusRequest` from `EdgeAuthoringState`.

**A framework-free module cannot name a ref**, so every chrome target is a string
the adapter resolves against a stable addressing attribute. Graph rows already
carry `data-graph-id` (`SpaceSidebar.tsx:780`, `:804`). **Layout rows carry
nothing** — the direct-click path captures `event.currentTarget.closest('li')`
instead — so add `data-layout-id`, and give the two non-row controls
`data-continuation-control="add-card"` and `="layout-header"`. The adapter then
does the `[attr="id"]` plus `.closest('li')` walk in one place instead of at
`entity-actions.tsx:133`.

A name→ref registry was considered and rejected: it puts React refs behind a
module whose whole point is having none, and it carries its own lifetime bug when
a control unmounts and re-registers.

### Two adapters, one module

`reveal` needs `useReactFlow().fitView`, which means mounting inside
`ReactFlowProvider`. Chrome targets need only `document.querySelector`.

- **`CanvasContinuation`** — mounted beside `CanvasCentre` at `App.tsx:1133`,
  inside the provider. Owns `card | edge | canvas`, and is the only thing in the
  repo that calls `.focus()` for them.
- **`ChromeContinuation`** — mounted at the App root, outside the provider. Owns
  `sidebar-row | control`.

**They cannot be one.** The provider is conditional on `canvas.kind === 'cards'`
(`App.tsx:1126`), so a single adapter inside it would never spend a chrome
continuation while placement is pending or failed — which is exactly when a
creation pane is likely to have been cancelled.

Each reads `getState().pending`, checks the kind **itself**, and calls a nullary
`take()` only when it owns it. `take(kinds)` was rejected: which kinds an adapter
owns is a fact about the React tree's shape, and putting it in the module's
signature is how mount topology leaks into a module that has no framework.

### Readiness is discovered, waiting is policy

The adapter re-resolves on every render and spends the continuation when the
element appears. The module is told nothing; there is no `ready(fact)` protocol
for callers to forget to fire. This is what `edge-authoring-react.tsx:505–525`
already does and it works.

What **does** move into the module is the wait policy, which the adapter
currently hard-codes in a comment:

- an `edge` target that resolves to nothing **stays owed** — the projection
  carrying a completed Edit arrives a strategy later;
- **every** `card` target **stays owed** until the node is drawn, for the same
  reason. This corrects what this ticket first said, which was that only
  `then: 'reveal'` and `'rename'` wait and a `then: 'focus'` card falls through.
  Add to Layout is a `focus` whose target arrives a projection later exactly as
  a creation does — it is why the mechanism this replaces polled the live
  projection — so keying the wait on `then` would drop it. The two card targets
  that name something already drawn (a cancelled Edge draft's anchor, a deleted
  Edge's source) resolve on the first render either way. `staysOwed` therefore
  reads the target kind and not `then`;
- a `canvas` target and a chrome target **fall through** — both are drawn
  already, so unresolvable means gone for good.

Fall-through means the canvas fallback for canvas targets, and nothing for chrome.

### Invalidation

Discard a pending continuation on **two** facts, subscribed from `authoring` the
way `edge-authoring.ts:490–500` already subscribes:

- `replacementEpoch` changes — ADR 0042, all local work goes;
- the mode becomes `presenting` — the target is still drawn but spending onto a
  Sidebar row underneath a live presentation is wrong.

**Not** `selectedLayoutId` and **not** `activeGraphId`, which the draft rule
invalidates on. Over-invalidating is how a legitimate continuation is silently
lost, and a target in a Layout no longer drawn simply fails to resolve, which the
wait policy above already answers.

A second `request` before the first is spent **replaces** it, silently. A
continuation says where the author should be *now*; an older one is stale by
definition. No report — the module publishes its pending state, so a test sees
supersession without one. Firing *twice* is the bug class, and `take()` is what
prevents that.

### Composition

```
const continuation = createContinuation({ authoring, reportObserverError });
const edgeAuthoring = createEdgeAuthoring({ authoring, adapter, connections, continuation, reportObserverError });
```

Built in `composeApp` after `authoring` and before `edgeAuthoring`
(`compose-app.ts:172`), returned on `ComposedApp`. It takes the whole
`SpaceAuthoring` rather than narrowed epoch/presenting getters, because Edge
Authoring already takes it for exactly these two facts and `compose-app.ts`'s own
doc comment forbids the alternative: "do not manufacture a port or adapter seam
when the dependency has one in-process implementation" (ADR 0016).

`edge-authoring.ts:486` becomes one line:

```
const requestFocus = (target: ContinuationTarget): void =>
  continuation.request({ target, select: false, then: 'focus' });
```

### The frame deferral is a hypothesis, not an inheritance

`edge-authoring-react.tsx:340` defers `onSelectCard` by a `requestAnimationFrame`
because "selecting a Card during the release would be undone by the selection
changes the release itself produces". `App.tsx:638` selects with no deferral and
works, because a menu handler is not mid-gesture.

The **canvas adapter** owns this, unconditionally — it is a fact about React
Flow's dispatch ordering, and that adapter is the only module allowed to know
React Flow exists. Not a `defer` flag on the request, which would make every
future caller answer a rendering question in domain terms.

**Then try removing it.** Under this design the spend no longer happens inside
`onConnectEnd`: the gesture posts, and the adapter's effect spends on a later
render, after React has committed the release. That is a good part of what the
frame was buying. Test whether it is still needed and pin whichever answer holds
— do not carry a workaround past the removal of its cause.

Either way, **re-check the epoch across the boundary**: a continuation taken
before the frame and spent after it can outlive a replacement and select a Card
from a Space that is gone. `:340` has that hazard unguarded today, so this is a
defect the module closes rather than one it introduces.

### `rename` still reaches `CanvasCard` as a prop

`nameOnCreation` (`App.tsx:1174`) stays; only its source moves. App reads the
pending continuation and passes the Card when `then === 'rename'`. `@project/ui`
owns `CanvasCard`'s inline editor and depends only on `core`, so it cannot reach
this module — and it should not: a component refocusing its own control after its
own edit is genuine locality.

Note that `createdCardId` is set at `:639` and `:687` and **never cleared**, so
"spend it once" is not enforced anywhere today. The module is what introduces it.

## What this changes elsewhere

- **`architecture-review/17`** publishes **one** continuation rather than
  `focusRequest` and `continueAt` as two separate one-shots. Amended in the same
  pass as this ticket was written.
- **`architecture-review/18`** inherits a three-argument `onBegin`.
  `returnFocus` is a continuation, and this ticket removes it from
  `SpaceSidebar.tsx:325–330`, from the `spaceChromeEdit` state at `App.tsx:380`
  and `:442`, and from `onReturnFocus` at `:449`. Leaving it would have this
  ticket delete `focusRow` while an identical `() => row?.focus()` survived three
  lines away in the same file.
- `connect` and `createConnectedCard` lose their now-dead `CardId | null`
  returns, and `endPointerDrag`'s goes with them.

## Not in scope

- **`CardPane`'s opening focus** (`components/CardPane.tsx:48`). The review
  listed it, and it is a different rule: Base UI owns the focus trap and the
  component only selects the declared starting field inside it. There is no
  cross-module timing hazard and no second implementation of it anywhere.
- **`@project/ui`'s five `.focus()` sites** — `CanvasCard.tsx:301`,
  `MarkdownCardBody.tsx:169`, `:182`, `InlineTitleEditor.tsx:84`, `:128`. The
  package depends only on `core` and cannot import from `app`, and each is a
  component restoring focus after an edit it hosted. Genuine locality.
- **`PresentingChrome.tsx:140`.** A traversal step is not an Edit.
- **`react-flow-adapter`'s `CardNode.tsx:332`.** The node focusing itself.
- **The Cards drawer reveal** (`App.tsx:185`, `:288–311`). The review counted it,
  and it *is* a second continuation of the same URL arrival that
  `CardDestinationFocus` handles — with its own once-per-`(Layout, address)`
  guard that is exactly this module's supersession logic. It is excluded because
  its target is neither a canvas subject nor a chrome row: a Card outside the
  selected Layout is not drawn at all, so it needs a sixth target kind and a
  `then` member that opens a drawer. **Worth a follow-up ticket after this
  lands**, when the cost of that sixth kind can be judged against a built module
  rather than a planned one.
- **Converging the two adapters.** They are deliberately two; see above.

## Evidence

**Replace, don't layer** — `architecture-review/17`'s standard, and it applies
here. A `.focus()` census across `packages/app/test` finds ten assertions.

New node-environment `packages/app/test/continuation.test.ts` owns the
transitions, none of which needs a tree:

- a request supersedes an unspent one;
- `take()` yields once and leaves none behind;
- a replacement epoch discards a pending continuation;
- entering presenting discards one;
- the per-target wait policy: an `edge` and a `rename` stay owed, a `focus` card
  and a `canvas` fall through.

Moving:

- `edge-authoring-react.test.tsx`'s four focus assertions collapse to **one**
  adapter test proving `.focus()` is called on the resolved element; the rule
  moves to the node test above.
- `SpaceSidebarFixture.test.tsx:157` (`row.closest('li')` has focus) does the
  same for the chrome adapter.

Passing unchanged, as the regression net — these belong to `17`'s cutover and
read the module through it after this lands: `card-creation.test.tsx:202`,
`:221`, `:306`; `space-card-authoring.test.tsx:622`.

Untouched, and named here so a reader does not think they were missed:
`card-creation.test.tsx:188` and `:380` (pane initial focus), `CardsDrawer.test.tsx:94`,
`SpaceCanvas.test.tsx:445`, all six in `PresentingChrome.test.tsx`.

Expect some assertions that read a selection synchronously after creation to gain
an `await`, from the frame deferral above. If the frame proves removable, they
get it back.

`pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` **all apply** — the last because
the Layout row gains `data-layout-id` and the Sidebar has stories.

## Naming

`createContinuation` / `Continuation` / `ContinuationTarget` / `useContinuation`,
after `createEdgeAuthoring` / `EdgeAuthoring` / `useEdgeAuthoring`.

The word already has precedent in the tree: `pendingContinuation`
(`edge-authoring.ts:483`), `continueAt` (`connection-completion.ts:110`), the
local `const continuation` (`edge-authoring-react.tsx:334`), and App's own prose
at `:776`.

**Not added to `CONTEXT.md`.** It names a surface's state machine rather than
anything in the authored world — the same reason *projection* is deliberately
absent from that document, and `test/unit/current-domain-vocabulary.test.ts`
gives every term added there real weight. It belongs in `docs/agents/ui.md`
beside the other surface conventions, as `architecture-review/17` establishes for
`card-creation`.
