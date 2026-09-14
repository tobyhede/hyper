# 27 — Space Thing Diagram and Graph choices live on the rail, not in the body

Status: resolved
Tags: release/v1
Blocked by: nothing. Corrects incomplete execution of `12`; does not reopen
its neutral-rail or shared-surface decisions.

**What to build:** An Open Space Thing extends its fixed rail toolbar with
Diagram and Graph clusters — a mini-dock — using the same shared components
and treatment as the Command Dock. The choices are kind commands on the one
`ThingRailActions` toolbar (ADR 0073), not a second command surface in the
card body.

This is **not** a duplicate of the Dock. The Dock moves the Space the author
stands on; a Space Thing writes which Diagram and Graph *that Thing* shows.
Both draw through `ChoiceMenu` and `ToolbarGroup`, but the operation stays
caller-supplied.

## Why

Ticket `12` is resolved and claims an Open Space Thing's Diagram and Graph
choices use the Dock's shared control compositions. The code places them in
`CardContent` on a vertical `CommandSurface` — a second chrome strip inside
the Thing, below the title, with its own tab stops.

That contradicts the intended design:

- Cards have a **fixed toolbar** on the rail; Space Things **extend** it.
- The Dock is the consistent interface for Spaces; a Space Thing's mini-dock
  should read as the same language on a smaller canvas, not a body panel that
  happens to share CSS tokens.
- ADR 0073 names choosing a Diagram and a Graph as **Space Thing kind
  commands** — they belong with Enter in the kind group on the rail, not in
  the body under the Title.

`CommandSurface.tsx` still documents the body placement as intentional. That
comment is wrong and must be corrected with the code.

## Required shape

- [x] Move Diagram and Graph from `CardContent` into `ThingRailActions`, as
      `ToolbarGroup` clusters beside the existing kind and shared groups.
- [x] Reuse `ChoiceMenu` and `ChoiceMenuTrigger` with `ToolbarButton` renders,
      matching the Dock's cluster treatment (named trigger: glyph, current
      title, chevron). Do **not** mount a nested `CommandSurface` or second
      `Toolbar` in the body.
- [x] Preserve ADR 0073's one-toolbar contract: one tab stop per Thing, arrows
      traverse Enter, Diagram, Graph, entity actions and Open/Close together.
- [x] Withhold both clusters while the Thing is Closed, read-only, or the
      target Space has not been read yet — same availability rules as today.
      The unread case may keep a plain body note or equivalent non-live-region
      feedback; it must not introduce a second toolbar.
- [x] Operations unchanged: `onDiagramChange` / `onGraphChange` write the
      Thing's stored selection; they do not navigate the containing Space.
- [x] Shrink the Open Space Thing footer geometry now that selectors no longer
      occupy the body: update `SPACE_THING_FOOTER_HEIGHT`,
      `SPACE_THING_EMBED_INSET.bottom`, `canvas-thing.css` and
      `canvas-thing-embedded-diagram.test.ts` together.
- [x] Update misleading comments in `CanvasThing.tsx` and `CommandSurface.tsx`.
- [x] Update parity claim `open-space-thing-chooses-its-context-on-the-shared-controls`
      if its wording still implies body placement.
- [x] Assert placement in unit tests: selectors live under
      `canvas-thing-actions` / the rail toolbar, not `.canvas-thing__body`.
- [x] Run `pnpm verify`, `pnpm e2e`, and `pnpm e2e:ladle`; record actual
      outcomes.

## Out of scope

- Dock identity-cluster behaviour from ticket `26` (name+chevron disclosure,
  Rename in the menu). This ticket only moves and aligns the Space Thing's
  existing named triggers.
- Showing Diagram/Graph while Closed. Current tests withhold selectors until
  Open; keep that unless a separate decision says otherwise.
- New ADR. Placement is treatment under ADR 0073 and ticket `12`; record the
  fix here.

## Decision record

No ADR. `docs/agents/workflow.md` puts control placement in issues and
behaviour tests. Ticket `12`'s decision record already states no ADR is needed
for this class of visual treatment change.

## Answer

Diagram and Graph now extend `ThingRailActions` as named `ToolbarGroup`
clusters using `ChoiceMenuTrigger` with `ToolbarButton`. Enter, the choices,
entity actions and Close share the rail's arrow navigation and one tab stop.
The body retains only plain unread feedback until the target resolves;
Closed and read-only Things withhold both choices. Selection callbacks still
write the Thing's own context.

The footer is now 100px, with a 104px bottom inset including the border.
The CSS and projection geometry test agree, and the minimum Open Size derives
from the smaller inset. Application and Ladle parity tests assert rail
placement, keyboard traversal and shared surface treatment.

Standards and Spec reviews, including follow-up test changes, found no defects.

Verification:

- Focused CanvasThing and geometry tests passed after demonstrating the old
  placement and footer failures. Embedded selection/edit tests: 22 passed.
- `pnpm e2e:ladle`: 87 passed. The first run exposed an unsupported Home-key
  assumption in the new test; the final test uses arrows and checks Tab exit.
- Initial `pnpm verify` exposed old footer, native-disabled and body-panel
  expectations, now updated, plus test timeouts under parallel load. The final
  run limits Vitest to two workers without changing tests or thresholds.
- Initial `pnpm e2e`: 195 passed, two failed on the earlier Home-key assertion
  and old below-the-embedding placement expectation. Both are corrected.

- Final `pnpm verify`, with `VITEST_MAX_THREADS=2 VITEST_MIN_THREADS=1
  VITEST_MAX_FORKS=2 VITEST_MIN_FORKS=1`: passed all static checks and 2,582
  tests across 208 files, including coverage thresholds.
- Application E2E rerun: 195 passed, two edge tests failed while edits to test
  files triggered Vite page reloads. Both passed in a separate one-worker rerun.
  All Space Thing tests passed. A final full local run was stopped at the
  user's request to open the PR and let CI perform final full verification.
- Final full CI verification is delegated to the PR checks.

### Rail ordering correction

The requested order is Diagram, Graph, entity actions (`…`), Open/Close, Enter.
The Space choices lead and Enter trails; other Thing kinds keep their existing
content-edit order. Application and Ladle keyboard proofs assert this sequence.
Target-Space authoring already exists through the embedded entry's `app.authoring`;
exposing additional Diagram and Graph menu actions would reuse that path.

Ordering validation: typecheck and 47 CanvasThing tests passed; the focused
Ladle test and both application tests passed. Standards and Spec review found
no defects. Full final verification remains with PR CI.
