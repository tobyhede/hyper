# 02 — An Edge may carry a Title

Status: ready-for-human

**What to build:** An optional, one-line, never-minted `title` on an Edge, through the domain: `graphEdgeSchema`, the aggregate and fixtures rolled forward in one change (the repo is the only source of state), intake, persistence on both SQL stores and the memory adapters, and a `titled-edge` (or similarly named) Edit that sets or clears it.

**Why:** Authors need to annotate an Edge; at a fork, a Title is what tells the presenter's choices apart.

- [ ] An ADR records that an Edge's Title is optional and absent by default, one line, never minted, and that an Edge's identity stays `(from, to)` within its Graph — drawing an existing Edge again still changes nothing.
- [ ] `CONTEXT.md`'s Edge entry says an Edge may carry a Title, and its Selected Edge entry no longer says the controls "reconnect".
- [ ] Setting a Title to empty clears it; the Edit is `unchanged` when the Title does not change.
- [ ] Delete-then-draw does not carry a Title over (decided — reconnect is dropped).
