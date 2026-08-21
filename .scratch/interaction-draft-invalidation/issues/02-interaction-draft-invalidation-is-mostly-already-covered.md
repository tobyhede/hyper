# Interaction-draft invalidation is mostly already covered, by accident

Status: ready-for-human

Surfaced by: investigating AGENTS.md's standing claim that ADR 0042's other half
is "not built", before building it

Moved from `.scratch/adr-0040-0042/issues/07` when that effort was split by
subject: its ADR 0042 tickets are this effort, its ADR 0040/0041 tickets are
`.scratch/layout-ownership-review/`.

## Context

AGENTS.md says, in the install-gate rule:

> Interaction-draft invalidation, 0042's other half, reads the same epoch and is
> not built.

`03`'s answer closes with the same sentence:

> Interaction-draft invalidation — the other half of ADR 0042 — is deliberately
> still unbuilt. It reads this same epoch.

**Both are misleading enough to send the next reader the wrong way.** Read as
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
(`packages/app/src/space-authoring.ts:136-150`), advanced in `acceptStoredSpace`
and nowhere else (`:1147-1167`, increment at `:1164`).

There are exactly **three** readers of it outside Authoring's own drain:
`render-adapter.ts:327-338`, `App.tsx:518`, and nothing else. No component
compares a captured epoch. There is **no shared contract test**.

## Each draft the ADR names, against the tree

| ADR 0042's draft | Exists? | Discarded on replacement? | By what |
|---|---|---|---|
| Title field — inline, on the graph | yes | **yes** | subtree unmount (over-determined, see below) |
| Title field — the opened-Card pane | yes | **yes** | unmount, via Navigation clearing `openedCardId` |
| A picker's unconfirmed target | **no** | n/a | no picker is built |
| React Flow's **drag** attempt | yes | **yes** | render adapter clears on epoch |
| React Flow's **connection** attempt | yes | **no** | document listeners outlive every unmount |
| An armed control's confirmation state | **no** | n/a | no destructive control is built |
| Selection (Cards, Edges) | yes | **yes** | unmount + render adapter |
| Traversal history | yes | **yes** | `navigation.openFresh` publishes whole |

### The canvas key is not what does the work, and is currently redundant

`App.tsx:518` keys `SpaceCanvas` on the epoch, with a comment saying it takes an
open title editor down with the Space it names. That outcome is real — everything
`SpaceCanvas` owns goes with it: `connectionGesture` (`SpaceCanvas.tsx:218`),
`modifierHeld` (`:219`), `selectedEdgeIds` (`:220`), `pointerOver` (`:224`),
`editingTitleCardId` (`:225`), `cardAuthoringWasEnabled` (`:240`), and
transitively `CardTitleEditor`'s `draft`/`error`/`cancelledBlur`
(`packages/react-flow-adapter/src/CardNode.tsx:50-53`).

**But the key is not what causes it today.** The same publication that advances
the epoch also nulls the projection (`render-adapter.ts:332`), which makes
`hasArrangement` false (`App.tsx:198`), which makes `canvasContent` answer
`placeholder` (`canvas-content.ts:22-23`), which renders `<PlacementPending />`
(`App.tsx:542`) **in place of the entire `ReactFlowProvider` subtree**. The
subtree unmounts whether or not the key changes.

So the guarantee is over-determined, and the key alone is untested: deleting
`key={authoringState.replacementEpoch}` from `App.tsx:518` fails nothing in
`pnpm verify` or `pnpm e2e`. That is fine as belt-and-braces and worth keeping —
but nobody should reason "the key handles drafts", because what handles them is
a placeholder branch that exists for an unrelated reason and could be changed by
someone who does not know it is load-bearing here.

### The opened-Card pane is covered by a third, different mechanism

`OpenCard` holds `title`, `description` and `body`
(`packages/app/src/components/OpenCard.tsx:69-71`) — the ADR's "title field owns
its changed text", and the largest draft in the app. It renders at
`App.tsx:561-572`, **outside** the keyed subtree and carrying no key of its own.

It is nonetheless discarded, because `acceptStoredSpace` calls
`navigation.openFresh` (`space-authoring.ts:1163`), `openFresh` publishes
`openedState` whole (`navigation.ts:215-217`), and `openedState` sets
`openedCardId: null` (`:164`). No opened Card, no pane, no state.

Correct outcome; incidental mechanism. It holds because Navigation resets, not
because anything observes the epoch, and no comment or test connects the two.

### Two of the four named drafts do not exist

**No picker.** ADR 0042 names Alias creation as the picker case — "Alias
creation, by contrast, remains a local picker draft until a target makes the
Alias valid" — and there is no Alias picker in the tree. The completion kinds
`created-alias`, `added-card-to-layout`, `created-card`, `added-graph` and
`recolored-graph` all exist behind Space Authoring with **no caller**: the only
five `complete({...})` call sites in the app are `App.tsx:305`, `App.tsx:344`,
`render-adapter.ts:254`, `:286` and `:309`. That is AGENTS.md's own "have no
control that reaches them, which packages 5 and 6 build".

The toolbar's Radix selectors are not pickers in this sense — `onValueChange`
commits immediately (`packages/ui/src/GraphSelector.tsx:44`), so there is no
unconfirmed target to hold.

**No armed destructive control.** Structural deletion is unbuilt (ADR 0033);
`SpaceCanvas.tsx:462` passes `deleteKeyCode={null}` with the comment "Deletion is
not built"; and `packages/app/e2e/editing.spec.ts:913` pins it — "the graph does
not advertise a delete action it does not implement".

### What no test pins

Every path is exercised; no draft is ever open when it is.

- `packages/app/test/Workspace.test.tsx:98` — the runtime and placement are
  replaced. `:185`, `:204`, `:259` — the refusal paths.
- `packages/app/test/viewport.test.tsx:79` — the viewport scale stays finite.
- `packages/app/test/render-adapter.test.ts:678` — the store drops its
  projection, selection and drag bookkeeping on epoch change. The closest thing
  to a draft-invalidation test, and it covers the store, not a surface.
- `packages/app/test/space-authoring.test.ts:2189`, `:2411`, `:2477` — epoch
  semantics and the queued-completion gate `03` built.
- `packages/app/e2e/http-persistence.spec.ts:108` — the only browser test through
  Accept remote. It asserts fresh Navigation and that `.graph-area` is *not*
  remounted; it opens no draft.

**None of them opens a title editor, starts a connection, or begins a drag
first.** So every "yes" in the table holds by construction and by reading, and
not one of them is defended against a regression. The ADR's "one shared contract
test" does not exist.

The nearest precedent for the guarantee is `editing.spec.ts:1022`, "changing the
renderer closes an opened Card rather than stranding its editor" — the same shape
for a different trigger.

## Acceptance

- [ ] A decision on silent discard versus an acknowledgement, recorded here.
- [ ] A decision on what "focuses the canvas" means, recorded here.
- [ ] A decision on the two unreachable survivors, recorded here.
- [ ] AGENTS.md and `03`'s answer no longer say the half is simply unbuilt.
- [ ] The covered cases are pinned, so they stop holding by accident: an inline
      title edit, an opened-Card draft and a drag, each open when a stored Space
      is accepted. This is the ADR's "one shared contract test", which does not
      exist today.

## Answer

The half is not unbuilt — it is unevenly built, and nothing tests the part that
works. Two of the four drafts ADR 0042 names have nothing to invalidate: no
picker and no armed destructive control exist, only their callerless completion
kinds. The two that do exist are discarded on every replacement already, by a
subtree unmount nothing tests and a key that is currently redundant. Three
things are genuinely left in the code, and only the first is a defect an author
can reach; a fourth item is the prose that sent this investigation the wrong way.

### 1. Focus after a replacement contradicts the ADR

The real defect, and it is not about a draft at all.

The ADR requires "App composition focuses the canvas only after the replacement
is complete". What App composition does instead is `App.tsx:361-369`: an effect
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
pane, argued at `App.tsx:347-359` — and simply cannot tell a replacement from a
close.

### 2. React Flow's connection attempt survives every unmount

The provider subtree does unmount (above), so React Flow's store is reset by
`StoreUpdater`'s cleanup. **The gesture is not in the store.**
`XYHandle.onPointerDown` attaches `mousemove`/`mouseup`/`touchmove`/`touchend` to
the *document* and removes them only inside its own `onPointerUp` — no React
cleanup, no abort signal. Nothing in `packages/` calls `cancelConnection`; the
grep returns zero hits. The surviving closures still hold the `onConnect` the
old `StoreUpdater` installed, which is App's `connectCards`.

It is unreachable today: the only caller of `acceptStoredSpace` is the Accept
remote `onClick`, a click needs a pointerup, and a pointerup is exactly when
React Flow ends a connection. A connection drag and the replacement cannot
overlap through any input this app offers.

### 3. `completedConnectionTarget` is a second survivor of the same family

`App.tsx:201` holds a ref outside the key, and `finishConnection`
(`App.tsx:265-272`) defers its use by a frame:

```ts
requestAnimationFrame(() => {
  useRenderAdapter.getState().selectCard(uuidSchema.parse(target));
});
```

A replacement landing inside that frame leaves `selectCard` naming a Card from
the Space that is gone. Same unreachability argument as 2, and the same question.

### 4. The prose that sends the next reader the wrong way

This part needs no decision. AGENTS.md's "not built" sentence and `03`'s closing
sentence should say what this ticket establishes instead: that the drafts which
exist are already discarded, by an unmount nothing tests and one redundant key;
that the two drafts needing new work do not exist yet; and that what remains is
focus behaviour plus two survivors behind an unreachable trigger.

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
  describes, which has some value on its own.

Until the first is answered, building anything here is guessing at product
behaviour. The answer's fourth item is the exception — the prose correction
stands whichever way these three go, so it does not wait on them.
