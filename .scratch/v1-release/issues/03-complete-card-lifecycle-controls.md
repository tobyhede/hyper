# 03 — Complete the Card lifecycle controls

Status: ready-for-agent
Tags: release/v1
Blocked by: `command-dock/07`
Related: `architecture-review/17` (resolved) — that ticket collapsed Card
creation into one reducer, and the third pane kind this ticket was written to
add landed with it: `packages/app/src/card-creation.ts:33` is
`CardCreationKind = 'alias' | 'space'` (PR #157). So the structure and its first
criterion are both already there; what is left below is the part that never
was. `entity-url-addressability/07` (resolved) owns Space Card creation,
reference choice and the atomic lifetime and cascade semantics.

**What to build:** Expose one coherent kind-selection, rename, confirmation and
responsive command surface for Markdown, Alias and Space Cards using authoring
operations their feature tickets already own. This ticket composes them and does
not implement them again.

**The surface is the Command Dock, not the Sidebar.** ADR 0082 supersedes
ADR 0053 and retires the Sidebar as the bound command surface;
`command-dock/07` deletes `packages/app/src/components/SpaceSidebar.tsx` and
`packages/app/src/components/OpenSpaceSidebars.tsx`. Every control this ticket
places goes on the Dock, and every piece of evidence it owes is written against
the Dock's stories and specs. Do not start it before `command-dock/07` lands —
the delete confirmation currently lives on the Sidebar
(`packages/app/src/components/SpaceSidebar.tsx:225`), so anything built beside
it is built on a module being removed.

- [x] Add Card explicitly chooses Markdown, Alias or Space.
      `packages/ui/src/AddCardControl.tsx:89` is the Add Card half of a split
      button; the `add-card-menu` trigger beside it at `:95` opens the kind menu.
- [x] Alias creation chooses one immutable Markdown Target for V1.
      Immutability is Space Authoring's, not the surface's:
      `packages/app/src/space-authoring.ts:1037` refuses a changed Target with
      `alias-target-immutable` (ADR 0070).
- [x] Space Card creation chooses an existing Space or atomically creates one.
      `packages/app/src/App.tsx:345-348` branches on `targetSpaceId`, taking
      `spaceCards.create` for a new Space and `spaceCards.link` for an existing
      one.
- [x] Rename edits the Card's own Title for every kind.
      `packages/ui/src/CanvasCard.tsx:244` gates `onBeginTitleEdit` on
      `readOnly` alone rather than on the Card's kind, and the
      `InlineTitleEditor` it drives is at `:410`.
- [ ] **Delete distinguishes whole-Space deletion from Remove from Layout and
      confirms every cascade before completing one Edit.** The confirmation half
      exists and moves to the Dock with `command-dock/07`. What does not exist
      is a *named* Remove from Layout control: the only way to reach
      `removed-card-from-layout` today is the Delete/Backspace key handler at
      `packages/app/src/components/SpaceCanvas.tsx:803` (and, for an embedded
      Layout, the `removeCard` that same handler calls at
      `packages/app/src/components/EmbeddedLayoutAuthoring.tsx:161`). No string
      "Remove from Layout" is drawn anywhere — the phrase appears only in an
      invariant message and two comments. A key with no visible command does not
      distinguish the two deletions, because the author never sees that there
      are two.
- [ ] **Narrow-screen evidence for the two controls that have none.** Rename,
      Add Card and Add Alias are already exercised at phone width; Add **Space**
      Card and the delete confirmation are not.
      `packages/app/e2e/mobile-sidebar.spec.ts` covers Add Card (`:93`) and Add
      Alias (`:107`) and never opens a Space Card pane or a confirmation dialog
      — its one delete test (`:141`) presses the key and asserts the Card
      survives. That spec is rewritten against the Dock by `command-dock/07`;
      the two missing cases are this ticket's to add to whatever replaces it,
      with keyboard and pointer input. The complete V1 workflow across the
      command surface is `v1-release/06`'s, and it is blocked by this ticket.

## Comments

**Rewritten against the Command Dock, and cut down to what is actually left.**
Two corrections, in the order they matter.

**The surface changed.** ADR 0082 retires the Sidebar as the bound command
surface and `command-dock/07` deletes both Sidebar modules, so this ticket now
lists it as a blocker. The cost of ignoring the order is concrete rather than
theoretical: the delete confirmation this ticket owns is an `AlertDialog` inside
`SpaceSidebar.tsx`, and the narrow-screen evidence it owes would be added to
`mobile-sidebar.spec.ts`, which `command-dock/07` rewrites. Both would be built
and then rebuilt.

**Four of six criteria were already met.** PR #157 (`architecture-review/17`)
collapsed Card creation into one reducer and the kind selection came with it, so
the `Related:` sentence claiming this ticket "adds a third creation pane kind"
described work that had already merged — `card-creation.ts:33` names both
non-Markdown kinds. `entity-url-addressability/07` is resolved and was still
listed as a blocker. Alias Target immutability, the create-or-link branch and
kind-independent rename are all in the tree with the lines cited above.

What survives is one control and two tests: nothing draws Remove from Layout by
name, and the phone branch has never seen a Space Card pane or a confirmation.
Leaving the four ticked criteria open made the ticket read as six pieces of
work, which is how a V1 list stops being a plan and becomes a list of things
nobody has checked.
