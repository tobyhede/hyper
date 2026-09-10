# 11 — Restore Card and Dock behaviour with trustworthy application evidence

Status: ready-for-human
Tags: release/v1
Blocked by: nothing — the confirmed regressions and evidence repair can start immediately.

**What to build:** Authors can Open, Edit and Resize Cards with the visible Card,
handles and Edges sharing the same geometry, and use Dock commands without
accidentally acting on the canvas. Application tests must exercise those actual
gestures and the production composition. Capture and settle the remaining
promotion decisions explicitly rather than changing expectations to fit the
implementation.

This ticket captures the reviewed handoff for `feat/07-promote-the-dock`, at
`d9be5e51`, against merge base `a2082964`. PR #178 was reported open and not draft.
Keep the branch unmerged; making the PR draft is the handoff's requested first
operational step, not an action already performed by this ticket's creation.
Ticket 07 records the promotion; this ticket does not reopen or modify it.

## Confirmed regression and why green tests missed it

Commit `11fe17f4` supplies Card entity actions to the working canvas. Those are
Copy link, Copy permanent link and Delete Card, moved onto the Card's own rail
when the Sidebar was retired. Supplying them activates a context-menu wrapper
around the whole Card. That wrapper uses `display: contents`, which removes its
layout box but preserves its DOM ancestry.

The sizing rule requires the Card face to be a direct child of the node's inner
wrapper. It therefore stops matching. In the running fixture, Opening A grows
the node and inner wrapper from 260 × 146 to 560 × 420 while the visible face
stays 260 × 146. Handles and resize controls follow the larger node. A temporary
browser-only selector override made all three dimensions agree. This establishes
the cause, but an unrestricted descendant selector is not a prescribed fix:
nested Cards must retain their own geometry.

The application test tagged `canvas-card-fills-authored-node-rect` measures only
the React Flow node, including after resize and reload. The Ladle test compares
the visible face with the node, but its specimen omits entity actions and thus
the offending wrapper. Both tests were rerun and passed on the broken branch.
The shared parity label did not establish equivalent assertions or composition.

The handoff reports full suites green: verify 2333 tests, application E2E 159,
Ladle E2E 77. Those full-suite counts were not independently rerun during the
investigation. PostgreSQL E2E was reported fixed but not executed locally.

## Acceptance — restore the oracle before repairing behaviour

- [x] Restore plain node hovering at the affected application test call sites;
      remove the helper's targeting of the smaller inner Card as a workaround.
      Its comment explicitly accommodates the broken Open Card geometry. Any
      separate pointer-refresh requirement must have independent reproduction.
- [x] Before changing production code, demonstrate a failing application
      assertion comparing the visible face with its node after Open. Extend it
      through Edit-on-Closed, Resize preview, completed Resize and reload.
- [x] Exercise entity actions in the Ladle geometry specimen so its DOM follows
      the affected production composition.
- [x] Remove automatic Escape dismissal from the disclosure helper. Test pressing
      a second trigger while another disclosure is open, with ordinary clicks
      and realistic pointer timing. Assert the resulting open disclosure.
- [x] Replace the side-edge names and unwell-open-Space application-evidence
      waivers with application tests. A controlled transport failure is valid
      setup when the real application handles and reports it.

## Acceptance — restore the affected authoring gestures

- [x] Open and Edit-on-Closed grow the visible Card to the authored Open Size;
      Close restores Closed Size and preserves remembered Open Size.
- [x] Resize keeps the face, handles, Edges and displaced neighbours aligned
      throughout the preview and after persistence. Nested Cards remain correct.
- [x] Pointing at the Card reaches its rail. Audit sibling-dependent hover
      treatment too: the new wrapper also separates the face from the authoring
      handles. Demonstrate the actual hover behaviour in a browser.
- [ ] Reproduce the reported Layout/Graph-name click opening a Card, before
      choosing a fix. Clicking either name begins only its rename interaction,
      including while another disclosure is open; no Card Open/Edit or unrelated
      authored change occurs. Outside-press propagation is a candidate, not a
      confirmed explanation.
- [x] Verify failure reporting and recovery while presenting. The Dock currently
      hides its persistence Retry with the whole surface; establish and implement
      the required reachable recovery path.

## Decisions and follow-up findings — do not mislabel as confirmed regressions

- **New Layout:** opening the Cards drawer after creation, and on first Layout
  initialization, already happens at `a2082964`. Removing that side effect is a
  requested behaviour change, not an addition introduced by this branch. Record
  whether New Layout should create/select its empty Layout and initial Graph
  without opening another surface, then test that exact outcome.
- **New Space:** the Dock opens Space Card creation. Ordinary Spaces must be
  created through owning Space Cards. Specify the intended command outcome,
  including ownership, whether creation Enters the Space, and cancellation,
  before classifying the present pane as incorrect.
- **Cards surface:** ticket 10 owns the popover-versus-drawer decision. The
  prototype comparison chose the popover; promotion retained the existing
  drawer. Existing tests alone do not justify overriding the chosen treatment.
  If restoring the popover, preserve the useful collection behaviours and
  remove the losing surface. This decision does not block Card geometry repair.
- **Typography:** establish the Dock's intended scale and inspect computed
  sizes/weights across controls and orientations. Absence of local font rules
  alone does not prove inconsistency; fix measured discrepancies.
- **Memoization:** Card rail actions are rebuilt each render. The handoff reports
  six embedded-Layout tests fail when memoized. That demonstrates a dependency
  on recomputation, not yet which dependency is incomplete or that a per-node
  cache is the required solution. Preserve those tests and diagnose separately
  before optimizing.
- **Active Graph:** the Dock and canvas resolve it separately. Assess whether
  they can disagree; record evidence before choosing a consolidation.
- Ticket 09 owns Space rename; ticket 08 owns Sidebar-era primitive retirement.
  Ticket 06 was deliberately left ready-for-human. These are not blockers for
  the confirmed repair and must not be silently absorbed or closed here.

## Verification and completion

- [x] Record explicit acceptance outcomes for each command before adapting its
      tests. Preserve behavior assertions; changing how a control is reached
      must not introduce compensating product actions in helpers.
- [x] Demonstrate each repaired regression red before and green after its fix,
      through the application as well as any component specimen.
- [x] Run verify, application E2E and Ladle E2E. Run PostgreSQL integration and
      PostgreSQL E2E with the database migrated, and always stop that database
      afterward. Do not stop or restart a human-owned dev server.
- [x] Verify the handoff's previously browser-unverified changes: PostgreSQL
      Space-name addressing, persistence notice stacking above the Dock, and
      the parent glyph marker's rendered evidence.
- [x] Attach actual results and resolve or explicitly assign every remaining
      decision/finding before recommending the branch for merge. Green counts
      alone are not acceptance evidence.

## Prior investigation boundaries

The handoff reports these hypotheses tested and ruled out: active/open-Space
selection wiring (unchanged from main), missing flex min-height, pointer-events
disabled on the Dock frame, and the InlineTitleEditor size-prop removal changing
its effective size. Do not repeat those investigations without new evidence.

**Process constraint:** A promotion may adapt how tests reach controls, but must
preserve existing behavioral assertions unless an explicit product decision
changes them. Helpers must not compensate for product defects.


## Answer — 2026-09-10

PR #178 is now draft and remains unmerged. The confirmed Card geometry and
presenting recovery regressions are repaired; the remaining product decisions
are assigned below. This is ready for human review, not a merge recommendation.

### Repair and evidence

The Card itself is now the Base UI context-menu trigger, using the shared
`EntityActions` render composition seam. `Card` forwards its DOM ref so that
composition works on React 18. No extra ancestor separates the face from its
node or sibling handles, and no broad descendant sizing rule reaches embedded
Cards. Entity commands remain available; their addition supplied the commands
formerly reached through the Sidebar, but the wrapper they activated caused
this regression.

Before the repair, the application face/node assertion failed with a 165 CSS
pixel size difference at the test zoom. The Ladle specimen, now supplied with
production entity actions, failed with a 260 × 146 face against a 480 × 360 node.
Both passed after the repair. Application evidence now compares x, y, width and
height through Open, Resize preview, completed Resize, reload, Close and
Edit-on-Closed. Embedded Card resize also checks the parent rectangle remains
unchanged. A real handle-hover test proves sibling hover still reveals actions.
The original fixture reproduction now shows node, inner wrapper and face all
560 × 420, with the screenshot inspected.

The presenting failure was independently red in application and Ladle: hiding
the entire Dock hid Retry. Presenting now hides the command toolbar while its
separate failure report and recovery control remain reachable. Application
coverage fails a real HTTP commit, presents, retries and observes persistence
without leaving presentation.

`hoverAfresh` and the disclosure helper's automatic Escape are removed. Tests
press Layout, Graph and Space disclosures directly at both 0 and 120 ms press
durations. Rename tests click Layout and Graph names with another menu open,
assert editor focus, cancel, and check unchanged Card state and revision.
**The reported name-click opening a Card was not reproduced** in those cases;
the unchecked reproduction item above records that limitation. Outside-press
propagation is not established as a cause and no speculative event fix was made.

Both application-evidence waivers are replaced: a side-edge Dock keeps names and
opens its menu into the canvas; an embedded target's failed HTTP commit appears
on its real open-Space entry, and recovery is reached in that Space. Browser
checks also prove notice stacking over the Dock and the rendered parent glyph.
PostgreSQL E2E verifies the Space-name addressing change and fresh-host durability.

### Remaining decisions

- Ticket 10: Cards popover versus drawer and collection behavior.
- Ticket 12: shared neutral Card/Dock toolbar components and measured typography.
  Its visual changes, including removing rail hover color, are separate work.
- Ticket 13: explicit New Layout and New Space creation, ownership, continuation
  and cancellation outcomes. Existing commands were not changed or implicitly
  approved by preserving their tests.
- Ticket 14: decoration invalidation, the reported memoization failures, and
  observable agreement between Dock and canvas Active Graph resolution.
- Tickets 09 and 08 retain Space rename and unused primitive decisions; ticket
  06 remains ready-for-human.

### Review

Standards review found stale presenting/recovery prose; `docs/agents/ui.md` now
matches the reachable failure report. Spec review identified the remaining
embedded node-only assertion gap; parent and embedded face rectangles now have
application assertions. The shared geometry helper also checks origins. No
unresolved production-code finding was reported by either review.

### Verification

- Static verification: toolchain, both typechecks, UI catalogue, ESLint,
  anti-slop lint and formatting passed.
- Final application E2E: **170 passed** in 2.7 minutes.
- Ladle E2E: **77 passed**.
- PostgreSQL integration: **80 passed**; PostgreSQL E2E: **1 passed**.
  The database started for these checks was stopped afterward.
- Final unrestricted coverage: **2333 passed, 2 skipped**, across **193 files**
  in 103.37 seconds. All verify stages passed, with coverage rerun separately
  after the initial timeout and sandbox interruption documented below.

Earlier runs are not hidden: a side-edge disclosure failed once, then passed
10 isolated repetitions without a code change and passed the final full suite.
Its intermittent cause remains unproven. An earlier handle test failure
coincided with edits triggering Vite HMR; the isolated and final runs passed.
The first final verification run had 2332 passes, two skips and one embedded
initial-render wait timeout while E2E ran concurrently. The unchanged embedded
file then passed all 16 tests in isolation. The separate sandboxed coverage run
encountered IPC socket EPERM errors and a raw HTTP test timeout; it was stopped
and rerun with the required permissions.
No timeout, assertion or product gesture was weakened to make these runs pass.
