# 05 — Add Graph management

Status: ready-for-agent
Tags: release/v1
Blocked by: `command-dock/07`
Related: `architecture-review/19` (resolved) — Graph create, recolour and delete
multiply the inline rename surfaces this ticket puts on the Command Dock, and
the focus return they need is the captured DOM closure stored on React state
that ticket deleted

**What to build:** Expose the existing Graph lifecycle operations through the
Command Dock and finish the selected-Edge lifecycle.

**The surface is the Command Dock, not the Sidebar.** ADR 0082 supersedes
ADR 0053 and retires the Sidebar as the bound command surface;
`command-dock/07` deletes `packages/app/src/components/SpaceSidebar.tsx` and
`packages/app/src/components/OpenSpaceSidebars.tsx`. The two Graph commands that
*do* have callers today are wired through that module — rename at
`packages/app/src/App.tsx:640` and activation at `:930-932` — so the three this
ticket adds go on the Dock beside them, after the promotion, or they are built
twice.

- [ ] **An author can create, recolour and delete a Graph. The reducers exist;
      nothing calls them.** `packages/app/src/space-authoring.ts:1244`
      (`added-graph`), `:1279` (`recolored-graph`) and `:1282` (`deleted-graph`)
      are complete and covered by unit and property tests. Their only non-test
      references in the tree are the type union, the reducer itself and
      `packages/app/src/authoring-refusal.ts:40-41`, which presents refusals
      nothing can currently provoke. So this is a controls-only job: three
      commands on the Dock, no new authoring. Rename (`:1270`) and activation
      already have callers and only move with the surface.
- [ ] **Every Layout retains at least one Graph and gives a clear refusal when
      its last Graph would be deleted.** The rule is written and its message is
      registered — `space-authoring.ts:1286` refuses `layout-must-keep-graph`,
      and `authoring-refusal.ts:75` and `:131` give it a form. It is
      **unreachable from the application** until the delete control above
      exists, which is why the criterion is unticked: an author cannot see a
      refusal for an operation they cannot start. Ticking it needs the control
      and the surfaced refusal, not the reducer.
- [x] Graph colour is used consistently by Edges, handles and presentation
      chrome. There is one resolution and everything reads it:
      `packages/app/src/colors.ts:43` (`graphColorMap`, a stored `color` else a
      palette slot by declared order), called once at
      `packages/app/src/canvas-projection.ts:72` for the projection that
      publishes both Edges and handles. `nextGraphColor` (`colors.ts:39`) takes
      the next slot for a newly added Graph. Nothing about colour is missing —
      only the control that lets an author change it, which is the recolour
      command above.
- [x] Edge selection exposes reconnect and delete controls after both creation
      and reconnection. Landed with PR #163
      (`22-reconnected-edge-selection`). The controls are
      `packages/app/src/components/SelectedEdgeControls.tsx:162`
      (`data-testid="edge-edit"`, the endpoint editor) and `:174`
      (`data-testid="edge-delete"`); the post-reconnect assertion is
      `packages/app/e2e/editing.spec.ts:2289`, which names the reconnected Edge
      by its decorated label rather than settling for "focus moved", because a
      Layout overview draws every Graph at once.
- [ ] The Graph controls this ticket owns have desktop and narrow-screen
      keyboard, pointer, application and Ladle evidence, on the Dock. The
      complete V1 workflow across the command surface is `v1-release/06`'s, and
      it is blocked by this ticket.

## Comments

**Rewritten against the Command Dock, and the remaining scope named honestly.**

**The surface changed.** ADR 0082 retires the Sidebar as the bound command
surface, so "expose the Graph lifecycle operations through the Sidebar" was an
instruction to build on a module `command-dock/07` deletes. That ticket is now a
blocker and the wording is the Dock's.

**The scope is smaller than it read, and differently shaped.** Three of the five
Graph operations already have complete, tested reducers with **no application
caller at all** — `added-graph`, `recolored-graph` and `deleted-graph`. That is
worth saying plainly, because "add Graph management" reads as domain work and it
is not: it is three controls wired to operations that already answer
`completed`, `unchanged` and `refused` correctly.

It also explains why the last-Graph refusal stayed unticked while its code is
written. `layout-must-keep-graph` cannot fire from the application, because the
delete that would provoke it has no control. A refusal nobody can reach is not
evidence that the rule holds where an author stands — it is a unit test, and
this criterion asks for more than one.

**Colour was already consistent.** One resolver, read once by the projection
that draws Edges and handles. The criterion was ticked on that basis and the
recolour half moved into the create/recolour/delete item where it belongs, so
the list no longer implies that colour propagation is outstanding work.

**Edge reconnect and delete are done.** PR #163 landed both controls and the
assertion that the reconnected Edge is the one that ends up focused.
