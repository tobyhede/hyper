# 02 — Replace the workspace toolbar with a Menubar

**What to build:** Give the workspace a persistent desktop menubar for View, Layout, Graph, Cards and presentation commands. Its selection, disabled, persistence-conflict and keyboard behaviour remains equivalent to today's controls while its grouping and accessibility follow the shared design system.

**Blocked by:** 01 — Establish the shadcn design-system baseline.

**Status:** resolved

- [x] View, Layout and Graph selection are represented as mutually exclusive menu choices, with the current selection visibly and accessibly identified.
- [x] Card creation and Present/Overview remain reachable with their existing availability rules and keyboard commitments.
- [x] `AddCardControl` composes its menu half through the shared
      `DropdownMenu` surface and semantic tokens while preserving the accepted
      split-control behavior: `modal={false}`, conditional focus return when
      Add Alias opens a pane, and `nokey` protection for the portalled popup.
- [x] Normal, pending, failed and conflicted persistence states are clear without treating status as a menu command; Ladle presents each state using the production composition.

## Answer

The production workspace now composes View, Layout and Graph as controlled
Menubar radio groups, with Present/Overview and the accepted Add Card split
control remaining adjacent persistent actions. The settled persistence design
from `feat/surface-inventory` remains intact through the shared
`PersistenceIndicator`: its lifecycle story covers the transient saved cue,
pending state and compact rejection. The production `PersistenceControl`
composes retryable failure, permanent rejection and conflict recovery: conflicts
use the shared `AlertDialog` for Reload/Save and put an unloadable-remote reason
inside a destructive `Alert`; permanent rejection uses the same dialog boundary
and returns to the unchanged local workspace after acknowledgement.

The paused implementation's portal race was resolved at the lifecycle boundary:
the toolbar controls which of its three menus is open and closes it before a
selection updates application state, while Menubar's non-modal root and
immediately hidden closed content leave the adjacent Add Card popup reachable.
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
- **Stories retained:** `persistence-indicator.stories.tsx` now drives the
  production control from a real `SpaceSession` over a delayed fixture backend;
  `workspace-toolbar.stories.tsx` and `WorkspaceToolbarFixture.tsx` render
  settled, pending, retryable failure, permanent rejection, conflict and
  presenting through the unchanged production composition.
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
  removed. The donor's Select-based toolbar implementation was superseded by
  this ticket's Menubar acceptance criteria.

Final extraction verification:

- `pnpm ladle:build` passed with the production persistence and workspace
  toolbar stories.
- `pnpm e2e:ladle` passed: 4 tests.
- `pnpm verify` passed: 1,286 tests passed and 8 skipped.
- `pnpm e2e` passed: 93 tests.

## Comments

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
