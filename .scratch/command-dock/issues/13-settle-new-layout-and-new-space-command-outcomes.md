# 13 — Settle New Diagram and New Space command outcomes

Status: done
Tags: release/v1
Blocked by: nothing.

**Decided.** Every creation command's visible outcome is settled below, including where the author continues and what cancelling does. The creation-gesture half is **ADR 0089**, which this ticket produced; the New Diagram half is treatment and is recorded here, which is where ADR 0082 puts shape decisions.

**This file was written before ADR 0085 and has been rewritten.** Where the history below says Layout read Diagram and where it says Card read Thing. The two premises the ticket was filed on both held at `37e44bc2` and are what the decisions below change.

## What was decided

### New Diagram

**It opens nothing.** The command creates and selects an empty Diagram with its one empty Active Graph in one Edit (ADR 0079), and no other surface appears. `App.tsx`'s `created-diagram` handler stops calling `setDiscloseThings`.

**First working-load initialization opens nothing either.** ADR 0080's repair still authors `Diagram 1` and `Graph 1` on a stored or imported diagramless Space; what goes is the announcement that it did. The orphan-conditional variant was considered and rejected: a rule that fires on *state* fires on navigation too, so merely choosing an empty Diagram from the menu would pop the list open, which is furniture appearing in response to looking at something.

**The author continues in the new Diagram's name.** One Edit, then a `control` continuation onto the Dock's Diagram name, `then: 'rename'` — the same shape `Create Markdown Thing` already spends (`App.tsx:1187-1191`). This is the whole of what happens after the press, and it is what answers the blank-canvas objection that ADR 0079's "existing Things remain outside it until added from the Things View" raises: what an author does with a brand-new empty Diagram is say what it is for, and `Diagram 4` is a placeholder nobody wants. It also gives ADR 0082's keyboard obligation a stated destination, where today focus sits on a menu item that is about to unmount.

**It stays one press.** No naming step before the Edit. Charging two presses for a creation is the defect that killed `CreateMenu` (ticket `16`), and confirmation is for destruction, not for a Diagram that costs nothing to delete. Under the rename continuation a mis-press is self-announcing, because the caret is in the new Diagram's name.

**Cancellation does not arise.** There is no pane and no pre-creation step; V1 has no undo, so the Edit is final on activation.

### The `initialization` chain is dead and goes with it

`App.tsx:311` was the sole consumer. Removing the disclosure removes the whole chain: `working-space.ts:108-109` stops returning `initialization: 'created-diagram'`, `http/index.ts:402` stops writing `X-Hyper-Space-Initialization`, `http/backend.ts:94` stops reading it, `persistence/backend.ts:14` loses the field, and `open-spaces.ts:34,330-331` stops carrying it onto the `OpenSpace` entry. The repair itself is untouched.

`discloseThings` survives, narrowed. The `{ thingId: null }` request *was* exactly the Diagram-creation and first-initialization case; the `{ thingId }` request is the URL-addressed Thing the selected Diagram does not place (ticket `10`), which is a different trigger and stays. So the request type takes a non-null `ThingId`, and the Dock's first-frame seeding of `THINGS_DISCLOSURE_ID` stays for that case.

### New Space

**The `New Space` row is deleted** from `SpaceMenu` (`CommandDock.tsx:1641-1644`), and with it the comment conceding it. It was never a second path to a *command* — both it and the `Create Space Thing` peer called `thingCreation.open('space')`, the identical line. Three grounds: ticket `09`'s precedent, which refused an entity-menu Rename row because "the Dock renames by a click on the name and a menu row would be a second path to one command"; the row failing the rule its own menu is curated by, since `Copy link` and `Exit` act on the Space you are standing in and `New Space` acts on the Diagram that is drawing; and a real defect, because a continuation address is one per creating kind, so cancelling a pane opened from the Space menu landed the caret on the `CreatePeers` glyph instead of the row that was pressed.

The discoverability cost is real and accepted: after this, the only visible route to making a Space is a glyph in the Things cluster. The honest fix for an unlabelled glyph is to label the glyph, not to add a second control that then needs its own continuation address and diverges the moment either side changes.

**`Create Space Thing` completes on activation** (ADR 0089). One press places the Thing at `centreAnchor()` in the Diagram Navigation has selected *at the moment of confirmation* — resolved then rather than closed over, which is the existing rule at `App.tsx:542` and is recorded as the decision rather than left as something a later reader may "simplify" — selects it, and puts the caret in the inline Title editor.

**It always creates a new Space.** Referencing an existing one is the Things Popover's add-Space row, which is link-only and keyboard-reachable. The `NEW_SPACE` sentinel, the `Select` of existing Spaces, and the `choosable` gate that withheld Create until the stored-Spaces listing had been read all go.

**Placement is optimistic.** The Thing is drawn and focused before the two-snapshot lifecycle settles; on refusal it is removed and the reason reported through the Dock's refusal channel, beside `createDiagramRefusal`. The message must name what died, because the author may be typing into the Thing when it goes. Awaiting the commit and leaving a refused creation standing were both rejected; ADR 0089 records why.

**The new Space is `Space N`**, numbered over the containing Space's own Thing titles by a fourth `titles.ts` operation, and the same string is handed to both the Space and the Space Thing so they agree at creation exactly as the pane's typed title did. The divergence afterwards is the existing rule: `CONTEXT.md` already holds that either may be renamed without the other and nothing propagates between them. This makes that divergence the default rather than an edge case, which is the change's main cost.

**It does not Enter.** The canvas stays where it is. Entering would strand the author one level down immediately after a gesture whose visible product is a Thing they just placed in *this* Space, with no undo to climb back with, and it would be the first production caller of `OpenSpaces.enter` — which `entity-url-addressability/08` owns, not this ticket.

### Create Alias

**It leaves the Dock.** An Alias is always created from an existing Thing, which supplies the Target and removes the need for a Target-selection interaction entirely (ADR 0089).

It becomes a `Create Alias` row in the Thing's own command groups (`thingRailActions`, `App.tsx:1010`), beside `Copy link` and above the `Delete Thing` group — a command *about* the Thing, which is what that menu is, inheriting its keyboard route rather than needing one invented. A rail glyph was rejected as permanent width on the most crowded thing on the canvas; a bare shortcut was rejected as a pointer-free command with no visible control. A shortcut may be added on top of the row later.

The label is `Create Alias`, matching the vocabulary the other creations use. `Create Alias of <title>` is the shape `Delete Thing` already rejected, the menu being named for its Thing.

**Placement is a fixed offset from the source Thing**, so the new Alias lands where the author is looking. A free-position search was rejected: that is a placement algorithm, and ADR 0086 put automatic arrangement behind an Edit and out of the render path deliberately. Overlap is authored and the author drags it off.

**The Title is the Target's Title, copied once** and independent thereafter, with the caret in it selected. ADR 0083 keeps the Target's name off the Thing front, so without this the author has no on-canvas indication of what the Alias points at beyond the dotted border. An Alias is apparent from the design, and titles need not be unique.

**The row is disabled on an Alias**, not absent. ADR 0070 forbids an Alias of an Alias, and an Alias is otherwise a regular Thing — so the menu stays consistent with every other Thing's, and the greyed row is where the product reinforces that an Alias is terminal.

### What goes with the panes

`NewSpaceThing.tsx`, `NewAlias.tsx` and `thing-creation.ts` are deleted, along with `returnToCreate`, `presentNewSpaceThingRefusal` and the Alias refusal presenter, and the `space` arm of `ThingCreationInput`. `ContinuationTarget`'s `control` arm **survives**, its two pane names (`'create-alias' | 'create-space-thing'`) replaced by the Diagram rename address the New Diagram continuation needs.

`CreatePeers` becomes two glyphs, markdown and space. Ticket `16`'s reasoning survives — the kind is chosen at creation, so none is a default — but its count does not, and it is amended rather than left titled for a count of three.

`Select` loses its last consumer, which `CLAUDE.md` explicitly tolerates ("`Select` and `Textarea` each spent a while with none and both came back"), and this closes the "one flow asking two ways" seam `docs/agents/ui.md` records. `ThingSearchCombobox` is **not** orphaned: `SelectedEdgeControls.tsx` keeps it for Edge endpoints, and `ThingsPopover.tsx` and `SpaceCanvas.tsx` also consume it. ADR 0070's status block sentence naming it the Alias creation Target picker is what ADR 0089 refines.

## Acceptance

- [x] The chosen visible outcome recorded for every creation command, including continuation and cancellation, before any implementation changes.
- [x] Each outcome proved through application gestures, including reload after a completed creation.
- [x] The Space Thing's optimistic placement proved in both directions: the Thing drawn and focused before the commit settles, and removed with a naming refusal when the lifecycle refuses. **What "removed" turned out to mean is worth recording.** The coordination installs its local Edit and *then* commits, and the promise the application awaits resolves at the installation — so the Thing is drawn and focused while the durable write is still in flight, which is the optimism. A refusal is delivered on that same resolution, *before* anything is installed, so there is never a half-made Thing to take away: `creates nothing and names the Space when the lifecycle refuses` asserts no Thing, no Title editor and the Dock's sentence. Making the placement any more optimistic than that is not possible without a new Edit kind — a Space Thing's schema requires a `spaceId`, a `diagram` and a `graph`, none of which exists until the lifecycle answers.
- [x] Each changed stable-story claim given matching application and Ladle evidence; the retired panes' claims and inventory entries removed. The three pane claims are gone with their stories and both Ladle specs; `Select` and `Dialog` gained `uncataloguedComponents` entries, having lost their last consumers with the panes, and the `thing-pane` CSS block went with `ThingPane` itself.
- [x] Ticket `16` amended for the peer count.
- [x] `CLAUDE.md` brought into line **when the code lands, not before** — it describes what is built, so four of its sentences become false only at that point: `CreatePeers` offering three kinds, `thing-creation.ts` being shared by two panes, `Select`'s one remaining consumer being the Space Thing creation pane, and `ThingSearchCombobox` remaining the Alias creation Target picker. The ADR 0070 entry gains ADR 0089 the same way. No `CONTEXT.md` change is owed: nothing here moves a term, and `Space N` is a default title rather than vocabulary.

Cancellation has no test to own: with no pane, nothing can be cancelled. Note for whoever writes these — the old pane refused cancellation while `submitting` on purpose, because "the Edit completes whether or not the surface that began it is still mounted", so a test that cancelled early never proved what it looked like it proved. Do not port that expectation forward as a no-Edit-after-cancel claim.

## Comments

Captured during ticket `11` implementation, which identified these as product decisions rather than proven branch regressions and left the existing behaviour standing pending an explicit decision. That decision is above. The reviewed handoff's request that New Diagram create and select "without opening another surface" is granted, and extended to the first-initialization case it asked to have decided explicitly.
