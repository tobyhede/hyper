# Package hygiene

Source: `/improve-codebase-architecture` review, 2026-08-04 — items found *during*
the Placement work and deliberately scoped out of it, plus one process gap.

Small, independent, none urgent. Filed so they are not rediscovered.

## Issues

- `01` — `LayoutPosition` and `LayoutPoint` are the same type in two packages
  (resolved)
- `02` — `packages/graph/src/index.ts` is uncurated `export *`
- `03` — code/glossary divergences are not being recorded (resolved)
