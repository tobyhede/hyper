# 02 — Integrate the Expanded Markdown Card into the application

**What to build:** Wire issue 01's finished component through the real React Flow node and Space Authoring lifecycle, prove the complete interaction in the application, and retire the broad review prototype that currently reimplements those systems.

**Blocked by:** 01 — the component contract and focused Ladle states must land first; this ticket consumes them rather than redesigning them inside React Flow.

**Status:** ready-for-agent

## Integration boundary

- [ ] Consume the production deep `CanvasCard` contract from issues 04 and 05 without constructing its Markdown body or copying its markup or treatment into `CardNode`, `SpaceCanvas` or application CSS.
- [ ] Complete the prerequisite domain and authoring slices in `.scratch/expanded-cards/spec.md`: authored Card rects, displacement and its inverse, open/close/resize completions, per-Card strategy sizes and conversion from an Algorithmic View where required by ADR 0064.
- [ ] `CardNode` supplies Markdown source and authored open/edit operations alongside React Flow-owned behavior only: node geometry, handles, resize integration, z-index and drag/pan containment. `CanvasCard` owns construction of the kind-owned body.
- [ ] Replace the legacy no-argument `onEditCard` adapter capability with authored operations that represent Open and Close distinctly. No adapter may assign that callback to `onOpenChange(open)` and discard the requested state.
- [ ] `SpaceCanvas` owns the one canvas-local caret identity and coordinates completed edits through Space Authoring. The story's local expansion, movement, content and resize state does not move into production as a second authoring model.
- [ ] Opening expands the existing Card in place. No covering pane, camera follow, `nowheel`, or 16:9 Expanded Card is introduced; ADR 0064 has decided those off.
- [ ] An open Card offers Edit then Close in its rail; while Markdown editing runs, Save and Cancel replace Edit and Close remains present but disabled. The complete rendered Markdown surface remains the same semantic edit control issue 01 established, aligned with the Title control under ADR 0065 rather than treated as a second command area.
- [ ] Rendered Markdown remains ordinary Card drag surface until editing begins. Its sibling Button preserves valid Markdown structure while making the displayed body the edit target. A live CodeMirror caret owns text selection and keyboard input without disabling unrelated Card gestures after the edit ends.
- [ ] Title and Markdown editing are mutually exclusive: the one canvas-local caret may name exactly one Card field, title activation is unavailable while a body edit runs, and a stale projection cannot mount both editors. Save, Cancel, `Mod-Enter` and Escape intentionally restore focus to the resulting Edit action; React Flow selection changes silently commit or cancel nothing.
- [ ] Preserve or deliberately rehome keyboard Edge authoring. A Card retains a keyboard-reachable Connect operation with its Escape and focus-return behavior; spatial React Flow handles are not its keyboard replacement.
- [ ] Expansion and neighbour displacement animate only where the production geometry supports a real before/after transition. Do not carry forward the review prototype's broken Animate.css entrance or magic-distance FLIP experiment.

## Motion geometry

The prototype animates on open and snaps on close because two things drive the same growth and disagree in one direction. `spec.md` §4 states the rule; this is what satisfying it looks like here.

**This is net-new, not a repair.** Production has no node transition of any kind today — `SpaceCanvas` never touches a node's `style`, and the only `transition` reaching a Card is `canvas-card.css`'s own `box-shadow`/`transform`/`background-color`. The per-node inline style exists solely in the review story. Nothing here regresses; there is no "again".

- [ ] The React Flow node wrapper is the **only** animated element. Inside a node everything is a passenger: `.rf-card-node__inner` becomes `100%`/`100%` unconditionally and `.rf-card-node__inner > .canvas-card` overrides the Card's collapsed default the same way. Both lose their `[data-expanded]` geometry rules — `.rf-card-node__inner` carries the identical discontinuity today and declares no height when collapsed, so changing only `.canvas-card` moves the snap one element down rather than removing it.
- [ ] `.canvas-card` **keeps** its declared collapsed default. It is mounted outside a sized box by `NewCardPreview` in production and by four component stories, none of which has a `.rf-card-node__inner` ancestor; `min-width`/`min-height` cannot stand in, because they floor a box rather than capping `100%` in a shrink-to-fit parent. `canvas-card.css` already states this and it is not being reversed.
- [ ] `data-expanded` governs content only — order, borders, what is rendered. Never geometry, on either element.
- [ ] One duration and one easing token govern the growing Card, the shrinking Card and every displaced neighbour. Do not write a duration twice.
- [ ] The transition is declared in CSS on `.rf-card-node`, which React Flow puts on the same element as the inline `width`/`height`/`transform`. Drag suppression is React Flow's own `.react-flow__node.dragging`, already on that element; a projection-composed class is needed only for resize, which `NodeResizer` drives through the store with no class marker.
- [ ] `prefers-reduced-motion` is honored in one place — the token — not repeated per rule.
- [ ] Content enter/exit is **not** in this ticket. The body still mounts and unmounts at full opacity; issue 03 gives it a cross-fade. Do not solve it here with a bespoke delay.

### What stays discontinuous, deliberately

- [ ] **Edges snap in both directions and this ticket does not fix it.** Handle bounds and node positions reach React Flow's store the moment the projection commits, and an SVG path `d` is not transitionable, so Edges land on their final endpoints at frame one. Fixing the box makes this *more* visible. State it in the ticket's `## Answer`; do not discover it in review, and do not widen scope to chase it.
- [ ] `.rf-card-node__content` writes the collapsed constant a third time for the presenting branch, which draws `CardContent` rather than `CanvasCard`. Out of scope, and not covered by "the container owns the rect".

### Evidence

- [ ] The primary assertion is **rest-state and untimed**: a collapsed Card in a node whose declared rect is deliberately *not* the collapsed constant, asserting the Card's border box equals the wrapper's. It fails today, passes after the fix, and states the rule itself rather than a symptom.
- [ ] A mid-flight `getAnimations()` check is admissible only with the duration token overridden through `page.addStyleTag`, or with the animations paused on the sampled frame. Asserting against a live 200ms transition is a race, and `playwright.ladle.config.ts`'s `failOnFlakyTests` turns a pass-on-retry into a red run.
- [ ] Note that box equality does **not** discriminate at rest under the current CSS, because collapsed the node rect and the constant coincide. That is why the assertion needs a node sized off the constant.
- [ ] `packages/app/ladle-e2e/card-expand.spec.ts` currently targets two static stories with no React Flow and no open/close control. The assertion needs a story that does not exist yet — build it under `## Catalogue consolidation` rather than assuming the harness already reaches it.

## Application proof

- [ ] Application Playwright proves through the real projection: expand a Markdown Card, read rendered Markdown, activate editing through both the displayed body control and the rail Edit action, edit and commit with `Mod-Enter`, edit and cancel with `Escape`, prove a click away leaves the draft and the editor up, drag outside editing, resize, collapse and reload the authored result. Adapter fixtures that manufacture `expanded`, `bodyEditor` or resize fields are component evidence, not application evidence.
- [ ] Application proof covers opening from an Algorithmic View converting to a Layout and proves drawn displacement is inverted before authored placement is stored.
- [ ] The test asserts rendered Markdown and source text keep the same content column while the gutter toggles on and off.
- [ ] The test asserts the shortcut hint is visible only while CodeMirror has focus, that its two key-and-word pairs are set apart from each other more than each key is from its own word, and that no bright editor-wide focus frame returns.
- [ ] The test asserts the rail replaces its Edit action with Save and Cancel while the edit runs, disables Close for its duration, draws all three as the one rail-action treatment, and that a press on Save or Cancel leaves the caret in the document rather than pulling it out to the rail.
- [ ] The test asserts the editing treatment is installed atomically: immediately after body editing begins, Edit is absent, Close cannot fire and title editing cannot begin, without waiting for a passive effect to settle.
- [ ] Application proof covers the keyboard-reachable Connect operation, its Escape path and focus return so Card rail changes cannot silently remove Edge authoring accessibility.
- [ ] Existing camera, Edge authoring, selection, dragging and presentation behavior remain green.

## Catalogue consolidation

- [ ] Promote issue 01's final component states into the stable Ladle catalogue and add the ADR 0052 parity claims mapping each meaningful story behavior to both Ladle and application evidence.
- [ ] Keep at most one minimal React Flow integration story, and only for behavior component isolation genuinely hides: node containment, resize handles or drag interaction. It composes production code and does not implement Space Authoring.
- [ ] Delete or demote `packages/app/stories/review/expanding-cards.*` once its useful claims are covered. No proposal-only story is presented as production evidence.
- [ ] Remove prototype-only CSS, controls, placement readouts and local authoring helpers rather than leaving a second application to drift.

## Verification

- [ ] Run `pnpm verify`.
- [ ] Run `pnpm e2e` for the real application composition.
- [ ] Run `pnpm e2e:ladle` for the component and any retained minimal integration story.
- [ ] Report the real output of all three commands and record the final evidence under `## Answer` before resolving the ticket.

## Not in scope

Reopening ADR 0064's interaction decisions, adding an Alias Expanded front, or generalizing the component for Card kinds that do not yet have an Expanded treatment.
