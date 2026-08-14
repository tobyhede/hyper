# 07 — Rebuild the Card Editor on Base UI Dialog

**What to build:** Replace the hand-rolled Card Editor surface with Base UI Dialog and selectively port the proven behavior from the paused Card-pane branch onto current main, so opened Cards and new Aliases share primitive-owned modality with one coherent Done/Cancel contract.

**Blocked by:** 03 — Move Button onto Base UI.

**Status:** ready-for-agent

- [ ] Use the Base UI/shadcn Dialog component and its normal modal focus, initial-focus, outside-interaction, Escape and accessible-title behavior instead of retaining the hand-rolled focus trap or importing the paused Radix wrapper.
- [ ] Preserve ADR 0048: every opened-Card field remains pending until one Done, while Cancel or Escape discards every pending field and closes.
- [ ] Preserve Alias creation as the documented exception whose Target selection completes creation because that pane has no Done action.
- [ ] Keep cmdk Command as the Card picker model; do not import the paused branch's replacement Combobox or delete Command.
- [ ] Reconcile the paused branch's semantic changes, tests and ADR 0049 with current main's Edge-authoring work rather than replacing current-main consumers wholesale.
- [ ] Prove focus enters the intended field, stays within the modal, survives nested picker interaction, and returns to the correct Card or toolbar control on every close path.
- [ ] Confirm the Dialog component and migrated consumers contain no Radix import, stale Radix composition prop or registry placeholder.
- [ ] Write the required Dialog migration report and pass focused tests, the relevant browser scenarios, typecheck and the production build in a Dialog-only commit.
