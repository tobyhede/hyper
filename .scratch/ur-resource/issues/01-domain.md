# 01 — Ur Resource in the domain

Status: resolved

**What to build:** a fifth Resource kind, `ur`, with no fields beyond `id`, `title` and `kind`. The frontmatter, import and resource unions in `@project/core` gain the arm; a resource file of kind `ur` carries no body (an empty body round-trips; a non-empty body is refused at intake, the way other non-markdown kinds refuse one). `resolveResourceContent` answers empty content for an Ur Resource, `via: 'self'`, and through a Reference Resource that targets it, `via: 'reference'`. A Reference Resource may target an Ur Resource. Export writes it and import reads it back; the aggregate round trip carries it.

**Acceptance:**
- Schema, intake, lookup, snapshot edits and aggregate export/import accept `kind: 'ur'`.
- `resolveResourceContent` answers an empty `ResourceContent` arm for an Ur Resource, self and through a Reference.
- Property and round-trip tests generate the fifth kind wherever they generate the other four.
- Fixtures and tests roll forward with the format (CLAUDE.md, "The repo is the only source of state").
