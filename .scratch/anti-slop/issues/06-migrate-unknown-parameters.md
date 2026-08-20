# Migrate `no-unknown-parameters`

Status: ready-for-agent

## Context

52 prod / 13 test across 28 files — the largest production rule and the widest
spread: no single file exceeds 9 hits even before issue 02 removes
`postgres-space-repository.ts` (6) and `http-protocol.ts` (9). After issue 02,
the remaining top files are:

| File | Hits |
| --- | ---: |
| `packages/graph/src/space.ts` | 5 |
| `packages/app/vite-space-http-plugin.ts` | 5 |
| `packages/http/src/index.ts` | 3 |
| `packages/app/src/edge-authoring-react.tsx` | 3 |
| `packages/graph/src/card-file.ts` | 2 |
| `src/cli/run.ts` | 2 |
| `packages/persistence/src/observable-state.ts` | 2 |
| `packages/core/src/schema.ts` | 2 |
| `packages/app/src/startup.tsx` | 2 |
| `packages/app/src/placement-rendering.ts` | 2 |
| `packages/app/src/space-authoring.ts` | 2 |
| remaining ~17 files | 1 each |

No dominant file means no single design fix collapses this rule — it needs
sub-splitting by package, not by finding one root cause.

One likely-exception candidate surfaced already: `packages/graph/src/card-file.ts:38`
mirrors Zod's own `safeParse` return shape:

```ts
interface FrontmatterSchema<T extends Frontmatter> {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}
```

This is the boundary parser's own contract, not a missing boundary — a
candidate for a narrowly-scoped, named exception rather than a rewrite, per
`research.md`'s instruction that an exception must name the specific boundary
and carry a concrete rationale.

## Direction

Split by package: `graph` (space.ts, card-file.ts — 7 hits), `app`
(vite-space-http-plugin.ts, edge-authoring-react.tsx, startup.tsx,
placement-rendering.ts, space-authoring.ts — 14 hits), `http`/`persistence`
(index.ts, observable-state.ts — 5 hits), `core` (schema.ts — 2 hits), root
`src/cli` (2 hits), then the remaining single-hit files as a sweep.

For each site: try introducing a named parsed contract or moving validation to
the actual I/O edge first. Only where a function's parameter type is
genuinely dictated by an external contract (Zod's `safeParse`, a framework
callback signature) should it get a scoped exception — name the file/symbol
in `oxlint.config.ts`, not a blanket rule disable.

Enable `no-unknown-parameters` once all sites in scope (fixed or explicitly
excepted) are accounted for.

## Caution

At 52 prod hits this is the single largest production migration outside issue
02. Land it in the package groupings above, and don't let "found one exception
candidate" turn into rubber-stamping the rest of the list as exceptions —
`card-file.ts` is a genuine external-contract case; most of the other 27 files
are not, based on the file list alone.
