# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` + `docs/adr/` at the root. It is a pnpm monorepo, but the seven `@project/*` packages are architectural layers of one domain (everything derives from `core`'s schema), not separate bounded contexts, so a single root context fits.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, for terms.
- **The current contract for the topic**, where one exists — see [`workflow.md`](workflow.md#current-contracts) for the list and the reading rules. It states the live rules with their reasons and source ADRs.
- **`docs/adr/`** — for a topic without a contract, read the ADRs that touch the area; for one with a contract, open its source ADRs when you need the full argument or the history.

If any of these files don't exist, **proceed silently**. Don't flag their absence or suggest creating them upfront; create them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── README.md                       the accepted set, one line each
│   ├── 0001-recursive-spaces.md
│   ├── 0002-layout-view-separation.md
│   ├── 0003-routes-may-conflict.md
│   ├── 0004-cards-are-the-graph.md
│   ├── 0005-layout-is-a-strategy.md
│   ├── 0007-routes-are-the-only-structure.md
│   └── superseded/                     retired decisions, kept as history
│       ├── 0006-cards-show-titles-in-the-graph.md
│       └── 0008-presentation-is-a-reveal-deck.md
└── packages/
```

For *how* these get written — the grilling loop, when a decision earns an ADR, the verification bar — see `docs/agents/workflow.md`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

**Map shares its spelling with a builtin and an Array method, so code follows ADR 0101's conventions.** No domain value is bound to a local named `map` — a callback's domain initial is `(m)`, and a longer-lived local takes a descriptive name. A `…Map` suffix on one of our identifiers means the entity, never a lookup table (say `…ById`, `…ByKind`). `.map(`, `.flatMap(`, `ReadonlyMap`, `WeakMap`, `MiniMap`, Prisma's `@@map` and a dependency's own names (Zod's `optionsMap`) are foreign and stay as they are.

**Graph is the name for what older records call Route (ADR 0041).** Schemas, code, tests and fixtures say Graph, Graph navigation and Traversal history; Route and Walk survive only in historical records and in qualified HTTP or graph-layout routing prose. Unqualified `Graph` and `GraphEdge` name the domain; a strategy's and the renderer's intermediates are `LayoutStrategyGraph` and `GraphRenderEdge`; the canvas is `SpaceCanvas`. Do not add a Route-named alias.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap to record during domain review.

A superseded ADR lives in `docs/adr/superseded/`, so the top-level listing is the live set; `docs/adr/README.md` states each accepted decision in one line. Check an ADR's `Status:` before relying on it — a superseded one is history, not a rule. Its `Refines`/`Refined by` links point at the decisions that narrowed it. Never edit an accepted ADR; see `docs/agents/workflow.md`.

## Flag ADR conflicts

If your output contradicts an existing ADR or a current contract, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (layout/view separation) — but worth reopening because…_
