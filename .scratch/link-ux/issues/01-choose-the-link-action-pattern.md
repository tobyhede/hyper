# 01 — Choose the link action pattern

**What to build:** Replace the Sidebar's persistent "Copy link to X" / "Copy link in this Layout" buttons with one entity-actions menu — Rename, Copy link, Copy permanent link, Open in new tab — reachable two ways: a trailing icon on the entity's own row or rail, and a right click anywhere on it. For Cards, Graphs, Layouts and Spaces alike. This ticket does not change addressing, routing, or the product-destination table (ADR 0069, ADR 0072) — only where and how a person reaches the two link forms those ADRs already define, plus one existing capability (rename) it now also surfaces.

**Status:** interaction direction chosen; production wiring remains open

**ADR 0079 reconciliation:** the retired `space-view` `SpaceEntity` kind is gone —
`layout-only-v1/03` removed it, and `SpaceSidebar` now asks one entity at a time as
`space` / `layout` / `graph`. The entity kinds are Space, Layout, Card and Graph, and
the canvas header names the selected Layout. ADR 0072, cited below, is superseded by
ADR 0079, and this ticket has been rewritten in the Layout vocabulary the code uses.

## Prototype

The menu is now a real component drawn by real surfaces, rather than a story-local replica. The Sidebar and Card prototypes both demonstrate the icon and right-click trigger paths; production still supplies neither surface with actions.

- **`packages/ui/src/EntityActionsMenu.tsx`** — `EntityActions` (the right-click surface) and `EntityActionsTrigger` (the icon), sharing one internal item list so the two paths cannot drift. Commands arrive as `readonly EntityActionGroup[]`; an empty group draws neither items nor its separator, which is how a withheld command stays withheld rather than shown-and-refused. An item carrying a `confirmation` holds the menu open through the press, swaps its own label, and announces the same word through a polite live region mounted outside the popup.
- **`packages/ui/src/icons.tsx`** — `LinkActionsIcon`, a link glyph. Not the conventional kebab: every other Card rail control names its command, so a generic "more" glyph would be the one control on the rail saying nothing.
- **`packages/ui/src/CanvasCard.tsx`** — an optional `entityActions` prop puts the icon on the real rail, in the shared command group **ahead of Open/Close**, so the rail reads `[link][open-or-close]` and Close keeps the position it has always had.
- **`packages/app/src/components/SpaceSidebar.tsx`** — an optional `entityActions` prop, asked one `SpaceEntity` at a time (`space` / `layout` / `graph`). Each Layout row, each Graph row and the Space's own title answers a right click and carries a `SidebarMenuAction` trailing icon, hover- and focus-revealed by the registry Sidebar's own `showOnHover`. Withheld while that row's title is being renamed.

Both props are optional and nothing in the application supplies them yet, so no production state changed and no ADR 0052 parity claim attaches. `packages/app/stories/review/link-actions-prototype.stories.tsx` supplies them: `Sidebar` mounts the real Sidebar and canvas, `CardRail` mounts real `CanvasCard`s. Addresses come from `@project/http`'s own `productDestinationPath` over the fixture Space's real ids; copying, navigating and renaming are replaced by a line in an on-screen log.

Run `pnpm --filter @project/app ladle`, open `Review/Link Actions`. Try both triggers — the icon, and a right click on a Sidebar row.

## Decision so far

Converged on the **actions-menu direction** (previously "Variant B" of an earlier three-way comparison — see git history on this file for that comparison and the two discarded directions, a single-click-with-hidden-secondary control and an explanatory share popover). Refined with two changes from that first pass:

1. **Two trigger paths, one menu.** A trailing icon stays the discoverable, always-reachable path; a right click on the row or Card is the accelerator. Both open the identical menu content — Base UI's own docs name this exact pattern ("Using with Menu": a visible menu button plus a `ContextMenu` sharing one `Item`/`Separator` list), and it's why `packages/ui/src/components/context-menu.tsx` was added as a small new foundation primitive (shadcn's own `context-menu` is Radix-backed; this repo's menu family is Base UI, so it's ported the way `dropdown-menu.tsx` already ports Base UI's `Menu` — it now has a consumer in `EntityActionsMenu.tsx`).
2. **Rename joins the menu, additively.** Card titles, Graph titles and authored-Layout titles already rename inline (click an already-selected title — `InlineTitleEditor` for Cards, `SpaceChromeTitleSubject`/`titleEdit.onBegin` in `SpaceSidebar.tsx` for Graph/Layout). The menu's "Rename" entry is a second path to that same capability, not a replacement — click-to-rename stays. A Space has no rename affordance in production today, so its menu omits the item rather than inventing one; this ticket doesn't add Space renaming.

This trades away the earlier "one click copies the useful default outright" speed in exchange for explicitness (nothing is guessed), a natural home for Rename and any future entity command, and a trigger convention (right click) users already carry from the rest of the OS/browser.

### Cards specifically: rail, right click, or both

The interaction decision is **both**, asymmetrically with Graph/Layout/Space. A Card already has a persistent rail once selected or hovered (`CardRailActions`: Open/Close/Edit, ADR 0073) that Graphs and Layouts don't have. `CanvasCard` adds one more `CardRailAction` to that rail (the same link glyph, opening the same menu) rather than inventing a second control, and wraps the Card in the matching right-click surface. For Graph, Layout and Space — which have no existing rail — the trailing icon on the Sidebar row *is* the primary actions surface, with right click as its accelerator.

### The icon

A link glyph (lucide `Link`), not the conventional kebab. The rail decided it: `EditIcon`, `OpenCardIcon` and `CloseCardIcon` each name their command, so a generic "more" glyph would be the one control there saying nothing about itself — and what this menu is mostly for is the entity's addresses. The Sidebar rows take the same glyph, because one menu reached two ways should not be two icons.

### Terminology

Never "canonical" or "contextual" in user-facing copy:

- **"Copy link"** — the address that reproduces what's currently on screen (a Card or Graph within the active Layout when that address exists, the entity's own address otherwise).
- **"Copy permanent link"**, offered only when it differs from the above — "permanent" already means what it needs to a general audience (cf. "permalink"), without naming a domain concept.
- Every menu item carries a one-sentence destination description ("Opens Constraints inside Layout 1, selected the way it is now" / "Always opens Constraints on its own, wherever it's placed") so the difference is legible without the reader knowing the domain model.

### Placement

On the entity itself, never standing Sidebar chrome: a Card's rail plus a right click on the Card, a Graph's row in the Sidebar's Graphs list, the canvas header for the current Layout, the Space's own title area in the Sidebar — the trailing icon always revealed by hover or keyboard focus, never permanently visible (`showOnHover`-equivalent styling already resolves to always-visible below the `md` breakpoint and hover/focus-revealed above it, so narrow screens need no separate treatment for the icon). Right click has no touch equivalent; Base UI's `ContextMenu` answers long-press instead on coarse pointers, which is worth confirming feels right on a touch canvas before this ships, since a Card's whole body is also a drag/pan/selection target there.

### No secondary address, or no rename

Both are simply omitted from the menu, never shown-disabled — matching the existing production rule in `SpaceSidebar.tsx` ("the command is withheld rather than shown and refused, because the destination it would copy does not exist"). A Card the Cards collection reveals but the active Layout doesn't place gets "Copy link" and nothing else address-wise; the Space gets no "Rename" at all.

### Confirmation

The clicked menu item's own label swaps to "Copied" in place, without the menu closing early. No toast, no dialog. Both halves are `EntityActionsMenu.tsx`'s: an `EntityAction` carrying a `confirmation` is the same fact that sets `closeOnClick={false}`, so a menu cannot be built that swaps a label behind a popup already gone. A polite live region carries the same word for a screen reader, mounted beside the trigger rather than inside the popup — inside, it would unmount before it announced. The story's on-screen log is separate and exists only so a reviewer can see which address a command would have copied.

### Keyboard and focus

Standard Base UI trigger/menu behavior throughout, left untouched: Tab reaches the trailing icon (a real tab stop independent of hover), Enter/Space/ArrowDown opens the menu, arrow keys move through items, Escape closes and returns focus to the trigger. The right-click path is explicitly an *enhancement*, per Base UI's own `ContextMenu` guidance — every command it offers is also reachable through the visible icon, so nothing is keyboard- or screen-reader-only behind a right click.

## Open follow-ups

- Wire the menu's Copy link / Copy permanent link to the real `copyProductDestination` path in `App.tsx`, and Rename to the same `authoring.complete({ kind: 'renamed-card' | 'renamed-graph' | 'renamed-layout', ... })` path `chromeTitleEdit`/`InlineTitleEditor` already use. That is what makes any of this production-reachable; `SpaceSidebar`'s `graph.links` and `cardLinks` footer buttons are deliberately still there and still wired, and come out in the same change rather than ahead of it.
- The canvas header (`SelectedCanvasRenderer`) is the one Sidebar-adjacent surface still without the menu — it names the drawing Layout outside the Sidebar and survives the Sidebar closing, so it wants the same treatment its row already has.
- The rail control and `CanvasCard` right-click surface are built; their interaction with React Flow's pointer handling (pan, drag, multi-select, connection dragging) still needs production evidence when `CardNode` supplies the actions.
- `CardNode` does not pass `entityActions` through, so the rail menu is reachable from `CanvasCard` directly but not yet from a Card on the canvas. That hop is the adapter's and belongs with whichever surface lands first.
- Decide whether Card title rename stays reachable both ways (click-to-rename and the menu) or the menu becomes the one path — same question for Graph/Layout.
- `packages/ui/src/components/context-menu.tsx` left `design-system-inventory.ts`'s uncatalogued list on its own, because `SpaceSidebar` now reaches it and the catalogue's rule is module reachability from a stable story. That is **not** evidence the menu works: no stable story draws it, because production supplies no `entityActions`. The parity claim is still owed.
- A Ladle behavior test and an application behavior test per ADR 0052 for whichever surface lands first.
