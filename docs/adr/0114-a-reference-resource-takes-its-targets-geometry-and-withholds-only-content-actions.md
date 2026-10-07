# A Reference Resource takes its Target's geometry, and withholds only content actions

Status: accepted
Refines: 0070, 0106
Refined by: 0120, 0122
Related: 0009, 0064, 0066, 0068, 0084, 0113

What a Resource's content asks of the canvas is decided from its **resolved content**, not from its stored kind. That covers four things: the size it first Opens to, the floor below which an Open Resize stops before snapping to Close, whether it embeds a Map, and whether its Open front draws a content area above the Title. A Reference Resource resolves to its Target's content (ADR 0070, single-hop by ADR 0009), so it takes all four from its Target. A Reference Resource to a Space Resource first Opens at a Space Resource's Open Size, keeps a Space Resource's resize floor, reports its body height as the Map it embeds needs, and draws no content area. A Reference Resource to an Ur Resource draws no content area either. The one thing a Reference Resource's kind decides is the one ADR 0113 leaves to a kind: its **content actions**. It offers none, because what it shows is its Target's content, read-only.

ADR 0106 made a Reference Resource to an Image Resource first Open at its Target's recorded natural size. That was a special case of this rule, and this ADR generalises it to every Target. ADR 0070 made the Open front draw the Target's content. This ADR extends that to the canvas facts that follow from what is drawn.

So the per-content facts are answered in one place, as functions of a resolved content value, and no caller answers them from the stored kind. The one exception is the kind glyph, which by ADR 0083 is how a Reference Resource is told apart from what it points at. A new kind of content fails to compile there rather than at every caller.

## Considered options

- **Keep deciding from the stored kind, and special-case each Target a Reference Resource can have.** Rejected. That is how a Reference Resource to an Image Resource came to take its Target's Open Size while a Reference Resource to a Space Resource did not. It drew an embedded Map at the default Open Size with the ordinary resize floor, while body-height reporting already treated it as Space-like. Three call sites gave three answers, and each new kind of content adds a case at every one of them.
- **Carry the resolved content on a Closed Resource's node.** Rejected. A Closed display carries no content (ADR 0070). The canvas instead receives the facts it needs while Closed, already answered.
