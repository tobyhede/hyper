# Handoff: presenting is broken — diagnose, decide, then rebuild

Status: needs-triage
Date: 2026-09-27
Branch/worktree at handoff: `default-space-on-load` (the only uncommitted changes are the user's own: `src/startup/default-content.ts` and `packages/app/public/american-justice.jpg` — do not touch or revert them)

## Read this first: process

This repo has a mandatory loop (`docs/agents/workflow.md`): **survey → grill → record → implement → verify → capture**. "No code until" shared understanding is explicitly confirmed by the user. Decisions are grilled **one question at a time, each with a recommendation**. ADRs are written only after confirmation, are append-only, and superseding one means amending the old ADR's status line and moving it to `docs/adr/superseded/` (held by `test/unit/adr-status-blocks.test.ts`). Tickets go under `.scratch/<feature>/issues/NN-slug.md` (`docs/agents/issue-tracker.md`).

The previous agent broke this: it wrote an accepted ADR and started editing source before grilling. All of that was reverted. **Nothing below is decided unless it says "Decided".** Start at grilling question 1.

Also mandatory before any UI code: the `shadcn-first-ui` skill (`.agents/skills/shadcn-first-ui/`), `docs/agents/ui.md`, and ADR 0052 (a stable Ladle story owes a Ladle test and an application test, tagged `@parity:<id>` and listed in `packages/app/stories/parity-claims.ts`). `pnpm ui:catalog:check` fails on any new production `.tsx` no stable story renders, and on a new class block in `packages/app/src/styles.css`, unless it is recorded in `packages/app/stories/design-system-inventory.ts`. Stylesheets colocated beside a component (like `components/command-dock.css`) owe no inventory entry.

## What the user reported

Presentation mode is "totally broken"; the tests did not catch it.

1. Resources are resized apparently at random on presenting.
2. Hover (authoring) handles are displayed.
3. Required: content is fullscreen; there are no editable elements.
4. Analysis requested: possibly break out of the Resource/canvas view entirely and draw the Resource's extracted content in the presentation. reveal.js was used in an earlier iteration (ADR 0008, removed by ADR 0024) — the user doubts it is the answer.

Screenshots showed: the presented Resource's face drawn small in the top-left of the frame, image clipped at the bottom, blue connection handles on the presented and neighbouring Resources, dotted canvas background and neighbouring Resources/Edges visible.

## Diagnosis (verified by reading the code)

Presenting today is ADR 0027 (canvas under camera control) + ADR 0044 (one `fitView`): the same React Flow canvas, zoomed onto the active node.

**Resize / framing — root cause.**
- `packages/react-flow-adapter/src/projection.ts:325` sets `showContent` on the active node while presenting; `ResourceNode.tsx:474` then swaps the Resource face for `.rf-resource-node__content` + `ResourceContent`.
- `packages/app/src/styles.css:434-438` sizes `.rf-resource-node__content` to the **collapsed** constant (`--resource-width`/`--resource-height`).
- `projection.ts:366` sizes the React Flow node wrapper from the Map's placement, which is the **Open Size** for an Open Resource.
- `PresentingCamera` (`packages/app/src/components/cameras.tsx:90`) does `fitView` on the **wrapper**.
- Result: a Closed Resource fills the screen; an Open Resource draws a 260×146 face in the top-left of a larger fitted frame. Which one you get depends on authored Open state — hence "random".
- Content inside is `overflow: hidden` at 16:9 with no image constraint, so images clip.

**Handles — deliberate, not a bug.** `packages/app/src/authoring-availability.ts:326-341`: `connectOnCanvas` is intentionally *not* withdrawn while presenting, so an Edge drawn from the presented Resource becomes a move at once. `packages/app/e2e/editing.spec.ts:2519` asserts that behaviour. The hover reveal on neighbours also stays live.

**Canvas chrome in frame.** Same surface, so background grid, neighbours and Edges appear at the edges of the fit.

**Why tests passed.** `packages/app/e2e/presenting.spec.ts` asserts traversal, that content is rendered, chrome layout, and that zoom increased. It never asserts the presented content fills the viewport, never presents an **Open** Resource (every fixture Resource is Closed — the one case where wrapper and face coincide), and never asserts absence of handles/editable elements. Its font-size assertion (`13px` title at line ~126) pins the 260px-frame scaling.

## Decided (by the user)

- A **Space Resource** (or a Reference Resource whose Target is a Space Resource) presents as its **title only** for the initial version.
- **Q1 (2026-09-27): presenting leaves the canvas.** It draws on its own full-viewport stage showing the Active Resource's rendered content over a mounted, inert canvas; supersedes ADR 0027 and ADR 0044, refines ADR 0024. The ADR records the surface boundary only — frame geometry, fullscreen, transitions and chrome placement are UI treatment and go to tickets (`docs/agents/workflow.md`, "When to write an ADR"). 
- **Q2 (2026-09-27): drawing an Edge mid-presentation is given up.** The stage offers no authoring; remove the `connectOnCanvas` presenting exception, its `authoring-availability.test.ts` assertion and `editing.spec.ts:2519`.
- **Q3 (2026-09-27): browser fullscreen** (treatment → ticket, not ADR). Present requests fullscreen on the **document** (`document.documentElement`) inside the Present activation; refusal is tolerated and the Stage fills the window regardless. While presenting *entered* fullscreen, leaving fullscreen (browser-consumed Esc) leaves presentation, and leaving presentation any other way exits fullscreen. A presentation that never got fullscreen (opened by URL) is not ended by unrelated `fullscreenchange`. Document, not Stage, so `body`-portalled dialogs stay visible.
- **Q4 (2026-09-27): Stage geometry** (treatment → ticket). Fixed 16:9 frame, as large as the viewport allows, letterboxed. Type in container-query units — move the existing `styles.css` ~439–470 rules to the Stage rather than rewriting. Images `max-width`/`max-height: 100%`, `object-fit: contain`, so an image alone never clips. Overflowing content scrolls vertically inside the frame (wheel, trackpad, Page Up/Down); arrow keys remain traversal even when the scroll region has focus — e2e must assert that.
- **Q5 (2026-09-27): leaving presentation returns the canvas untouched.** The camera never moved, so the Stage simply goes. Delete `OverviewCamera`, `OVERVIEW_FIT`, `OVERVIEW_DURATION`. Panning to the Resource presenting ended on is not done (possible later ticket).
- **Q6 (2026-09-27): no transition between Resources in this version** — the Stage swaps content instantly. File a parked ticket for a crossfade between Resources on the Stage that **reuses the presence hook and duration/easing tokens built by `.scratch/expanded-cards/issues/03-cross-fade-the-expanded-card-content.md`** (which crossfades Open/Close on the canvas — a different transition, already implemented). No View Transitions API and no animation library: one fade mechanism in the product.
- **Recorded:** ADR 0105 (accepted) supersedes 0027 and 0044 (moved to `docs/adr/superseded/`), refines 0024; index and filename links updated. `CONTEXT.md` Presenting rewritten and **Stage** coined. The root `README.md` line 9 prose still describes camera presenting — fix it at implementation (capture step), with `docs/agents/rendering.md` ~42–43.

## Grilling agenda (undecided — ask in order, one at a time, each with a recommendation)

1. **Does presenting leave the canvas?** Separate full-viewport stage drawing the Active Resource's rendered content over an inert, still-mounted canvas (supersedes ADR 0027 and ADR 0044; refines ADR 0024) — vs. staying on the canvas and fixing defects individually (size the face from the node's real size, withdraw handles, hide neighbours/background). *Previous agent's recommendation: separate stage* — both defects are correct authoring features leaking onto an audience surface, and every future canvas feature would otherwise need its own presenting withdrawal. Cost: the camera move between Resources, and drawing an Edge mid-presentation.
2. **Drawing an Edge mid-presentation** — confirm it is given up (deletes the `editing.spec.ts:2519` test and the `connectOnCanvas` exception), or keep some way to author a move while presenting.
3. **Browser fullscreen.** Use the Fullscreen API on entering (needs user activation; a presentation URL opened directly cannot get it, so the stage must still fill the window), and does leaving browser fullscreen (Esc) leave presentation? Which element goes fullscreen (the document, so modals like the persistence-conflict dialog and delete confirmation, which portal to `body`, stay visible — vs. the stage element, which hides them)?
4. **Stage geometry.** Fixed 16:9 letterboxed frame with container-query typography (ADR 0024 names this technique; text stays crisp vs. `transform: scale()`) — vs. filling the viewport at any aspect. How are images constrained? Does overflowing content clip (ADR 0027 treated overflow as an authoring problem) or scroll?
5. **Overview / exit.** Esc/Overview returns to the canvas as it was (camera never moved) — vs. fitting the canvas to the whole Map on exit (today's `OverviewCamera`).
6. **Transition between Resources.** None, crossfade, or something spatial. ADR 0024's negative still forbids a deck framework; any library must not model a sequence.
7. **Where the stage component lives.** `@project/ui` (generic presentational frame; needs its own story) vs. `app` (composition of `ResourceContent` + `PresentingChrome` + Navigation). Either way it needs a stable story and parity claims.
8. **Chrome placement.** `PresentingChrome` is currently `absolute inset-x-0 bottom-0` inside `.graph-area`; on a stage it would sit below or over the frame. Its contract (moves, Back, guidance, Overview, Copy link, focus debt, `aria-keyshortcuts`, live region) should be unchanged.
9. **What is removed.** Candidates: `PresentingCamera`, `OverviewCamera`, `PRESENTING_PADDING`, `PRESENTING_DURATION`, `OVERVIEW_DURATION`, `showActiveResourceContent`/`showContent`, the `.rf-resource-node__content` and `.resource*` blocks in `styles.css` (and the `resource` entry in `design-system-inventory.ts`). `MAX_ZOOM` is also read by the zoom slider's range and the story canvas (`stories/support/ReactFlowCanvas.tsx`) — decide whether it stays at 16 without the presenting justification.

Record each answer as it settles (workflow step 3). Update `CONTEXT.md`'s **Presenting** entry (currently says "drawn close enough that one Resource fills the screen … no second surface") if Q1 goes the stage way.

## Material from the reverted attempt (reuse after confirmation, not before)

A draft ADR "0105 — Presenting draws on its own stage, not on the canvas" was written and reverted. Its substance: stage over inert canvas, one 16:9 letterboxed frame, content by kind (Markdown rendered via the shared sanitised `ResourceContent`/`RenderedMarkdown`; Reference shows its own title over its Target's content via `resolveContentResource` in `@project/graph`; Space → title only), fullscreen requested on the document with refusal tolerated, leaving browser fullscreen leaves presentation; gives up mid-presentation Edge drawing and the camera move; negative: do not return presenting to the canvas without an enforced withdrawal for every canvas authoring capability, and ADR 0024's no-deck negative stands. Next free ADR number is **0105**; the index is `docs/adr/README.md` ("Canvas and camera" table).

Touch points found (for ticket scoping):
- `packages/react-flow-adapter/src/projection.ts` (`showContent`, `showActiveResourceContent`, body resolution), `ResourceNode.tsx` (content branch, `ResourceContent` import).
- `packages/app/src/canvas-projection.ts` / `canvas-rendering.ts` (`presenting` in `CanvasInteraction`), `App.tsx` (renders `PresentingChrome`, passes `activeResourceId`/`presenting` to `SpaceCanvas`), `components/SpaceCanvas.tsx` (mounts both cameras, `maxZoom` comment), `components/cameras.tsx`, `camera.ts`, `authoring-availability.ts`, `presenting-keys.ts` (defers inside `[role=dialog]` — don't make the stage a dialog), `components/PresentingChrome.tsx`.
- Test fixtures carrying `showContent: false` (≈10 files under `packages/app/test` and `packages/react-flow-adapter/test`), `packages/app/test/cameras.test.tsx`, `canvas-projection.test.ts` (asserts `showContent`), `authoring-availability.test.ts` (asserts the presenting connection exception).
- E2E: `packages/app/e2e/presenting.spec.ts` (camera-based assertions throughout; `activeResource` helper in `e2e/graph.ts:128` reads `.rf-resource-node--active`), `editing.spec.ts:~2474` and `:2519`, `new-space.spec.ts:~357`. Ladle: `ladle-e2e/issue-07-presenting-chrome.spec.ts`, story `stories/components/presenting-chrome.stories.tsx` + `stories/support/PresentingChromeFixture.tsx`.
- Docs: `docs/agents/rendering.md` lines ~42–43 describe the camera-based presenting and `maxZoom`; `.scratch/reveal-presentation/spec.md` links ADR 0027 by filename.

## Tests the rebuild must add (they would fail today)

- The presented content fills the viewport (bounding box of the frame vs. viewport, letterboxed at 16:9).
- Presenting an **Open** Resource and a **Closed** Resource gives the same framing.
- No authoring handle, toolbar, resize control, `textbox` or `contenteditable` is visible/reachable while presenting; the canvas behind is not focusable.
- An oversized image fits inside the frame.
- Space Resource presents its title only.

## Verification bar

`pnpm verify`, `pnpm e2e`, and `pnpm e2e:ladle` (stories change), each run once on the finished state; report real output and name any command judged inapplicable. Never start/stop a dev server you didn't start.
