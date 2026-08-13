# `incomingEdges` has no caller

Status: resolved

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

- [x] `incomingEdges` is either removed with its test, or kept with a recorded
      reason a reader can find from the module.
- [x] The curation doc at the top of `packages/graph/src/index.ts` matches
      whichever answer is taken.
- [x] `pnpm verify` green.

## Answer

**Removed, not kept.** `incomingEdges` is gone from
`packages/graph/src/traversal.ts`, and its `describe` block and its import from
`../src/traversal` are gone from `packages/graph/test/traversal.test.ts`. The
`diamond` fixture stays — `outgoingEdges` and `graphEntryCards` both read it.

The "keep it" argument was that ADR 0040's Remove-from-Layout cascade removes
"every incident Edge", so the cascade was the plausible first caller. That
cascade has since been built, and it did not call this. `withoutIncidentEdges`
in `packages/app/src/snapshot.ts` filters both directions in one pass over each
Graph's edges — it never asks for the arriving edges as a list, because it does
not want a list, it wants the edges that remain:

```ts
edges: graph.edges.filter((edge) => edge.from !== cardId && edge.to !== cardId);
```

Two calls returning arrays nothing keeps would be a worse way to write that, so
the predicted caller arrived and declined. With it decided the other way, the
remaining case was symmetry with `outgoingEdges`, which this ticket already
recorded as not a reason on its own.

What moved:

- `packages/graph/src/traversal.ts` — the function and its one-line doc.
- `packages/graph/test/traversal.test.ts` — the `describe('incomingEdges')`
  block and the name in the internal import.
- `packages/graph/src/index.ts` — the curation doc's third clause, which existed
  only to explain a name that was unoffered "for want of a caller rather than
  behind one". Every hidden helper the paragraph still names now sits behind an
  offered form, in one of the two senses it distinguishes, so the exception it
  was written to record has nothing left to except.

Nothing else changed, and nothing else needed to:

- `test/unit/graph-package-surface.test.ts` never listed it — it was not on the
  index — so the surface guard is untouched and still passes.
- `traversal.ts`'s module doc block needed no edit. It says these are "the reads
  that traversal supports — what a Card's moves are, and where a traversal can
  begin", which this ticket noted `incomingEdges` was neither of. Deleting the
  function is what makes that sentence true rather than something to correct.
- `docs/adr/0041-graph-is-the-first-public-name-for-route.md:113` still names it.
  ADRs are append-only records of what was decided when, and 0041's rename
  listing is accurate about the tree it renamed. Not edited.
- `.scratch/graph-rename/issues/02-…` and
  `.scratch/package-hygiene/issues/02-…` also still name it. Both are resolved
  tickets recording decisions taken while it existed, and `02` in this directory
  is the one that deferred the question here by name. Rewriting either would
  falsify the record that produced this ticket. Not edited.

Behaviour-preserving, as predicted: there were no callers.
