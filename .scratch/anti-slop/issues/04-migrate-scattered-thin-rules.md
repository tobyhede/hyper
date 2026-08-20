# Migrate the remaining scattered rules: unsafe dictionary type, unknown returns, known-value widening

Status: ready-for-agent

## Context

Three rules have low totals spread across many independent files, no file
carrying more than 2 hits after issue 02 removes the boundary-decoder share.
There is no shared root cause to design around here — this is a queue of
independent per-site decisions, not a design exercise, unlike issue 02.

- `no-unsafe-dictionary-type` — 4 prod remaining (`packages/app/src/space-authoring.ts`
  x2, plus whatever issue 02 didn't cover), 6 test, 9 files total.
- `no-unknown-returns` — 5 prod, 9 test, 10 files, max 2/file:
  `packages/core/src/schema.ts` (2), `packages/app/vite-space-http-plugin.ts` (2),
  `packages/persistence/src/observable-state.ts` (1), rest 1-2 each in test files.
- `no-known-value-widening` — 7 prod (6 after issue 02's `http-protocol.ts` hit),
  12 test, 18 files, every file 1-2 hits: `packages/persistence/src/http-protocol.ts`,
  `packages/react-flow-adapter/src/projection.ts`, `packages/app/src/renderer.ts`,
  `packages/app/src/edge-authoring-react.tsx`, `packages/app/workspace-aliases.ts`,
  `packages/app/src/colors.ts` in production; the rest test/story.

## Direction

Work file by file, not rule by rule — several of these files also appear in
issues 03/05/06, so touching a file once for all its remaining anti-slop
findings is more efficient than three separate passes. Each site needs the
same judgment call `research.md` describes: try a named contract or move
validation to the I/O edge first; only fall back to a narrowly-scoped
exception where the value genuinely crosses an external boundary the generic
rule can't model.

Enable each rule in `oxlint.config.ts` as its own count reaches zero — they
don't have to land together since they don't share files systematically.

## Caution

Don't batch-fix these with a single mechanical transform (e.g. blanket
`Record<string, unknown>` -> a shared dictionary type) just because the rule
name suggests one fix shape. The files are unrelated; each needs its own look.
