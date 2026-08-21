# TypeScript 7 and the mechanical typing gaps

Implement ADR 0061 and ADR 0062: move the authoritative compiler to TypeScript 7 behind an asserted TypeScript 6 tooling bridge, then close the two mechanical enforcement gaps that survive the existing `strictTypeChecked` and anti-slop rule sets.

The work is complete when `pnpm verify` proves the compiler it ran is TypeScript 7 or above, when a *new* narrowing type assertion fails lint anywhere in the repository, and when a new union variant fails at every incomplete consumer.

Source: `Hyper TypeScript 7 + Pervasive Typing Agent Skills — Implementation Specification.md` (21 August 2026). This spec keeps that document's Phases 1 and 2 and corrects them against measurement; Phases 3–6 are `.scratch/typing-skills/`.

## What was measured before writing this

Run on the working tree at `f5506ce`, 21 August 2026.

- `typescript@7.0.2` is npm `latest` and ships bin `tsc`. `@typescript/typescript6@6.0.2` exists and ships bin `tsc6` only. `typescript-eslint@8.67` peers `typescript >=4.8.4 <6.1.0`. The dual-package bridge is both necessary and mechanically sound.
- TypeScript 7.0.2 typechecks the root program **clean today** — `pnpm --package=typescript@7.0.2 dlx tsc -p tsconfig.json --noEmit` exits 0 with zero errors — and six of the seven package configs clean.
- `packages/app` fails under TypeScript 7 with exactly two errors, both inside `@ladle/react`'s bundled `typings-for-build/app/src/ui.tsx`. It is `.tsx` source inside `node_modules`, so `skipLibCheck` does not cover it, and TypeScript 6 does not report it. This is the only known migration blocker.
- `@typescript-eslint/no-unsafe-type-assertion` would report **79 errors**: 28 in production, 51 in tests, e2e and configs. Production distribution: `render-adapter.ts` 8, `http-protocol.ts` 5, `space-authoring.ts` 3, `placement.ts` 2, `sidebar.tsx` 2, `AuthorableEdge.tsx` 2, and one each in `card.ts`, `OpenCard.tsx`, `card-file.ts`, `space.ts`, `input-group.tsx`, `postgres-space-repository.ts`.
- `@typescript-eslint/switch-exhaustiveness-check` at the proposed options would report **3 errors**: `packages/app/src/authoring-refusal.ts`, `packages/http/src/backend.ts`, `packages/app/test/space-authoring.property.test.ts`.
- Non-null assertions are already banned in production and exempted in tests (`eslint.config.js:229`), and production is clean. The source document's §10 is a no-op.
- `prisma-next` peers `typescript >=5.9`, satisfied by the 6.0.2 bridge target, so `pnpm contract:check` should survive it — issue 04 proves that rather than assuming it.

## Corrections to the source document

- **It does not know about the anti-slop layer.** `no-chained-type-assertions` already blocks `as unknown as T`; `require-safety-comment-for-type-assertion`, `no-widen-then-assert`, `no-known-value-widening`, the `no-unknown-*` family, `no-unsafe-dictionary-type` and `no-runtime-typeof` already carry much of its §8/§12/§14 doctrine. Only two rules are genuinely new, and the assertion regimes collide — that collision is what ADR 0062 decides.
- **`@typescript/native` is a misleading alias key.** It is not a published package, so as a local alias it would work, but `@typescript/native-preview` *is* a real and different package. Pick a key that cannot be mistaken for it.
- **The toolchain assertion as described only proves the root `tsc`.** `pnpm -r typecheck` runs each package's own binary; the check must cover that resolution too or it is weaker than it claims.
- **There is no demonstrated defect.** The source document lists "unsafe type assertions ... are treated as defects" among its objectives and never shows one. Neither could I: no bug in this repository's history or tracker is traced to a narrowing assertion, and `.scratch/anti-slop/` issue 07 examined every production site under exactly that test and flagged none. An objective is not a problem statement. This is what turned ADR 0062 from a cleanup mandate into a ratchet — see the grilling record below.
- **The cleanup would move judgment out of the code.** Today a justified assertion carries its reason on the line above it. A rule with no baseline pushes each justification into a config file — further from the code, less visible in review, able to go stale unseen. Roughly 93 inline invariants would become roughly 40 config entries.

## The grilling record

ADR 0062 was drafted as *"a narrowing assertion is a defect"* and grilled before acceptance. Three things came out of it and they are the reason the ticket list looks the way it does.

**The problem was not demonstrated.** See the corrections above. The draft asserted a defect class on the source document's authority rather than on evidence, and the evidence points the other way — the existing sites were reviewed, their comments state real invariants, and one of them argues correctly against the very fix the ADR would have imposed.

**What is real is prospective.** `require-safety-comment-for-type-assertion` is satisfied by prose, and prose is the cheapest thing an agent produces. The existing comments survived human-directed review; nothing guarantees the next one does. A comment also does not survive refactoring. That is a genuine gap, and its scope is new code — not the 79 sites already there.

**ESLint has a baseline mechanism, and an earlier note here saying otherwise was wrong.** ESLint 10.7, this repository's version, has bulk suppressions. Verified against the working tree: a generated baseline covers all 79 findings across 39 file entries and re-runs clean; a new file containing an assertion fails; a ninth assertion in `render-adapter.ts`, which has eight suppressed, fails and reports all nine, since a count-based baseline cannot tell which is new; `--prune-suppressions` drops entries as sites are fixed, so the ceiling only lowers.

That removes the cleanup from the critical path. Issues 07 and 08 became design questions to judge on their merits, 09 became a reference list, and 10 dissolved entirely.

The same three-part test was then applied to the exhaustive-switch rule, which had been drafted as a clause of the same ADR. It fails the test — three sites, unsurprising, no credible rejected alternative — so it is issue 05 and nothing more.

A second round tested ADR 0061's own premise, which had been taken from the source document rather than argued. Measured: the full typecheck as `verify` runs it (root plus seven packages) is **19.7s** on TypeScript 6, and the root program alone is 9.6s against 4.4s on TypeScript 7. There is no correctness argument — TypeScript 6 is not wrong about anything here — so the case rests on speed plus the fact that the repository typechecks clean under TypeScript 7 *today*, which is perishable. Migrating now is a lockfile change; migrating in a year is archaeology. Accepted on that basis, with the toolchain assertion carrying independent value regardless: nothing today stops `tsc` silently resolving to the wrong major version.

## Out of scope

Blanket annotation rules (`typedef`, `explicit-function-return-type`, `explicit-module-boundary-types`), a repository-wide branded-primitive campaign, `skipLibCheck: false`, custom lint rules duplicating `typescript-eslint`, tightening the test-only non-null exception, and everything in `.scratch/typing-skills/`.

## Sequence

Issues 01–04 are the migration and land together as one change; nothing else may start until `pnpm verify` is green on TypeScript 7. Issue 05 is independent and cheap. Issue 06 turns the assertion rule on behind its baseline and blocks on nothing. Issue 11 documents both.

Issues 07 and 08 are design questions to judge when someone is in that code anyway; 09 is a reference list, not a work queue; 10 and 12 are closed.

So the whole effort is five tickets — 01, 02, 03, 05, 06 — plus 04 and 11 to prove and document them. `.scratch/typing-skills/` starts after this completes, not alongside it.
