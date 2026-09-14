# 05 — Add Graph management

Status: resolved
Tags: release/v1
Blocked by: nothing. `command-dock/07` landed; the Sidebar is gone.
Related: `architecture-review/19` (resolved) — Graph create, recolour and delete
multiply the inline rename surfaces this ticket puts on the Command Dock, and
the focus return they need is the captured DOM closure stored on React state
that ticket deleted

**What to build:** Expose the existing Graph lifecycle operations through the
Command Dock and finish the selected-Edge lifecycle.

**The surface is the Command Dock, not the Sidebar.** ADR 0082 supersedes
ADR 0053 and retires the Sidebar as the bound command surface;
`command-dock/07` deletes `packages/app/src/components/SpaceSidebar.tsx` and
`packages/app/src/components/OpenSpaceSidebars.tsx`. Rename and activation
moved with the surface; create, recolour and delete are on the Dock beside them.

## Already true — do not rebuild

- [x] Graph colour is used consistently by Edges, handles and presentation
      chrome. There is one resolution and everything reads it:
      `packages/app/src/colors.ts:43` (`graphColorMap`, a stored `color` else a
      palette slot by declared order), called once at
      `packages/app/src/canvas-projection.ts:72` for the projection that
      publishes both Edges and handles. `nextGraphColor` (`colors.ts:39`) takes
      the next slot for a newly added Graph.
- [x] Edge selection exposes reconnect and delete controls after both creation
      and reconnection. Landed with PR #163
      (`22-reconnected-edge-selection`).

## Built

The reducers and Dock controls were complete; this ticket adds the application,
mobile and Ladle evidence they were missing. Recolour evidence uses the current
swatch picker and checks that the stored selection survives reload.

- [x] **An author can create, recolour and delete a Graph.** `GraphIdentityMenu`
      in `CommandDock.tsx` draws New Graph, Colour and Delete; `App.tsx` spends
      `added-graph`, `recolored-graph` and `deleted-graph` through
      `reportGraphEdit`. Desktop and phone application evidence:
      `editing.spec.ts`, `mobile-dock.spec.ts`. Ladle evidence:
      `ladle-e2e/command-dock.spec.ts`. Parity claims:
      `command-dock-adds-graph`, `command-dock-recolors-graph`,
      `command-dock-deletes-graph`.
- [x] **Every Diagram retains at least one Graph and gives a clear refusal when
      its last Graph would be deleted.** Authoring refuses
      `diagram-must-keep-graph`; Delete is present and `aria-disabled` on the
      last Graph rather than absent. Application evidence:
      `editing.spec.ts` (`@parity:command-dock-deletes-graph`),
      `dock-commands.test.tsx` (`the last Diagram and Graph`).
- [x] **Graph controls have desktop and narrow-screen keyboard, pointer,
      application and Ladle evidence on the Dock.** Keyboard: `editing.spec.ts`
      (Enter on the Graph cluster to reach New Graph). Pointer and application:
      the specs above. Ladle: `ladle-e2e/command-dock.spec.ts`.

## Comments

**Rewritten against the Command Dock, and the remaining scope named honestly.**

**The surface changed.** ADR 0082 retires the Sidebar as the bound command
surface, so "expose the Graph lifecycle operations through the Sidebar" was an
instruction to build on a module `command-dock/07` deletes. That ticket is now a
blocker and the wording is the Dock's.

**The scope is smaller than it read, and differently shaped.** Three of the five
Graph operations already had complete, tested reducers with **no application
caller at all** — `added-graph`, `recolored-graph` and `deleted-graph`. That is
worth saying plainly, because "add Graph management" reads as domain work and it
is not: it is three controls wired to operations that already answer
`completed`, `unchanged` and `refused` correctly.

It also explains why the last-Graph refusal stayed unticked while its code is
written. `diagram-must-keep-graph` cannot fire from the application, because the
delete that would provoke it has no control. A refusal nobody can reach is not
evidence that the rule holds where an author stands — it is a unit test, and
this criterion asks for more than one.

**Colour was already consistent.** One resolver, read once by the projection
that draws Edges and handles. The criterion was ticked on that basis and the
recolour half moved into the create/recolour/delete item where it belongs, so
the list no longer implies that colour propagation is outstanding work.

**Edge reconnect and delete are done.** PR #163 landed both controls and the
assertion that the reconnected Edge is the one that ends up focused.
