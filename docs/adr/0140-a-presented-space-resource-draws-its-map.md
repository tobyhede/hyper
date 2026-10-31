# A presented Space Resource draws its Map

Status: accepted
Refines: 0123
Related: 0024, 0070, 0112, 0113

A Space Resource on the Stage draws its name over the Map and Graph it selects. The Map is drawn whole, fitted to the room below the name, at full strength and taking no pointer, by the same Map surface that draws it inside an Open Space Resource on the canvas, under the inert policy (ADR 0112). A Reference Resource whose Target is a Space Resource draws the same, by the single hop ADR 0070 defines. When the target Space cannot be held, or has no such Map, the Stage says the Map is not available. To assistive technology the drawing is one image, named by its Map.

ADR 0123 drew a Space Resource by its name alone. A talk that frames each section with a diagram puts those diagrams in Space Resources on its Graph, and on the Stage each one showed a title over an empty frame. That made Space Resources unusable in a presentation.

ADR 0123's "the Stage does not show the Map" is about the Map being presented. That still holds. Presenting draws no camera move across the presented Map, and its placement, size, Shape and Open state still never reach the Stage. What a Space Resource draws here is its own content, the Map it points at, exactly as a Markdown Resource draws its Markdown. An Ur Resource, and a Reference Resource whose Target is one, still draw their name alone (ADR 0113).

## Cost accepted

- **A tall Map draws small.** It is fitted whole to a 16:9 frame, so a Map laid out as a long column has small Titles. A talk lays its diagrams out for the frame they are shown in.
- **Presenting holds the target Space.** The Stage keeps the target Space composed while the slide is shown and releases it when the slide changes, as the canvas does for an Open Space Resource.

## Rejected: drawing the Map from a separate presentation renderer

A second renderer for a presented Map would be a second way to draw a Map, which ADR 0112 rules out. Every difference between the two would be a defect waiting to be found.
