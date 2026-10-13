# 01 — A Resource document is an envelope

Status: resolved

**What to build:** ADR 0128's document shape, with no change in behaviour bar the one the Answer records. `resourceDocumentSchema`, `resourceSchema` and the snapshot, HTTP and import schemas built from them (`packages/core/src/schema.ts`) become `{ id, title, kind, content }`, where `content` holds what each kind holds today: Markdown `{ source }` (today's `body`), Image `{ url, naturalSize? }`, Reference `{ target }`, Space `{ spaceId, map, graph, framing? }`, Ur `{}`. The discriminated union stays for now, discriminated on `kind`, with each arm's `content` typed; the registry in `02` is what makes `content` unknown to the core.

Resource files do not change in this step: the frontmatter codec in `packages/graph/src/resource-file.ts` maps flat frontmatter to and from the envelope, and Export writes byte-identical files for every Resource it wrote in full before.

**Roll forward in the same change (ADR 0054):** every stored-document fixture, seed and test that builds a Resource document, and `docs/agents/editing-and-persistence.md`'s sentence that `body` is the field and `content` the domain word and that neither is renamed into the other, and AGENTS.md's ADR 0128 entry, which becomes "partly built: the envelope": `content` becomes the envelope's field, and a Markdown Resource's source is `content.source`. The SQL `document` column is jsonb and keeps its type; the repository's revision handling is untouched.

**Acceptance:**

- Every tracked fixture imports and exports byte-identical Resource files.
- `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green, and so are CI's PostgreSQL and SQLite jobs, which read stored documents.
- No reader outside `core` touches a kind field except through `content`.

## Answer

Built. `resourceSchema` and `resourceDocumentSchema` are envelopes built by one `resourceEnvelope` in `packages/core/src/schema.ts`, sharing the frontmatter's `title` and `kind` rule instances; each kind's fields are a `*ResourceContentSchema`, which the Reference, Space and Image frontmatter schemas extend; the Markdown and Ur frontmatter have no content keys, since a Markdown Resource's source is its file's body. The codec in `packages/graph/src/resource-file.ts` maps frontmatter to the envelope (`decodeEnvelope`) and back (`serializeResourceFile`), so Resource files are unchanged; `packages/core/test/resource-envelope.test.ts` holds the shape, `test/unit/tracked-fixture-aggregate.test.ts` holds the tracked fixture's export a fixed point of Import and Export, and `test/unit/aggregate-round-trip.test.ts` holds a re-export unchanged. The tracked fixture's export was compared once against the export from cb960173, before the envelope, and every file was identical; no test pins that comparison, since the earlier serializer is not in the tree.

One change in what Export writes came with it: Export now writes every field of a stored document's content, in the content schema's key order, so a Space Resource's `framing` is written to its file, and the first Export after this change rewrites the file of every framed Space Resource. The field list Export kept before left `framing` out, so a framed Space Resource lost its framing on the next Import. A file with no `framing` is written byte for byte as before. A development database holding the flat documents is dropped, recreated and re-seeded rather than migrated.

**Since (2026-10-13):** `07` replaced the frontmatter codec this Answer describes with JSON Resource files, and `09` the `*ResourceContentSchema` extends with one content schema per kind; `decodeEnvelope` and `serializeResourceFile` are gone. `07`'s round-trip test holds the byte-for-byte comparison this Answer made by hand.
