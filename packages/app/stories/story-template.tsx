/**
 * Copy this file to start a new story. Rename the copy to `<name>.stories.tsx`
 * inside the section it belongs in (see below), delete whichever worked
 * example below you don't need together with its own supporting imports, then
 * replace `ComponentUnderTest` with your real component (or delete it if the
 * example you kept already imports its own). This file is not itself a story
 * — it does not end in `.stories.tsx`, so neither Ladle nor `pnpm
 * ui:catalog:check` will ever see it — but it lives under `stories/`, so
 * `pnpm verify` still typechecks and lints it, both worked examples included.
 * If it stops compiling, fix it here rather than letting the next copy
 * inherit the rot.
 *
 * ## Which section?
 *
 * The top-level Ladle section is enforced by folder <-> title-prefix pairing
 * in `scripts/ui-catalog.ts`. It is not the domain hierarchy — a Space does
 * not "contain" a Card here — and it is not how many parts something is built
 * from. It answers one question: **what real machinery does this story need
 * to mean anything?**
 *
 * - `stories/components/`, title `'Components/…'` — renders correctly from
 *   props alone. Nothing else has to be standing behind it.
 * - `stories/surfaces/`, title `'Surfaces/…'` — needs one specific piece of
 *   real, un-replaceable framework or library machinery — a live React Flow
 *   canvas, for instance — but not the whole running app.
 * - `stories/space/`, title `'Space/…'` — needs the real app-level machinery:
 *   Space Authoring, a persistence session, the Sidebar. Despite the name,
 *   this means "the whole app for a given Space", not the domain Space.
 * - `stories/review/`, title `'Review/…'` or `'Space/…'` — staged and
 *   non-production. No ADR 0052 parity claim attaches here, ever. Use it for
 *   a surface the application cannot reach yet, or a prototype you want
 *   visible without promising it. Choosing `'Space/…'` here deliberately
 *   places the story in the same Ladle nav group as the stable `Space/…`
 *   stories, with nothing in the sidebar to tell the two apart —
 *   `stories/review/multiple-spaces.stories.tsx` does this today, alongside
 *   `stories/space/space.stories.tsx`'s own `'Space/Space'`. Default to
 *   `'Review/…'` and reach for `'Space/…'` only when sitting beside the
 *   stable Space stories is actually what you want.
 *
 * `components`, `surfaces` and `space` are stable: every named export counts
 * as production-parity evidence and may be claimed in
 * `stories/parity-claims.ts`. `review` never does.
 *
 * ## Needs a real React Flow canvas?
 *
 * For a new story in one of the three stable sections, never instantiate
 * `<ReactFlow>` yourself — build on `StoryCanvas` and `StoryCanvasFrame` from
 * `./support/ReactFlowCanvas` instead; they own `ReactFlowProvider`,
 * `Background`, the `minZoom`/`maxZoom` defaults, `proOptions`, and the
 * fit-vs-fixed-viewport union, so a new story cannot quietly drift from what
 * every other canvas story already agreed on. `stories/review/` may carry
 * pre-existing exceptions that predate this rule and aren't obligated to
 * migrate — `space-card-canvas-prototype.stories.tsx` is the current one. The
 * `SurfacesExample` below shows the pattern; delete it if the component under
 * test needs no canvas, and see `ComponentsExample` after it instead.
 */
import type { Story } from '@ladle/react';
import { StoryCanvas, StoryCanvasFrame } from './support/ReactFlowCanvas';

export default { title: 'Surfaces/Replace Me' };

/**
 * Stand-in for the real component under test, so both worked examples below
 * are live, typechecked code rather than one real example plus a comment the
 * compiler never sees. Delete this and import your real component in its
 * place once you've picked which example you're keeping.
 */
function ComponentUnderTest() {
  return <div>Replace me</div>;
}

/**
 * One sentence on what this story proves. If it lives in `Surfaces/…`, say
 * why a real canvas — rather than a fixture prop — is the thing that proves
 * it, the way `Surfaces/Graph HUD`'s own story does.
 *
 * Keeping this form: delete `ComponentsExample` below; the title above is
 * already `'Surfaces/Replace Me'` — just rename `Replace Me`.
 */
export const SurfacesExample: Story = () => (
  <StoryCanvasFrame height="h-[26rem]">
    <StoryCanvas nodes={[]} viewport={{ fit: true }} className="h-full">
      <ComponentUnderTest />
    </StoryCanvas>
  </StoryCanvasFrame>
);
// A story that owns its own viewport — a canvas, a full-screen Sidebar, a
// dialog — sets `iframed: true` so it draws in its own frame rather than the
// catalogue's. Leave this off for anything that isn't full-viewport.
SurfacesExample.meta = { iframed: true };

/**
 * Renders correctly from props alone: no canvas, no frame.
 *
 * Keeping this form: delete `SurfacesExample` above and the
 * `./support/ReactFlowCanvas` import, and change the title above to
 * `'Components/Replace Me'` (then rename `Replace Me`). Add
 * `.meta = { iframed: true }` only if the component owns its own viewport
 * (see above).
 */
export const ComponentsExample: Story = () => <ComponentUnderTest />;
