# 08 — Retire the Sidebar-era primitives

Status: ready-for-human
Tags: release/v1
Blocked by: nothing. `07` is what left these without consumers.

**What to decide:** Whether six `@project/ui` modules that lost their last
consumer when `07` deleted `SpaceSidebar.tsx` and the open-Spaces tab strip are
deleted or kept — and, on the same grounds, one dead arm of a live type that lost
its last caller the same way.

`07` recorded each of them in `packages/app/stories/design-system-inventory.ts`
rather than deleting it, because `ui:catalog:check` demands one or the other and
a surface promotion is not the place to retire a foundation primitive. That is a
holding position, and this ticket is where it is settled.

## The six

| Module | Why it has no consumer |
| --- | --- |
| `packages/ui/src/AddCardControl.tsx` | The Sidebar drew it. The Dock's `CreateMenu` offers the three kinds as peers behind one trigger instead of as a split control, on grounds written in its own doc comment. |
| `packages/ui/src/components/sidebar.tsx` | The registry `Sidebar`. ADR 0082 retired the gutter, so nothing composes `SidebarProvider`, `SidebarInset` or `SidebarTrigger`. |
| `packages/ui/src/components/sheet.tsx` | Imported only by `sidebar.tsx`. The Dock has no Sheet on purpose. |
| `packages/ui/src/components/skeleton.tsx` | Imported only by `sidebar.tsx`, through `SidebarMenuSkeleton`. |
| `packages/ui/src/OpenSpaces.tsx` | The vertical tab strip of open Spaces. `OpenSpacesApplication` drew it beside the Sidebar and now mounts the entries directly; the Dock's Open Spaces menu is the set's surface. |
| `packages/ui/src/components/tabs.tsx` | Imported only by `OpenSpaces.tsx`. |

**The last two are in the inventory's blind spot rather than in the
inventory.** `ui:catalog:check` resolves coverage through the import graph by
the names taken through a barrel, and `packages/app/src/dock-model.ts` takes
`openSpaceStatusLabel` — which lives in `OpenSpaces.tsx` beside the component —
so the walk reaches the module and calls it rendered. Nothing renders the
component. That is why they carry no inventory entry and still owe this decision:
the check cannot ask for one. If the answer is to keep them, move
`openSpaceStatusLabel` to a module of its own so the coverage claim stops being
an accident; if it is to delete them, `dock-model.ts` needs that label from
somewhere and the same move is the first step either way.

## And one that is not a module: `InlineTitleEditorVariant`'s `sidebar` arm

`packages/ui/src/InlineTitleEditor.tsx:6` declares
`export type InlineTitleEditorVariant = 'card' | 'sidebar' | 'header';`, and
`:116` reads `size={variant === 'sidebar' ? 'compact' : 'default'}`. **The
`sidebar` arm has no caller.** The only two mounts left in the repo are
`variant="card"` (`packages/ui/src/CanvasCard.tsx:413`) and `variant="header"`
(`packages/app/src/components/CommandDock.tsx:568`), and no module, test, story
or fixture writes the literal anywhere else — the other repo hits for the word
belong to the registry `Sidebar`'s own unrelated `'sidebar' | 'floating' |
'inset'` prop. The component's own doc comment has already moved on: `:56-59`
names `CanvasCard.test.tsx` and `SpaceApp.test.tsx` as the two variants' tests
and says outright that ADR 0082 retired the Sidebar that used to rename a Layout
and a Graph. Only the size line at `:112-115` still reasons from *"The Sidebar's
field"*.

It belongs here because it is the same Sidebar-era leftover in `@project/ui` that
ADR 0082 orphaned, and retiring it is the same kind of change the six are: an
executable edit to an exported type, plus `packages/ui/src/index.ts:17`, which
exports `InlineTitleEditorVariant` by name. It is unlike the six in one way worth
stating, because it is why nothing has asked: it is a dead **arm of a live type**
rather than a whole module with no consumer, so `ui:catalog:check` sees a
component two stable stories render and demands nothing. Nothing in the tree can
report this; a reader had to.

**What a decider needs, and it cuts both ways.** `variant === 'sidebar'` is the
sole selector of `Input`'s `compact` size in this component, so with the arm dead
every surviving mount already renders `default` — deleting the arm changes no
rendering at all, and keeping it preserves a size path nothing reaches. The
`compact` size itself is not at stake either way: it has callers across the Dock,
`SelectedEdgeControls`, `CardsDrawer` and `PersistenceControl`, so removing this
one reference orphans nothing in `Input`.

## What makes it a decision rather than a deletion

Three of the four are shadcn registry primitives, and the repo's standing rule
for those is the one written beside `Command.tsx` and `empty.tsx`: *"Retiring a
primitive an ADR names is a foundation decision, not a surface one."*
`AddCardControl` is not a registry primitive, but ADR 0050 and
`docs/agents/ui.md` both name it — twice — as where the Base UI `Menu` boundary
and the `aria-keyshortcuts` convention are read from, so deleting it costs those
two documents their worked example.

Against keeping them: `AddCardControl`'s doc comment argues at length for a
**split** control, and `CreateMenu`'s argues at length for **three peers**. Two
recorded designs that contradict each other, one of them dead, is an invitation
to a future reader to restore the wrong one.

## What to build

- [ ] Take the decision for each of the six, together — it is one question asked
      six times and answering them differently needs saying why.
- [ ] If deleted: remove the module, its exports from `packages/ui/src/index.ts`,
      its tests (`packages/ui/test/AddCardControl.test.tsx`,
      `AddCardControl-base-ui.test.tsx`, `Sidebar.test.tsx`,
      `OpenSpaces.test.tsx` if there is one), and its inventory entry — and
      repoint `docs/agents/ui.md`'s two `AddCardControl` references and
      `packages/app/test/edge-authoring-react.test.tsx`, which mounts
      `AddCardControl` as *"the real control, mounted where the real one is"* and
      is wrong about that as of `07`. **Two further files cite it in prose, not
      as an import**, and a deletion that stops at the importers leaves them
      pointing at a module that is gone — the same defect this ticket exists to
      fix: `packages/app/test/PresentingChrome.test.tsx:203` and
      `packages/ui/test/CanvasCard.test.tsx:394` each name `AddCardControl` as
      the worked example of the `aria-keyshortcuts` convention, so whatever
      control announces its own shortcut after the deletion is what they should
      name instead.
- [ ] Take `InlineTitleEditorVariant`'s `sidebar` arm with the same answer, or
      say why a dead arm of a live type is kept where a dead module is not. If
      deleted: drop the arm from the union at `InlineTitleEditor.tsx:6`, settle
      `:116` on `Input`'s `default` size, and rewrite the `:112-115` comment so it
      stops reasoning from a field the Sidebar drew. `packages/ui/src/index.ts:17`
      keeps exporting the type either way; only its arms change.
- [ ] Either way, give `openSpaceStatusLabel` a home that is not beside a
      component nothing renders. Both surfaces that ever reported an unwell open
      Space spend it, and one of them is gone.
- [ ] If kept: rewrite each inventory reason so it stands on the module's own
      terms rather than on this ticket's existence, and drop the pointer here.

## Evidence

`pnpm verify` for either outcome. `pnpm e2e` and `pnpm e2e:ladle` only if a
deletion reaches a component with a story — none of the four has one today,
which is why they are in the inventory at all.
