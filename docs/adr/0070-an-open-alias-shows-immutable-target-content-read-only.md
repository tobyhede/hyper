# An Open Alias shows its immutable Target content read-only

Status: accepted
Supersedes: 0049
Refines: 0009, 0039, 0046, 0048, 0051, 0064
Related: 0066, 0068, 0069

An Alias chooses its **Target** once, when it is created, and is never retargeted. It remains an ordinary independently titled Card in every other respect: its Title, Layout membership and placement, Graph Edges, Open/Closed state and Open Size remain authorable. Changing those facts edits the Alias or the Layout that contains it; immutability applies only to the Target and to content reached through it.

Opening an Alias is the same Layout-owned Open operation every Card uses. The Open Alias keeps its own Title and renders the Target Card's content read-only through ADR 0009's single-hop resolution. A Markdown Target supplies rendered Markdown without a source editor. A Space Card Target supplies its selected Space View and Graph without controls that change either selection. To author content or content configuration, the author opens the Target Card itself.

The rendering reuses the Target kind's existing content renderer under a read-only capability rather than creating Alias-specific Markdown or Space rendering. Close and Resize remain normal Card operations and persist the containing Layout. A future **Jump to Target Card**, and any shortcut from there into the Target's ordinary Edit interaction, use durable Card navigation under ADR 0069; they do not author the Target in place through the Alias.

## Why

The superseded Alias metadata pane made Opening mean something different for one Card kind and made an existing Card's identity mutable through retargeting. It also exposed configuration instead of the content an Alias exists to show. Read-only resolution preserves one source of truth, makes Markdown and Space Card Targets consistent, and keeps the authoring subject explicit: Card and Layout operations author the Alias occurrence, while content operations author the Target Card.

Creating a new Alias instead of retargeting preserves the meaning of its existing placement and Graph Edges. This costs an explicit delete-and-create sequence when an author chose the wrong Target, which is accepted over silently making an established Card and every Edge naming it represent different content.

## The negative to remember

Do not interpret “read-only” as forbidding ordinary Card or Layout authoring: an Alias can still be renamed, moved, connected, Opened, Closed and Resized. Do not put Target, Markdown source, Space View selection or Graph selection controls on an Open Alias. Do not duplicate the Target kind's renderer to display resolved content.

