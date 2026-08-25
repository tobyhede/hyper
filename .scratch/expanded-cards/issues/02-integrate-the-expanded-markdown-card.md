# 02 — Integrate the Expanded Markdown Card into the application

**What to build:** Wire issue 01's finished component through the real React Flow node and Space Authoring lifecycle, prove the complete interaction in the application, and retire the broad review prototype that currently reimplements those systems.

**Blocked by:** 01 — the component contract and focused Ladle states must land first; this ticket consumes them rather than redesigning them inside React Flow.

**Status:** ready-for-agent

## Integration boundary

- [ ] Consume the production `CanvasCard` and `MarkdownCardBody` contract from issue 01 without copying its markup or treatment into `CardNode`, `SpaceCanvas` or application CSS.
- [ ] Complete the prerequisite domain and authoring slices in `.scratch/expanded-cards/spec.md`: authored Card rects, displacement and its inverse, open/close/resize completions, per-Card strategy sizes and conversion from an Algorithmic View where required by ADR 0064.
- [ ] `CardNode` supplies the Expanded Markdown content slot and React Flow-owned behavior only: node geometry, handles, resize integration, z-index and drag/pan containment.
- [ ] `SpaceCanvas` owns the one canvas-local caret identity and coordinates completed edits through Space Authoring. The story's local expansion, movement, content and resize state does not move into production as a second authoring model.
- [ ] Opening expands the existing Card in place. No covering pane, camera follow, `nowheel`, or 16:9 Expanded Card is introduced; ADR 0064 has decided those off.
- [ ] The rail and its existing Card-level actions remain unchanged by Markdown body editing. The body-level pencil is the disclosure for click-to-edit; it does not replace or masquerade as a rail action.
- [ ] Rendered Markdown remains ordinary Card drag surface until editing begins. A live CodeMirror caret owns text selection and keyboard input without disabling unrelated Card gestures after the edit ends.
- [ ] Title and Markdown editing are mutually coherent: the application permits only the caret state the component contract can represent, returns focus intentionally, and does not silently commit or cancel through React Flow selection changes.
- [ ] Expansion and neighbour displacement animate only where the production geometry supports a real before/after transition. Do not carry forward the review prototype's broken Animate.css entrance or magic-distance FLIP experiment.

## Motion geometry

The prototype animates on open and snaps on close because two things drive the same growth and disagree in one direction. `spec.md` §4 states the rule; this is what satisfying it looks like here.

- [ ] The React Flow node wrapper is the **only** animated element. Everything inside it is a passenger with no opinion about its own size: `.canvas-card` declares no width or height in either state, and the collapsed pixel constant moves to `.rf-card-node__inner` (with `min-width`/`min-height` covering the pre-layout and bare-mount cases).
- [ ] `data-expanded` governs content only — order, borders, what is rendered. It must not switch geometry, or close stops animating again.
- [ ] One duration and one easing token govern the growing Card, the shrinking Card and every displaced neighbour. Do not write a duration twice.
- [ ] The transition is declared in CSS on the node class, not rebuilt as a per-node inline style on every render. Suppression during drag and resize is a class the projection composes alongside `rf-card-node`.
- [ ] `prefers-reduced-motion` is honored in one place — the token — not repeated per rule.
- [ ] Ladle E2E asserts the symmetry deterministically through `getAnimations()` rather than mid-flight screenshots: after a close, a running `width` transition on `.react-flow__node` **and** a `.canvas-card` computed box equal to the wrapper's. That assertion fails against the prototype today and is the one-line statement of the defect.
- [ ] Content enter/exit is **not** in this ticket. The body still mounts and unmounts at full opacity; issue 03 gives it a cross-fade. Do not solve it here with a bespoke delay.

## Application proof

- [ ] Application Playwright proves: expand a Markdown Card, read rendered Markdown, disclose and activate the body edit affordance, edit and commit with `Mod-Enter`, edit and cancel with `Escape`, prove a click away leaves the draft and the editor up, drag outside editing, resize, collapse and reload the authored result.
- [ ] Application proof covers opening from an Algorithmic View converting to a Layout and proves drawn displacement is inverted before authored placement is stored.
- [ ] The test asserts rendered Markdown and source text keep the same content column while the gutter toggles on and off.
- [ ] The test asserts the shortcut hint is visible only while CodeMirror has focus, that its two key-and-word pairs are set apart from each other more than each key is from its own word, and that no bright editor-wide focus frame returns.
- [ ] The test asserts the rail replaces its Edit action with Save and Cancel while the edit runs, disables Close for its duration, draws all three as the one rail-action treatment, and that a press on Save or Cancel leaves the caret in the document rather than pulling it out to the rail.
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

