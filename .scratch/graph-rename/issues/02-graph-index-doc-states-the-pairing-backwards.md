# The graph index doc states the offered-name pairing backwards

Status: ready-for-agent

Surfaced by: review of PR #36, reported before merge and not fixed

## Context

`packages/graph/src/index.ts` explains the package's curation rule, and gets one
of its own examples inverted:

```
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

```
 * consumers do call — `cardIdsForGraphs` behind `graphCardIds` and
 * `filterHandlesByGraph` behind `filterHandlesByGraphs`, …
```

## Acceptance

- The sentence names each hidden helper and its offered form individually.
- No behavioural change; `pnpm verify` stays green.
