# 02 — Replace the workspace toolbar with a Menubar

**What to build:** Define the correct workspace command surface in stable Ladle
stories first, using the shared shadcn/Base UI components and their native
interaction contracts. Then convert production to the story's accepted
composition: a persistent row of single-choice selectors for View, Layout and
Graph, with Card creation and presentation commands as adjacent persistent
controls. Existing production is extraction input, not design authority; preserve
product requirements, not accidental implementation behaviour.

This originally read "a persistent desktop menubar for View, Layout and Graph".
That was wrong for the reason recorded in the 2026-08-18 comment — a menubar
trigger is a stable command noun, and these carry values.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved

- [x] View, Layout and Graph selection are represented as mutually exclusive menu choices, with the current selection visibly and accessibly identified.
- [x] Card creation and Present/Overview remain reachable with their existing availability rules and keyboard commitments.
- [x] `AddCardControl` composes its menu half through the shared
      `DropdownMenu` surface and semantic tokens while preserving the accepted
      split-control behavior: `modal={false}`, conditional focus return when
      Add Alias opens a pane, and `nokey` protection for the portalled popup.
- [x] Normal, pending, failed and conflicted persistence states are clear without treating status as a menu command; Ladle defines each accepted state and production is verified against it.
- [x] The stable stories are authored and behavior-tested as the design-system
      reference before production is converged onto them. Importing an
      unreviewed production composite into a story is not parity evidence.

## Answer

**Amended 2026-08-18 — the Menubar was withdrawn; see the comment below.** View,
Layout and Graph are three independent single choices, each drawn as a `Select`
whose trigger carries its current value at a fixed width. Present/Overview and
the accepted Add Card split control remain adjacent persistent actions. The
settled persistence design
from `feat/surface-inventory` remains intact through the shared
`PersistenceIndicator`: `PersistenceIndicator`'s own lifecycle story covers the
transient saved cue and pending state, and the workspace toolbar's `Rejected`
story covers compact rejection by dismissing `RejectionControl`'s dialog. The
production `PersistenceControl`
composes retryable failure, permanent rejection and conflict recovery: conflicts
use the shared `AlertDialog` for Reload/Save and put an unloadable-remote reason
inside a destructive `Alert`; permanent rejection uses the same dialog boundary
and returns to the unchanged local workspace after acknowledgement.

The conflicted and rejected stories use Ladle's documented `iframed` metadata
for modal stories. Their production focus traps therefore stay inside the story
canvas instead of making the catalogue navigation inert; preview-mode behavior
tests remain unframed and exercise the dialogs directly. The shared AlertDialog
portal resolves its container from the rendered content's `ownerDocument`, so
Base UI mounts into Ladle's iframe rather than escaping back to the catalogue
body. Catalogue coverage clicks a real story link while the modal is open.

The paused implementation's portal race was exposed by the story-first keyboard
contract as a conflict between a hand-written open-menu state machine and Base
UI's Menubar lifecycle. Removing that state machine lets the primitive own menu
coordination, focus and dismissal. Radio groups own `onValueChange`; items do
not duplicate selection with `onClick`. Workspace selection uses the primitive's
supported `closeOnClick` option so selection returns immediately to the canvas
and adjacent commands. `finalFocus` uses the primitive's supported focus-return
hook to restore the owning trigger.
`AddCardControl` now composes the shared DropdownMenu facade and preserves its
conditional focus-return and `nokey` behavior; the shared trigger forwards the
caller's ref so cancelling Alias creation still restores focus.

## Extraction accounting

- **Shared UI retained:** `90f87ee`'s toolbar sizing in `Button.tsx` and
  `AddCardControl.tsx`; `d8520b6`'s `PersistenceIndicator`, export, unit test and
  lifecycle story; the donor's `alert-dialog.tsx`, public exports and component
  test; the already-landed shared `Alert`; and the DropdownMenu trigger/ref and
  Menubar lifecycle corrections in their shared components and tests.
- **Production composition retained and reconciled:** `App.tsx` composes the new
  app-owned `PersistenceControl`; `WorkspaceToolbar.tsx` replaces the donor's
  Select controls with controlled Menubar radio groups while keeping
  Present/Overview and Add Card adjacent. Its grouped persistence input keeps
  the rendered control, typed state and acknowledged revision together.
- **Stories retained:** `persistence-indicator.stories.tsx` drives the accepted
  lifecycle from a real `SpaceSession` over a delayed fixture backend;
  `workspace-toolbar.stories.tsx` and `WorkspaceToolbarFixture.tsx` define
  settled, pending, retryable failure, permanent rejection, conflict and
  presenting before production is reconciled to the same composition. They are
  not snapshots of unreviewed production behavior.
- **Behavior proofs retained and reconciled:** `PersistenceIndicator.test.tsx`,
  `AlertDialog.test.tsx`, `WorkspaceToolbar.test.tsx` and `Workspace.test.tsx`;
  the selector and toolbar-boundary updates in `editing.spec.ts`, `graph.ts`,
  `new-space.spec.ts` and `overview.spec.ts`; the donor's modal conflict behavior
  in `http-persistence.spec.ts`; and the focused production-story checks in
  `issue-02-workspace-toolbar.spec.ts` through `playwright.ladle.config.ts`.
- **Deferred:** ADR 0052's repository-wide parity manifest, runtime collection
  enforcement and dedicated Ladle CI job remain Issue 08.
- **Rejected:** inline conflict/rejection toolbar controls introduced during
  extraction; they replaced the donor's modal production behavior and were
  removed. The Menubar composition itself was rejected on 2026-08-18 and the
  donor's Select-based selectors were rebuilt in its place — see the comment
  below for why the acceptance criterion that asked for a menubar was wrong.

Verification after the 2026-08-18 amendments:

- `pnpm verify` passed: 1,264 tests passed and 8 skipped, across 125 files.
- `pnpm e2e` passed: 93 tests.
- `pnpm e2e:ladle` passed: 6 tests. One run of "modal persistence stories are
  isolated from the Ladle catalogue" failed on the catalogue search input before
  five consecutive green runs; that test predates these changes and touches
  nothing they own, so it is recorded as flaky rather than fixed here.

Known outstanding, not addressed by either amendment: **the header is not
responsive.** `.shell__header`'s two flex children keep the default
`min-width: auto`, so neither compresses and both overflow the header's painted
box at roughly 1050px and below. The fixed trigger width makes selection stable
but removes the row's give, and the title's `white-space: nowrap` never
truncates. Fixing it needs `min-w-0` on both children, `flex-basis` rather than
a fixed width on the trigger label, and a disclosure step below the point where
labels stop being readable. Whether that is the horizontal toolbar's fix or a
move to shadcn's `Sidebar` — which is the only application-chrome component in
that registry with a worked-out responsive story — is an open design question.

Extraction verification when the ticket first resolved:

- `pnpm ladle:build` passed with the production persistence and workspace
  toolbar stories.
- `pnpm e2e:ladle` passed: 4 tests.
- `pnpm verify` passed: 1,286 tests passed and 8 skipped.
- `pnpm e2e` passed: 93 tests.

## Comments

### 2026-08-18 — retryable failure reports in two places, not one

The donor put a retryable failure in the toolbar as a `Retry persistence`
Button that *replaced* the indicator, with the reason in a `title` attribute.
Two things wrong with that. It moved every control beside it, for the same
reason the fixed trigger width above exists — chrome geometry should not depend
on a transient condition. And a `title` is the one place a reason cannot be
read: touch never shows it and screen readers treat it inconsistently, so the
only account of *why* a save failed was effectively invisible.

Split by what each surface is good at. The toolbar reports the condition as a
red dot through `PersistenceIndicator`'s new `failed` cue — same shape and size
as the resting cues, so nothing moves. The reason and the action live in
`PersistenceNotice`, a destructive `Alert` with an `AlertAction` retry, pinned
top-right under the toolbar through `AppShell`'s new `notice` slot. `Alert`
carries `role="alert"`, so the reason is announced when it arrives.

Deliberately not a dialog. A retryable failure leaves the local work intact and
the workspace fully usable — the author can keep editing and the next commit may
succeed on its own — so blocking the canvas would overstate it. That is the line
between this and the two states that do get dialogs: a conflict has no safe
dismissal, and a rejection needs acknowledging. Permanent rejection also keeps
the louder `CircleAlert` glyph rather than a dot, because no retry clears it.

The shell's `notice` slot is unconditional and `.shell__notice:empty` hides it,
so a caller passes one component for the whole condition instead of repeating
that component's own test. `WorkspaceToolbarFixture` now composes the real
`AppShell` rather than a stand-in header, since a fixture drawing only the
toolbar could not show a pairing that spans both.

### 2026-08-18 — Menubar withdrawn, Select restored

This ticket's own acceptance criterion named a menubar, and that criterion was
wrong. A menubar trigger is a stable command noun — File, Edit, View — and the
roving tab focus across the bar assumes stable command groups. These three
triggers carry *values*: `View · Flow`, `Layout · None`, `Graph · None`, one of
them with a colour swatch and another with a live dot. Every deviation the
Menubar implementation needed was a reconstruction of Select: a fixed `w-40` on
each trigger because a data label cannot size itself, a `truncate` span inside
it, and a duplicated `title` so the truncated value stayed readable. It also
invented `''` as the no-selection sentinel and cast `onValueChange`'s untyped
string back to `BuiltInViewId`, where Base UI's documented empty state is `null`
and Select infers the value type — both already recorded in `docs/agents/ui.md`
as what the View, Layout and Graph selectors do.

`6885084` had deleted `ViewSelector`, `LayoutSelector`, `GraphSelector` and
`SelectorTrigger` as orphans of that migration. They are rebuilt rather than
reverted: `BuiltInViewId` from `@project/core` replaces the local
`AlgorithmicViewId`, `graphColor` replaces the inlined fallback chain, semantic
Tailwind tokens replace the raw `var(--…)` classes, and `GraphSelector` no longer
welds Present into a segmented group — Present stays the adjacent `Button` this
ticket accepted, with its disabled rule and its tests moving to
`WorkspaceToolbar`. `packages/ui/src/components/menubar.tsx` is deleted with
them; nothing else used it.

One behaviour is new rather than restored: a Select trigger's natural width is
the width of whatever is chosen, so selecting a longer title used to shift every
control to its right. The label is now a **fixed** width rather than a maximum,
and the live-Layout dot sits in a reserved slot on the Layout selector, so the
toolbar's geometry is a property of the toolbar and not of the Space's longest
title.

### 2026-08-16 — paused implementation

Partial production migration and its test updates are preserved as the tracked
patch `../patches/issue-02-workspace-menubar-wip.patch`. The original local
stash object was `2814ec7c5b135ba1fe5a07d9f472a66c8634d9fe`, named
`wip issue 02 workspace menubar migration`. Inspect the patch from the clean
Issue 02 branch after confirming that Issue 11 no longer blocks the surrounding
design decisions; Issue 09 is already delivered by PR #73. It records changes
against the donor's later production surface, so rework its intent against the
files the clean branch actually inherits rather than blindly applying it.

The WIP moves View, Layout and Graph choices into Menubar radio groups while
retaining Add Card through the production `AddCardControl` and retaining
Present/Overview as a persistent adjacent action. Those two exceptions are
intentional: current accepted UI guidance makes Add Card the direct half of a
split control, and existing application behavior keeps Present/Overview
reachable without first opening Graph.

Retaining `AddCardControl` means retaining the production composite, not its
private menu implementation. This ticket also migrates that menu half from its
direct Base UI wrapper and raw CSS variables to the shared `DropdownMenu`
surface. The migration must preserve the focus and keyboard behavior named in
the acceptance criterion above.

Verification before pausing:

- Root and app TypeScript checks passed.
- Focused `WorkspaceToolbar`, Card-authoring and Card-creation tests passed: 38
  passed, 8 skipped.
- `pnpm e2e:ladle` reached 9 passed and 1 failed. The toolbar story selected
  Grid successfully, but the next Add Card menu click was blocked by the prior
  Menubar portal's inert presentation layer. Resume by diagnosing the menu
  close/dismissal boundary; do not hide it with a timeout or forced click.
- Full `pnpm verify` and `pnpm e2e` were not run for the WIP.
