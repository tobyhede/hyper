# 07 — `Layout`/`LayoutStrategy` rename

Status: resolved
Type: task
Decision: ADR 0014

Ran **between 02 and 03**, alone, for the reason `docs/agents/workflow.md` gives:
a repo-wide rename conflicts with everything, so it goes early — every ticket
finished before it adds new surface in the old vocabulary, and 03–06 are all
layout call sites.

`Layout` names the authored card→position map (`core`); `LayoutStrategy` names
the function that arranges cards (`graph`). Factories renamed with the type.

| was                 | is                    | where                    |
| ------------------- | --------------------- | ------------------------ |
| `AuthoredLayout`    | `Layout`              | `core/types.ts`          |
| `Layout` (function) | `LayoutStrategy`      | `graph/layout.ts`        |
| `gridLayout`        | `gridStrategy`        | `graph/grid.ts`          |
| `GridLayoutOptions` | `GridStrategyOptions` | `graph/grid.ts`          |
| `positionedLayout`  | `positionedStrategy`  | `graph/positioned.ts`    |
| `elkLayout`         | `elkStrategy`         | `react-flow-adapter`     |
| `elk-layout.ts`     | `elk-strategy.ts`     | module + its test, `git mv` |

Unchanged, deliberately:

- `LayoutGraph`, `LayoutCard`, `LayoutPort`, `LayoutPoint`, `buildLayoutGraph` —
  they belong to the strategy, and "layout" reads there as the mass noun (the
  geometry), not as a `Layout`. Recorded as residual ambiguity in ADR 0014.
- `PositionedLayout`, `positionedLayoutSchema`, `layoutPositionSchema` — these
  name the *data*, which is what a Layout now is.
- `layoutResult`/`laidOut`/`layoutGraph`/`layoutReady` in `App`/`GraphView` —
  all about resolved geometry.
- `packages/app/.scratch/spike/SpikeGraph.tsx` still calls `elkLayout`. It is
  frozen evidence, outside tsc and eslint, and never to be promoted (AGENTS.md).

## Answer

Four call sites in type position, and the rest prose. Docs updated in the same
pass: `CONTEXT.md` (the Layout entry split in two, and View's read-only rule now
turns on whether the view resolved to a Layout), AGENTS.md (opening paragraph,
package boundaries, and the layout gotcha split into a data/behaviour bullet plus
the contract bullet), ADR 0014 written, `Refined by` added to 0005 and 0013.

The rename ships **with** tickets 01 and 02 uncommitted in the tree, which the
workflow's "never let a rename ride along with a structural change" rule wants
split. Commit 01+02 first, then this, as two commits.

`pnpm verify` green — 124 tests, 0 lint errors. `pnpm e2e` green and unchanged,
16 passed: the proof it was behaviour-preserving.
