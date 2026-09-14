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

### Full target menus

The user extended this ticket: the Space Thing's menu options must be the same
as the Dock's. Diagram offers Rename, New Diagram, Copy link and Delete; Graph
offers Rename, Colour, New Graph, Copy link, Copy permanent link and Delete.
The two surfaces now draw shared `DiagramMenuActions` and `GraphMenuActions`.
Space Thing callbacks use the existing target entry's authoring and browser
location; Graph commands explicitly address the stored Diagram. The rail order
remains Diagram, Graph, entity actions, Open/Close, Enter.

The shared application/Ladle scenario exercises all commands, last-Graph
protection, and the containing canvas staying selected. The application also
checks reload persistence. Domain tests cover a context different from the
target's own selected Diagram and repair of a target's deleted Active Graph.
Review follow-ups:
- Confirmed: blur completion returned focus to the old trigger. A failing unit
  regression now passes; blur leaves focus at its destination.
- Confirmed: New Diagram bypassed the continuation owner. It now requests the
  containing Space's continuation, scoped to the rail and newly created Diagram;
  a readiness regression verifies deferred projection updates.
- Confirmed: cross-Space create/delete could persist in the wrong order. Four
  failing memory-backend regressions now pass. Creation saves the target before
  the Thing refers to it; deletion saves the replacement selection first.

Final focused validation: 69 UI/continuation tests, 124 canvas/authoring/Edge
tests, four persistence regressions, and the shared Ladle action scenario
passed. Root and package typechecks and the UI catalogue check passed.
The final application browser rerun was blocked by occupied test port 5300;
no server was stopped. Full final verification is delegated to PR CI as requested.


### Space Thing entity menu refinement

User follow-up: Enter belongs inside the entity menu. The groups are now
Rename / Create Alias; Enter / Open in New Tab; Copy link to Thing in Diagram /
Copy link to Thing / Copy link to Space; Remove from Diagram. Copy actions carry
no explanatory subtitles. Alias creation accepts a Space Thing and still refuses
an Alias Target. Its Open content uses the graph resolver and the shared Diagram
embedding, with authoring disabled throughout the Alias view.

The branch was rebased onto main to incorporate the shared compact-button icon
sizing and Dock layout corrections. A shared browser proof checks the exact menu,
Rename, Alias creation and read-only content, and matching icon/font CSS sizes;
the application proof also reloads the created Alias. Full verification remains
with PR CI; local verification is limited to the affected tests and static checks.


Validation after rebase: root typecheck, the focused application and Ladle
entity-menu scenarios, and eight resolver/footer tests passed. The affected
menu/action tests passed (35 tests); earlier focused Alias intake, authoring,
Enter and CanvasThing checks passed. Review found and corrected duplicated
Alias resolution and outdated live documentation. Final full checks run in CI.
