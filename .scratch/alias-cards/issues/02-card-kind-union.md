# Make Card a kind: Markdown | Alias

Status: open
Blocked by: 01

## Context

`cardSchema` is currently flat — `{ id, title, content }` where `content` is a markdown path. Alias needs Card to become a discriminated union.

## Task

Extend the schema per the outcome of issue 01, and extend `validateReferences` with the alias rules settled there (at minimum: an alias target must resolve, and must not be the alias itself).

Keep the `@project/core` / `@project/graph` split intact: shape in `core`, referential integrity in `graph`.

## Acceptance

- An alias card round-trips through `parseManifest`.
- Self-referencing and unresolved aliases are reported as reference errors.
- Existing markdown-only manifests still parse (the example manifest is unchanged by this issue).
- `pnpm verify` green.
