# impress.js as the traversal surface — spike findings

Spike date: **2026-07-25**. Version probed: **impress.js 1.1.0** (npm `dist-tags.latest`, the bundled `js/impress.js` with plugins). There is no 2.x — `impress.js@2.0.0` 404s on the registry; 1.1.0 dates from 2018.

Context: ADR 0023 (a route is an acyclic graph of card edges), ADR 0024 (presenting is traversal; reveal.js removed), ADR 0025 (a Layout is optional; the app supplies an algorithmic default).

Harness: a standalone static page under `.scratch/impress-spike/`, served on `:8788`. 10 hardcoded cards with Markdown-ish content — a linear chain, a 3-way fork (`approach` → `optA`/`optB`/`optC`), a 3-way merge, and a second 2-way fork (`decision` → `next`/`appendix`). Five interchangeable coordinate sets, a minimap/hints/chooser UX layer, and instrumentation for key assignment and camera geometry.

---

## Verdict

**Neither option in the brief. Use React Flow's camera on the canvas the app already has.**

The brief offered adopt-impress or build-it-ourselves. The spike's decisive finding is that impress contributes only a camera — its navigation model is unusable for a graph walk (§2) — and that **we already own a better camera than the one it offers.** `@xyflow/react` 12.11.2, already in the dependency tree, already rendering the cards:

```
setCenter(x, y, { zoom?, duration?, ease?, interpolate? })   => Promise<boolean>
fitBounds(rect, { padding?, duration?, ease?, interpolate? }) => Promise<boolean>
zoomTo, setViewport, getZoom
```

That is impress's camera with easing, a custom interpolator, and a Promise you can await — impress only fires an event. Verified against the installed types in `@xyflow/system@0.0.79`, `dist/esm/types/general.d.ts:19-56, 196-212`.

So presenting is **the graph canvas, closer in**: traversal drives `setCenter` to the next card, the overview is `fitBounds` over the space, and there is no second surface, no second coordinate system, and no transformation of a Card into anything. That is ADR 0024's "there is no deck" taken literally, and it is what the two-artefact model was costing us.

Adopting impress would mean adding a 2018 dependency that renders the same cards a second time, in its own coordinate space, owning `location.hash`, to supply a camera we have.

---

## Corrections made during the spike

Recorded because they were wrong in ways a reader would otherwise inherit.

**The fork-visibility result was reached against the wrong criterion.** I measured whether the *branch cards* are inside the camera's frame at a fork, found they are not at presentable zoom, and treated that as the fork question being answered. It isn't. The question is whether the presenter understands their options, and screen-fixed chrome answers it without the cards being on screen. Adding a minimap and a hint row made a 3-way fork fully legible at full presentable zoom (§5). The geometric measurement stands; the conclusion drawn from it does not.

**The quadrant investigation was made moot by a decision taken after it.** Once navigation is Left-back / Right-forward / Up-Down-to-choose, direction keys stop meaning spatial direction — Right means "advance" regardless of where the next card sits. The whole quadrant/angular/margin apparatus only mattered while arrow keys were supposed to point at things. Kept in §6 as a short record, because "just map each arrow to whichever card lies that way" is an idea that will recur.

**The `transform: scale()` conflict is not impress's.** I reported that impress reimposes the root scaling that `.scratch/card-display/issues/05` chose container-query units to avoid. True, but it is a property of *any zooming camera* — React Flow applies `transform: translate(...) scale(z)` to `.react-flow__viewport` in exactly the same way. It is a consequence of wanting a spatial camera at all, and it belongs to the option-A design, not to a library comparison.

**ELK should not have been load-bearing and the grid fixture was a strawman.** The brief's original Q5 named real ELK output as the risk case, so I generated it with the repo's own `DEFAULT_ELK_LAYOUT_OPTIONS`. But AGENTS.md is explicit that ELK "is one automatic strategy among several and must never be the focus". Separately, my `grid` fixture placed cards in *dictionary order* with no relation to the edges, so it measured "an arbitrary layout", not a grid.

---

## 1. What impress's navigation model is

One linear sequence. impress collects `.step` elements in **DOM order** and keeps an index. `next()` is index+1 wrapping to the first; `prev()` is index−1 wrapping to the last (`impress.js:605-619`). Right/Down/Space/PgDn/Tab call `next()`, Left/Up/PgUp call `prev()` (`impress.js:3297-3309`). That is the whole of it — it is a deck.

The **goto plugin** sits on top as a *redirect*. It is a pre-stepleave hook (`impress.js:1786-1840`): when impress has already decided to move, the plugin may change the destination first. `data-goto-key-list="ArrowUp ArrowDown ArrowRight ArrowLeft"` with `data-goto-next-list="a b c d"` means "if the key was ArrowUp, land on `a` instead".

## 2. Why that model fails for a route — the decisive finding

**It can redirect a move, never cancel one.** An arrow not in the key list falls through to impress's default, which is DOM order with wraparound. Measured: pressing Left on `intro` — a card with no incoming edge, so no "back" — landed on `overview`, the last step in the document. Every unused arrow has to be defensively mapped back to the current card to fake a no-op. (That workaround does work: impress skips `onStepLeave` when the resolved target equals the active step.)

**A keypress can only ever mean "go here".** The plugin's entire vocabulary is a destination, four attribute slots, one per key. The navigation we want — *Up/Down move the selection among a fork's outgoing edges without moving the camera; Right commits* — needs a keypress that is not a navigation. There is no way to express it.

So the harness intercepts all four arrows in the capture phase with `stopImmediatePropagation()`, before impress sees them, and calls `api.goto()` directly. Verified working: Right advances, Down moves the selection at a fork while the camera stays put, Right commits, Left walks back. And **impress's navigation then runs never** — the goto plugin, `next()`/`prev()` and the key lists are all dead. What remains in use is the camera.

That is the finding the recommendation rests on. A route is a graph walk with selection state; impress is a deck with a per-key redirect; the hook is not expressive enough, so you bypass navigation entirely.

## 3. Camera and coordinate mapping

A single constant maps Layout units to canvas px exactly and preserves relative geometry. **This part of the hypothesis is true** — no quantisation, no spacer steps, no second coordinate model — and it is the good idea the spike confirms. It transfers wholesale to option A.

The framing arithmetic, which is about layout spacing versus card size and so applies to React Flow identically:

- The card fills `cardWidth / viewportWidth` of the screen, independent of zoom.
- At the repo's ELK spacing, layer centres are 420 Layout units apart against a 260-unit card.
- Cards stop overlapping at `m ≥ 1280/420 ≈ 3.05`; a neighbour's edge reaches the screen edge when `420·m − 640 < ROOT_W/2`.
- At `ROOT_W = 1640` (card fills 78% of screen) that leaves a workable band of **`m ∈ [3.05, 3.48]`**. At `m = 3.2` a neighbour's edge sits ~116 canvas px inside the frame — a visible sliver either side.

The usable multiplier is set by each layout's own spacing-to-card-size ratio, so it wants fitting per space from the minimum inter-card distance, not one global constant.

Edge lengths at that setting, across all 11 edges: **0.82–1.15 screen-diagonals**, about 1.4–1.9 screen-widths/second over a 600 ms transition. Comparable to a slide push, not a whip. A layered arrangement helps — adjacent cards are roughly one layer apart, so no edge is long.

**Worth copying from impress:** when the scale changes it splits the move with a `duration/2` delay — translating first at the wider scale when zooming in, scaling out first when zooming out (`impress.js:537-553`). That is real craft and it is what stops long jumps whipping. When the scale is unchanged the delay is zeroed and it is a straight pan. React Flow's `ease` and `interpolate: 'smooth' | 'linear'` are where the equivalent would go.

**Limitation:** I drove this in an automated tab where `requestAnimationFrame` was suspended (a frame sampler collected 0 frames), so I never watched the animation run. Geometry, distances and timing are measured; *perceived* smoothness is a human judgement I did not make.

## 4. Content fidelity

The 1280×720 card canvas does not fight impress provided `data-width`/`data-height` are set on the root. At the 1920×1080 default the card fills 2/3 of the screen; at 1640×923 it fills 78%. Autoscale then behaves like reveal's — measured `windowScale = min(1710/1640, 951/923) = 1.0303`.

Steps are absolutely positioned with `translate(-50%,-50%)` and need an explicit size, which a fixed card canvas has. `container-type: size` works on the inner div, cq-unit typography rendered correctly at every zoom, and Markdown — headings, lists, inline code, emphasis — rendered fine throughout.

The root `transform: scale()` tension with card-display/05 is real but belongs to any zooming camera (see Corrections).

## 5. The fork, with chrome — it works

At presentable zoom the branch *cards* are not in frame: at `ROOT_W = 1640` only one of three peeks in, and they become visible only around `ROOT_W ≈ 3600–5200`, where the focused card is 23–44% of screen width and its body text is 8–15 screen px. That is an overview, not a card being presented. The constraint is provable: to be visible a neighbour must sit within `ROOT_H/2 + 360` canvas px vertically — 821 px at `ROOT_H = 923` — while the fork's forward step is 1344 px, so a neighbour can never be both off-axis enough to read as a distinct direction and inside the frame. 16:9 makes the vertical budget binding.

**Chrome resolves this completely.** A minimap (the whole space, active card highlighted, live outgoing edges picked out) plus a hint row (the outgoing edges enumerated, selection marked) makes a 3-way fork fully legible while the camera still frames one card at 78%. Confirmed on the grid fixture, where the HUD simultaneously reports both outgoing edges spatially unreachable and the fork remains perfectly usable.

Two consequences for option A: the fork affordance is **ours to design either way** — none of the minimap, hints or chooser used impress — and it is screen-fixed chrome, not canvas content, so it is unaffected by the camera.

Also worth recording: impress cannot pull the camera back at a fork. `data-scale` is canvas geometry, not camera state — raising `approach`'s to 2.35 made the *card* 2.35× larger on the shared canvas rather than zooming out, and it then appears oversized in the overview. And the camera centres on the step's own `data-x`/`data-y`, so it cannot frame a bounding box the step is not centred in (fork bbox centre (3814, 995) against step centre (3142, 390)). React Flow's `fitBounds` has neither limitation — which is the second reason option A beats option D.

## 6. Spatial direction keys — a dead end, recorded

Only relevant if arrow keys are made to point at whichever card lies that way. They are not, under the chosen navigation. Recorded because the idea will recur.

Quadrant bucketing, split on the diagonals, 22 neighbour slots:

```
layout                     unreachable   within 15° of a boundary
positioned (freeform)           2             10 / 22
grid                            9              4
column (name sort)              8              0
elk                             5              —
```

- **A positioned layout fails by instability, not stranding.** Only 2 neighbours unreachable, but 10 of 22 assignments sit within 15° of a diagonal — `approach → optA` at 1.5°, `optA → approach` at 1.5°, `optA → tradeoffs` at 6.5°. A ~10px drag flips which key reaches a card, silently. Navigation does not break, it drifts as the author edits placement.
- **The algorithmic defaults are worse, and for a reason bigger than bucketing.** ADR 0025's defaults order cards **by name**, which is uncorrelated with the edge graph, so a card's graph neighbours are scattered. A single column has only two usable directions, so any card with more than two neighbours strands the rest — `approach` has 4 and loses 3.
- Angular nearest-match reaches 0 unreachable but binds keys that point the wrong way: on a positioned layout 2 keys are >45° off, both at the merge; on ELK output, 4 of 22, worst 114°. A key that contradicts what is on screen is worse than a dead key.
- Eight-way does not help — the fan occupies a ~50° wedge, narrower than one bucket.

## 7. Overview

A single extra step at the bounding-box centre with a computed scale showed all 10 cards, one keypress each way. The arrangement renders faithfully — spine, fan, merge and second fork all legible as a shape. This is the "the deck is the graph seen close up" payoff and it lands.

Under option A it is not a feature to build: it is `fitBounds` over the space, which is the view that already exists.

## 8. Mount / unmount

`tear()` unwraps the injected `.canvas` div, strips step inline styles and classes, clears body classes, removes its keyboard listeners (verified — arrows do nothing afterwards, no active step) and deletes the root from its internal `roots` memo (`impress.js:735`). Re-`init()` works and navigation then fires exactly once per keypress — no double-binding.

Residue: `perspective: 0px` on the root, and the `#/<stepid>` hash. The style is trivial; **the hash is not** — impress owns `location.hash` and would fight TanStack Router.

`impress()` is memoised per root **id** and `init()` is a silent no-op if already initialised, so the contract is strictly `init()` in the effect, `tear()` in cleanup, never two instances on one id.

---

## What to build, under option A

1. **Traversal drives the camera.** `setCenter(card.x, card.y, { zoom, duration })` per step of the walk. Await the returned Promise rather than timing it.
2. **Selection state at forks.** Up/Down move through the active card's outgoing edges; Right commits; Left walks back. Back reads the **walk**, not the graph — a merge has several incoming edges, so "the card before this one" is only answerable from the path actually taken.
3. **No `isLinear` anywhere.** One outgoing edge means a one-member selection, so Right advances and Up/Down have nothing to move. The degenerate case falls out (ADR 0024).
4. **Chrome carries the fork**, not the canvas: a hint row over the active card's outgoing edges, and the minimap. Both are screen-fixed and camera-independent.
5. **`CardNode` needs a presenting render mode** — full content rather than its title. This is ADR 0006's deferred "show full content" View option, which `card.ts` already anticipates ("a card becomes a live preview of a slide").
6. **Copy impress's two-phase move** for any transition that changes zoom.

## Terminology

**Slide should not become a domain term.** CONTEXT.md already lists it under *Avoid* twice — once under Card (`node, slide, page, tile, subgraph`) and once under Presenting (`deck, slide, step, slideshow, playback, present mode`) — and it is the thesis of ADR 0024: what made reveal wrong was that a route had to *become* a deck of slides.

It cuts against option A specifically, whose whole value is that nothing is transformed. A Slide would reintroduce the second artefact and its questions — does it have identity, does a merge produce one or two, what happens when the Card is edited — none of which exist under "it is still the Card".

The two things actually wanted:

- **A View concern, not a noun.** "Displays as a slide" is the presenting view drawing a card's full content instead of its title — ADR 0006 put that choice in the View already.
- **`active card`** — where the walk currently is. Pairs with ADR 0026's *active route* and names a position in a traversal rather than an artefact. CONTEXT.md has no term for this today; that is the real gap.

Note `step` is now avoided under Route, Edge *and* Presenting. ADR 0024 had left the door open ("step may survive as the presentation unit") and CONTEXT.md has since closed it.
