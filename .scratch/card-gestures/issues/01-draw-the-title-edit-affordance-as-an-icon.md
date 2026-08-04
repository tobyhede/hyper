# 01 — Draw the title-edit affordance as an icon

**What to build:** Replace the "Edit title" text button in a Card's corner with a
small icon, hand-rolled in the repo's own style, losing none of its behaviour or
its meaning to a screen reader.

**Blocked by:** nothing.

**Status:** resolved

- [x] `EditIcon` is added to `packages/ui/src/icons.tsx` in that file's established style: 24×24 viewBox, `stroke="currentColor"`, `strokeWidth="1.6"`, `aria-hidden="true"`.
- [x] No `lucide-react` or other icon dependency is added; shadcn/ui's icon set is not vendored for one glyph.
- [x] The affordance keeps its `aria-label` of `Edit title of <title>`, so replacing text with a glyph costs a screen reader nothing.
- [x] The affordance keeps its place in the tab order and its three `stopPropagation` calls for click, pointerdown and keydown.
- [x] `Enter` and `Space` on the focused affordance still begin title editing and still do not open the Card.
- [x] It is revealed by the same hover, selection and focus rules as before, and hidden by the same withdrawal rules.
- [x] It reads as an affordance at the Card's drawn size rather than as decoration, and does not overlap the title or the description.
- [x] Existing coverage that finds the control by its accessible name continues to pass unchanged.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

`EditIcon` is a pencil in `packages/ui/src/icons.tsx`, drawn to that file's
existing shape, exported through `@project/ui` and used by `CardNode` — which
already imported `CardContent` from there, so the swap crossed no new boundary.
No icon dependency was added.

The button is otherwise untouched: same `aria-label`, same tab position, same
three `stopPropagation` calls. One thing did change in kind rather than degree,
and is noted at the call site: the glyph is `aria-hidden`, so `aria-label` is now
the button's *only* accessible name rather than a refinement of visible text.
Dropping it would leave the control unnamed, not coarsely named.

The CSS stopped sizing the button from its content — a fixed 1.5rem square,
centred, with padding removed — since a glyph gives a box no shape of its own.
A hover state was added because the border was the only thing distinguishing it
from the Card beneath.

Geometry is asserted in `editing.spec.ts` rather than left to the eye: the
affordance is square to within a pixel, sits inside the Card's box, and ends
above the title's. Confirmed load-bearing by widening the button to 3rem, which
fails it at 13.2px.

`pnpm verify` green (74 files / 699 tests). `pnpm e2e` green (62).

Not covered, and named in the ticket as a look-at-it item: whether the glyph
reads as an affordance at the drawn size. Nothing in the suite reports that.

## Comments

The ticket was built to a wrong requirement. The affordance was specified as a
rename control because that is what the text button it replaced did, and nobody
questioned it while it said "Edit title". As a pencil it promises the Card, not
one field of it — and the app already uses "Edit Card" for the surface it should
open.

The glyph, its styling, its accessible-name property and its geometry coverage
all stand. What it is pointed at does not. `04` repoints it and takes over this
ticket's `aria-label` and eligibility items; the spec was corrected first.
