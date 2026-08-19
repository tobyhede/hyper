# The workspace command surface is a sidebar and the canvas takes one choice

Status: accepted
Refines: 0031
Refined by: 0055
Related: 0025, 0026, 0028, 0040, 0045, 0047, 0050, 0052

Workspace commands live in a persistent left **Sidebar**, and what draws the canvas is **one exclusive choice** in it: the computed Views and authored Layouts are rendered as two labelled menu groups sharing exactly one pressed item. There is no second selector and no `None`. The Space title names the workspace at the top of the sidebar; the canvas header names what is currently drawing it and whether that is computed or authored.

Two things are being decided together because one forced the other. The horizontal row could not hold the choice honestly, and the choice could not be drawn as one list in a row.

## The row ran out

`.shell__header` put the Space title and six controls — View, Layout, Graph, Add Card, Present, persistence — on one line and gave neither of its two flex children a `min-width`. Both overflow the painted header at roughly 1050px, the title never truncates because it is `nowrap`, and the fixed trigger width that made selection geometry stable is exactly what removed the row's give. That defect is recorded at the end of Issue 02 with its fix — `min-w-0` on both children, a flex basis rather than a fixed width, and a disclosure step — and the fix is a repair of the shape rather than a shape that works. Every workspace concept added since has cost horizontal space the row does not have, and the next one costs more.

Two occupants of that row were already tried and withdrawn. The **Menubar** went first (Issue 02, 2026-08-18): a menubar trigger is a stable command noun and roving focus across the bar assumes stable command groups, while these triggers carry *values*. Every deviation that implementation needed — a fixed `w-40`, a `truncate` span, a duplicated `title`, `''` as a no-selection sentinel — was a reconstruction of Select. The **Selects** that replaced it are the right primitive for a value in a row, and they are still a collapsed list: the thing an author moves between most often is one click away from being visible at all.

shadcn ships one application-chrome component with a worked-out responsive story, and it is the Sidebar: offcanvas collapse, a mobile Sheet below the breakpoint, a trigger that stays in the canvas header, and remembered open state. ADR 0047 makes that component the default and a hand-roll the deviation; there is no product requirement here that the primitive does not already serve. Vertical chrome also grows in the direction that is cheap — a list gains a row, and rows are what a sidebar has.

## The canvas has one choice, and the row had made it look like two

The domain has always had one. `RendererSelection` is `{ kind: 'view' } | { kind: 'layout' }`, `resolveRenderer` answers one `ResolvedRenderer`, and ADR 0031 exposed exactly that: *one* selector, grouped into Views and Layouts. The two-Select toolbar is drift away from that document, not an elaboration of it.

The drift is legible in the values it had to invent. `Layout · None` does not name a Layout; it says a View is drawing. `View · Flow` while a Layout draws does not name what is on screen; it names the View that *would* draw if you picked one. A control whose value can mean "not this control" is not the choice — it is half of one, and the author is left to reconstruct the whole from which of two triggers is styled active.

The sidebar draws the choice as the model already holds it: one logical choice rendered through two labelled `SidebarMenu` groups, **Computed views** and **Authored layouts**, one item pressed across both, and no empty value anywhere. The two menu elements preserve shadcn's group composition; they do not represent independent values. Selecting is navigation and not an edit — ADR 0028 and ADR 0031 are untouched — and conversion still lands the author on the new Layout, which is now a new row in the list rather than a value appearing inside a trigger that previously read `None`.

**Graphs stay a separate list, deliberately.** Activating a Graph does not choose what draws the canvas; it is emphasis within whatever is drawing (ADR 0026, ADR 0045). Merging the two lists would put two different kinds of exclusivity in one place and make `Long` look like an alternative to `Grid`. Two lists, each of which is a list, is the point — not one list of everything.

## What it costs

**Sixteen rem of canvas.** The canvas is spatial and the sidebar takes width from it permanently, where the toolbar took height once. This is the real price and it is paid on every screen. Offcanvas collapse and the primitive's `cmd/ctrl+B` are the mitigation, and the trigger stays in the canvas header so the sidebar is never lost.

**The lists are unbounded.** A Select trigger has fixed geometry no matter how many Layouts a Space holds; a sidebar list scrolls. A Space with thirty Layouts scrolls its canvas group, and nothing here caps or paginates it. Accepted: a named list that scrolls is still more legible than a collapsed one, and the Space that makes this hurt does not exist yet. If it arrives, the answer is a filter in the group, not a return to a trigger.

**A second global keyboard shortcut.** `cmd/ctrl+B` arrives from the primitive and is not Hyper's. It is left as the primitive defines it, per ADR 0047's second rule, and it does not collide with `C`, the presenting arrow keys or React Flow's own.

**The canvas HUD's Graph legend now repeats the sidebar's Graphs group.** Colour, title and active state are stated in both places. The legend is kept here because it sits with the minimap as an on-canvas colour reference for Edges the author is looking at, not because the duplication is invisible. Whether it survives is Issue 06's call, and this ADR does not make it.

**Persistence keeps the indicator's own vocabulary.** The prototype's footer paired a dot with static text reading `Changes saved`; that text was fixture decoration and it disagreed with the cue beside it. Production renders `PersistenceControl` alone in the sidebar footer, so the cue names itself once, through the label and tooltip the component already owns. A visible cue label is a change to `PersistenceIndicator`, which is Issue 04's to make if it is wanted.

## The negative

**Do not reintroduce a second control for the canvas choice, in any presentation.** The tempting version is not the old pair — it is a Layouts-only picker added later "because there are a lot of them now". The moment a second control exists, one of the two needs a value meaning "not me", and `None` is back.

**Do not restore the Menubar, and do not read this as a licence to rebuild the row.** Both were tried on this branch, in this order, and both are recorded with what failed. A future review looking at a 16rem gutter beside a spatial canvas will re-suggest a compact top bar; it is answered by the responsive defect above, not by taste.

**Do not fold Graph activation into the canvas list**, however much the two look alike as lists of coloured names. They are different verbs over different aggregates.

**Do not put persistence status into a menu or a command list.** Status is not a command, which is what Issue 02 established before the surface changed; moving from a row to a column does not change it.

**Do not put the Space title back over the canvas.** The sidebar header names the workspace and the canvas header names what is drawing it. One name per surface is what makes the header able to carry the current canvas at all.
