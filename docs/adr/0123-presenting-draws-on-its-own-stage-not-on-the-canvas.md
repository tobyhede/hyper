# Presenting draws on its own Stage, not on the canvas

Status: accepted
Supersedes: 0027, 0044
Refines: 0024
Related: 0043, 0064, 0070, 0106, 0113, 0121, 0122

Presenting draws the Active Resource's content on a **Stage**: a surface of its own, separate from the canvas, that fills the window. The canvas stays mounted behind it and is inert while presenting. Nothing on it is reachable, focusable or drawn to the audience. Traversal is unchanged (ADR 0024): the Stage shows one Resource at a time, and the presenting chrome moves along the Active Graph's Edges.

The Stage offers **no authoring**. Nothing that changes the Space is available while presenting. An author who wants a new move leaves presenting, draws the Edge on the canvas and presents again. The chrome reads the Active Resource's outgoing Edges when it renders, so the new move is there without anything further.

What the Stage draws depends on the Resource's kind, through the content `resolveResourceContent` answers, never on how the Resource sits on a Map:

- a Markdown Resource draws its Markdown through the shared sanitised renderer;
- an Image Resource draws its picture, fitted to the frame and never replaced from the Stage;
- a Reference Resource draws its own name over its Target's content, by the single hop ADR 0070 defines;
- a Space Resource and an Ur Resource draw their name alone, as does a Reference Resource whose Target is one.

A Resource's position, size (ADR 0122), Shape (ADR 0121) and Open or Closed state (ADR 0064) are the Map's, and none of them reaches the Stage. A Closed Resource, an Open one and one resized to any size are framed the same way.

## Why the canvas was the wrong surface

ADR 0027 presented on the canvas under camera control, and ADR 0044 made the move one `fitView`. It failed in exactly the way that design invited. Each defect was a correct canvas feature leaking onto a surface an audience watches:

- The presented content was drawn at the Closed Size while `fitView` framed the node, which is the Resource's authored size. A Resource at the default size filled the screen; any other drew small in a corner of a larger frame. ADR 0122 made every Resource's size authored, so which one the audience saw came down to how the author had sized it.
- Connection handles stayed live on the presented Resource and its neighbours, deliberately, so an Edge could be drawn mid-presentation.
- The background, neighbouring Resources and Edges sat at the edges of every fit.

Each could be fixed on its own. But the canvas gains authoring capabilities as the product grows, size and Shape among them since these defects were found, and on the canvas every one needs its own withdrawal while presenting. One that is forgotten breaks presenting silently, which is how these got in, and no test noticed. A separate Stage withdraws them all at once, and makes "fills the window and offers nothing editable" a property of one surface that can be tested directly.

## Cost accepted

- **The spatial move is gone.** ADR 0027 valued the camera travelling across the Map between Resources. The Stage does not show the Map, so there is no camera move to make, and leaving presenting returns the canvas exactly as it was. A transition between Resources may still be drawn on the Stage; it is treatment, not bound here.
- **Drawing an Edge mid-presentation is gone.** The exception that kept connection handles live while presenting, and the tests asserting it, are removed.

## Rejected: fixing each defect on the canvas

Draw the presented content at the node's authored size, withdraw handles while presenting, hide neighbours and the background, and ignore a Shape's outline. It keeps the spatial move, and it keeps the arrangement that produced the defects: an audience surface made of authoring features, each switched off by a rule of its own.

## Negative

- **Do not return presenting to the canvas** without an enforced withdrawal of every canvas authoring capability: one that fails when a new capability is added without one, not a list someone keeps.
- **Do not add authoring to the Stage.** A control that changes the Space belongs to the canvas or the Dock.
- ADR 0024's negative stands: the Stage is not a deck, and no library that models a slide sequence draws it.

## What this does not bind

Frame geometry, typography scaling, how images and overflowing content fit, browser fullscreen, transitions and where the presenting chrome sits are UI treatment. They live in the tickets under `.scratch/presenting-stage/`, in stories and in behaviour tests, where they can change without an ADR.
