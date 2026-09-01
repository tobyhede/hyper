# 16 — Make Space Card lifecycle the one multi-Space Edit interface

**What to build:** Deepen Space Card lifecycle so callers provide domain intent
and coordination privately derives, validates and installs the complete Edit.

**Blocked by:** 15 — Derive coordinated Edits behind a browser persistence
barrier.

**Status:** resolved
Tags: release/v1

- [x] Keep exactly the three known lifecycle operations: create a Space Card and
      its new target Space, reference an existing Space, and delete a Space Card
      with the ADR 0074 zero-reference cascade.
- [x] Each operation reads the latest working Spaces after coordination begins;
      no caller supplies a replacement Space snapshot, participant list,
      expected revision or persistence ordering.
- [x] Derive the complete candidate in a private functional core, validate it
      through normal single-Space and aggregate intake, and produce no local
      change when the operation is unchanged or refused.
- [x] Install every participant's authoritative working state before one
      external publication. No observer may see a new target without its Space
      Card, a removed Space Card with its target still locally alive, or only a
      prefix of a deletion cascade.
- [x] Answer the normal `completed`, `unchanged` or `refused` authoring outcome.
      Do not return `CommitResult`; persistence failure and conflict remain
      asynchronous observable state.
- [x] Replace the snapshot-based coordinated `registry.submit(changes)` surface.
      Do not retain a compatibility path or expose the private coordination
      mechanism as a generic application interface.
- [x] Interface tests cover create, existing-target reference, convergence,
      Meta preservation and complete cascade deletion through Space Card
      lifecycle rather than by calling coordination internals.

## Not in scope

Card lifecycle controls, Open or Enter Space Card UI, cross-Space Edges, aliases
targeting Space Cards, or speculative multi-Space operations beyond ADR 0076.

## Answer

`registry.spaceCards(newId)` is the one public multi-Space authoring seam and
offers only create, link and delete. Callers provide domain intent and receive
the normal authoring outcome; private coordination derives participants and
revisions after acquiring the barrier, validates the complete aggregate, and
installs every working participant before the single external publication.
The former generic `registry.submit(changes)` interface is gone.
