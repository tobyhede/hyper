# Gate the documented React Flow mispractices

Status: open

## Why

`findings.md` catalogues what React Flow officially tells implementers, and six of its numbered warnings describe failure modes this adapter can actually reach. Today none of them are gated: React Flow logs a warning into a console nobody reads, and the app keeps rendering something subtly wrong. `presentation.spec.ts` asserts behaviour it names explicitly, and passes happily while React Flow complains.

The point of this work is **not** to test React Flow. It is to make the library's own diagnostics load-bearing, so a future change that violates a documented rule fails a command rather than degrading a screenshot.

## Shape

Three gates, in descending value:

1. **`01` — fail e2e on React Flow console warnings.** One auto-use Playwright fixture covers #002, #004, #008, #010, #013 and #015 across every scenario e2e already drives, with no per-rule test to write or maintain. This is the whole plan's centre of gravity; the other two exist because they catch things the console never mentions.
2. **`02` — unit invariants on the projection.** Every projected edge's `sourceHandle`/`targetHandle` must resolve to a handle that actually exists on the referenced node, and handle ids must be unique per card per side. That is warning #008's precondition, checkable as a pure function over `projectCardNodes` + `projectRouteEdges` with no DOM — so it fails in `pnpm test` in milliseconds, not in `pnpm e2e`.
3. **`03` — handles stay measurable.** `display: none` on a handle silently misplaces edges and produces *no* warning, so the console gate cannot catch it. One assertion.

## Deliberately not tested

- **`React.memo` / render counts.** The perf guide names custom node and edge components, but at fixture scale this is premature, and a render-count assertion is a brittle proxy for a thing we have no measured problem with.
- **`useUpdateNodeInternals`.** Not a test — an open design question (see `AGENTS.md`, and `findings.md` §3.2/§3.10). `01` is the instrument that tells us whether it's a real problem here: if #008 fires, it is. Decide it on that evidence rather than writing a test that asserts today's behaviour.
- **jsdom rendering of React Flow.** The docs' own recommendation is Playwright for anything that renders, which is already this repo's split. The `mockReactFlow()` shim would add a second rendering path to maintain for coverage `01` gets more cheaply.

## Out of scope (separate follow-ups, not tests)

Typing `RoutedEdge` with `EdgeProps<Edge<RoutedEdgeData, 'routed'>>` to delete the `data as …` cast, and `useCallback`-ing the `onNodeClick` arrow in `GraphView`. Both are documented-rule cleanups, neither needs a test of its own — `tsc` gates the first and nothing meaningfully gates the second.
