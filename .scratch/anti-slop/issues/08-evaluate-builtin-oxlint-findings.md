# Decide on the 3 unrelated built-in Oxlint findings

Status: needs-triage

## Context

Running Oxlint at all (to host the anti-slop plugin) surfaces its own default
rule categories, independent of anti-slop. Both scan passes found the same 3:

- `unicorn/no-useless-spread` — `packages/persistence/src/observable-state.ts:54`
- `unicorn/no-useless-spread` — `packages/graph/test/card-file.property.test.ts:54`
- `unicorn/no-thenable` — `packages/persistence/test/observable-state.test.ts:69`

This is a separate decision from anti-slop adoption: whether Hyper wants
Oxlint's default categories enabled at all, or wants Oxlint scoped to *only*
the vendored anti-slop plugin and nothing else. Either is defensible — ESLint
already covers general JS/TS linting, so Oxlint's defaults may be redundant
with existing ESLint coverage, or may catch things ESLint's config doesn't.

## Direction

Not scoped by this investigation — needs a human call on whether Oxlint stays
anti-slop-only (`oxlint.config.ts` disables its default categories, these 3
findings become moot) or picks up its defaults too (in which case fix these 3
alongside issue 01, since they're already zero-effort to locate).

## Caution

Don't let this block issues 01-07 — anti-slop's rules and Oxlint's built-in
categories are independently configurable in `oxlint.config.ts`.
