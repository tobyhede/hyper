# Presenting on the Stage

Status: ready-for-agent

Presenting draws the Active Resource on its own **Stage** over an inert canvas (ADR 0123, superseding ADR 0027 and ADR 0044). This spec carries the treatment ADR 0123 leaves to tickets. It was settled in a grilling session on 2026-10-07, which reaffirmed and extended the decisions of 2026-09-27.

## The problem

Presenting on the canvas was broken in ways the tests did not catch:

- **Framing depended on authoring.** The presented content was drawn at the Closed Size while the camera framed the node at its authored size, so any Resource not at the default size presented small in a corner of a larger frame.
- **Authoring stayed live.** Connection handles showed on the presented Resource and its neighbours, by design.
- **The Map showed through.** The background, neighbouring Resources and Edges sat at the edges of every fit.

The presenting e2e suite never presented an Open or resized Resource, never asserted the content filled the screen, and never asserted the absence of authoring controls.

## Decisions

1. **Presenting leaves the canvas.** The Stage fills the window and draws the Active Resource by kind, never by position, size, Shape or Open state. The canvas stays mounted behind it and is inert.
2. **No authoring while presenting.** Drawing an Edge mid-presentation is given up, with the exception that kept handles live and the tests asserting it.
3. **Browser fullscreen.** Present requests fullscreen on the whole document, so dialogs that portal to the end of the page stay visible. A refusal is tolerated and the Stage fills the window regardless; a presentation opened from a link never gets fullscreen. While presenting that entered fullscreen, leaving fullscreen leaves presenting, and leaving presenting any other way leaves fullscreen. A presentation that never entered fullscreen is not ended by fullscreen events.
4. **Stage geometry.** One fixed 16:9 frame, the largest that fits, letterboxed. Type is sized in container units so it stays crisp at any size. Images fit inside the frame and never clip. Content that overflows scrolls vertically inside the frame, by wheel, trackpad and Page Up or Page Down; the arrow keys stay traversal even while the scroll region has focus.
5. **Leaving presenting returns the canvas unmoved.** The camera never moved. Panning to the Resource presenting ended on is parked.
6. **No transition between Resources in this version.** A crossfade reusing the existing presence hook and motion tokens is parked. No View Transitions API and no animation library.
7. **Where the Stage lives.** The letterboxed frame and its scrolling body are a presentational `Stage` in `@project/ui` that takes children, beside `PresentedResource`. `app` composes it with Navigation and the presenting chrome.
8. **Chrome placement.** The presenting chrome sits in a strip below the frame, which letterboxes in the space above it. What the chrome does, its focus handling and its live region are unchanged.
9. **What is deleted.** The presenting and overview cameras and their padding and duration constants; the projection's presented display, so a canvas Resource is only Closed or Open; the canvas presented-content styles, whose container-unit type rules move to the Stage; the camera prose in the root README and the rendering guide. The overview fit constant stays, because it also frames a Map when the canvas opens.
10. **The zoom ceiling stays at 16.** Its doc comment is rewritten to give the authoring reason, since the presenting one is gone.

## Content by kind

`PresentedResource` already draws each kind and the Stage reuses it unchanged: Markdown through the shared sanitised renderer, an Image Resource's picture, a Reference Resource's name over its Target's content, and the name alone for a Space or Ur Resource.

## Tickets

- `01` Withdraw authoring while presenting.
- `02` Present on the Stage, blocked by 01.
- `03` Retire canvas presenting, blocked by 02.
- `04` Present in fullscreen, blocked by 02.
- `05` Crossfade between Resources on the Stage, parked, blocked by 02.
- `06` Show where presenting ended, parked, blocked by 02.
