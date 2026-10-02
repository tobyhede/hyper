# A Map is a Map wherever it is drawn

**Status:** ready-for-agent

Decision: ADR 0112. Blocked by PR #331 (image replacement owns its complete attempt), which composes one image replacement per Space.

## Problem Statement

A Map drawn inside an Open Space Resource is assembled differently from the canvas's own Map. `EmbeddedMapAuthoring` mixes the target Space's authoring with a render adapter built for the embedding, the containing Space's `commandOutcomes` and `deleteConfirmation`, an allow-list of the Edits it may complete (`embedded-authoring.ts`) and an availability built from constants. `SpaceCanvas` then branches between "embedded node" and "host node" for Enter, F2, Delete and connecting. The consequences an author meets:

- An embedded Map offers no creation, no entity menu, no Connect to Resource, no Edge selection or deletion and no image Replace, and nothing records why.
- A refused connection inside it is dropped silently; Enter on an embedded Resource does something different from Enter on the canvas.
- Its notices reset when the *containing* Space's Map changes.
- Read-only is decided in about seven places, and a Reference embedding's Resources never carry `data.readOnly`.
- Back and Forward are held only by the followed Space's image replacement.
- It is authorable only when its target already happens to be an open Space; otherwise there is no authoring at all.

## Solution

One drawn-Map module — a *surface* in code — owns everything a Map does on the canvas, over one Space's own composition, one explicit Map and Graph, and one policy: `authoring | inert | read-only`. The canvas's own Map is the root surface; an embedded Map is the same surface over its target's composition, placed in the containing frame. What differs is only what ADR 0112 records: presenting at the root only, one camera, Edit one level deep, Edges within one Space, and drops refused on an inert or read-only Map.

## Decisions

1. A Map behaves the same wherever it is drawn; every difference is recorded with its reason or is a defect.
2. Edit on an Open Space Resource gates authoring inside it, as the policy value `inert` → `authoring`.
3. Read-only has exactly two sources — shown through a Reference Resource, or a stale or retained Space — computed once and inherited by nested surfaces.
4. Only the root surface presents (ADR 0111).
5. Surfaces nest by construction; only an `authoring` surface can make a child `authoring`.
6. One canvas selection names its surface; keyboard, rail and Undo/Redo dispatch to it, otherwise to the root.
7. Navigation is held while any open Space is replacing an image.
8. Per Space, from its composition: authoring, `commandOutcomes`, continuation, `deleteConfirmation`, Edge Authoring, image replacement. Per surface: the render adapter and its share of the selection.
9. One notice area shows the outcomes of every Space drawn on the canvas.
10. Pointer gestures land in the surface under the point; keyboard creation in the selection's surface; the Dock in the root Space. A drop on an inert or read-only surface is refused with wording.
11. The full entity menu is offered in every surface, acting on that surface's Space.
12. A connection across two surfaces is refused with wording; Connect to Resource offers only Resources of the same surface.
13. Opening a Space Resource admits its target to Open Spaces, with the containing Space as Opener; closing leaves it open.
14. A Reference Resource whose Target is a Space Resource admits that target too and draws it `read-only`.
15. A stale or unavailable target draws its last working state `read-only`, with its own status.
16. The nesting walk is seeded with the root's own Space and Map, so a surface never contains its own Map.
17. *Surface* is a code name and stays out of `CONTEXT.md`.
18. Undo and Redo follow the selection's surface, otherwise the root.

## User Stories

1. As an author, I want an embedded Map to offer every command a Map offers, so that I don't have to Enter a Space to do ordinary work in it.
2. As an author, I want to create Resources inside an embedded Map I am editing, by drop, paste or keyboard, so that the new Resource lands in that Space and Map.
3. As an author, I want the entity menu on a Resource in an embedded Map, so that Rename, Create Reference, Enter, Open in New Tab, Copy link and Remove from Map work there.
4. As an author, I want to replace an embedded Image Resource's picture, so that Replace is not special to the canvas's own Space.
5. As an author, I want to select and delete an Edge in an embedded Map, and Connect to Resource inside it, so that Graph authoring is the same everywhere.
6. As an author, I want a connection between Resources of two different Spaces refused with a reason, so that I learn Edges stay within one Space.
7. As an author, I want a drop on a Map I am only reading refused with a reason, so that it never lands in the Map beneath by accident.
8. As an author, I want an embedded Map's notices shown where I see notices, and kept until they concern something that changed in that Space.
9. As an author, I want Back and Forward held while any image replacement runs, so that a replacement inside an embedded Map keeps its context too.
10. As an author, I want a Reference to a Space Resource to draw its Map exactly as the Space Resource does, only read-only.
11. As an author, I want an unwell embedded Space shown read-only with its own status, so that I can see what it held and why I can't edit it.
12. As an author, I want Undo to undo the Edit in the Space I am working in, so that working inside an embedded Map does not undo the containing Space.

## Tickets

| # | | Status |
| --- | --- | --- |
| 01 | The canvas's own Map is a surface | ready-for-agent |
| 02 | One policy decides authoring, inert and read-only | ready-for-agent |
| 03 | An embedded Map is a surface over its own Space | ready-for-agent |
| 04 | One canvas selection names its surface | ready-for-agent |
| 05 | One notice area for every drawn Space | ready-for-agent |
| 06 | Any open Space's replacement holds navigation | ready-for-agent |
| 07 | Cross-surface connections are refused and a surface never contains its own Map | ready-for-agent |

## Out of scope

- Nested framing (Edit beyond one level).
- Cross-Space Edges and cross-Space presentation (ADR 0111).
- A second React Flow instance or camera for an embedded Map.

## Verification

Each ticket: targeted local typecheck, lint and affected tests, then a draft PR whose `CI passed` gate is observed green. Ticket 03's tests assert the full Map capability list against an embedded Map in `authoring`, and the withheld set against `inert` and `read-only`.
