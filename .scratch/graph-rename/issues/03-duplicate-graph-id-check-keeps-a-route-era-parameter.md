# The duplicate-graph-id check keeps a route-era parameter name

Status: ready-for-agent

Surfaced by: review of PR #36, reported before merge and not fixed

## Context

`packages/graph/src/validate.ts:75`:

```ts
for (const id of duplicates(space.graphs.map((r) => r.id))) {
```

`r` was for route. It is the last one left in `packages/graph/src`.

Trivial on its own, and worth a ticket only because of where it sits. ADR 0041
states its own completion criterion as a repository scan finding no retired
domain names outside historical records, and #36 added
`test/unit/current-domain-vocabulary.test.ts` to enforce exactly that. A
single-letter binding is below what that scan reads, so the rename's own guard
cannot see it.

Reported during the review of #36 and not fixed before it merged; present on
`main`.

## Direction

Rename the binding to `graph` and update the property access. Check the sibling
callback at the layout loop in the same file for the same residue while there.

## Acceptance

- No `r`-for-route binding remains in `packages/graph/src`.
- No behavioural change; `pnpm verify` stays green.
- Consider whether `current-domain-vocabulary.test.ts` should read
  single-letter bindings against a small deny-list, or whether that is more
  false positives than it is worth. Recording the answer is enough.
