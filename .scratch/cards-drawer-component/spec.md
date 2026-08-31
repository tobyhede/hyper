# The Cards drawer is a Drawer

## What is wrong now

`packages/app/src/components/CardsDrawer.tsx` is not a drawer. It is a second
`Sidebar` — `<Sidebar side="right" collapsible="none" className="w-[310px] shrink-0 border-l">` —
conditionally mounted as a flex sibling of the canvas. That is wrong on five counts:

1. **`Sidebar` is the application's command surface, not a panel primitive.** ADR 0053
   gives the left edge to the one `Sidebar` the Space composes. A second one on the
   right borrows the shell's `SidebarProvider` context, so the Cards drawer shares the
   command Sidebar's open state, its `Ctrl/Cmd-B` shortcut and its mobile `Sheet`
   behaviour. `collapsible="none"` mutes most of that by accident rather than by design,
   and the story has to wrap the component in a *second* `SidebarProvider` to mount it
   at all — a component that needs an unrelated provider to render is a component
   composed from the wrong primitive.

2. **No dismissal contract.** Escape does nothing. There is no close control. The only
   way out is the header toggle that opened it. Every other transient surface in this
   repo (the Card panes, the endpoint editor, the combobox) ends on Escape.

3. **No focus contract.** Opening moves nothing; closing returns focus nowhere. Closing
   the drawer while focus is inside it drops focus to `<body>`.

4. **No accessible identity.** The region has no role and no name. A screen reader
   reaching it finds an unlabelled `div` of buttons.

5. **No transition.** `{cardsDrawerOpen && <CardsDrawer …/>}` mounts and unmounts, so
   the panel pops in and out with the canvas snapping width beside it.

## What to build

A `Drawer` in `@project/ui`, composed from Base UI's own `Drawer` primitive
(`@base-ui/react/drawer`, present in the installed 1.7.0), and a `CardsDrawer` that
composes it.

### Why Base UI's Drawer and not shadcn's

`@shadcn/drawer` is vaul, which is Radix. This repository has neither: `packages/ui`
depends on `@base-ui/react` alone and `components.json` pins the `base-nova` style.
Taking the registry component would install a second dialog, focus-trap and animation
stack beside the one every other surface here uses. The shadcn-first workflow's step 8
covers exactly this case — *"When shadcn lacks the capability but Base UI supplies the
primitive, build the smallest shadcn-style wrapper in `@project/ui`"* — so the wrapper
is shadcn-shaped (`data-slot` attributes, `cn`, parts named `Drawer*`) over Base UI's
parts.

`packages/ui/src/components/sheet.tsx` is the base-nova `Sheet` and is already vendored,
but it is not on the `@project/ui` barrel and its only consumer is `sidebar.tsx`'s mobile
branch — it is the Sidebar's own implementation detail, not a panel primitive surfaces
compose. It is also the wrong shape here: a `Sheet` is a positioned Dialog with no gesture
support, and the whole point of this drawer is that Cards are dragged out of it.

### Behaviour the Drawer must have

- **Non-modal.** `modal={false}`. The canvas behind it stays live, because dragging a
  Card from the drawer onto the canvas is the primary interaction and a backdrop or a
  pointer-events lock would kill it. No `Drawer.Backdrop` is rendered.
- **Survives an outside press.** `disablePointerDismissal`. A non-modal Base UI drawer
  closes on outside press *and* on focus leaving it; both fire the moment the reader
  clicks the canvas, and adding several Cards in a row is the normal case. The drawer
  closes on its own control, on the toggle, on Escape, or on a swipe — never because
  the reader touched the thing it exists to feed.
- **Escape closes it**, from the Base UI primitive rather than a hand-rolled listener.
- **Focus returns to the trigger** when it closes.
- **Named region.** `Drawer.Title` gives the dialog its accessible name.
- **Slides.** `data-starting-style` / `data-ending-style` transform, with
  `--drawer-swipe-movement-x` respected so a swipe tracks the pointer.
- **Swipe-to-dismiss does not eat the Card drag.** Base UI's swipe gesture is opted out
  per-element with `data-base-ui-swipe-ignore`; the scrolling Card list carries it, so a
  press on a Card begins an HTML5 drag and a press on the drawer's chrome can still
  swipe it shut.

### What changes for the reader

The drawer overlays the right edge of the canvas instead of squeezing it. That is what
a drawer is, and it removes the layout coupling that made the canvas re-flow — and every
Card on it re-measure — on a toggle that says nothing about the Layout.

## What the overlay costs, and what was done about it

The drawer is a portalled overlay, and the end edge of the main area is crowded: the
React Flow pane is pinned to it, the Graph key and pannable overview sit bottom-right of
that pane, and a standing persistence notice sits top-right. An overlay covers all
three, and none of them is optional — the Graph key is the on-canvas colour reference
for the Edges being read, the overview is interactive, and a persistence failure stands
until the condition clears rather than expiring like a toast.

**The shell yields the strip rather than layering over it.** `AppShell` takes an
`insetEnd` — a width the main area gives up at its end edge — and `App` passes the
drawer's own `DRAWER_WIDTH` while it is open. Everything pinned to that edge then moves
with the edge, and there is nothing to layer: `.shell__notice` keeps its original `z-5`,
under both the drawer and every modal surface, because the drawer no longer reaches it.

The alternative was a z-index ladder, and it was tried and rejected: raising the notice
above the drawer put it over the drawer's own Filter and Search controls, which overlap
it almost exactly, and over `.card-pane` as well.

Two details of the mechanism are load-bearing:

`AppShell` gained `.shell__area` inside `.shell__main`. An absolutely positioned box
resolves against its containing block's *padding* box, so the notice would have ignored
the padding and stayed under the drawer; `.shell__area` is the containing block with the
strip already taken out of it.

The padding is **not** animated, although the panel beside it slides. React Flow
re-measures its container continuously, so an animated width moves the canvas under a
pointer that is already dragging a Card out of the drawer — the Card then lands
somewhere other than where it was dropped, which the drag-to-place e2e caught. The flex
layout this replaced took the strip in one step too.

**The trigger is still covered while the drawer is open**, because the drawer spans the
viewport height and the header is not padded. That is fine: the drawer's own close
control lands in the same corner, so the affordance is replaced in place rather than
lost, and Escape closes it regardless. This is what shadcn's `Sheet` and Base UI's own
drawer demo both do; insetting the drawer below the header instead would mean the
component knowing the shell's header height.

## Two states that used to reset by unmounting

The panel this replaced was conditionally rendered, so closing it destroyed the
component. Only the popup unmounts now, and two things that used to reset for free had
to be made explicit:

**Withdrawing the drawer closes it.** Presenting, opening a Card and creating an Alias
all withdraw it, and `cardsDrawerOpen` staying true meant it sprang back afterwards —
taking focus with it, because `Drawer.Popup` moves focus in on *every* open however that
open was caused. Leaving a presentation landed the reader in the Cards list instead of
on the canvas they returned to.

**Closing forgets the query and kind.** Otherwise the next open meets "No matching
Cards" with no memory of having typed anything.

## Out of scope

- Deleting the unused `sheet.tsx`. It is a foundation primitive question (AGENTS.md),
  not a surface one.
- Snap points, nested drawers, `Drawer.Indent` and the virtual-keyboard provider. None
  has a consumer.
- Any change to what the drawer *lists*, or to the Add / drag-to-place behaviour. Those
  are settled by `.scratch/v1-release/issues/02-complete-the-cards-view.md` and are
  preserved exactly.
