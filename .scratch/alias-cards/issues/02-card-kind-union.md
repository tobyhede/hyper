# Make Card a kind: Markdown | Alias

Status: open

## Context

`cardSchema` is currently flat — `{ id, title, content }` where `content` is a markdown path. Alias needs Card to become a discriminated union. Issue 01 settled the model (ADR 0009, `CONTEXT.md`).

## Task

**Schema (`core`).** Make `cardSchema` a discriminated union on an explicit `kind`, defaulted to `'markdown'` so existing manifests parse unchanged:

- `markdown`: `{ id, title, kind: 'markdown', content }` — `content` as today.
- `alias`: `{ id, title, kind: 'alias', target }` — `target` is a card id, no `content`.

`title` is required on both — an alias carries its own. The `space` kind is **not** added here (deferred; ADR 0001). Watch the Zod mechanics: `discriminatedUnion` needs the discriminant present, so defaulting `kind` to `'markdown'` for the legacy shape needs care (e.g. a preprocess that fills `kind` before the union, or an equivalent). Existing manifests have no `kind` field and must still parse.

**Validation (`graph`, `validateReferences`).** Add three distinct `ReferenceErrorKind`s, checked with the whole manifest in view:

- `unresolved-alias-target` — `target` names no card.
- `alias-self-reference` — `target` is the alias's own id.
- `alias-targets-alias` — `target` resolves to a card whose `kind` is `alias` (the single-hop rule).

No alias-cycle check — single-hop makes cycles unrepresentable.

Keep the split intact: shape in `core`, referential integrity in `graph`.

## Acceptance

- An alias card round-trips through `parseManifest`.
- Each of the three alias faults is reported as its own reference-error kind.
- Existing markdown-only manifests still parse (the example manifest is unchanged by this issue).
- `pnpm verify` green.
