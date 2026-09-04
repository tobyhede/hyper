# 02 — The entity-actions menu is general now: reicon it, and put the links back in it

**Status:** resolved

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

**Scope correction (see Comments): the Card rail is out of scope.** The question of "one general glyph everywhere or a rail exception" is not open here, because the rail is not this ticket's to change. Change the glyph the **Sidebar's** trigger draws, leave `CanvasCard`'s rail control, its glyph and its right-click surface exactly as they are, and resolve `EntityActionsTrigger` hard-coding one icon for every caller by letting the caller supply the glyph. The rail's own reiconing moves to "Deliberately not here".

The original wording, kept because the argument still stands for whoever takes the rail: the rail argument that picked `Link` holds *on the rail* — `EditIcon`, `OpenCardIcon` and `CloseCardIcon` each name their command, so a generic glyph beside them says nothing. But issue 01 also settled that "one menu reached two ways should not be two icons", and the menu is no longer mostly addresses.

### 2. Links in the menu, buttons out

Extend `layoutActions` (and rename it — it is no longer Layout-only) to answer Graph, Card and Space, building Copy link / Copy permanent link from the same `copyProductDestination` path already in `App.tsx`. Follow the existing withholding rule: an address that does not exist is absent, never shown and refused — `onCopyContextual` is already withheld for a Card the selected Layout does not place (`App.tsx:987`), and the same is true of a Graph the Layout does not draw. Then delete `SpaceSidebar.tsx`'s `graph.links` block and the `cardLinks` copy buttons, plus the props feeding them, in this same change — issue 01 is explicit that they "come out in the same change rather than ahead of it", so that no window exists with two paths to one command or none.

Watch the naming rule while doing it: **never "canonical" or "contextual" in user-facing copy** (issue 01, Terminology). The prop names may keep those words; the labels are "Copy link" and "Copy permanent link", the second offered only when it differs from the first.

### 3. `EntityAction` takes an icon

Add an optional icon to `EntityAction` and draw it in `EntityActionItems`, which currently renders label-over-description in a flex column with no leading slot. Both roots share that one list, so the icon lands in the right-click menu and the trigger menu together by construction.

### 3a. The Sidebar story draws the real menu

**Scope correction (see Comments).** `packages/app/stories/review/link-actions-prototype.stories.tsx`'s `sidebarActions` builds a prototype menu production does not draw. Once production supplies `entityActions`, the story and the application must offer the same commands, in the same groups, with the same labels, icons and descriptions — a story showing a menu the app does not have is worse than no story. Where the prototype shows a command production does not implement (Space rename, "Open in a new tab"), either implement it or drop it from the story, and say which and why. `packages/app/ladle-e2e/link-actions.spec.ts` asserts against that story, so it moves with it.

### 4. Design treatment

A group can now hold Rename, two addresses, Open in a new tab and Delete Layout. Give the items a pass under `$shadcn-first-ui`: leading icon alignment against the two-line label/description block, the destructive command's treatment, and whether `w-72` (`MENU_WIDTH`) still fits the longest description. Search `@project/ui` and the shadcn registry before hand-rolling anything; a new hand-rolled block fails `pnpm ui:catalog:check` until it is recorded in `packages/app/stories/design-system-inventory.ts` with its reason.

## Done when

- The app's Graph rows carry the trigger, and its menu copies both Graph addresses.
- No "Copy link to …" button remains in `SpaceSidebar.tsx`.
- `packages/app/ladle-e2e/link-actions.spec.ts` still passes, and the review story either becomes the stable story that owes a parity claim or is retired in favour of one — production now supplies `entityActions`, so ADR 0052 applies and the claim issue 01 recorded as "still owed" comes due, with both a Ladle and an application proof.
- `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` all run and are reported. This change touches a component with stories, so `e2e:ladle` is not optional and nothing else runs it.

## Deliberately not here

- The Card rail menu on the canvas: `CardNode` still does not pass `entityActions` through, so the rail menu is reachable from `CanvasCard` directly and not from a Card on the canvas. That hop is the adapter's and stays on issue 01's follow-up list.
- **The Card rail's own glyph and its name.** The rail keeps lucide `Link` and `LinkActionsIcon` keeps its name, because the name still describes what the rail draws. Whether the rail follows the Sidebar to the general glyph — and the rename that would go with it — is a rail decision, and the natural time to take it is when `CardNode` first supplies the actions, above. `EntityActionsTrigger`'s `icon` default is the link glyph for exactly that reason: the rail is its only caller that passes none, so the default is where the rail's choice currently lives.
- The canvas header (`SelectedLayoutName`), which names the drawing Layout outside the Sidebar and wants the same menu its row has.
- Whether click-to-rename survives alongside the menu's Rename. Issue 01 left it open; this ticket keeps both.

## Comments

Raised from a report that "copy graph link" had regressed out of the Sidebar. It had not been removed — `git log --all -S "Copy link to" -- packages/app/src/components/SpaceSidebar.tsx` returns only the two commits that added it, and `SpaceApp.test.tsx`'s clipboard tests still click those buttons in the composed app. What changed is that a link-glyphed menu appeared in production carrying no link, which is what the report was actually about.

### Scope correction taken mid-implementation

Two changes arrived from the human after the ticket was picked up, and both are folded into the sections above rather than left in conversation.

1. **The Card rail is out of scope.** `CanvasCard`'s rail control, its glyph and its right-click surface are untouched. That closes the first open decision this ticket set — there is no rail-versus-Sidebar icon question to settle, because only one of the two is in play. What it left in its place was a smaller question with an obvious answer: `EntityActionsTrigger` hard-coded one glyph for every caller, so it now takes an `icon`, the Sidebar passes the general one, and the default stays the link glyph because the rail is the only caller that passes none. Leaving the default alone is literally what leaves the rail alone. The rail's reiconing is now listed under "Deliberately not here".
2. **The Sidebar story must draw the real menu.** Recorded as piece 3a and answered below.

### The glyph, and why `LinkActionsIcon` was not renamed

`EntityActionsIcon` is lucide `Ellipsis` — the conventional "more" glyph, at the same 14px as every other icon in that file. Conventional *is* the argument: a Sidebar row and a Space title carry no other command for a generic glyph to be the odd one out beside, and the menu behind it holds a rename, one or two addresses and a delete. Any glyph naming one of those names a third of the menu. It is the glyph shadcn's own `sidebar` registry examples put in `SidebarMenuAction`, which is the slot this sits in.

`LinkActionsIcon` keeps its name. The ticket tied the rename to the glyph change — "the name is the same claim as the glyph, and leaving it while changing the drawing splits them" — and the glyph it draws did not change: the rail is out of scope and still draws lucide `Link`. Renaming it now would be a rename riding along with a structural change, which `docs/agents/workflow.md` explicitly forbids. Its doc comment was rewritten instead, to say it is the rail's glyph, that the Sidebar's is different, and where the decision to reconcile them belongs.

### Decision: the review story is replaced, not promoted (ADR 0052)

The ticket left the parity claim open — "the review story either becomes the stable story that owes a parity claim or is replaced by one". **Replaced.**

Promoting `Review/Link Actions → Sidebar` would have meant a second stable Sidebar story beside `Space/Space`, drawing the same real `SpaceSidebar` over a hand-written command list. That is the drift the scope correction names, made permanent and given a claim to stand on. What was done instead:

- The command set moved out of `App.tsx` into `packages/app/src/entity-actions.tsx` as `spaceEntityActions` — a pure function of the entity and four callbacks.
- `SpaceSidebarFixture` calls **that function**, so the stable `Space/Space` stories draw the application's own menu. Copying records the destination kind and path on `document.body.dataset` instead of writing the clipboard; renaming runs the fixture's real chrome title edit. Nothing about *which commands exist* is the harness's any more, which is what makes the story evidence rather than a picture.
- The review story keeps only `CardRail`, which stays review because no Card on a canvas can reach it until `CardNode` passes the actions through. Its commands come from `spaceEntityActions` too, so it can no longer advertise something production lacks.
- Claims: `space-sidebar-copies-card-destinations` and `space-sidebar-copies-graph-destinations` were re-worded onto the menu and keep both proofs (Ladle `issue-14-space-sidebar.spec.ts`, application `space-routing.spec.ts`). A third, `space-sidebar-entity-actions-menu`, is new and carries the claim issue 01 recorded as still owed — that one menu is reached two ways and holds the same commands either way — with a Ladle proof in `link-actions.spec.ts` and an application proof in `space-routing.spec.ts`.

Two prototype commands were **dropped rather than implemented**, and each for the same reason: production does not have it and this ticket is not the place to invent one. "Open in a new tab" is not among the ticket's four pieces or its "Done when", and a Space rename does not exist at all — issue 01 already settled that its menu omits the item rather than inventing one. Card Rename went with them: a Card's title is renamed in place on its Front, and the Sidebar's chrome title edit takes Layout and Graph subjects only.

### Two behaviour changes worth naming

- **A copy no longer dismisses the mobile Sheet.** It used to, and correctly: every command in that Sheet acted on the canvas, so leaving it up left the reader looking at a sidebar instead of a result. A copy has no canvas result — it has a confirmation, and `EntityActionsMenu` shows that by swapping the item's own label in place. Dismissing the Sheet takes the surface the confirmation is on. `mobile-sidebar.spec.ts` and `SpaceSidebar.test.tsx` were turned around to hold the new rule rather than deleted.
- **The Layout menu no longer disappears wholesale while a Card title editor is open.** Rename begins the very chrome title edit that condition withdraws and Delete Layout would unmount the Card holding the draft, so both are still withheld; an address is a fact about the Layout rather than a change to it, so Copy link stays and the trigger stays with it. `card-authoring.test.tsx` holds both halves.

### Where the Card's addresses went

Deleting the `cardLinks` copy buttons left the selected Card with no menu to hang off — `SpaceEntity` had `space`, `layout` and `graph`, and the rail is out of scope. So `SpaceEntity` gained a `card` arm and the Sidebar footer now names the selected Card as a row of its own, carrying the same trailing icon and right click every other entity row carries. Delete Card stays exactly as it was, beneath that row: it owns a confirmation dialog a menu item cannot host, and the ticket says to keep it.

### The known limitation the review closed

This ticket shipped with `EntityActionsMenu` firing its confirmation synchronously, and recorded that as a limitation belonging in its own ticket: a copy whose clipboard write was then refused still swapped the label to "Copied" while the refusal appeared in the notice area. Review found it, and it was fixed here rather than deferred, because the mobile change above is what turns it from cosmetic into silence — a copy no longer dismisses the Sheet, and the notice area the refusal is reported in sits behind that Sheet, so on a phone the false "Copied" was the only thing a reader got.

`EntityAction.onSelect` now answers an `EntityActionOutcome` (`'done' | 'failed'`, or a promise of one) and the label swap awaits it. A failure shows `EntityAction.failure` — "Not copied" — in place of the label, in the menu the command was pressed in, and `closeOnClick` holds the menu open for a failure as it does for a confirmation. `packages/ui/test/EntityActionsMenu.test.tsx` and `SpaceApp.test.tsx` hold both halves, each written red first.

The same review also claimed the confirmation's live region is `aria-hidden` while the menu is open. **It is not**, and the test comment asserting it was the false claim. Base UI's `markOthers` collects every `[aria-live]` element and keeps it and its ancestors out of the set it hides, precisely so a region outside a modal popup still announces; and the dropdown path is not modal at all, since `MenuPopup` passes `modal: isContextMenu`. The comment has been rewritten and the third-party guarantee pinned by a test rather than asserted in prose.

### Unresolved

Nothing in the ticket was left undone. `packages/app/package.json` gained one explicit subpath import — `"#src/entity-actions": "./src/entity-actions.tsx"` — because `#src/*` maps to `./src/*.ts` alone and the new module is `.tsx`. An array fallback (`["./src/*.ts", "./src/*.tsx"]`) typechecks but Vite does not resolve it, so the exact key is the portable form.

### Open decision, from review: what the Space title's "Copy link" means

`entity-actions.tsx` states the rule that "Copy link" is whichever address reproduces what is on screen, and the `space` branch does not follow it: it answers `{ kind: 'space', spaceId }`, which resolves to `defaultLayout`. So a reader on Collection 2 copies a link that opens the recipient on Collection 1. The address that would satisfy the rule does exist — the drawing Layout's — which makes the branch's original justification ("a Space has exactly one, so there is nothing for *permanent* to differ from") simply false. That comment has been corrected in place.

What remains is a product question neither issue 01 nor this one settled: **does the Space title's "Copy link" mean the Space, or the Space as currently drawn?** The second reading also gives the Space a genuine second address, and so puts a "Copy permanent link" item in a menu that has never had one. Behaviour is unchanged pending that decision, and it is not in this ticket's scope.
