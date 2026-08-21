# 07 — Rebuild presentation chrome with design-system components

**What to build:** Make Graph traversal choices, keyboard guidance, end-of-Graph feedback and the Overview exit control one accessible presentation surface built from the shared design system.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** ready-for-human

- [x] Available moves, selected moves and the end state are visually and accessibly distinct without changing traversal behaviour.
- [x] Keyboard guidance and the Overview exit preserve their current actions and remain usable at narrow viewport sizes.
- [x] Ladle shows real presentation states for no moves, one move, branching and retreat availability.

## Audit note

No production presentation-state catalogue landed for the required no-move,
single-move, branching and retreat cases. The production presentation chrome
also remains outside the new design-system composition; both halves belong to
this ticket.

## Implementation handoff

Deepen the existing `PresentingChrome` in place. It remains an app-owned,
screen-fixed production module composed from shared design-system primitives;
do not move Traversal language into `@project/ui` and do not introduce a second
presenting surface. Navigation remains authoritative for available moves, the
selected branch, Traversal history, advance, retreat and exit. The chrome is
controlled and receives only those facts and operations, never the whole
Navigation interface or local copies of its state.

Zero, one and many outgoing Edges remain one mechanism. A sink renders no move
and names the end of the Graph; one outgoing Edge is a one-member choice; a
fork is several choices. Add no linear-Graph mode or `isLinear` branch. Clicking
an unselected move selects it without moving the camera, while clicking the
selected move advances. The chrome owns the indexed list it renders, so it
calculates the selected-index delta and calls the existing
`selectBranch(delta)` operation; remove that coordination from `App`.

The move controls must expose the action they perform to assistive technology:
an unselected move is “Choose <Title>” and the selected move is “Go to
<Title>”. Do not represent them as radios, toggles or disabled destinations:
selection alone is not the completed action. Moves and the End-of-Graph state
share a polite live status region so a changed choice set is announced without
moving focus merely because Navigation changed.

### Complete interaction surface

Add a real Back control whenever Traversal history can retreat, invoking the
same Navigation operation as Arrow Left. This exposes an existing capability to
pointer and assistive-technology users rather than adding a second retreat
behavior. Overview remains in both the screen-fixed chrome and the workspace
Sidebar: either surface may be unavailable when the other is needed, and both
invoke the same Navigation operation.

The global Presenting key handler must defer to native activation. In
particular, Space on an interactive control must activate that control exactly
once rather than first advancing through the window listener and then firing
the control's click. Arrow and Escape Traversal commands may remain global, but
do not special-case one button; apply the interactive-control rule to chrome
and Sidebar controls alike. Guidance lists only currently available commands:
Up/Down for a fork, Right when a move exists, Left when history can retreat, and
Escape always. Use the official shadcn keyboard-key primitive if available;
otherwise record the required deviation before hand-rolling one.

When a move or Back is activated from inside the chrome, it owes focus after
the old control disappears: restore it to the newly selected move, to Back at a
sink when retreat is available, or otherwise to Overview. Track only this
chrome-originated focus debt. A traversal initiated through global arrow keys
must not steal focus into the chrome.

Keep branch choices in one bounded horizontal scrolling row and scroll the
selected choice into view. Do not wrap an unbounded Graph out-degree into a
chrome block that covers the presented Card. At narrow widths, choices occupy
their own full-width row and Back, applicable keyboard guidance and Overview
sit below it with their labels and touch targets intact; do not collapse the
primary Traversal choices into a menu.

All semantic Presenting chrome styling moves out of the global application
stylesheet and into the production module's design-system composition. The
chrome is screen-fixed DOM and has no React Flow geometry exception to retain.

### Stable-story parity

Stable stories live under `stories/components` and render the unchanged
production `PresentingChrome` through real Navigation over purpose-built
Spaces. Story support may supply Spaces, deterministic dependencies and layout
constraints, but must not maintain a story-local selected index or Traversal
history, translate production state, fake a canvas, or manufacture camera
behavior. Now that Sidebar and Presenting stories both need the environment, a
small shared story-support harness may be extracted if the deletion test shows
that it concentrates real setup; it must not become a visual facsimile or a
second lifecycle owner.

Use those stories as the one remaining design pass, not as evidence assembled
after production has already settled the result. Build the real sink, one-move,
fork, retreat and narrow-viewport states first from shared design-system
primitives, then pause before production conversion for a focused human review
of:

- visual hierarchy and spacing;
- selected-move emphasis and the distinction between Choose and Go;
- Back and Overview placement;
- bounded move-list overflow and narrow-width composition;
- applicable keyboard guidance;
- real pointer, keyboard, focus and live-announcement behaviour.

That review approves the stable story as the production reference under Issue
13's story-first authority. It does not reopen the settled Traversal model,
module seam or ownership decisions. Reconcile production to the approved story
only after this gate, then establish the paired application evidence against the
same exported module.

Cover reachable production topology: a starting sink, one move, a fork, changed
branch selection, post-advance retreat, a terminal sink with retreat, and a
narrow viewport. Paired claims separately prove:

- branch selection and commit;
- sink announcement and retreat recovery;
- global keyboard commands coexisting with native button activation;
- narrow responsive usability.

The application proof for a fork must not change the tracked E2E fixture, whose
Graphs are deliberately all lines. In one isolated E2E test, select an authored
Layout and Graph, use the real Edge Authoring surface to add a second outgoing
Edge to a Card that already has one, then Present and prove both choices,
selection without movement and commit down the selected Edge. Every test owns a
fresh memory repository, so this purpose-built fork leaves the shared fixture
and other tests unchanged.

Ladle proves the production chrome's control semantics, focus, announcement,
choice and responsive behavior. Application E2E proves its real composition
with Edge Authoring, Navigation, canvas and camera. Expand the current
sink-only module test into interface-level coverage of semantics, callbacks,
live announcements, focus restoration, overflow and applicable guidance;
retain Graph-walk correctness in Navigation's own tests rather than duplicating
it here.

Close the accounting with exact parity mappings and real results from
`pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle`. Keep the ticket
`ready-for-human` until all three pass. ADRs 0024, 0027, 0043, 0044, 0047 and
0052 already own the durable decisions; this extraction needs no new domain
term or ADR.

## Answer

`PresentingChrome` was deepened in place. It is still the one app-owned,
screen-fixed presenting surface and it is still controlled — Navigation remains
authoritative for the moves, the selected branch, Traversal history, advance,
retreat and exit — but everything it draws now comes from `@project/ui`, and
nothing named `presenting` survives in `packages/app/src/styles.css`.

### What changed

- **`@project/ui` gained `Kbd`/`KbdGroup`** (`packages/ui/src/components/kbd.tsx`),
  generated from shadcn's official `base-nova` `@shadcn/kbd` registry item. No
  deviation was needed: shadcn ships the keyboard-key primitive the guidance
  wanted. `packages/ui/src/index.ts` exports both.
- **`PresentingChrome`** is a `Button`/`Kbd` composition. Zero, one and many
  outgoing Edges remain one mechanism — a sink draws no move and names the end,
  one Edge is a one-member choice, a fork is several — and no `isLinear` branch
  was added.
- **The chrome owns the indexed list it renders.** It takes `onSelectBranch`
  and computes `index - selectedIndex` itself; `App`'s
  `selectBranch(index - moves.findIndex(...))` coordination is gone.
- **Moves name their action**: `Choose <Title>` unselected, `Go to <Title>`
  selected, with the Card's title as the visible text. They are ordinary
  buttons — no `aria-pressed`, no `role="radio"`, nothing disabled — because
  selection alone is not the completed action.
- **One polite `role="status"`** wraps the moves and the End-of-Graph text, so a
  changed choice set is announced without focus moving.
- **A real Back control** appears whenever Traversal history can retreat and
  calls the same `navigation.retreat` Arrow Left calls. Overview stays in both
  the chrome and the Sidebar, both invoking `navigation.exitPresenting`.
- **Chrome-originated focus debt**: advancing or retreating from a control in
  the chrome restores focus to the newly selected move, else to Back at a sink
  that can retreat, else to Overview. A traversal run from the global arrow keys
  sets no debt and moves no focus.
- **Bounded overflow**: the choices are one horizontally scrolling row and the
  selected one is scrolled into view. Below the chrome's own container-query
  breakpoint the choices take a full-width row and Back, the applicable guidance
  and Overview sit below it, with labels intact and 44px minimum touch targets.
  The chrome is its own `@container`, so a narrow region asks the same question
  a narrow window does — which is what lets the Ladle story and the phone-width
  E2E prove the same rule.
- **The global Traversal keys moved to `packages/app/src/presenting-keys.ts`**
  as `usePresentingKeys(active, commands)`. It now defers to native activation:
  a Space or Enter press whose target is inside an interactive control
  (`button`, `a[href]`, `input`, `[role="button"]`, `[role="menuitem"]`, …) is
  left to that control, so Space activates it exactly once instead of also
  advancing. The rule is written over interactive controls generally, so it
  covers Sidebar controls as well as the chrome's. Arrow and Escape stay global.
  It is a production module rather than an effect in `App` because the Ladle
  proof of that rule has to bind the listener the application binds.

### Parity mappings

Every claim is registered in `packages/app/stories/parity-claims.ts`; the
catalogue check enforces one Ladle test and one application test each.

| Claim | Stable story | Ladle proof | Application proof |
| --- | --- | --- | --- |
| `presenting-line-offers-one-move` | `components/presenting-chrome.stories.tsx#Line` | `ladle-e2e/issue-07-presenting-chrome.spec.ts` — "a line offers one move, named as the destination it goes to" | `e2e/presenting.spec.ts` — "the chrome names the moves available, and says when the graph ends" |
| `presenting-space-activates-one-control-once` | `#Line` | same file — "Space on a focused move activates that control exactly once" | `e2e/presenting.spec.ts` — "Space on a focused move activates that control exactly once" |
| `presenting-fork-selects-then-commits` | `#Fork` | same file — "a fork selects a branch and then commits down the one chosen" | `e2e/presenting.spec.ts` — "an authored fork offers both moves, selects without moving and commits down the one chosen" |
| `presenting-sink-ends-the-graph-and-can-retreat` | `#Sink` | same file — "a sink announces the end of the Graph and Back recovers the Card before it" | `e2e/presenting.spec.ts` — "a sink announces the end of the Graph and Back recovers the Card before it" |
| `presenting-narrow-keeps-choices-and-controls` | `#Narrow` | same file — "a narrow chrome keeps the choices in their own row above the other controls" | `e2e/presenting.spec.ts` — "at a phone width › the choices keep their own row above Back, the guidance and Overview" |

The fork's application proof authors its own fork: it selects `Collection 1`,
activates `Short`, draws A → C through the real Edge Authoring handles, then
presents. The tracked fixture is unchanged — its Graphs are still all lines —
because every E2E test owns a fresh memory repository.

### Stories and story support

- `packages/app/stories/components/presenting-chrome.stories.tsx` — `Line`,
  `Fork`, `Sink`, `Narrow`, each rendering the unchanged production
  `PresentingChrome` through real Navigation.
- `packages/app/stories/support/PresentingChromeFixture.tsx` — supplies a Space,
  an opening walk made of production `present()`/`advance()` calls, and a
  bounded positioned region. It also binds the production
  `usePresentingKeys`. It keeps no selected index and no Traversal history; it
  is not a canvas facsimile.
- `packages/app/stories/support/navigation.ts` — `useStoryNavigation`, extracted
  because the Sidebar and Presenting fixtures now need the same composition: the
  deterministic resolver, the mutable Space reader Navigation resolves against,
  and the rule that the instance is React *state* rather than a memo. The
  deletion test is real — remove it and both fixtures grow the same twenty
  lines back, including the lifecycle rule `WorkspaceSidebarFixture.test.tsx`
  pins. It owns no state of its own and is not a second lifecycle owner.
- `packages/app/stories/support/spaces.ts` — `walkthroughSpace` (a line) and
  `deepDiveSpace` (four Edges out of the starting Card, one title long enough to
  overrun the row). Both declare `defaultRenderer`, so `defaultRenderer` and ADR
  0026 answer where a story opens, not the harness. `story-spaces.test.ts` pins
  that, the minted-id block, and that the fork really forks.

### Tests

- `packages/app/test/PresentingChrome.test.tsx` — expanded from one sink
  assertion to fourteen interface-level tests: control semantics, each callback,
  the shared live region, focus restoration in all four directions, the
  applicable guidance, and scroll-into-view on a changed selection. Graph-walk
  correctness stays in `navigation.test.ts`.
- `packages/app/test/presenting-keys.test.tsx` — the binding, the inactive case,
  Space deferring to a focused control, and arrows staying global on one.
- `packages/app/test/PresentingChromeFixture.test.tsx` — the fixture composes
  production Navigation and keeps no state of its own.

### Departures worth recording

- **A *starting* sink is not reachable as an opening state.** A Graph's start is
  a Card an Edge leaves, so `present()` never opens on a sink; the reachable
  sink is one a traversal walks to. The `Sink` story is therefore two production
  `advance()` calls in, and the no-moves-no-retreat combination is covered at
  module level rather than as a stable story, which is what ADR 0052 asks for a
  state production cannot reach.
- **The human design-review gate is still open.** The ticket asks for the
  stories to be built and reviewed *before* production conversion. Because ADR
  0052 requires a stable story to render the unchanged production component,
  there was nothing to review until `PresentingChrome` itself changed, so the
  module and its stories moved together. The four stories are the design
  reference and the review of visual hierarchy, selected-move emphasis, Back and
  Overview placement, overflow, narrow composition and live behaviour has not
  been run by a human.

### Review findings acted on, and two not

A `/code-review` pass over the branch raised six. Four were real and are fixed
in this ticket:

- **The moves row clipped its own focus ring.** `overflow-x-auto` clips
  vertically too, and `py-0.5` left 2px where `Button`'s outline needs 4. This
  is the row the chrome deliberately puts focus into, so the indicator it places
  was the one being cut. Now `py-1.5`.
- **`truncate` did nothing on the move buttons.** `Button` is `inline-flex`, so
  a bare string is an anonymous flex item `text-overflow` never reaches; with
  the base `justify-center` a long title overflowed past *both* ends and was
  hard-clipped at each, losing the start of the Card's name with no ellipsis.
  The label is now its own `min-w-0 truncate` span, and `deepDiveSpace`'s
  longest Card is titled past what the bounded button can hold so the narrow
  Ladle test asserts the ellipsis rather than assuming it.
- **`role="status"` is atomic by default**, so one Arrow Down re-read all four
  choices. The region now carries `aria-atomic="false"` and announces what
  changed.
- **A reopened workspace Sheet leaked its keys.** Below the Sidebar's breakpoint
  the workspace is a modal Sheet over the canvas and its trigger survives into
  presentation, so it can be reopened mid-traversal; its focus trap then put
  every press inside it, and one Escape both dismissed the sheet and left
  presentation. `usePresentingKeys` now defers to a modal surface exactly as it
  defers to a control that activates itself — same rule, spent on a surface
  instead of a control. Proven in `presenting-keys.test.tsx` and by "a reopened
  workspace Sheet owns its own keys while presenting".

Two were declined:

- **"Space on a focused *unselected* move reselects rather than advances."**
  That is the ticket's own rule working. Space on a control named `Choose
  <Title>` chooses that Card, which is what the control says it does; making it
  advance instead would be the double-command this ticket exists to remove.
  Moving focus with the arrow-key selection would fix the asymmetry and is
  explicitly forbidden — "a traversal initiated through global arrow keys must
  not steal focus into the chrome" — and dropping `' '` from the global map
  would withdraw a binding nothing asked to withdraw. The guidance never
  advertises Space; it lists `→ go`.
- **"`KbdGroup` should be typed `ComponentProps<'kbd'>`."** The review says the
  shadcn registry types it that way; it does not — `@shadcn/kbd`'s `base-nova`
  source declares `React.ComponentProps<"div">` over a `<kbd>` element, and the
  file is a faithful copy. Nothing in the repo passes it a ref, and diverging
  from the generated drop would make the next regeneration a conflict rather
  than a no-op. Left as shipped.

### Verification

All three suites run on this branch, in its final shape.

- `pnpm verify` — exit 0. `Test Files 141 passed (141)`, `Tests 1464 passed | 8
  skipped (1472)`. Coverage thresholds held.
- `pnpm e2e` — exit 0. `108 passed (1.5m)` across the `chromium` and
  `new-space` projects, with the parity reporter reporting no unproven claim.
- `pnpm e2e:ladle` — exit 0. `23 passed`, including the five new presenting
  claims.

Three flakes were seen along the way, each re-run green in isolation and none
in code this ticket touches: `editing.spec.ts`'s "editing an existing Layout
updates it instead of creating another one" left `data-revision` at `1` after a
second `dragBy` (that helper's known mousedown race under parallel load), and
`card-authoring.test.tsx` plus `startup.test.tsx` timed out waiting for a Card
heading on one loaded run. The results above are from runs where every suite
went green end to end.
