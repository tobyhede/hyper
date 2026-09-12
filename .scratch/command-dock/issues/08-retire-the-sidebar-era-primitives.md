# 08 — Retire the Sidebar-era primitives

Status: resolved
Tags: release/v1
Blocked by: nothing. `07` is what left these without consumers.

**What was decided:** all six modules are deleted, and a seventh nothing named
went with them. The holding position `07` took — recording each in
`packages/app/stories/design-system-inventory.ts` rather than deleting it,
because `ui:catalog:check` demands one or the other — is discharged.

**Three of this ticket's own premises were already false when it was written.**
It was created in `f7b5470f`, the promotion commit itself, and that commit had
answered parts of it before the file was committed. They are corrected in place
below rather than left standing, because a ticket that asks a settled question
is the same defect this ticket existed to fix.

## What went

| Module | Why it had no consumer |
| --- | --- |
| `packages/ui/src/AddCardControl.tsx` | The Sidebar drew it. The Dock's `CreateMenu` offers the three kinds as peers behind one trigger instead of as a split control. |
| `packages/ui/src/components/sidebar.tsx` | The registry `Sidebar`. ADR 0082 retired the gutter, so nothing composed `SidebarProvider`, `SidebarInset` or `SidebarTrigger`. |
| `packages/ui/src/components/sheet.tsx` | Imported only by `sidebar.tsx`. The Dock has no Sheet on purpose. |
| `packages/ui/src/components/skeleton.tsx` | Imported only by `sidebar.tsx`, through `SidebarMenuSkeleton`. |
| `packages/ui/src/OpenSpaces.tsx` | The vertical tab strip of open Spaces. The Dock's Open Spaces menu is the set's surface. |
| `packages/ui/src/components/tabs.tsx` | Imported only by `OpenSpaces.tsx`. |
| `packages/ui/src/hooks/use-mobile.ts` | **The seventh, and this ticket did not name it.** Imported only by `sidebar.tsx`. `ui:catalog:check` scans `.tsx` and this is a `.ts` hook, so nothing in the tree could report it — a reader had to. `vitest.setup.ts`'s `matchMedia` shim looked like it went with it and did not: see the `test/key-bindings.ts` entry below for what actually reads it. |

## Why deletion rather than keeping

**ADR 0082 is the decision that made them dead, so deleting them agrees with an
ADR rather than overruling one.** That is what separates these from `Command.tsx`
and `empty.tsx`, which stay in the inventory because ADR 0050 keeps what they
wrap. The rule quoted against this ticket — *"Retiring a primitive an ADR names
is a foundation decision, not a surface one"* — is satisfied by taking the
decision here rather than avoided by it. This ticket is the foundation decision.

**`AddCardControl`'s case for keeping was half the size this ticket claimed.**
It said ADR 0050 and `docs/agents/ui.md` "both name it — twice". `grep -rn
AddCardControl docs/adr/` is empty: no ADR has ever named it. Both references
were `docs/agents/ui.md`'s (`:8`, `:9`), and both are repointed at live code —
the `Menu` behind the Command Dock's `CreateMenu`, and `CanvasCard`'s Save and
Cancel rail actions for the `aria-keyshortcuts` convention. Its own doc comment
argued at length for a **split** control while `CreateMenu`'s argues at length
for **three peers**; two recorded designs that contradict each other, one of them
dead, is an invitation to restore the wrong one.

**Four registry primitives can be generated again from shadcn.** A stored copy
with no consumer is not the only record of them, and it is the copy that drifts
from the registry silently.

**Deletion is the guarded path and keeping is not.** `ui-catalog.ts` reports an
inventory entry whose module is gone, and `test/unit/key-bindings.test.ts`
reports the Sidebar's `Mod-B` entry once the source it scanned is gone — so a
forgotten thread fails `pnpm verify`. A rewritten inventory reason is prose that
only a reader can check.

## Two this ticket did not take, because they still had a consumer when it ran

`10` retired `CardsDrawer` in favour of a Popover anchored to the Dock trigger,
which took the last consumer of the registry `Drawer` and of the strip the shell
yielded to a screen-edge surface. Both were live when the six above were deleted,
so they are not omissions from this ticket — they fell out of a later surface
decision and are named here so the handoff is written down rather than asserted
in an inventory entry.

| Module or prop | Why it has no consumer |
| --- | --- |
| `packages/ui/src/components/drawer.tsx` | The registry `Drawer` and `DRAWER_WIDTH`. `CardsDrawer` was the only mount; `10` decided the Cards list is a Popover anchored to its trigger, on the ground that a screen-edge drawer occludes the canvas edge you are dropping onto. |
| `AppShell`'s `insetEnd` | The strip `.shell` yielded to a surface overlaying the end edge. A Popover overlays the canvas rather than displacing it, so nothing sets it. |

The drawer carries an inventory entry rather than a deletion, on the grounds this
ticket states for itself: retiring a registry primitive is a foundation decision,
and taking these two is a decision of its own. Deleting `insetEnd` would take the
`padding-inline-end` rule in `styles.css` with it.

**That decision of its own is `22-retire-the-registry-drawer-and-the-yielded-strip.md`,
and not this ticket.** This section is the handoff — what fell out and why — and
a resolved ticket cannot be scanned for as work. `10` originally wrote that this
ticket "owns taking it"; it does not, and `10` now points at `16` too. Every
site of prose about the pair cites `16`.

## The three stale premises, corrected

- **`InlineTitleEditorVariant`'s `sidebar` arm was already deleted.** `f7b5470f`
  removed it along with the `size={variant === 'sidebar' ? 'compact' : 'default'}`
  line, and wrote the reason this ticket asked for into the type's own doc
  comment — *a variant with no caller is an invitation*. The union at
  `packages/ui/src/InlineTitleEditor.tsx` reads `'card' | 'header'` and has since
  that commit. Nothing was owed here.
- **`OpenSpaces.tsx` and `components/tabs.tsx` were in the inventory, not in a
  blind spot.** The same commit closed the blind spot: `scripts/ui-catalog.ts`
  now resolves barrel names by their own casing (`isComponentName`), so
  `openSpaceStatusLabel` no longer marks its module rendered and `<OpenSpaces/>`
  is the only thing that could. Both modules carried entries as a result. The
  consequence this ticket drew — *"if the answer is to keep them, move
  `openSpaceStatusLabel` so the coverage claim stops being an accident"* — was
  already void: the claim was not an accident any more.
- **ADR 0050 does not name `AddCardControl`.** Above.

## What was built

- [x] **The six, together, deleted** — plus `hooks/use-mobile.ts` behind them.
      Modules, their exports from `packages/ui/src/index.ts`, their tests
      (`AddCardControl.test.tsx`, `AddCardControl-base-ui.test.tsx`,
      `Sidebar.test.tsx`, `OpenSpaces.test.tsx`, `tabs.test.tsx`) and their six
      inventory entries.
- [x] **`openSpaceStatusLabel` has a home that is not beside a deleted
      component.** `packages/ui/src/open-space-status.ts` carries it with
      `OpenSpaceStatus`, and its doc comment says why it outlived the strip and
      why the record beside it stays private. `OpenSpaceEntry` and
      `OpenSpacesProps` had no consumer outside the module and are gone.
      `dock-model.ts` still imports both surviving names through `@project/ui`.
      They stay in `ui` rather than moving into `app` because a second
      vocabulary for one state is the risk the shared words exist to prevent,
      and it returns with the next surface that reports an unwell Space.
- [x] **`InlineTitleEditorVariant`** — nothing to do, see above. The type is
      still exported by name from `packages/ui/src/index.ts`.
- [x] **The prose repointed.** `docs/agents/ui.md`'s two references,
      `packages/ui/test/CanvasCard.test.tsx` and
      `packages/app/test/PresentingChrome.test.tsx` (the `aria-keyshortcuts`
      worked example is now `CanvasCard`'s Save and Cancel, which is where both
      of those tests already stand), `AGENTS.md`'s `ui` bullet,
      `packages/ui/src/AppShell.tsx`, `packages/app/src/components/CardsDrawer.tsx`,
      `scripts/ui-catalog.ts`'s worked example, `packages/app/src/dock-model.ts`,
      `packages/app/test/dock-report.test.ts`,
      `packages/app/src/components/CommandDock.tsx` and
      `packages/app/ladle-e2e/command-dock.spec.ts`.
- [x] **`packages/app/test/edge-authoring-react.test.tsx` repointed**, and it was
      worse than this ticket said. Its comment claimed *"the real control,
      mounted where the real one is … one production control proving one
      guard"*, and `AddCardControl` had not been a production control since
      `07` — the test proved the `.nokey` guard against a component nothing
      mounted. It now mounts `CARDS_TRIGGER`, the Command Dock's own exported
      Cards-trigger treatment, in a `Toolbar`, so the class under test is the
      class the Dock ships.
- [x] **`test/key-bindings.ts`** lost the Sidebar's `Mod-B` entry.
      **`vitest.setup.ts` keeps its `matchMedia` shim**, and the claim that it
      existed only for `useIsMobile` was wrong: removing it turned
      `packages/app/test/space-card-embedded-layout.test.tsx`'s
      embedded-persistence case red, bisected to that file alone. React Flow's
      `getMediaQuery()` reads `window.matchMedia('(prefers-color-scheme: dark)')`
      and answers `null` without it, so the canvas mounts down a different
      colour-mode path than the browser takes; `@codemirror/view` and Base UI's
      `unstable-use-media-query` read it too. The shim's doc comment now names
      React Flow rather than the deleted hook.
- [x] **`.oxlintrc.json`** lost its `no-module-mocking` exception for
      `packages/ui/test/AddCardControl-base-ui.test.tsx`, a file that no longer
      exists.

**One thing deliberately kept:** `packages/ui/package.json`'s `#hooks/*` subpath
import and its public `./hooks/*` counterpart, now pointing at a directory that
does not exist at all — git tracks no empty directory, so deleting the one hook
took `packages/ui/src/hooks` with it. Both are the destination
`packages/ui/components.json` names for a generated hook, so removing them
without it would break the next `shadcn add` that ships one. Subpath patterns
resolve only on use and there is no importer, so a dangling pattern costs
nothing today. The set is generator infrastructure rather than a claim that a
hook exists.

**One pre-existing defect fixed in passing:** `design-system-inventory.ts`'s
`Command.tsx` reason read *"Deliberately without a consumer, like `Select`
above"*, and there was no `Select` entry above it — `Select` gained consumers
with `entity-url-addressability/07`. The file's own doc comment requires a reason
to be a property of its subject, so the dead cross-reference went and
`empty.tsx`'s *"for the same reason"* now names what it points at.

## Evidence

The first pass at this ticket was committed from a mixed tree and its Evidence
block claimed a `verify` green that did not hold: `typecheck`,
`ui:catalog:check` and `test` were all red on the committed tree. Three changes
nothing here asked for had come with it, and the review that found them is what
this section now records.

**Reverted as undisclosed scope, not part of this ticket:**

- `packages/app/src/dock-model.ts`'s session prototype — `opened`,
  `editDocument`, `editSelectedLayout`, `exitSpace`, `OpenEntry`,
  `SessionState` and `SpaceExit`, 248 lines. `packages/app/test/dock-session.test.ts`
  and `packages/app/stories/support/CommandDockFixture.tsx` both still import
  them, so deleting them took both typechecks, the test suite and every
  `space--command-dock--*` story with them. Only the file's `openSpaceStatusLabel`
  paragraph was ever in scope, and that is all that is changed here.
- `packages/app/stories/design-system-inventory.ts`'s `SpaceApp.tsx` and
  `startup.tsx` entries. Neither module is a Sidebar-era primitive, neither was
  deleted, and neither has a stable story — removing the entries failed
  `ui:catalog:check` outright.
- `packages/app/ladle-e2e/command-dock.spec.ts`'s behavioural rewrite: real
  `navigator.clipboard` polling against an `https://example.test` origin, and
  `.locator('visible=true')` on some twenty assertions. The fixture implements
  copy by setting `document.body.dataset['copyCommand']` and nothing writes to
  the clipboard for that story, so the rewrite asserted against a fixture that
  never landed; and `toBeHidden()` on a filtered locator passes on zero
  elements, which is weaker than what it replaced. Only the prose repoint
  remains.

**Also corrected:** `.oxlintrc.json` kept a second `sidebar.tsx` entry, in the
`anti-slop/no-runtime-typeof` exception list, which only the
`no-unknown-returns` prune had caught. `packages/ui/src/components/field.tsx`
cited the deleted `components/tabs.tsx` twice and now cites `separator.tsx`,
which reads `data-orientation` the same way. `dock-report.test.ts`'s `it(...)`
name still promised a comparison against the deleted strip.

**The gates, run on the tree these words are committed with:**

- `pnpm verify` — **green**: toolchain, both typechecks, UI catalogue, ESLint
  (with `--prune-suppressions`, which shrank `eslint-suppressions.json`),
  anti-slop, formatting, and **197 test files, 2453 passed, 2 skipped**.
- `pnpm e2e` — **180 passed**. Not strictly owed, since none of the seven has a
  story and none reaches a production surface, but `packages/ui/src/index.ts`
  changed and a barrel is not something to assume about.
- `pnpm e2e:ladle` — **82 passed**, first run, no retries. This is the suite the
  first pass could not have run: every `space--command-dock--*` story crashed on
  a fixture importing the deleted session model.

## Comments

The work is committed on `refactor/retire-sidebar-era-primitives`, off `main` at
`d6ba07bc`.

The lesson of the first pass is `AGENTS.md`'s own: a `verify` reported without
having been run on the tree being committed is worse than no evidence, because
it is what a reader trusts. The three reverted changes were all present in the
working tree when the suite was run and all absent from — or partly absent
from — what was committed.
