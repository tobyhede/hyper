# Opening a Card expands it in place

Status: accepted
Supersedes: 0006, 0011, 0037
Refines: 0048, 0063
Refined by: 0066, 0070, 0073
Related: 0024, 0025, 0027, 0036, 0040, 0045, 0051, 0058, 0065

Opening a Card draws its content **on the Card**, by growing that Card on the
canvas where it already sits. There is no surface over the canvas. The Card keeps
its rail, paper, ink and Edges, and changes size. Several Cards may be open at
once.

Which Cards are open is authored. A Layout's placement is a card-to-rect map:
where a Card sits, whether it is Expanded, and how large it is while Expanded.
Opening and closing are therefore Edits, survive reload and export with the
Space. Opening on an Algorithmic View converts it into a Layout under ADR 0025.

## Open and Edit are separate actions

Opening changes Layout state. Editing puts a caret in one open Card's content.
Keeping them separate lets a persisted Layout contain several open Cards without
giving every Card a live editor or making each one compete for the keyboard.

The Card rail exposes the complete interaction:

- A closed Card offers **Edit** and **Open**.
- **Open** expands the Card.
- **Edit** on a closed Card opens it and then begins editing.
- An open Card offers **Edit** and **Close**.
- While editing, **Save** and **Cancel** replace **Edit**. **Close** remains in
  place but is disabled.

Edit on a closed Card composes the same Open operation with the same begin-edit
operation an open Card uses. It is not a second expansion path.

An open Markdown Card draws rendered Markdown through the shared sanitised
renderer. Editing replaces that body with `MarkdownSourceEditor` and focuses it.
There is no commit on blur. Four exits and no more: `Mod-Enter`, `Escape`, Save
and Cancel. `Mod-Enter` and Save commit; `Escape` and Cancel abandon. A click
elsewhere leaves the draft and the editor up. Every exit leaves the Card open.

Close is disabled during editing so the Card cannot collapse out from under a
live caret and an unresolved draft. Keeping the disabled control in its rail
position also prevents the actions from rearranging while the author writes.

## Expanded Cards displace their neighbours

A Card `+x` of an Expanded Card takes that Card's growth on its own `x`, and the
same rule applies on `y`. Growth is summed over every Expanded Card, with every
comparison reading authored coordinates so the result is independent of visit
order.

That displacement is derived and never written to the Layout. Closing removes it
exactly; the authored positions remain what the author wrote. The accepted cost
is a step boundary: a Card crossing an Expanded Card's authored origin may jump
between the two sides of the displacement rule.

## One Card, one renderer and one editor

An Expanded Card is the existing Card with a content region, not a second Card
component. Card kinds own what fills that region under ADR 0051. Markdown at rest
reuses the rendering boundary presentation uses, so the same source cannot be
interpreted by competing Markdown pipelines. Editing uses the one Hyper-owned
CodeMirror wrapper from ADR 0063.

Title editing remains the Title's own interaction under ADR 0065. Content editing
is the Card-level Edit action described here. Only one content edit owns the
keyboard at a time, canvas-wide.

## Three behaviours stay off

**Scroll is not contained.** No `nowheel` is added to an Expanded Card. The wheel
belongs to the canvas everywhere. An open Card that needs more room is resized;
while editing, CodeMirror may scroll its document without turning the Card into a
permanent hole in canvas wheel-panning.

**No 16:9 constraint.** The collapsed Card keeps the presentation silhouette. An
Expanded Card takes the authored rect its document needs.

**The camera does not follow.** The Card grows where the author placed it and the
author travels to it.

## What this replaces

ADR 0006's title-only Card remains the closed state; an open Card also draws its
content. ADR 0011's single-renderer concern is retained by sharing the renderer,
rather than by withholding rendered Markdown from an open Card. ADR 0037's
immediate editing is replaced by distinct Open and Edit actions because expansion
is persisted Layout state rather than a transient visit to one Card.

The transient `openedCardId`, its `openCard`/`closeCard` navigation operations and
the covering Card pane are replaced by Layout-owned expansion. Alias creation is
unaffected: creating a Card that does not exist yet is not opening one.

ADR 0070 replaces the Alias exception: an Alias now uses this Layout-owned Open
operation and fills the Open Card with its immutable Target's content read-only.

## The negative to remember

Open/Close and Edit/Save/Cancel are separate state machines with one composition:
Edit may open first, but opening never begins an edit by itself. During an edit,
Close stays visible and disabled, and blur leaves the draft and editor intact.

Neighbour displacement remains derived. Expanded geometry remains authored. No
content measurement, camera follow, 16:9 constraint or permanent wheel-containment
hole is introduced by opening a Card.
