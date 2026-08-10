# `incomingEdges` has no caller

Status: needs-triage

Surfaced by: review of PR #46, while correcting the curation doc that named it

## Context

`packages/graph/src/traversal.ts:22` exports `incomingEdges(graph, cardId)`.
Nothing calls it. Not the package, not `app`, not the adapter — a repo-wide
search for the identifier finds the definition, the index's curation comment,
ADR 0041's rename listing, and `packages/graph/test/traversal.test.ts`, which is
the only call site in the tree.

It is not on `@project/graph`'s index, and that is the right answer for a name
no consumer writes. But the index's doc block explains an unoffered name by the
offered form standing in front of it, and there is no such form here:
`graphStartCard` calls `graphEntryCards`, and `graphEntryCards` builds its own
`Set` from `edge.to` rather than calling `incomingEdges`. PR #46 had to say so
in the comment, because the alternative was to describe a call that does not
exist.

The module's own doc block also does not claim it. It says these are "the reads
that traversal supports — what a Card's moves are, and where a traversal can
begin". `outgoingEdges` is the first, `graphEntryCards`/`graphStartCard` the
second. `incomingEdges` is neither.

Both directions have an argument, which is why this is filed rather than done:

- **Delete it.** Three lines, one test, no caller, and a curation contract that
  now has to spend a clause explaining a name nothing reaches. `outgoingEdges`
  is used (`packages/app/src/navigation.ts:86`); symmetry with a used function
  is not by itself a reason to keep an unused one.
- **Keep it.** ADR 0040 is accepted and not built, and Remove from Layout
  "removes every incident Edge" (`docs/adr/0040-layouts-own-card-membership-and-routes.md:20`).
  Incident means arriving as well as leaving, so the cascade is a plausible
  first caller — for `incomingEdges` as it stands, not for something new.

## Direction

Decide, don't drift. If it is kept, the reason belongs beside it in
`traversal.ts` — the module doc currently enumerates the reads it supports and
omits this one, so a reader has no way to tell an intended placeholder from a
leftover. If it goes, the function and its `describe` block in
`packages/graph/test/traversal.test.ts` go together, and the index's doc block
loses the clause that exists only to explain it.

Either way this is behaviour-preserving against every current caller, since
there are none.

## Acceptance

- [ ] `incomingEdges` is either removed with its test, or kept with a recorded
      reason a reader can find from the module.
- [ ] The curation doc at the top of `packages/graph/src/index.ts` matches
      whichever answer is taken.
- [ ] `pnpm verify` green.
