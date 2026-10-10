# 01 — A Resource document is an envelope

Status: ready-for-agent

**What to build:** ADR 0128's document shape, with no change in behaviour. `resourceDocumentSchema`, `resourceSchema` and the snapshot, HTTP and import schemas built from them (`packages/core/src/schema.ts`) become `{ id, title, kind, content }`, where `content` holds what each kind holds today: Markdown `{ source }` (today's `body`), Image `{ url, naturalSize? }`, Reference `{ target }`, Space `{ spaceId, map, graph, framing? }`, Ur `{}`. The discriminated union stays for now, discriminated on `kind`, with each arm's `content` typed; the registry in `02` is what makes `content` unknown to the core.

Resource files do not change in this step: the frontmatter codec in `packages/graph/src/resource-file.ts` maps flat frontmatter to and from the envelope, and Export writes byte-identical files.

**Roll forward in the same change (ADR 0054):** every stored-document fixture, seed and test that builds a Resource document, and `docs/agents/editing-and-persistence.md`'s sentence that `body` is the field and `content` the domain word and that neither is renamed into the other: `content` becomes the envelope's field, and a Markdown Resource's source is `content.source`. The SQL `document` column is jsonb and keeps its type; the repository's revision handling is untouched.

**Acceptance:**

- Every tracked fixture imports and exports byte-identical Resource files.
- `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green, and so are CI's PostgreSQL and SQLite jobs, which read stored documents.
- No reader outside `core` touches a kind field except through `content`.
