# 02 — The entity-actions menu is general now: reicon it, and put the links back in it

**Status:** ready-for-agent

**What to build:** Finish the production wiring issue 01 left open, and reconcile the menu's presentation with what it actually became. Four things, one change: a glyph that says "options" rather than "link"; the Copy link / Copy permanent link commands added to the menu for every entity that has an address; a per-item icon on `EntityAction`; and a design pass over the item layout now that a group can hold a rename, a destructive command and two addresses side by side.

**Why:** The menu shipped as a *link* menu and is not one any more. Issue 01 chose lucide `Link` deliberately over a kebab — "what this menu is mostly for is the entity's addresses" (`packages/ui/src/icons.tsx:108-113`) — but the only production supplier of `entityActions` is `layoutActions` (`packages/app/src/App.tsx:421`, passed at `App.tsx:1010`), added by `00b2fea5 Implement empty layout lifecycle`, and it offers Rename and Delete Layout. So the application draws a link glyph over a menu with no link in it, and a Graph row draws no glyph at all because `layoutActions` returns `[]` for every entity whose `kind !== 'layout'`. The icon's own justification no longer describes the menu it opens.

## What is where today

- **The menu**: `packages/ui/src/EntityActionsMenu.tsx` — `EntityActions` (right-click surface), `EntityActionsTrigger` (the icon), one shared item list. `EntityAction` carries `id`, `label`, optional `description`, optional `confirmation`, `onSelect`. **No icon field.**
- **The glyph**: `LinkActionsIcon` (`packages/ui/src/icons.tsx:114`), lucide `Link` at 14px. One commit ever touched it (`902df15f`); `git log --all -S "LinkActionsIcon"` returns that commit alone.
- **The rows**: `SpaceSidebar.tsx` wraps the Space title, each Layout row and each Graph row in `EntityActionsRow` (7 sites, unchanged since `902df15f`). It withholds the trigger entirely when every group is empty — which is why Graph rows have no icon in the app.
- **The commands that should be in it**: the Graph pair still renders as two buttons under the Graphs list (`SpaceSidebar.tsx:648-668`, gated on a Graph being active), and the Card pair plus Delete Card in the footer (`SpaceSidebar.tsx:672-706`). Both are fed by `copyProductDestination` in `App.tsx` (`App.tsx:896-909` for `graph` / `layout-graph`, `App.tsx:968-1006` for `card` / `layout-card`).
- **The proven shape**: `packages/app/stories/review/link-actions-prototype.stories.tsx` builds the full menu per entity kind — Rename, Copy link, Copy permanent link, Open in a new tab — over real `productDestinationPath` addresses. `packages/app/ladle-e2e/link-actions.spec.ts` proves all five paths including "a Graph contextual link uses the selected Layout". It is a review story and carries no ADR 0052 parity claim, because production supplies none of it.

## The four pieces

### 1. A new icon

The rail argument that picked `Link` still holds *on the rail* — `EditIcon`, `OpenCardIcon` and `CloseCardIcon` each name their command, so a generic glyph beside them says nothing. But issue 01 also settled that "one menu reached two ways should not be two icons", and the menu is no longer mostly addresses. Decide which of those two rules gives: one general glyph everywhere, or a rail exception. Whichever way it goes, rename `LinkActionsIcon` with it — the name is the same claim as the glyph, and leaving it while changing the drawing splits them.

### 2. Links in the menu, buttons out

Extend `layoutActions` (and rename it — it is no longer Layout-only) to answer Graph, Card and Space, building Copy link / Copy permanent link from the same `copyProductDestination` path already in `App.tsx`. Follow the existing withholding rule: an address that does not exist is absent, never shown and refused — `onCopyContextual` is already withheld for a Card the selected Layout does not place (`App.tsx:987`), and the same is true of a Graph the Layout does not draw. Then delete `SpaceSidebar.tsx`'s `graph.links` block and the `cardLinks` copy buttons, plus the props feeding them, in this same change — issue 01 is explicit that they "come out in the same change rather than ahead of it", so that no window exists with two paths to one command or none.

Watch the naming rule while doing it: **never "canonical" or "contextual" in user-facing copy** (issue 01, Terminology). The prop names may keep those words; the labels are "Copy link" and "Copy permanent link", the second offered only when it differs from the first.

### 3. `EntityAction` takes an icon

Add an optional icon to `EntityAction` and draw it in `EntityActionItems`, which currently renders label-over-description in a flex column with no leading slot. Both roots share that one list, so the icon lands in the right-click menu and the trigger menu together by construction.

### 4. Design treatment

A group can now hold Rename, two addresses, Open in a new tab and Delete Layout. Give the items a pass under `$shadcn-first-ui`: leading icon alignment against the two-line label/description block, the destructive command's treatment, and whether `w-72` (`MENU_WIDTH`) still fits the longest description. Search `@project/ui` and the shadcn registry before hand-rolling anything; a new hand-rolled block fails `pnpm ui:catalog:check` until it is recorded in `packages/app/stories/design-system-inventory.ts` with its reason.

## Done when

- The app's Graph rows carry the trigger, and its menu copies both Graph addresses.
- No "Copy link to …" button remains in `SpaceSidebar.tsx`.
- `packages/app/ladle-e2e/link-actions.spec.ts` still passes, and the review story either becomes the stable story that owes a parity claim or is retired in favour of one — production now supplies `entityActions`, so ADR 0052 applies and the claim issue 01 recorded as "still owed" comes due, with both a Ladle and an application proof.
- `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all run and are reported. This change touches a component with stories, so `e2e:ladle` is not optional and nothing else runs it.

## Deliberately not here

- The Card rail menu on the canvas: `CardNode` still does not pass `entityActions` through, so the rail menu is reachable from `CanvasCard` directly and not from a Card on the canvas. That hop is the adapter's and stays on issue 01's follow-up list.
- The canvas header (`SelectedLayoutName`), which names the drawing Layout outside the Sidebar and wants the same menu its row has.
- Whether click-to-rename survives alongside the menu's Rename. Issue 01 left it open; this ticket keeps both.

## Comments

Raised from a report that "copy graph link" had regressed out of the Sidebar. It had not been removed — `git log --all -S "Copy link to" -- packages/app/src/components/SpaceSidebar.tsx` returns only the two commits that added it, and `SpaceApp.test.tsx`'s clipboard tests still click those buttons in the composed app. What changed is that a link-glyphed menu appeared in production carrying no link, which is what the report was actually about.
