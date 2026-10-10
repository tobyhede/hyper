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

**`path` means a file path only.** The document and the implementation spell the Map's Graphs `graphs`/`activeGraph`. The `path` identifiers left are filesystem paths, the HTTP and product URL paths `@project/http` builds and matches (`productDestinationPath`, `SPACE_COLLECTION_PATH`, Hono's `context.req.path`), or React Flow's own SVG `edge-path` class; do not rename those.

**“Arrangement” is ordinary prose, not a domain entity**, and the code honours `CONTEXT.md` on that. The one deliberate occurrence is `packages/graph/src/layout.ts`, which quotes the avoid-list in its own doc comment. `AuthoringRefusal` uses `placement-pending`, and `CanvasContent`'s third kind is `'resources'`, produced by `canvasContent`'s `hasResourcesOnCanvas`. **`'resources'` is not a synonym for Placement**: it means “Resources are mounted on the canvas”, which stays true while replacement placement is still pending.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap to record during domain review.

A superseded ADR lives in `docs/adr/superseded/`, so the top-level listing is the live set; `docs/adr/README.md` states each accepted decision in one line. Check an ADR's `Status:` before relying on it — a superseded one is history, not a rule. Its `Refines`/`Refined by` links point at the decisions that narrowed it. Never edit an accepted ADR; see `docs/agents/workflow.md`.

## The vocabulary guard

`test/unit/current-domain-vocabulary.test.ts` holds retired words out of the source the repo authors (`packages/**`, `src/**`, `test/**`, `scripts/**` and the root `.ts` configs). **No arm of it scans prose Markdown**, so a retired word in `AGENTS.md`, `CONTEXT.md`, `docs/**` or a skill is a review finding rather than a build failure. Root tool configuration — `eslint.config.js`, `.oxlintrc.json`, `.coderabbit.yaml`, `ci.yml`, the two `pnpm-*.yaml` — is out by construction, each being written in some tool's vocabulary.

- **"workspace" is guarded, not merely avoided.** `CONTEXT.md` retires it for two readings, the loaded Space and the app chrome around it: say Space for the loaded Space, and Dock or canvas for the chrome. The test reads the bare word. pnpm's sense is untouched, and where it is allowed is the exemption list: five modules (`packages/app/workspace-aliases.ts`, the shared `packages/app/database-vite-config.ts` that spends it for both Vite targets, `packages/app/http-server-build.config.ts`, `scripts/check-typescript-toolchain.ts` and its test), each asserted to still contain a hit so an exemption cannot outlive its reason. The dependency protocol is forgiven **by the line, not the file**: a manifest is read like anything else, so a script name, an `imports` entry or a renamed package is still reported.
- **The name `CONTEXT.md` retires for a Space is guarded by shape.** ADR 0010 retired it for the top-level value, and `CONTEXT.md` says it is retired from the code, not merely avoided. The test holds it in two scopes. **Every scannable file** is held to the shapes a domain name is written in: the PascalCase compound in either direction, the camelCase one, the screaming constant, the kebab-case refusal code or test id, and the word capitalised as a noun. **Implementation source** (`src/`, and each package's own `src/`) is held to the bare word as well, because there is no package file to read there and the only surviving sense is ours. So npm's and pnpm's sense stays writable where it is genuinely meant: bare and lowercase, in a comment or a script. Three identifiers naming a parsed package file are masked by spelling, and the retirement notice on `core`'s space-file schema is masked as a quotation; each mask is asserted to still be earning itself.
- **Two blind spots to know before adding an arm.** A retired word carrying an **English suffix** offers no capital, no word boundary and no hyphen, so every compound arm reads straight past it; the Map block has a suffix arm for that (the retired spelling of `mapless`), with the plural ruled out by name so the compound arms keep owning it. And a **cited foreign path** is forgiven by `CITED_PATH` rather than by a shape — React Flow's docs name a section after the retired gerund — so a new arm that reports a URL is working correctly and the mask is what settles it.

## Flag ADR conflicts

If your output contradicts an existing ADR or a current contract, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (layout/view separation) — but worth reopening because…_
