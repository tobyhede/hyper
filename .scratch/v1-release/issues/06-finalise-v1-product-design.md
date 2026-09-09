# 06 — Finalise the V1 product design

Status: ready-for-agent
Tags: release/v1
Blocked by: `command-dock/07`; 03, 05; `entity-url-addressability/08`;
`interaction-draft-invalidation/04`

**What to build:** Finish V1 as one coherent responsive design rather than a mix
of feature-owned treatments.

**The command surface is the Command Dock.** ADR 0082 supersedes ADR 0053 and
retires the Sidebar as the bound surface; `command-dock/07` deletes
`packages/app/src/components/SpaceSidebar.tsx` and
`packages/app/src/components/OpenSpaceSidebars.tsx`, and takes the responsive
story with them — the offcanvas collapse, the mobile Sheet, the remembered open
state and `cmd/ctrl+B` all came free from the Sidebar primitive, and ADR 0082
prices that plainly: *"The responsive story is now ours."* This ticket judges
the finished design over the Dock, not over the Sidebar, which is why it lists
`command-dock/07` directly rather than relying on 03 and 05 to carry it.

- [ ] Every V1 surface uses one theme, icon language, spacing system and control
      hierarchy. The theme half is settled: `a5a76669` made sand the canvas and
      the chrome neutral grey over it, in `packages/app/src/tailwind.css`, which
      every `@project/ui` control follows without being told — portalled ones
      included. What remains is icon language, spacing and control hierarchy
      across the Dock and the canvas.
- [ ] Focus, selected, disabled, empty, loading, saving, conflict and failure
      states are complete and do not rely on colour alone. Persistence is the
      Dock's own obligation under ADR 0082 — it reports the Space's state
      without being asked, in `PersistenceIndicator`'s five states and
      `openSpaceStatusLabel`'s words, and a retryable `failed` must not be drawn
      like a final `rejected`.
- [ ] The Command Dock supports the full V1 workflow on desktop and narrow
      screens. Every command is reachable and operable from the keyboard alone —
      not a subset, and not "everything except the drag" — and every control's
      accessible name contains its visible label.
- [ ] Every stable production surface has meaningful Ladle states and matching
      application parity evidence. `command-dock/07` replaces the thirteen
      Sidebar claims with Dock claims rather than renaming them; this ticket
      checks the set is complete once 03 and 05 have added their controls to it.

## Comments

**Rewritten against the Command Dock.** ADR 0082 retires the Sidebar as the
bound command surface, and `command-dock/07` is where that stops being true only
on paper. This ticket is the design pass over the finished V1, so it is judged
over the surface V1 ships with — hence `command-dock/07` as a direct blocker
rather than an implied one through 03 and 05. Reading it through them would let
someone start the design pass on a surface being deleted.

**The responsive criterion is the one that changed most.** It used to say
"command surfaces" in the plural and lean on a primitive that supplied the phone
branch for free. ADR 0082 accepts the cost of losing that — offcanvas collapse,
the Sheet, the remembered state and `cmd/ctrl+B` are all now ours — and binds
"one surface, not two" and full keyboard reach in their place. Both are written
into the criterion so the pass has something to check rather than a word.

**The theme is no longer part of this ticket's problem.** The "mix of dark,
light and feature-owned treatments" the original framing named was answered by
`a5a76669`, which put the values in `tailwind.css` once. What is left under that
criterion is icon language, spacing and control hierarchy.
