# The graph index doc states the offered-name pairing backwards

Status: resolved

Surfaced by: review of PR #36, reported before merge and not fixed

## Context

`packages/graph/src/index.ts` explains the package's curation rule, and gets one
of its own examples inverted:

```text
 * only callers are inside the package stays in its module, behind the form
 * consumers do call — `cardIdsForGraphs` and `filterHandlesByGraph` behind the
 * plural forms, …
```

Ground truth in `packages/graph/src/graph-rendering.ts`:

| hidden helper | offered form |
|---|---|
| `cardIdsForGraphs` (plural) | `graphCardIds` (**singular**) |
| `filterHandlesByGraph` (singular) | `filterHandlesByGraphs` (**plural**) |

The two pairs run in opposite directions, so "behind the plural forms" is right
for the second and wrong for the first.

This matters more than a stray sentence would elsewhere. This comment *is* the
package's curation contract — `test/unit/graph-package-surface.test.ts` holds
the index's declarations to one list precisely so that adding a name is a
deliberate act, and this doc is what tells the next person which direction
"deliberate" runs in. A reader following it would hide the wrong helper.

Reported during the review of #36 and not fixed before it merged; present on
`main`.

## Direction

State both pairs explicitly rather than generalising over them:

```text
 * consumers do call — `cardIdsForGraphs` behind `graphCardIds` and
 * `filterHandlesByGraph` behind `filterHandlesByGraphs`, …
```

## Acceptance

- [x] The sentence names each hidden helper and its offered form individually.
- [x] Every relation the sentence states is re-derived from the source, and it
      states none that the source does not have.
- [x] No behavioural change; `pnpm verify` stays green.

## Answer

Both pairs are named individually and the sentence no longer generalises over
them. Fixing that exposed a second fault of the same kind, caught by the review
of the fix: the rule the sentence states — a helper "whose only callers are
inside the package" sits "behind the form consumers do call" — does not
describe `incomingEdges`, and the first attempt paired it with `graphEntryCards`
"behind `graphStartCard`", inventing a call that is not there.

Every name in the sentence, re-derived from `graph-rendering.ts`, `traversal.ts`
and the index's own export list:

| absent from the index | what actually holds |
|---|---|
| `cardIdsForGraphs` | `graphCardIds` (offered) calls it — `graph-rendering.ts:121` |
| `graphEntryCards` | `graphStartCard` (offered) calls it — `traversal.ts:71` |
| `outHandleId`/`inHandleId` | `buildCardHandles` (`:70`, `:76`) and `buildGraphRenderEdges` (`:167`, `:168`), both offered, call them |
| `filterHandlesByGraph` | *it* calls the offered `filterHandlesByGraphs` — `graph-rendering.ts:146` |
| `incomingEdges` | nothing calls it; `packages/graph/test/traversal.test.ts` is its only reference |

Two things follow, and the comment now says both.

**"Behind" carried two opposite senses.** For `cardIdsForGraphs`,
`graphEntryCards` and the two handle-id helpers, the offered form is the caller.
For `filterHandlesByGraph` the hidden name is the single-Graph specialisation
written *on* the offered plural. Both are true of what is exported, but a reader
applying one sense to the other pair hides the wrong helper — which is the harm
this ticket opened on.

**`incomingEdges` is behind nothing.** It is unoffered for want of a caller, and
the comment says that rather than naming a form it does not sit under. It stays
in `traversal` as `outgoingEdges`'s mirror; whether it should exist at all is a
separate question and is filed as `04`, because deleting it here would be a
behavioural change this ticket did not ask for.

An earlier revision of this ticket's `Status:` line certified that "the
sentence's other two pairings were checked against the source and are correct as
written". That was never an acceptance criterion and was false for
`incomingEdges`, so it is removed rather than reworded.

The doc block is also rewrapped to the ~80-column fill of its neighbouring
paragraphs. Prettier does not reflow comments, so nothing enforces it.

Comment only: the index exports exactly the names it did, and
`test/unit/graph-package-surface.test.ts` is untouched.
