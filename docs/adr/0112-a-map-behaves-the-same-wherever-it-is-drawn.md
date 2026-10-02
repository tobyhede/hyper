# A Map behaves the same wherever it is drawn

Status: accepted
Refines: 0068
Related: 0070, 0079, 0082, 0102, 0105, 0109, 0111

A Map drawn inside an Open Space Resource is a Map. Every command, gesture, refusal and notice a Map offers on the canvas it offers there, against the Space it belongs to. A difference between the two is allowed only when this ADR, or a later one, records it with its reason. A difference without a recorded reason is a defect.

## What this corrects

ADR 0068 settled that editing inside an embedded Space authors that Space, and the edit-portal work built it on the compound canvas. The embedding was then assembled from parts: the target Space's authoring, a render adapter built for the embedding, the containing Space's command outcomes and delete confirmation, an allow-list of the Edits an embedding may complete, and an availability built from constants. The result offered a subset of what a Map offers, and the subset was an accident of what had been wired: an embedded Map could not create a Resource, open the entity menu, choose an Edge's end through Connect to Resource, select or delete an Edge, or replace an image, and nothing recorded why. Its refusals were dropped, its notices lived and died with the containing Space's Map, its read-only state was decided in several places, and Back and Forward ignored work running in it.

## The decision

A drawn Map is one Space's own composition, one Map and Graph named explicitly, and one policy: authoring, inert or read-only.

- **Per Space, from that Space's one composition:** authoring, command outcomes, continuation, delete confirmation, Edge Authoring and image replacement. An embedded Map never borrows them from the Space that contains it.
- **Per drawn Map:** the render adapter that projects it and its share of the canvas selection. The same Space may be drawn twice, showing different Maps.
- **The policy is computed once where the Map is drawn and inherited by every Map drawn inside it.** Read-only comes from exactly two sources: the Map is shown through a Reference Resource, or its Space is stale or retained after a failure, in which case it draws its last working state with that Space's own status. Inert is Read on an Open Space Resource. Only an authoring Map can make a Map inside it authoring, through Edit on that Space Resource, so Edit reaches one level.
- **Every Space whose Map is drawn is an open Space.** Opening a Space Resource, or a Reference Resource whose Target is one, admits its target to Open Spaces with the containing Space as its Opener; closing it leaves the target open, as Enter does. There is one kind of composed Space.
- **One canvas selection names the drawn Map it belongs to.** Keyboard commands, the rail and Undo and Redo act on that Map's Space, or on the canvas's own Space when nothing is selected. A pointer gesture — a drop, an empty Option/Alt drop, a paste at the pointer — lands in the Map under the point. The Command Dock always acts on the canvas's own Space, being that Space's command surface.
- **One notice area** shows the outcomes of every Space whose Map is on the canvas.
- **Navigation is held while any open Space is replacing an image**, wherever the replacement began.
- **A drawn Map never contains its own Map.** The walk that draws nested Maps starts with the canvas's own Space and Map on its path.

## Recorded differences

- **Only the canvas's own Space presents.** Presenting is that Space's Navigation, and presentation stays within one Space (ADR 0111).
- **One camera.** An embedded Map projects into the containing React Flow instance; its framing is authored on the Space Resource rather than being a second viewport (ADR 0068's compound canvas).
- **No nested framing.** Edit on an Open Space Resource reaches one level, as above.
- **An Edge joins Resources in one Space.** A connection between Resources of two different drawn Maps is refused with wording, like any other connection refusal, and Connect to Resource offers only Resources of the same drawn Map.
- **A drop on an inert or read-only Map is refused** with wording rather than falling through to the Map beneath it.

## Rejected

**Keeping the embedding as its own assembly and adding the missing capabilities one at a time.** Each addition would need its own wiring, its own availability input and its own test, and the next capability would be missing again until someone noticed. Image replacement was the first one noticed.

**An optional replacement, creation or menu capability that an embedded Map leaves out.** It encodes the accident as a choice. A capability the composition has is offered; one a recorded difference withholds is withheld by the policy.

**Borrowing the containing Space's command outcomes so notices stay visible.** It ties an Edit's notice to another Space's Map and replacement epoch. The notice area reads every drawn Space instead.

**A composition for an embedded target outside Open Spaces.** It would be a second kind of composed Space, and every rule stated over the open set — the navigation hold first — would need a second statement for it.

## Vocabulary

The rule is stated in domain words: a Map, drawn. The code calls the drawn unit a *surface*, as it calls the render intermediate a *projection*; neither enters `CONTEXT.md`. *Portal* and *nested space* stay avoided.
