# An Edge may carry a Title

Status: accepted
Related: 0024, 0032, 0057, 0083

An Edge may carry a **Title**: optional, one line, and absent unless an author writes one. It is the Edge's own content. It takes no part in the Edge's identity, which stays `(from, to)` within its Graph. Beside it an Edge may carry `titleHidden: true`, which says the Title does not draw at rest. Both are stored on the Edge inside the Map's Graph (`graphEdgeSchema`) and authored by three Edits, `titled-edge`, `hid-edge-title` and `showed-edge-title`.

Authors need to annotate an Edge. At a fork the Title is what tells the presenter's choices apart, and until now the only way to name a transition was an extra Resource on the path.

## What a Title is

- **Absent by default and never minted.** No gesture draws a titled Edge. There is no `Edge N` and no copy of an endpoint's Title. Resources, Maps and Graphs mint a neutral name because each is chosen from a list by name. An Edge is chosen by pointing at it, and a line labelled with its own ordinal would be noise on every Edge of a Map.
- **One line, no cap.** The schema refuses a Title containing `\n` or `\r`, and the refusal carries the stable code `edge-title-one-line` (`EDGE_TITLE_ONE_LINE`) on the Zod issue's `params`, as ADR 0057 and `RESOURCE_TITLE_REQUIRED` do. The Edit refuses a draft containing a line break anywhere, rather than folding it, because folding would store something the author did not see. There is no length cap. What a long Title does on a short Edge is the canvas's problem (`edge-toolbar/issues/06`), not the schema's.
- **Stored trimmed and non-empty.** The Edit trims the draft, and an empty draft clears the Title rather than storing `""`, which the schema refuses. Setting the Title an Edge already has is `unchanged`.
- **Identity is unchanged.** Two Edges with the same endpoints and different Titles are still `duplicate-graph-edge`, and the render id stays `${graphId}::${from}::${to}`. Drawing an Edge that already exists still changes nothing. Nothing was drawn, so the Title is not cleared, kept or merged. Every Edit that addresses an Edge finds it by its endpoints (`sameEdge`), never by deep equality: the Edge a surface holds may carry a Title that has changed since.

The one-line rule is local to the Edge. ADR 0083 makes Graph, Map and Space titles single-line too, but no schema refuses a line break in them, and tightening those is a separate change.

## Why `titleHidden` is admitted when per-Edge style is not

Per-Edge colour, dash style, end markers and tags stay out. The line's appearance is the Graph's: a Graph has one colour, and ADR 0100 separates Graphs by where their lines run. A per-Edge style would give an Edge a second way to say which Graph it belongs to, one that disagrees with the first.

`titleHidden` is not a style. It says whether the Edge's *own content* draws at rest, the way Open/Closed says whether a Resource's content draws (ADR 0064). The Edge's line is the Graph's, and its Title is the Edge's, so the choice of whether the Title shows belongs to the Edge. It is authored and persisted rather than view state because it is a decision about this Edge on this Map that the author expects to find again.

It is stored only as `true`. Absent means shown, and `false` is refused, so each state has one spelling and a round trip cannot turn one into the other. The schema refuses `titleHidden` without a `title`, and clearing the Title clears `titleHidden` in the same Edit. Hiding an Edge that has no Title is refused `edge-title-required`. Surfaces keep the eye toggle disabled without a Title (`edge-toolbar/issues/05`), so that refusal is for a caller that ignores it.

**Rejected: Title visibility as a Graph-level or view-level setting.** A Graph-level "show Titles" switch cannot express the case that motivates hiding: one long Title on a crowded fork, hidden while its neighbours stay readable. A view-level setting, whether per viewer or per session, would not persist the author's choice, and the next reader would see the clutter the author had already removed. Either may still be wanted as an extra control over the per-Edge one. Neither replaces it.

## Reconnect is dropped, and a redrawn Edge carries nothing over

The Edge toolbar has no reconnect (`edge-toolbar/issues/05`). Moving an end is Delete, then draw again. The costs are accepted:

- **The Title is lost.** A redrawn Edge is a new Edge with no Title. The Title is not carried over from the deleted one, because nothing links the two.
- **The redrawn Edge is appended.** `outgoingEdges` offers a fork's choices in `graph.edges` order (ADR 0024), so an Edge moved by Delete-then-draw becomes the last choice at its fork. How a presenter orders a fork is deferred to `edge-toolbar/issues/08`.

Until `05` removes the gesture, `reconnected-edge` stays live, and it keeps the stored Edge's Title and `titleHidden` as it moves the endpoint, in place. That keeps a gesture still on the canvas from dropping a Title. It is not a decision that a moved Edge keeps its Title.

## Title, not Label

The word is **Title**. It is the product's one word for an entity's authored name, across Resources, Graphs and Maps, and an Edge's name is the same kind of thing. "Label" is React Flow's word (`EdgeLabelRenderer`, `label`). It stays in the render layer, and `CONTEXT.md` lists it under _Avoid_ for this. Whether the product should say *Name* for its one-line identities, and keep *Title* for a Resource's multi-line Title, is a separate question. It is deferred and not reopened here.

## What it costs

- `graphEdgeSchema` is now `.strict()`. It used to be a plain object that stripped unknown keys. With two optional keys on it, a misspelt `titlehidden` would be dropped on the next save instead of failing intake. So any Edge carrying an undeclared key now fails intake, where before the key was quietly removed. No tracked document carried one.
- There is no migration and no version bump. Edges live inside the stored Space document, and an absent key is the old shape (ADR 0056). The aggregate exporter's canonical rebuild of an Edge had listed `from` and `to` only, which would have dropped a Title on the first export. It now writes the two new keys in a fixed order.
- A surface that rebuilds an Edge from its endpoints now drops a Title without any error. Every such site has to spread or read the stored Edge. The tests on reconnect, removal from a Map and the export round trip hold the ones that exist.
