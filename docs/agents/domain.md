# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` + `docs/adr/` at the root. It is a pnpm monorepo, but the five `@project/*` packages are architectural layers of one domain (everything derives from `core`'s schema), not separate bounded contexts, so a single root context fits.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-recursive-spaces.md
│   ├── 0002-layout-view-separation.md
│   ├── 0003-routes-may-conflict.md
│   ├── 0004-cards-are-the-graph.md
│   ├── 0005-layout-is-a-strategy.md
│   ├── 0006-cards-show-titles-in-the-graph.md
│   └── 0007-routes-are-the-only-structure.md
└── packages/
```

For *how* these get written — the grilling loop, when a decision earns an ADR, the verification bar — see `docs/agents/workflow.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

Check an ADR's `Status:` before relying on it — a superseded one is history, not a rule. Its `Refines`/`Refined by` links point at the decisions that narrowed it. Never edit an accepted ADR; see `docs/agents/workflow.md`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (layout/view separation) — but worth reopening because…_
