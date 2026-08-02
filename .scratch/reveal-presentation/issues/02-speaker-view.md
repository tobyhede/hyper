# Speaker view

Status: superseded by ADR 0024 and ADR 0027; feature remains unbuilt

This ticket's reveal.js implementation premise is no longer valid. A speaker
view may still be wanted, but it needs a new decision designed around traversing
a Route on the graph canvas. The proposal below is retained as historical
evidence and is not an active implementation ticket.

## Context

One of the two features that justified adopting reveal.js (ADR 0008) — building it
by hand is exactly what we chose not to do. README has listed it as a want since
the initial commit: current card, next card, notes, elapsed time.

reveal ships it as a plugin: a second window synchronised over `postMessage`,
reading speaker notes from the deck.

## Task

Enable the notes plugin and give cards somewhere to carry speaker notes.

The modelling question, which is ours and not reveal's: **where do notes live?**

- A convention inside the card's markdown (e.g. a trailing `## Notes` section, or
  an HTML comment) — no schema change, but the reading surface would show them.
- A field on the card in the manifest — a schema change, and it makes notes part
  of the domain rather than an artefact of one view.

Notes are authored content shown to one viewer and not others, which sounds like a
**View** concern expressed as card data. Worth deciding against `CONTEXT.md` before
implementing.

## Acceptance

- A presenter can open a speaker window showing the current and next card.
- Notes never appear on the audience surface, or in the reading surface.
