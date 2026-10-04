# A Map behaves the same wherever it is drawn

Status: accepted
Refines: 0068
Related: 0070, 0079, 0082, 0102, 0105, 0109, 0111
Refined by: 0116

A Map drawn inside an Open Space Resource is a Map. Every command, gesture, refusal and notice a Map offers on the canvas it offers there, against the Space it belongs to. A difference between the two is allowed only when this ADR, or a later one, records it with its reason. A difference without a recorded reason is a defect.

## What this corrects

ADR 0068 settled that editing inside an embedded Space authors that Space, and the edit-portal work built it on the compound canvas. The embedding was then assembled from parts: the target Space's authoring, a render adapter built for the embedding, the containing Space's command outcomes and delete confirmation, an allow-list of the Edits an embedding may complete, and an availability built from constants. The result offered a subset of what a Map offers, and the subset was an accident of what had been wired: an embedded Map could not create a Resource, open the entity menu, choose an Edge's end through Connect to Resource, select or delete an Edge, or replace an image, and nothing recorded why. Its refusals were dropped, its notices lived and died with the containing Space's Map, its read-only state was decided in several places, and Back and Forward ignored work running in it.

## The decision

A drawn Map is one Space's own composition, one Map and Graph named explicitly, and one policy: authoring, inert or read-only.

- **Per Space, from that Space's one composition:** authoring, command outcomes, delete confirmation, image replacement, and Edge Authoring's completion and eligibility. An embedded Map never borrows them from the Space that contains it.
- **Per drawn Map:** the render adapter that projects it. The same Space may be drawn twice, even showing the same Map, so each drawing has an **occurrence**: the path of drawing Resources — Space Resources, or Reference Resources whose Target is one — from the canvas's own Map to it, unique while it is drawn.
- **Per canvas, keyed by occurrence:** the selection, continuation and in-progress gesture state. A request to continue after an Edit carries the occurrence it was made in and is spent only there. If that occurrence stops being drawn before the Edit completes, the Edit stands and the continuation is dropped — nothing is selected, no caret is placed, and no other drawing of the same Map takes it.
- **The policy is computed once where the Map is drawn, as the lower of an inherited ceiling and a local state.** The ceiling only restricts: read-only passes to every Map drawn inside, and every Map below the first embedded level is inert at most. Read-only comes from exactly two sources: the Map is shown through a Reference Resource, or its Space is stale or retained after a failure, in which case it draws its last working state with that Space's own status. The local state is Read or Edit on the Open Space Resource that draws the Map, and Edit is offered only on a Space Resource drawn in the canvas's own Map. An authoring embedded Map still opens, closes and moves the Space Resources in it, those being Edits to its own Map; what they draw is inert.
- **A Space is composed while anything holds it.** Its listing in Open Spaces holds it, and so does each drawing of one of its Maps. Opening a Space Resource, or a Reference Resource whose Target is one, takes a hold on the target's composition without listing it; closing it releases the hold. Exit removes a Space from the listing and releases only the listing's hold, so a Space another Map still draws stays composed, unlisted and without an Opener, and is disposed when its last hold goes. Entering a Space that is only drawn lists it over the composition already held. There is one kind of composed Space with two kinds of holder.
- **One canvas selection names the occurrence it belongs to.** Keyboard commands, the rail and Undo and Redo act on that occurrence's Space, or on the canvas's own Space when nothing is selected. A pointer gesture — a drop, an empty Option/Alt drop, a paste at the pointer — lands in the Map under the point. The Command Dock always acts on the canvas's own Space, being that Space's command surface.
- **One notice area** shows the outcomes of every Space whose Map is on the canvas.
- **Navigation is held while any composed Space is replacing an image**, listed or only drawn, wherever the replacement began.
- **A drawn Map never contains its own Map.** The walk that draws nested Maps starts with the canvas's own Space and Map on its path.

## Recorded differences

- **Only the canvas's own Space presents.** Presenting is that Space's Navigation, and presentation stays within one Space (ADR 0111).
- **One camera.** An embedded Map projects into the containing React Flow instance; its framing is authored on the Space Resource rather than being a second viewport (ADR 0068's compound canvas).
- **No nested framing.** Edit is offered only on a Space Resource in the canvas's own Map; one level down it is withheld, as above.
- **An Edge joins Resources in one Space.** A connection between Resources of two different drawn Maps is refused with wording, like any other connection refusal, and Connect to Resource offers only Resources of the same drawn Map.
- **A drop on an inert or read-only Map is refused** with wording rather than falling through to the Map beneath it.

## Rejected

**Keeping the embedding as its own assembly and adding the missing capabilities one at a time.** Each addition would need its own wiring, its own availability input and its own test, and the next capability would be missing again until someone noticed. Image replacement was the first one noticed.

**An optional replacement, creation or menu capability that an embedded Map leaves out.** It encodes the accident as a choice. A capability the composition has is offered; one a recorded difference withholds is withheld by the policy.

**Borrowing the containing Space's command outcomes so notices stay visible.** It ties an Edit's notice to another Space's Map and replacement epoch. The notice area reads every drawn Space instead.

**Listing every drawn Space in Open Spaces.** Exit would then dispose a composition another Map still draws. Refusing Exit while a Space is drawn traps the author behind an Edit to another Space; letting the embedding stop drawing makes an authored Open state draw nothing; readmitting the Space undoes the Exit. Holds separate being listed from being composed, so none of the three is needed.

**A second kind of composition for drawn Spaces.** Every rule over composed Spaces — the navigation hold first — would need a second statement. A drawn Space is the same composition, held differently.

**Continuation per Space.** Two drawings of one Map share Space, Map and Resource ids, so a per-Space continuation cannot tell which drawing an Edit was made in. The occurrence can.

**Letting an authoring embedded Map enable Edit below it.** Edit would then nest without limit, which is the nested framing this ADR leaves out.

## Vocabulary

The rule is stated in domain words: a Map, drawn. The code calls the drawn unit a *surface*, as it calls the render intermediate a *projection*; neither enters `CONTEXT.md`. *Portal* and *nested space* stay avoided.
