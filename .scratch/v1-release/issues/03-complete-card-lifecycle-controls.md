# 03 — Complete the Card lifecycle controls

Status: resolved
Tags: release/v1
Blocked by: nothing. `command-dock/07` landed; the Sidebar is gone.
Related: `architecture-review/23` (resolved), `entity-url-addressability/07`
(resolved), ADR 0089. Written before ADR 0085: the heading keeps Card; the
body uses Thing and Diagram.

**What to build:** A named **Remove from Diagram** command beside **Delete
Thing**, and phone-width evidence that Delete Thing's confirmation opens.

This ticket composes operations Space Authoring already owns
(`removed-thing-from-diagram`, `deleted-thing`). It does not reimplement
creation, rename, or the delete confirmation.

## Already true — do not rebuild

- [x] **Markdown and Space Thing are chosen at creation, on the Dock.**
      `CreatePeers` offers those two kinds (`DockThingKind`). An Alias is
      created from its Target: `Create Alias` on that Thing's command menu
      (ADR 0089). There is no Add Card split button and no creation pane.
- [x] **Alias Target is immutable.** `edited-thing` refuses a changed Target
      with `alias-target-immutable` in `space-authoring.ts` (ADR 0070).
- [x] **A new Space and a link to an existing one are different commands.**
      Create Space Thing always mints (`createSpaceThing` in `App.tsx`).
      Linking an existing Space is the Things list `onAddSpace` row
      (`ThingsPopover` — `Add a Space Thing for this Space to the Diagram`).
- [x] **Rename edits the Thing's own Title for every kind.** `CanvasThing`
      gates `onBeginTitleEdit` on `readOnly` alone.
- [x] **Delete Thing confirms the cascade.** The Thing menu's `Delete Thing`
      row (`App.tsx`, `id: 'delete-thing'`) arms `DeleteThingConfirmation` at
      the App root. The dialog names the Thing and, for a Space Thing, the
      lifetime cascade (ADR 0074). Desktop evidence:
      `editing.spec.ts`, `space-thing.spec.ts`, `thing-rail-actions.test.tsx`.
- [x] **Create Space Thing at phone width.**
      `mobile-dock.spec.ts` — `Create Space Thing from the strip names the new
      Thing on the canvas`. Create Markdown Thing is the test above it.

## Built

Space Authoring already distinguishes the two ways a Thing leaves:

```
removed-thing-from-diagram  — this Diagram's membership, rect, incident Edges
deleted-thing              — the same removal, cascaded through every Diagram
```

(`space-authoring.ts`, the two completion kinds under Thing membership.)
`CONTEXT.md` names both. Both commands are now drawn on the Thing menu.

### 1. Name Remove from Diagram — done

The only way to reach `removed-thing-from-diagram` today is Delete/Backspace
in `SpaceCanvas.tsx` (the `authoring.complete({ kind: 'removed-thing-from-diagram' })`
handler). The phrase is not a control label anywhere — it appears in comments
and an embedded-authoring invariant. The Things list names **Add to Diagram**
on Things that are *off* the canvas; it does not name the inverse, and should
not: that list is the add surface.

**Add a `Remove from Diagram` row on the Thing's command menu**, the same
`EntityActionsMenu` that already draws `Create Alias` and `Delete Thing`.
That is where an author sees that there are two deletions.

- The row completes `removed-thing-from-diagram` on the press. It does not
  open `DeleteThingConfirmation`. Remove from Diagram is not a Space cascade.
- Availability is the canvas key's, not Delete Thing's: `authorOnCanvas` and
  not body-editing. Delete Thing is withdrawn while the Thing is Open;
  Remove from Diagram is not — it reclaims the Open room (`CONTEXT.md`).
- Keep Delete/Backspace as Remove from Diagram. The new row is the name of
  that operation, not a second one.
- Search `@project/ui` first (`EntityActionsMenu`). This is another row on
  the menu that already exists.

### 2. Phone-width delete confirmation — done

`mobile-dock.spec.ts` still only proves that Delete on a Dock control does
*not* remove the selected Thing. It never opens `Delete Thing …?`.

Add pointer and keyboard cases at 390×844: open the confirmation, Cancel
leaves the Thing, Confirm runs `deleted-thing`. Model the assertions on
`editing.spec.ts` — `Delete Thing confirms before removing the Thing from
the whole Space`.

## Out of scope

- Restoring `AddCardControl`, a three-kind Dock cluster, or a creation pane
- A confirmation on Remove from Diagram
- Remove from Diagram as a Things-list row
- The complete V1 command-surface journey (`v1-release/06`)
- Embedded-Diagram `removeThing` (already bound to the same completion)

## Evidence

- Application test: the Thing menu names both commands; Remove from Diagram
  drops membership on this Diagram and leaves the Thing in the Space; it
  does not mount `DeleteThingConfirmation`
- `mobile-dock.spec.ts`: confirmation at phone width, pointer and keyboard
- `pnpm verify` and `pnpm e2e`

## Answer

The Thing command menu now names both ways a Thing leaves. `thingRailActions`
in `App.tsx` offers **Remove from Diagram** beside **Delete Thing** on the
same `EntityActionsMenu`. The new row completes `removed-thing-from-diagram`
on the press and never mounts `DeleteThingConfirmation`. Availability is the
canvas key's — `authorOnCanvas` and not body-editing — so the row stays
offered while the Thing is Open; Delete Thing does not. Delete/Backspace is
still that same Edit.

Phone-width evidence is in `mobile-dock.spec.ts`: at 390×844, pointer and
keyboard each open `Delete Thing B?`, Cancel leaves the Thing, Confirm
runs `deleted-thing` — the Thing is gone from the Space, not only this
Diagram (`Add B to Diagram` absent, revision `1`).

`thing-rail-actions.test.tsx` holds the named command: both rows present, the
press drops this Diagram's membership and leaves the Thing in the Space, no
alertdialog, and an Open Thing still offers Remove while withdrawing Delete.

## Comments

**Rewritten 2026-09-13 against `main`.** The previous draft cited
`AddCardControl`, `card-creation.ts`, `CanvasCard`, `SpaceSidebar` and
`mobile-sidebar.spec.ts` — all gone — and still blocked on `command-dock/07`.
Four creation/rename criteria were already true; Create Space Thing at 390px
landed in `mobile-dock.spec.ts` after that draft. What remained was the named
Remove from Diagram row and the phone-width confirmation cases.

**Implemented 2026-09-13.** Remove from Diagram is a row on `EntityActionsMenu`
(`thingRailActions` in `App.tsx`). Phone confirmation cases are in
`mobile-dock.spec.ts`.
