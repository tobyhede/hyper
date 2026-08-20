# Combined multi-rule pass on the two boundary-decoder files

Status: ready-for-agent

## Context

`src/persistence/postgres-space-repository.ts` and
`packages/persistence/src/http-protocol.ts` are top offenders in 5 of the 10
non-clean rules and together carry **43 of the 167 production diagnostics
(26%)**, all at the actual DB-revision and wire-decoding boundary:

| Rule | `postgres-space-repository.ts` | `http-protocol.ts` |
| --- | ---: | ---: |
| `no-chained-type-assertions` | 1 | 0 |
| `no-runtime-typeof` | 9 | 4 |
| `no-unknown-parameters` | 6 | 9 |
| `no-shape-in-symbol-names` | 2 | 0 |
| `no-unsafe-dictionary-type` | 2 | 2 |
| `require-safety-comment-for-type-assertion` | 4 | 1 |
| `no-conditional-empty-object-spread` | 2 | 0 |
| `no-known-value-widening` | 0 | 1 |
| **Total** | **26** | **17** |

These are the "genuine missing parse boundary" cases `research.md` says need
real design attention, not a mechanical per-rule fix or a rubber-stamped
exception. One representative example, `postgres-space-repository.ts:65`:

```ts
/**
 * Prisma Next 0.16.0 emits `int8` inputs as `number`, although its codec passes
 * values through unchanged and node-postgres supports bigint parameters. Keep
 * the upstream type workaround isolated here so revisions are never narrowed.
 */
const toDatabaseRevision = (value: bigint): number => value as unknown as number;
```

The invariant is already documented in prose; this needs a `SAFETY:`-form
comment, not a design change — but it's exactly the kind of case where reading
the surrounding code before choosing "convert the comment" vs. "restructure
the boundary" matters, which is why this is one ticket instead of six.

## Direction

Read both files fully before changing anything — the same value likely
triggers more than one rule (e.g. a `typeof` check feeding an unsafe-dictionary
parameter), so fix the boundary shape once rather than rule-by-rule inside the
same file.

For each site: introduce a named parsed contract or move validation to the
actual I/O edge where possible (per `research.md`'s general instruction).
Where the value genuinely crosses an external boundary Zod/TypeScript can't
express directly (e.g. the `bigint -> number` Prisma workaround above), add the
`SAFETY:` comment stating the concrete invariant, not a restatement of the
assertion.

Enable the 5 touched rules in `oxlint.config.ts`, scoped so they only run
where each rule's migration is complete — after this ticket, that means these
two files plus whatever issue 01 already covers. (Full per-rule enablement
happens as later phases finish the rest of the ruleset.)

## Caution

Don't let "these two files are the highest-leverage target" become "fix these
two files for every rule and skip the design work everywhere else" — the
concentration here is real but partial; `no-conditional-empty-object-spread`
and `no-known-value-widening` still have real tails elsewhere (issues 04-05).
