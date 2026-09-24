# Edge toolbar and Edge Title

The selected Edge's controls were a hand-rolled pair of text buttons (`Edit`, `Delete`) on their own raised card, and `Edit` opened a popover of two endpoint pickers — reconnection by keyboard. They did not look or behave like the Command Dock or a Resource's toolbar, and "Edit" named an operation an Edge does not have.

This spec records what a prototype settled. The prototype is Ladle stories under `packages/app/stories/review/edge-toolbar-prototype.stories.tsx` with support in `packages/app/stories/support/EdgeToolbarPrototype*.tsx`, on the throwaway branch `prototype/edge-toolbar`. It is a decision source, not production code: every ticket below reimplements through the `shadcn-first-ui` workflow.

## Decisions

- **Reconnect is dropped.** Moving an end is Delete then draw again. Consequences accepted: a Title on the deleted Edge is not carried over, and the redrawn Edge is appended to its Graph, so it becomes the last choice at a fork when presenting (`outgoingEdges` reads `graph.edges` in order).
- **An Edge may carry a Title**: optional, one line, never minted — absent by default. The word is Title, not Label: it is the product's one word for this across Resources, Graphs and Maps, and "label" is React Flow's render-layer word (`EdgeLabelRenderer`). Whether the whole product should say Name for one-line identities and keep Title for a Resource's multi-line Title is a separate, deferred question.
- **Tags, per-Edge colour and per-Edge style are out.** Colour stays on the Graph; end markers, if wanted, are Graph-level too.
- **Edges no longer animate.** React Flow's `animated` marching dash is off; the Active Graph is told apart by stroke width, opacity and paint order. The line is solid as a result.
- **Toolbar**: `[Edit][Delete]` as icons — the shared `EditIcon` and `DeleteIcon` — in one named `Edge commands` group on the shared command surface, with the Resource toolbar's semantics: one `Toolbar` named `Edge <Title>` (or `Edge <From> → <To>` when untitled). Edit edits the Title, the Edge's only editable property.
- **Revealed on hover or Selection**, as a Resource's rail is, and held while the Title is being written. Hover counts on the line (read through React Flow's own interaction path) and on the Title and toolbar, with a short release so the pointer can cross from the line to the toolbar. Only the Active Graph's Edges reveal commands.
- **Title — the `wire` treatment.** A box on the Edge's midpoint in the Resource's paper (`--canvas-resource-face-rest`), whose 3px border is the Edge's own stroke in the Graph's colour, so the line runs into the box and round it. Type from the Resource: its Title ink and weight at the caption rung (12px). Padding 10px × 4px. At rest a titled Edge shows its Title; an untitled Edge shows nothing.
- **Click to edit (ADR 0065).** While revealed, the Title is a one-activation control named `Edit Title <name>` with the Resource Title's hover (active face, 2px underline in the Graph's colour). Editing swaps in the field **drawn as the Title it replaces** — same box, same type, centred, sized to its content — with the Resource's editing mark (active face, 3px underline). Enter completes, Escape cancels, focus returns to the Title; completing an empty draft clears the Title.
- **A Title fits its Edge.** It is drawn no wider than the Edge's drawn length less the arrowhead and a margin (floor 40px, ceiling 224px), ellipsed, with the full Title in the native tooltip and the field.

## Rejected in the prototype

- `tag` (the Resource's ink border and selected ring): matches the Resource best, but the Graph-coloured line visibly stops at an ink box — the line and the border do not join.
- `caption` (Resource type above an unbroken line): lightest, but the Title floats free of the Edge.
- A `⋯` entity menu holding Rename and Delete Edge: an Edge has too few commands to hide them.
- Endpoint chips (`From ▾ → To ▾`): wider than a short Edge and slid under its Resources; and reconnection is dropped anyway.

## Open

- What a short Edge does with a Title that does not fit — see `issues/06`.
