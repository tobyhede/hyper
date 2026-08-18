# 14 — Replace the workspace toolbar with a workspace Sidebar

**What to build:** Move the workspace command surface from the horizontal
header row into a persistent left Sidebar, and draw what renders the canvas as
**one** exclusive choice over the computed Views and the authored Layouts —
no second selector, no `None`. ADR 0053 is the decision; this ticket is its
delivery.

The working design was `packages/app/stories/review/workspace-sidebar.stories.tsx`
(`Review/Designing/Workspace Sidebar`), committed as `63f473e`. It was design
evidence, not a component to import: under ADR 0052 the stable story must end up
rendering the production composition, and the review story retires when it does
— which it now has, replaced by `Components/Workspace Sidebar`.

**Blocked by:** 02 — Replace the workspace toolbar with a Menubar (delivered;
this supersedes its surface).

**Status:** resolved

- [x] View and Layout selection is one exclusive list with two group labels, one pressed item, and no empty value in any state — including a Space that owns no Layout yet.
- [x] The canvas header names what is currently drawing and whether it is computed or authored; the sidebar header names the Space.
- [x] Graph activation stays its own list with per-Graph colour and one active item, and does not merge into the canvas list.
- [x] Add Card keeps `AddCardControl` whole: split-control behaviour, `modal={false}`, conditional focus return, `nokey`, and the `C` shortcut with its existing availability rules.
- [x] Present/Overview keeps its existing availability rule — dead with no active Graph, and dead when the active Graph holds no Edges — and its `present-button` / `exit-presenting-button` identity.
- [x] Normal, pending, failed, rejected and conflicted persistence keep the composition Issue 02 settled: the indicator's own cue in the sidebar footer, the pinned `PersistenceNotice` for retryable failure, and the two `AlertDialog` recoveries.
- [x] The sidebar collapses and restores through the primitive's trigger and shortcut, and the canvas header keeps the trigger when it is closed.
- [x] `ViewSelector`, `LayoutSelector`, `GraphSelector` and `SelectorTrigger` are removed with their exports and tests; nothing keeps a second canvas-choice presentation alive.
- [x] The registry's `components/button.tsx` drop is rewired onto the repository's public `Button`, as `alert-dialog.tsx` already is, so `packages/ui` ships one Button.
- [x] The stable story renders the production sidebar composition, the review story and its design spec are removed, and the Ladle behaviour spec covers the accepted states.
- [x] `pnpm verify`, `pnpm e2e:ladle` and `pnpm e2e` pass, with the e2e suite driving the sidebar rather than the withdrawn selector test ids.

## Why this exists rather than reopening Issue 02

Issue 02 is resolved and its surface is delivered; what it delivered is now
superseded. Its own record already carried the open question this answers —
whether the header's responsive defect is the row's fix or a move to shadcn's
`Sidebar` — and named the Sidebar as the only application-chrome component in
that registry with a worked-out responsive story. ADR 0053 takes that decision.
Issue 02 keeps its accounting for what it extracted from the donor; this ticket
owns the surface that replaces it, so neither record has to be read as partly
false.

## Extraction status

This is not a donor extraction. `feat/surface-inventory` has no sidebar, and no
donor commit is a source for it. The retained inputs are the settled behaviour
Issue 02 delivered — `AddCardControl`, `PersistenceIndicator`,
`PersistenceControl`, `PersistenceNotice`, the two `AlertDialog` recoveries and
their tests — carried across the surface change unchanged. Issue 13's extraction
loop still governs the order of work: story first, then production, then paired
proof.

## Answer

The workspace command surface is `packages/app/src/components/WorkspaceSidebar.tsx`, composed over the shared registry `Sidebar` in `@project/ui`. The Space title is the sidebar header, Add Card its first group, then **Computed views** and **Authored layouts** as two groups of one exclusive list, then **Graphs**, then Present and the persistence cue in the footer. `AppShell` now frames a `SidebarProvider` with the sidebar beside a `SidebarInset`, whose header carries the trigger and `CurrentCanvas` — the name of what is drawing and whether it is computed or authored — and nothing else.

**One choice, expressed in the types.** `CanvasChoice` carries a whole `RendererSelection` rather than an id and a kind, and `onSelect` hands the chosen row back whole, so the list and the header cannot disagree and nothing casts a string back into a `BuiltInViewId`. `rendererSelectionKey` in `renderer.ts` is the one identity rule for a selection. `builtInViewTitle` joins it there so the row titles come from the same place the resolver's own title does.

**Navigation lost `selectedView`.** It existed to give the View Select a value while a Layout drew — the remembered View — and one list has no remembered anything: every View is a row, and the pressed row is the answer. Removed with its three test assertions.

**Empty states replace the two `None` values.** A Space with no Layout says `None yet — editing a view creates one` (ADR 0025); a Space with no Graph says `None yet — the first Layout mints one` (ADR 0018, ADR 0040). Neither is a value in a list.

## What the migration paid for

Four things broke, each caught by a test rather than by review:

- **Delete with focus on a canvas choice deleted the selected Edge.** The withdrawn Select trigger carried `nokey`; the sidebar did not. `nokey` now sits on `SidebarContent` and `SidebarFooter` rather than on the root, because the mobile `Sheet` portals those regions out of it. `edge-authoring-react.test.tsx` pins it against the real chrome.
- **The Add Card menu opened behind the sidebar.** `DropdownMenuContent` carried no stacking level while the sidebar's container is `fixed … z-10`; its positioner now carries `z-50`, as `Popover` and `AlertDialog` already did.
- **jsdom declares `window.matchMedia` and leaves it `undefined`.** `useIsMobile` calls it on every render of the shell, so `vitest.setup.ts` stubs it — reading the value rather than asking `in`, which is true and useless here.
- **React Flow auto-panned through a connection drag.** The canvas is 256px narrower, which put `connectHandles`' opening nudge 36px from the container edge — inside React Flow's 40px auto-pan margin — so the node never stopped moving and Playwright waited for a stable box forever. The helper now nudges *towards* the target, which is the truer gesture as well.

## Departures, and what was left alone

- **No tooltips on the sidebar rows**, against the working design. `collapsible="offcanvas"` has no icon-only state for a tooltip to label, and a `side="right"` tooltip opens over the canvas.
- **No static persistence label.** The working design paired the dot with `Changes saved` text that disagreed with the cue beside it. Production renders `PersistenceControl` alone, so the cue names itself once. A visible label is Issue 04's (recorded there).
- **`Select` stays in `@project/ui` with no consumer.** Retiring a primitive ADR 0050 names is a foundation decision, not this ticket's.
- **The canvas HUD keeps its Graph legend**, which now repeats the sidebar's Graphs group. Recorded in ADR 0053 as a cost and handed to Issue 06.
- **The sidebar stays open while presenting.** Presentation chrome is Issue 07's; this ticket kept parity with the toolbar, which also stayed on screen.

## Deleted

`ViewSelector`, `LayoutSelector`, `GraphSelector`, `SelectorTrigger` and their three component tests; `WorkspaceToolbar` and its test; `workspace-toolbar.stories.tsx` with `WorkspaceToolbarFixture`; the review story `review/workspace-sidebar.stories.tsx` and its design spec, now that the stable story renders the production composition (ADR 0052); `ladle-e2e/issue-02-workspace-toolbar.spec.ts`, replaced by `issue-14-workspace-sidebar.spec.ts`; and the registry's duplicate `components/button.tsx`, with `sheet.tsx` and `sidebar.tsx` rewired onto the repository's public `Button` as `alert-dialog.tsx` already was.

## Verification

- `pnpm verify` passed: 1,258 tests passed and 8 skipped across 122 files, with the UI catalogue valid and no lint or format findings.
- `pnpm e2e` passed: 93 tests.
- `pnpm e2e:ladle` passed: 8 tests.
- The rendered application was inspected on the tracked fixture in both a computed View and an authored Layout.
