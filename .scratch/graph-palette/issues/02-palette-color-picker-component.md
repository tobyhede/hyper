# 02 — Palette colour picker component

Status: resolved
Tags: release/v1

**What to build:** A reusable `@project/ui` control that lets an author choose
one colour from a **closed palette** shown as a swatch grid inside a popover.
The caller supplies the palette entries (label + hex); the component does not
embed palette constants. Choosing a swatch invokes the caller's handler and
closes the popover. Keyboard and focus behaviour follow Base UI / shadcn
popover conventions; record any deviation from `shadcn-first-ui` before
hand-rolling.

**Blocked by:** None — can start immediately (stories may use a small fixture
palette until ticket 01 lands).

- [ ] Exported component on `@project/ui` suitable for Graph recolour and other closed palettes later.
- [ ] Swatch grid shows every supplied colour with its label; the chosen swatch is visibly selected.
- [ ] Popover opens from a caller-provided trigger; Escape dismisses without leaving a stray focus trap.
- [ ] Stable Ladle story under `stories/components/` and a matching `pnpm e2e:ladle` behaviour test.
- [ ] Component recorded in the design-system inventory if required by `pnpm ui:catalog:check`.
