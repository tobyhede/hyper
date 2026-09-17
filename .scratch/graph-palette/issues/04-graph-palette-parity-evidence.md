# 04 — Graph palette parity evidence

Status: resolved
Tags: release/v1

**What to build:** Replace parity claims and tests that assert the old six-item
radio submenu with evidence for the Tableau 20 swatch picker on the Command
Dock — desktop and narrow-screen, pointer and keyboard, Ladle and application.
Update the Thing **Colours** story sweep if the catalogue palette count changed.

**Blocked by:** 03 — Wire Graph colour picker on the Command Dock.

- [x] `parity-claims.ts` entries for Graph recolour describe the swatch popover, not radio items.
- [x] Application E2E covers opening the picker, choosing a swatch, and persistence (including phone width where the Dock is the only chrome).
- [x] Ladle E2E covers the same obligation on the Command Dock story.
- [x] Obsolete tests that query menu radio items by colour name are removed or rewritten; `pnpm e2e`, `pnpm e2e:ladle`, and `pnpm verify` pass.

## Comments

Resolved on `main` by `b9fe0a0cf` (adopt Tableau 20 and the swatch grid), `47c0f8fce` (picker layout and palette ordering) and `ed18178ae` (parity claims and swatch grid tests).
