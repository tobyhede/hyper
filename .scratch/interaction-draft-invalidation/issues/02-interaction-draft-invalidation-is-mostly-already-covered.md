# Interaction-draft invalidation is mostly already covered, by accident

Status: ready-for-human

Surfaced by: investigating AGENTS.md's standing claim that ADR 0042's other half
is "not built", before building it

Moved from `.scratch/adr-0040-0042/issues/07` when that effort was split by
subject: its ADR 0042 tickets are this effort, its ADR 0040/0041 tickets are
`.scratch/layout-ownership-review/`.

## Context

Both quotations below are what the documents said when this investigation began.
Section 4 of the Answer records that both have since been corrected, so neither
sentence is in the tree any more; they are kept here because they are what the
ticket exists to answer.

AGENTS.md said, in the install-gate rule:

> Interaction-draft invalidation, 0042's other half, reads the same epoch and is
> not built.

`01`'s answer closed with the same sentence:

> Interaction-draft invalidation — the other half of ADR 0042 — is deliberately
> still unbuilt. It reads this same epoch.

**Both were misleading enough to send the next reader the wrong way.** Read as
written, they ask for a mechanism covering four drafts. Two of those four do not
exist to cover. The two that do exist are already discarded on a replacement —
but by mechanisms that were built for other reasons, that nothing tests, and one
of which is currently redundant. What is genuinely left is a focus behaviour the
ADR states and the code contradicts, plus two survivors nothing can currently
reach.

This is filed rather than implemented because what remains carries a product
decision. It needs a human to **answer** the question at the bottom; the
implementation after that is small.

### What ADR 0042 asks for

> A title field owns its changed text, a picker owns its unconfirmed target,
> React Flow owns its connection **or drag** attempt, and an armed destructive
> control owns its confirmation state.

> Every interaction-local owner discards its draft when that epoch changes;
> target-bound surfaces close, selection and Traversal history clear, and App
> composition focuses the canvas only after the replacement is complete.

> The epoch is invalidation, not a registry. Space Authoring does not know which
> field, picker, popover, drag or armed control is open […] Each owner compares
> or is keyed by the epoch and applies its own normal cancellation.

> The accepted cost is distributed reset handling, **pinned by one shared
> contract test and surface-specific focus tests**.

The signal itself is built and correct: `SpaceAuthoringState.replacementEpoch`
(`packages/app/src/space-authoring.ts:221`), advanced in `acceptStoredSpace`
and nowhere else (`:1344-1364`, increment at `:1361`).

There are exactly **two** readers of it outside Authoring's own drain: the render
adapter's subscriber (`render-adapter.ts:524-535`, which reads the epoch twice
within the one subscription — before and after) and the canvas key
(`App.tsx:639`). Nothing else. No component compares a captured epoch, and there
was **no shared contract test** — section 5 of the Answer is where that stopped
being true.

## Each draft the ADR names, against the tree

| ADR 0042's draft | Exists? | Discarded on replacement? | By what |
|---|---|---|---|
| Title field — inline, on the graph | yes | **yes** | subtree unmount (over-determined, see below) |
| Title field — the opened-Card pane | yes | **yes** | `navigation.openFresh` clears `openedCardId` |
| A picker's unconfirmed target | **no** | n/a | `NewAlias` is built and holds none |
| React Flow's **drag** attempt | yes | **yes** | render adapter clears on epoch |
| React Flow's **connection** attempt | yes | **no** | document listeners outlive every unmount |
| An armed control's confirmation state | **no** | n/a | Edge delete is built and unarmed |
| Selection (Cards, Edges) | yes | **yes** | unmount + render adapter |
| Traversal history | yes | **yes** | `navigation.openFresh` publishes whole |

### The canvas key is not what does the work, and is currently redundant

`App.tsx:639` keys `SpaceCanvas` on the epoch, with a comment saying it takes an
open title editor down with the Space it names. That outcome is real — everything
`SpaceCanvas` owns goes with it: `editingTitleCardId`
(`packages/app/src/components/SpaceCanvas.tsx:173`), `canvasAuthoringWasEnabled`
(`:219`), `lastCreatedCardId` (`:231`), and transitively the title editor's
`draft` and `error` (`packages/ui/src/CanvasCard.tsx:193-194`). The gesture state
this ticket first listed here — `connectionGesture`, `modifierHeld`,
`selectedEdgeIds`, `pointerOver` — has since moved to Edge Authoring, which the
same subtree still owns.

**But the key is not what causes it today.** The same publication that advances
the epoch also nulls the projection (`render-adapter.ts:530`), which makes
`hasCardsOnCanvas` false (`App.tsx:204`), which makes `canvasContent` answer
`placeholder` (`canvas-content.ts:22-23`), which renders `<PlacementPending />`
(`App.tsx:676`) **in place of the entire `ReactFlowProvider` subtree**. The
subtree unmounts whether or not the key changes.

So the guarantee is over-determined, and the key alone is untested: deleting
`key={authoringState.replacementEpoch}` from `App.tsx:639` fails nothing in
`pnpm verify` or `pnpm e2e`. That is fine as belt-and-braces and worth keeping —
but nobody should reason "the key handles drafts", because what handles them is
a placeholder branch that exists for an unrelated reason and could be changed by
someone who does not know it is load-bearing here.

### The opened-Card pane is covered by a third, different mechanism

`OpenCard`'s `MarkdownDraft` holds `title`, `body` and `titleError`
(`packages/app/src/components/OpenCard.tsx:36-40`) — the ADR's "title field owns
its changed text", and the largest draft in the app, since the body is Markdown
prose. It renders at `App.tsx:692-711`, **outside** the keyed subtree and
carrying no key of its own. (The ticket first named a `description` beside the
other two; it is gone from this draft and from the domain — `git grep description
-- 'packages/*/src'` now returns nothing.)

It is nonetheless discarded, because `acceptStoredSpace` calls
`navigation.openFresh` (`space-authoring.ts:1360`), `openFresh` publishes
`openedState` whole (`navigation.ts:215`), and `openedState` sets
`openedCardId: null` (`:164`). No opened Card, no pane, no state.

Correct outcome; incidental mechanism. It holds because Navigation resets, not
because anything observes the epoch, and no comment or test connects the two.

### Two of the four named drafts do not exist

**No picker.** ADR 0042 names Alias creation as the picker case — "Alias
creation, by contrast, remains a local picker draft until a target makes the
Alias valid" — and Alias creation, now that it is built, holds no picker draft.
`NewAlias` says so itself (`packages/app/src/components/NewAlias.tsx:61-64`):
"Choosing the Target is therefore the completion rather than a step before one,
which is why there is no Create button beside Cancel: a second activation would
ask the author to confirm a choice they have already made, and the pane would
have to hold an unconfirmed Target across it." An Alias without a Target is not
a valid Card, so the pane holds local state and never an unconfirmed target.

`added-card-to-layout`, `added-graph` and `recolored-graph` do still exist behind
Space Authoring with no caller, and that is AGENTS.md's own "have no control that
reaches them, which packages 5 and 6 build" — but `created-card` and
`created-alias` have since acquired theirs (`App.tsx:304`, `:337`), which is
what made this row answerable from a built surface rather than from an absence.

**No armed destructive control.** Structural deletion is still unbuilt (ADR
0033). Edge deletion since has been: `deleteKeyCode` is `['Backspace', 'Delete']`
(`edge-authoring-react.tsx:80`, `:832`), plumbed through `SpaceCanvas.tsx:427`
and `:457`. It is not an *armed* control and so holds no confirmation state to
invalidate — `SelectedEdgeControls.tsx:122` says so outright: "**Delete is
immediate.** There is no confirmation step: a refused Delete says so on this
surface, and an accepted one is undone by authoring the Edge again." The draft
this row is about is a control that has been armed and is waiting; nothing in
the tree waits.

### What no test pins

Every path is exercised; no draft is ever open when it is.

- `packages/app/test/Workspace.test.tsx:98` — the runtime and placement are
  replaced. `:188`, `:207`, `:262` — the refusal paths.
- `packages/app/test/viewport.test.tsx:79` — the viewport scale stays finite.
- `packages/app/test/render-adapter.test.ts:895` — the store drops its
  projection, selection and drag bookkeeping on epoch change. The closest thing
  to a draft-invalidation test, and it covers the store, not a surface.
- `packages/app/test/space-authoring.test.ts:2123`, `:2398`, `:2456` — epoch
  semantics and the queued-completion gate `01` built.
- `packages/app/e2e/http-persistence.spec.ts:176` — the only browser test through
  Accept remote. It asserts fresh Navigation and that `.graph-area` is *not*
  remounted (`:217`, `:251`); it opens no draft.

**None of them opens a title editor, starts a connection, or begins a drag
first.** So every "yes" in the table held by construction and by reading, and not
one of them was defended against a regression.

That gap is now closed by `packages/app/test/replacement-invalidation.test.tsx` —
the ADR's "one shared contract test", built after this investigation and
described in the answer below. What it does *not* close is the argument above:
two of its three cases still pass under either single mechanism, which is the
over-determination measured rather than reasoned.

The nearest precedent for the guarantee is `packages/app/test/navigation.test.ts:158`,
"closes an opened Card when the renderer changes, so no editor outlives its
placement" — the same shape for a different trigger.

## Acceptance

- [ ] A decision on silent discard versus an acknowledgement, recorded here.
- [ ] A decision on what "focuses the canvas" means, recorded here.
- [ ] A decision on the two unreachable survivors, recorded here.
- [ ] A decision on whether an arriving conflict should commit an in-progress
      inline rename, recorded here. Surfaced by 5 below: the modal that carries
      `Accept remote` blurs the field, and blur is that editor's commit.
- [x] `docs/agents/editing-and-persistence.md` (where AGENTS.md's install-gate
      rule now lives) and `01`'s answer no longer say the half is simply
      unbuilt. Both now carry the finding in a sentence and point here for the
      argument; `01`'s Direction keeps what was believed when it was written,
      marked as corrected rather than rewritten.
- [x] The *reachable* covered cases are pinned, so they stop holding by
      accident: an opened-Card draft and a drag, each open when a stored Space is
      accepted. This is the ADR's "one shared contract test", and it is
      `packages/app/test/replacement-invalidation.test.tsx`. It asserts the
      discard and nothing else — not that the discard is silent, not where focus
      lands — so it freezes none of the decisions above. The inline title edit is
      *not* pinned, and 5 below says why it cannot be through the app's own
      trigger.

## Answer

**This records what the investigation established; it does not resolve the
ticket.** `Status:` stays `ready-for-human` because the three decisions in
Comments are open, and the Acceptance boxes above are the ones that close it.
Read the heading as the answer to "is this built?", which was answerable from the
tree, and not as the answer to "what should happen?", which is not.

The half is not unbuilt — it is unevenly built, and nothing tests the part that
works. Two of the four drafts ADR 0042 names have nothing to invalidate. Both of
those surfaces have since been built and neither holds a draft: choosing an
Alias Target is itself the completion rather than a step before one, and Edge
delete is immediate rather than armed, so there is no unconfirmed target and no
confirmation state for a replacement to discard. The two that do exist are
discarded on every replacement already, but by three separate mechanisms and not
in every gesture: the opened-Card pane goes with Navigation's reset, an
in-flight drag with the render adapter's epoch subscriber, an inline title
editor with the subtree unmount, and the canvas key over all of them is
currently redundant. React Flow's owner is the partial one — its drag is
discarded and its connection attempt is not, because that gesture lives in
document listeners no unmount reaches. Three things are genuinely left in the
code, and only the first is a defect an author can reach. Two further items
needed no decision and are therefore done rather than deferred: the prose that
sent this investigation the wrong way, and the contract test — which is what
makes "nothing tests them" a sentence about the past.

### 1. Focus after a replacement contradicts the ADR

The real defect, and it is not about a draft at all.

The ADR requires "App composition focuses the canvas only after the replacement
is complete". What App composition does instead is `App.tsx:558-565`: an effect
that, whenever `openedCardId` goes from a Card to `null` outside presenting,
focuses the DOM node of the Card that *was* open —

```ts
document
  .querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(closed)}"]`)
  ?.focus();
```

Accepting a stored Space makes `openedCardId` `null`, so this fires on a
replacement, holding an id from the **replaced** Space. Two outcomes, neither the
ADR's:

- The replacement has no such Card: `?.focus()` finds nothing, focus falls to
  `<body>`. A keyboard author lands at the top of the document with nothing said
  about the workspace being replaced under them.
- The replacement has a Card with that id: focus lands, silently, on a Card the
  author never opened in a Space they have not seen.

The effect is right for what it was written for — returning focus after closing a
pane, argued at `App.tsx:543-556` — and simply cannot tell a replacement from a
close.

### 2. React Flow's connection attempt survives every unmount

The provider subtree does unmount (above), so React Flow's store is reset by
`StoreUpdater`'s cleanup. **The gesture is not in the store.**
`XYHandle.onPointerDown` attaches `mousemove`/`mouseup`/`touchmove`/`touchend` to
the *document* and removes them only inside its own `onPointerUp` — no React
cleanup, no abort signal. Nothing in `packages/` calls `cancelConnection` — the
one hit is a doc comment in `edge-authoring-react.tsx:440-443`, which reaches the
same reading from the other side and adds that React Flow does cancel from "the
whole flow unmounting". That is its *store*, not these listeners, and the same
comment says why the distinction holds: "the listeners are plain DOM ones with no
React cleanup, so even an Edge that leaves the projection mid-drag still ends
through here." The surviving closures still reach an `onConnect`, though not a
captured one: `@xyflow/react` resolves it from `store.getState()` at call time,
so a late release runs whichever handler the store holds — the Edge Authoring one
(`edge-authoring-react.tsx:54`), not the `connectCards` this ticket first named,
which survives only as a comment (`render-adapter.ts:352`).

It is unreachable today: the only caller of `acceptStoredSpace` is the Accept
remote `onClick`, a click needs a pointerup, and a pointerup is exactly when
React Flow ends a connection. A connection drag and the replacement cannot
overlap through any input this app offers.

### 3. The deferred connection continuation is a second survivor of the same family

Edge Authoring defers the continuation selection by a frame, so that React Flow
has settled its own gesture before a Card is selected — twice, once for the
pointer release (`edge-authoring-react.tsx:368`) and once for keyboard Connect
(`:787`):

```ts
requestAnimationFrame(() => onSelectCard(continuation));
```

A replacement landing inside that frame leaves `onSelectCard` naming a Card from
the Space that is gone. Same unreachability argument as 2, and the same question.
(This was `completedConnectionTarget` and `finishConnection` on `App.tsx` when
the ticket was written; the survivor moved with Edge Authoring and neither name
is in the tree now.)

### 4. The prose that sent the next reader the wrong way — corrected

This part needed no decision, so it is done rather than waiting with the rest.
The "not built" sentence — which moved from AGENTS.md into
`docs/agents/editing-and-persistence.md` when the scoped agent docs were split
out — and `01`'s closing sentence now say what this ticket establishes: that the
drafts which exist are already discarded, by an unmount and one redundant key;
that the two drafts needing new work do not exist yet; that the contract test in
5 below now pins the discard; and that what remains is focus behaviour and two
survivors behind an unreachable trigger. Both point here rather than restating
the argument. `01`'s Direction is left as written and marked as
corrected — it is the record of what was believed when the epoch gate was built,
and rewriting it would falsify the thing the ticket exists to preserve.

### 5. The contract test, and what measuring it added

Built as `packages/app/test/replacement-invalidation.test.tsx`, since it needed
no decision either: it pins the discard ADR 0042 already requires and asserts
nothing about acknowledgement or focus, so it survives whichever way the
questions below are answered.

Mutation-checking it turned this ticket's central claim from an argument into a
measurement. **K** deletes the canvas key, **R** stops the render adapter's epoch
subscriber clearing, **N** makes `openFresh` retain `openedCardId`:

| case | K | R | K+R | N |
|---|---|---|---|---|
| opened-Card pane | passes | passes | passes | **fails** |
| in-flight drag | passes | **fails** | **fails** | passes |

The drag is the one case a single mutation kills, and `reconcile` is why — a
surviving Card takes its position from the live node, so a store that kept its
projection would go on drawing the Card where the pointer left it, under the
accepted Space's title. An unmount cannot reach a store.

**The inline title field is absent from that table, and the reason is a finding
of its own.** It was in the first draft of this test, written when the conflict
banner was inline chrome and a workspace could be mounted already-conflicted with
its Cards still reachable. `Accept remote` now lives in a modal `AlertDialog`
(`PersistenceControl.tsx`), so the draft has to be opened *before* the conflict is
raised — and raising it traps focus into the dialog, which blurs the field, and
blur is `CardTitleEditor`'s own commit. Measured, not reasoned: with the field
open and a rename typed, the input is gone from the DOM by the time
`persistence-accept-remote` is on screen, and the typed text has been committed.
There is no open draft left for the replacement to discard.

**The drag left in flight exposed an unguarded path of the same family — not a
fourth draft, but the absence of a guard on the one the drag uses.** The test
never releases its drag, which raised the question of what a late `mouseup`
would do — the gesture began against the Space that is gone. Tracing
`changeNodes` answered it badly: `render-adapter.ts:249` reads
`dragOrigins.get(change.id) ?? beforeById.get(change.id)`, so clearing
`dragOrigins` on the epoch is **not** what would stop a stale settled change,
and the only guards on that path are `projection === null` (`:423`) and the
owned-id filter (`:431-433`). By the time a replacement has landed the
projection is non-null again and the Card id is unchanged, so a settled change
arriving then would reach `authoring.complete({ kind: 'settled-card-movement', …
})` (`:481`). Authoring's epoch gate would not catch it either — that gate
applies to *queued* completions, not to a fresh `complete` call.

Measured rather than reasoned, by instrumenting `changeNodes` and bisecting:

| what the test does | settled change emitted? | `working` after |
|---|---|---|
| drag, release, no replacement | yes, `{130,80}` | `{130,80}` |
| drag, raise conflict, release | yes, `{145,95}` | `{145,95}` |
| drag, **accept remote**, release | **none** | `{900,700}` |
| drag, accept, move, release | **none** | `{900,700}` |

So nothing stale is installed today — but not because this code refuses it. The
leaked `mouseup.drag` listener does fire and does reach XYDrag's `end`; it falls
through without emitting, because the keyed `SpaceCanvas` remount left its
gesture state inert. **The protection is entirely React Flow's**, and a change to
how that state machine settles would land here with no guard of ours in the way.
Same unreachability as 2 and 3, and it belongs with them in the question below:
closing it means capturing the epoch with the drag and dropping a settled change
whose gesture began before it.

Two things follow. First, the over-determination this ticket opened with is
**undefended**: the canvas key and the projection reset are each sufficient for
the drafts inside the canvas subtree, only the title field distinguished them,
and with it unreachable `K` alone breaks nothing in the suite. Second, there is a
new product question — *should a conflict arriving under an in-progress rename
commit it?* — which is listed with the others below rather than answered here.

## Comments

### The question that needs answering — deferred, and blocking the rest

**When an author's Space is replaced out from under an open draft, what should
they see?**

Every "yes" in the table discards silently. That is defensible while the author
pressed the button themselves — they clicked Accept remote, so they asked for it.
It is much weaker for the opened-Card pane, where the discarded draft can be a
paragraph of Markdown they typed, and the pane vanishes with no acknowledgement
that anything was lost.

Three separable answers are needed:

- **Does silent discard stay the answer?** If yes, the remaining work is small
  and mechanical: teach the focus effect to tell a replacement from a close, and
  pin the covered cases so they stop being accidents. If no, the shape of the
  acknowledgement — a status line, a confirm ahead of Accept remote, retaining
  the text somewhere — is a design question this ticket cannot answer.
- **Where should focus land?** "The canvas" is the ADR's word. The flow
  container, the first Card, or the toolbar control that replaced Accept remote
  are all readings of it, and they behave differently for a screen reader.
- **Are the two unreachable survivors worth closing?** Closing 2 means calling
  `cancelConnection` on an epoch change, which needs a component inside the
  provider to observe the epoch — the first surface that would "compare the epoch
  it captured" as the ADR describes. Closing 3 means capturing the epoch with the
  ref and dropping the callback if it moved. Both are cheap; neither is
  reachable; doing them adds the first real instance of the pattern the ADR
  describes, which has some value on its own. The unguarded settled-change path
  measured in 5 belongs with them: it is the same unreachable trigger, but unlike
  2 and 3 nothing of ours refuses it — only React Flow's gesture state does — so
  it is the one where "leave it, it cannot happen" rests on a third party's
  internals rather than on our own.

Until the first is answered, building anything here is guessing at product
behaviour. The answer's fourth item was the exception — the prose correction
stands whichever way these three go, so it did not wait on them and is done.
