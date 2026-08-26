# Expanding Cards — what the prototype found

Status: resolved
Relates: **ADR 0064** (the decision this produced), `.scratch/expanded-cards/spec.md` (how it gets built), issue 01 (render a Space Card as a sub flow), issue 05 (grill Space Card navigation), ADR 0006, ADR 0037, ADR 0051, ADR 0058

**The direction was taken.** ADR 0064 supersedes ADR 0006 and records it: opening a
Card expands it in place, expansion is a Layout property, and the neighbour
displacement is derived. Three of the four switches are decided *off* — scroll is
not contained, no 16:9, no camera follow — and `push neighbours` is the only one
left in the prototype. What is written below is what the prototype found, kept as
the evidence the ADR was taken on; where it reads as an open question, the ADR is
the answer.

`packages/app/stories/review/expanding-cards.{tsx,css,stories.tsx}` — Review →
Expanding cards. Two stories: one Card expanding, and two open at once.

Built to settle by interaction what the model discussion could not settle by
argument. The contested behaviours are switches above the canvas rather than
choices baked in, so each can be felt both ways.

## The model claim the code makes

`CardPlacement` — `{ x, y, expanded, width, height }` keyed by Card — is the one
deliberate model statement in the prototype. It is the card-to-**rect** map a
Layout becomes if expansion is authored, and position, expansion and size move
through one value for the same reason they would there. The readout at the
bottom-left prints it live, so what a drag or a resize costs a Layout is visible
while it happens.

Collapsed size is deliberately *not* stored. A collapsed Card is
`CARD_WIDTH x CARD_HEIGHT`, the constant `packages/app/src/card.ts` argues for,
and nothing about expanding needs that to change.

## Confirmed by use

- **The Card grows in place and stays the same object.** Same rail, same ink,
  same paper, same Edges still attached to it while it changes size. The
  transition is on React Flow's node wrapper, so handles and Edges travel with
  the Card instead of snapping ahead of it.
- **Editing works on the canvas.** CodeMirror in a node, with a caret, behind
  the same lazy split production uses.
- **Editing is a gesture, not the expanded state.** A double click on the title
  renames and a double click on the source puts a caret in it — `Enter`
  completes a title, `Mod-Enter` completes the source, `Escape` abandons
  either, and clicking away completes either. One caret at a time, canvas-wide.
  This is the answer to the question the discussion left open: several Cards
  expanded is not several live editors, because expansion is what the Layout
  authored and the caret is what the author asked for a moment ago. It also
  keeps ADR 0037 intact — the resting expanded Card shows its *source*, so
  nothing here revives the reading state that ADR deleted.
- **The collapsed Card's own title editor is what renames.** `CanvasCard`'s
  `state: 'editing'` with its three completions, refusal display and focus
  return, exactly as `CardNode` wires it — including `onReturnFocus` reaching
  the React Flow node through `closest('.react-flow__node')`. The prototype
  writes the same contract again for the *expanded* Card's title, because
  `CanvasCard` does not export its editor; that duplication is a prototype
  cost, and a production version would want one component for both.
- **Two open at once works**, which is the capability a modal forecloses by
  construction and the thing the rest of the cost has to buy.
- **`nowheel` contains the editor's scroll.** A wheel over an expanded Card
  moves neither the canvas nor the zoom. React Flow's four escape hatches are
  each load-bearing and each answers a different collision: `nodrag` (a text
  selection dragging the Card out from under the caret), `nopan` (a click-drag
  in the editor panning the canvas), `nokey` (arrow keys moving the Card instead
  of the caret), `nowheel` (the scroll fight).

  **Superseded as guidance by ADR 0064** ("Three behaviours stay off"): the
  containment works, and it is not adopted. No `nowheel` is added to an Open
  Card — the wheel belongs to the canvas everywhere, and an Open Card that needs
  more room is resized. Read this bullet as what the prototype measured, not as
  what to build. The other three hatches are untouched by that decision.
- **React Flow's own `NodeResizer` is in the pinned 12.11.2** and carries
  `keepAspectRatio`, so the 16:9 question is a prop rather than a rewrite.

## Found by building it, and not anticipated

**Expanding must raise the Card.** React Flow paints in node order, so without
an explicit `zIndex` a Card grows *underneath* whatever was declared after it —
the neighbours end up in front of the thing you just opened. Fixed in the
prototype with `zIndex: expanded ? 10 : 0`. A real Layout owes the same answer,
and two Cards expanded at the same z-index still resolve by document order,
which is not a rule anyone chose.

**Expanding collides, and the answer prototyped is that the collision is
derived.** A Layout's positions were authored for `260x146` boxes, so expanding
one to `560x420` overlaps its neighbours immediately. Three answers were
available: neighbours are *edited* out of the way, Cards simply overlap, or the
displacement is **computed from which Cards are expanded** and never stored.
The third is what `displacementOf` does — a Card `+x` of an expanded one takes
that Card's growth on its own `x`, and the same for `y`, summed over every
expanded Card. Both comparisons read authored positions on both sides, so the
result does not depend on visit order.

What that buys: the authored Layout is never rewritten, so collapsing puts
every neighbour back *exactly* rather than approximately, and a Card that
starts expanded is arranged the same way a Card expanded by hand is — the
`Two open at once` story needs no second fixture. It costs an Edit nowhere,
which is the part that matters for the model: a Layout stays one rect per Card,
and `expanded` is the only thing the arrangement follows from.

`push neighbours` is a switch, so the overlap is still one click away. Turn it
off on `Two open at once` to see the collision the authored Layout actually
has.

Two things it does **not** answer. The rule compares origins, not boxes, so a
Card that starts left of an expanded Card's `x` but overlaps its width is not
moved — the expanded Card grows over it. And the rule is a step function: drag
a Card across an expanded Card's authored `x` and the drawn position jumps by
that Card's growth, because which side of it the Card is on has changed. Both
are the rule being what it is rather than bugs, and both are visible.

## Not verified

Synthetic wheel events did not reproduce the scroll fight with **contain
scroll** off, and synthetic drags did not engage `NodeResizer`'s handles. Both
need a real pointer and trackpad. The `nowheel`-on case *was* confirmed — the
canvas does not move — so the containment half is evidence and the fight half
is still only ADR 0006's argument.

One cost is confirmed and unresolved: the double click that opens the source
editor does not carry the caret to the word it landed on. The read view and the
editor are two components, so the editor mounts focused at the document start —
the text does not move, but the caret is not where the pointer was. A word-level
answer would need the click position mapped into the mounted editor.

## The switches, and what each is really asking

- **push neighbours** — off, an expanded Card overlaps whatever was `+x` or
  `+y` of it, which is the authored Layout drawn honestly. On, the neighbours
  take its growth, derived and reversible (above). The question underneath is
  whether an author wants the arrangement to answer for the expansion at all,
  or would rather place the expanded Card themselves.
- **contain scroll** — **decided off by ADR 0064; recorded here as the question
  it answered.** ADR 0006 rejected content in a node partly because "it makes a
  card a container and its scroll fights the canvas pan". On, `nowheel` fixes
  that and the cost moves: every expanded Card becomes a hole you cannot
  wheel-pan across, and the more the feature succeeds the more of the canvas is
  hole. Off, ADR 0006's objection is live. ADR 0064 took the second, accepting
  the objection rather than paying that cost; CodeMirror may still scroll its
  own document while editing.
- **keep 16:9** — `card.ts` couples the Card's silhouette to the presentation
  surface: "click a card, present it, and the shape does not change". Off, a
  resized Card breaks that promise. On, the box is the box the ratio allows,
  which is rarely the box a document wants. The unexplored third answer is that
  the *collapsed* Card keeps the silhouette and the expanded one is free.
- **camera follows** — off, the Card grows where it is and the author travels to
  it, which is the infinite-canvas answer and leaves the source small until they
  do. On, the source is legible at once — and the further that is followed, the
  more it becomes the dialog with the backdrop removed.

## ADR 0006 is being reversed, deliberately

Its closing line: "a future architecture pass will see a graph of 'cards' that
do not show their content and suggest showing it; that suggestion is this ADR,
already considered." Two of its three reasons are answered by author-chosen,
per-Card expansion with a size that fits — silent clipping, and unreadability at
overview zoom. The third, the scroll fight, this document proposed to answer
mechanically with `nowheel` at the cost above — **and ADR 0064 declined that
answer.** It leaves the wheel with the canvas and accepts the fight instead, so
ADR 0006's third reason is not reversed by a mechanism here; it is outweighed.
ADR 0006 also framed "show full content" as a *View* setting; making it a
per-Card Layout property is the specific sentence that moves.

## What this would delete

`openedCardId` in `packages/app/src/navigation.ts`, with `openCard`/`closeCard`,
read by `App.tsx` and `SpaceCanvas.tsx`. If expansion is authored it becomes
Layout data and the transient seam goes — the same shape as ADR 0037 deleting
the reading mode and ADR 0058 deleting `WorkspaceSelection`.

## Still open

`Card/Alias` has no expanded state in the prototype and needs one: CONTEXT.md
says an Alias "shows another card's content", so an expanded Alias drawing its
Target's content is what an Alias *is* — but that displaces today's Alias
metadata form, and retargeting would need a new home.

`Card/Space` is not prototyped at all. It is issue 01, it needs the `space` kind
in `core` (issue 03) first, and it is the only one of the three that needs React
Flow sub-flows, ELK compound nodes, and deliberate refusal of the cross-boundary
Edges the library permits and ADR 0040 forbids.
