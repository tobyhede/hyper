# 01 — Establish the Meta Space lifecycle

Status: ready-for-agent
Tags: release/v1
Blocked by: `architecture-review/12`

**What to build:** Give each repository one permanent Meta Space whose identity
is repository state and whose reachability closure is the complete authored
aggregate.

- [ ] Use `space-cards/03`'s singleton `metaSpaceId` repository state as the one
      Meta identity. It is not an authored Space field, inferred from graph shape
      or represented by the mutable nullable `spaces.entry` flag.
- [ ] First repository initialization establishes the Meta identity through the
      repository lifecycle seam consumed by ticket 16's canonical Default Content
      generator. It does not use the ordinary one-Card new-Space initializer or
      silently seed an already initialized repository.
- [ ] Opening the application without another destination opens the Meta Space's
      canonical URL. Missing or invalid Meta state fails explicitly.
- [ ] Authored commits cannot change or delete `metaSpaceId`, and the Meta Space
      cannot be deleted through Space Card removal. Complete administrative
      import may establish or replace repository Meta state.
- [ ] Creating an ordinary Space happens only through its first Space Card; no
      ordinary Space may remain outside the Meta reachability closure.
- [ ] Remove Entry Space mutation and vocabulary from current implementation:
      retire `spaces.entry`, `setEntry`, `hyper entry` and startup selection by
      repository cardinality.
- [ ] Seeds, fixtures and canonical import/export identify the same Meta Space
      without inventing a second kind of Space.
- [ ] Unit, HTTP, PostgreSQL and browser tests cover Meta initialization,
      canonical startup, invalid Meta state and deletion refusal. Ticket 16 owns
      the exact initialized aggregate and destructive reset evidence.
