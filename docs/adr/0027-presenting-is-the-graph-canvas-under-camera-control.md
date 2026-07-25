# Presenting is the graph canvas under camera control; there is no second surface

Status: accepted
Refines: 0024
Related: 0002, 0006, 0023, 0025, 0026

Presenting renders on the arrangement already on screen. Traversal drives React Flow's camera: `setCenter(x, y, { zoom, duration })` moves to the active card, `fitBounds` frames the whole space for an overview. There is no second surface, no second coordinate system, and nothing a Card is transformed into.

ADR 0024 established that presenting walks a route's edges and that there is no deck. It did not say what presenting draws on. This does: the graph, closer in.

## Why not impress.js

impress.js was the strong candidate, because it positions steps at real coordinates on one canvas and moves a camera between them — which is the shape of the problem. It was spiked (`.scratch/impress-spike/findings.md`) and rejected on a finding about its navigation model, not on taste.

**impress can redirect a move but never cancel one.** Its model is one linear sequence in DOM order with an index; `next()` and `prev()` wrap around. The `goto` plugin is a pre-`stepleave` hook that rewrites the destination after impress has already decided to move. An arrow not named in `data-goto-key-list` falls through to the default, so pressing Left on a card with no incoming edge lands on the last step in the document rather than doing nothing.

**A keypress there can only ever mean "go here."** The plugin's whole vocabulary is a destination, in four attribute slots, one per key. The navigation a route needs — *Up and Down move the selection among a fork's outgoing edges while the camera stays put; Right commits* — is a keypress that is not a navigation, and there is no way to express it.

So the harness intercepted all four arrows before impress saw them and called `goto()` directly, at which point impress's navigation ran never. What remained in use was the camera — and we already own a better one. `@xyflow/react` is in the dependency tree and already rendering the cards, and its `setCenter`/`fitBounds` return a Promise you can await and take `duration`, `ease` and `interpolate`, where impress only fires an event.

Two further limits found: impress cannot pull the camera back at a fork, because `data-scale` is canvas geometry rather than camera state and the camera centres on the step's own coordinates, so it cannot frame a bounding box the step is not centred in — both of which `fitBounds` does. And impress owns `location.hash`, which would fight TanStack Router.

Adopting it would have meant a 2018 dependency (1.1.0; there is no 2.x) rendering the same cards a second time, in its own coordinate space, to supply a camera we have.

## What the spike confirmed

The hypothesis that made impress attractive was right, and it transfers. **A single constant maps Layout units to canvas pixels and preserves the arrangement's geometry** — no quantisation, no spacer steps, no second coordinate model. That multiplier is bounded by each layout's own spacing-to-card-size ratio, so it wants fitting per space from the minimum inter-card distance rather than fixing globally.

Worth copying from impress: when a move changes zoom it splits the transition, translating at the wider scale first when zooming in and scaling out first when zooming out. That is what stops long jumps whipping, and `ease`/`interpolate` are where the equivalent goes.

## The fork is chrome, not canvas

At a zoom where the active card is legible, a fork's branch cards are not in frame, and this is provable rather than a tuning failure: a neighbour must be off-axis enough to read as a distinct direction and close enough to sit inside the viewport, and 16:9 makes the vertical budget binding, so it cannot be both. Branch cards become visible only at an overview zoom where body text is a few pixels tall.

This does not matter, and the reason it does not is the spike's own correction of itself. The question is whether the presenter understands their options, not whether the cards are on screen. Screen-fixed chrome — a hint row enumerating the active card's outgoing edges with the selection marked, and a minimap of the space — makes a three-way fork fully legible while the camera still frames one card. None of it is canvas content, so it is unaffected by the camera and would have been ours to build under any option.

So the spatial payoff of a shared canvas is the **overview**, not seeing your neighbours mid-walk. That is `fitBounds`, and it is the view that already exists.

## Consequences

`CardNode` gains a presenting render mode showing full content rather than its title — ADR 0006's deferred "show full content" option, which was always a View's choice.

Traversal carries selection state: Up and Down move through the active card's outgoing edges, Right commits, Left walks back. **Back reads the walk, not the graph** — a merge has several incoming edges, so "the card before this one" is answerable only from the path actually taken.

No `isLinear` anywhere, per ADR 0024. One outgoing edge is a one-member selection, so Right advances and Up/Down have nothing to move; the degenerate case falls out rather than being branched on.

`CONTEXT.md`'s **Presenting** entry says the space is "out of view," which this makes false — presenting is the space, and the overview is one gesture away. That clause changes, and **active card** is coined for where the walk currently is, pairing with ADR 0026's active route.

## The cost we accept

**Presenting and authoring share a surface.** ADR 0008 separated them precisely to stop the smaller surface carrying the larger one's future, and that concern was legitimate. What has changed is the thing it was protecting against: the deck vocabulary — transitions, fragments, speaker view, export — is gone with ADR 0024, so there is no longer a second future to keep out. The residual cost is real and narrower: a defect in the canvas now breaks both reading and presenting.

**The camera scales the canvas with `transform: scale()`**, which is what `card-display/05` deliberately avoided for the reading surface by choosing container-query units, on the grounds that scaling softens text. This is a property of wanting a spatial camera at all, not of any library, and it applies to the presenting surface only.

**The motion was measured but never watched.** The spike ran in an automated tab with `requestAnimationFrame` suspended, so distances, framing and timing are measured and perceived smoothness is not. It is a judgement to make on our own canvas.

## The negative

A future review will find presenting with no framework behind it and reach for one that offers a camera and per-key navigation hooks. **Do not adopt a deck framework's per-key redirect for a graph walk.** Measured on impress's `goto` plugin: it redirects a move and cannot cancel one, an unmapped key falls through to sequence order, and a keypress can only name a destination — so selection-without-movement, which every fork needs, is inexpressible. The failure is in the model, not the configuration, and it will be the same in any library whose navigation is an index over a sequence.

And **Slide must not become a domain term.** `CONTEXT.md` lists it under _Avoid_ twice already, and it is the thesis of ADR 0024. Under this decision nothing is transformed, so a Slide would reintroduce the second artefact and all its questions — does it have identity, does a merge produce one or two, what happens when the Card is edited — none of which exist while the answer stays "it is still the Card."
