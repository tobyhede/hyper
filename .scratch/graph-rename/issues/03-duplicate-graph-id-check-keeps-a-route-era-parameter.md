# The duplicate-graph-id check keeps a route-era parameter name

Status: resolved

Surfaced by: review of PR #36, reported before merge and not fixed

## Context

`packages/graph/src/validate.ts:75`:

```ts
for (const id of duplicates(space.graphs.map((r) => r.id))) {
```

`r` was for route. **Three of them survived the rename, not one** — the second
sits twelve lines below the first, in the same function:

| site | binding |
|---|---|
| `packages/graph/src/validate.ts:75` | `space.graphs.map((r) => r.id)` |
| `packages/graph/src/validate.ts:87` | `space.graphs.map((r) => r.id)` |
| `packages/graph/src/space.ts:163` | `input.graphs.map((r) => [r.id, r])` |

Trivial on its own, and worth a ticket only because of where it sits. ADR 0041
states its own completion criterion as a repository scan finding no retired
domain names outside historical records, and #36 added
`test/unit/current-domain-vocabulary.test.ts` to enforce exactly that. A
single-letter binding is below what that scan reads — it needs a compound or a
whole word — so the rename's own guard could not see any of the three.

Reported during the review of #36 and not fixed before it merged; present on
`main`.

## Resolution

All three renamed to `graph`, with the property access updated.

**The guard now reads them.** `current-domain-vocabulary.test.ts` gained
`RETIRED_INITIAL_BINDING`, which answers the open question below: worth
reading, once scoped so that it costs nothing in false positives.

A bare ban on the letter is what would make this unaffordable — `r` is
legitimately a result, a row, a request or a repository, and the deny-list that
follows would never stop growing. **Requiring the Graph collection on the same
line removes that cost entirely.** The repo's convention is the domain initial
or the whole word (`(c)`/`(card)`, `(l)`, `(e)`), so a binding introduced over
`graphs` has one correct name and the retired one's initial is not it. The
pattern is pinned in both directions: against the three real sites, and against
`result.rows`, `responses`, `repositories` and a correct `(graph)` binding.

The earlier Direction here said to "check the sibling callback at the layout
loop in the same file". That was the wrong place — the layout callbacks
(`validate.ts:80`, `:140`, `space.ts:164`) all bind `(l)`, correct for layout.
The residue was at `validate.ts:87` and in a different file entirely, which a
file-scoped check would never have reached. The scan found what the pointer
missed, which is the argument for the scan.

## Acceptance

- [x] No `r`-for-route binding remains in `packages/graph/src`.
- [x] No behavioural change; `pnpm verify` stays green.
- [x] `current-domain-vocabulary.test.ts` reads single-letter bindings, scoped
      to the retired initial over a Graph collection.
