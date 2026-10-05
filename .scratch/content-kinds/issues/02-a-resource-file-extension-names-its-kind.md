# 02 — A Resource file's extension claims Markdown for every kind

Status: needs-triage

**Problem:** every Resource is stored as one `.md` file (ADR 0020), whatever its kind. Kinds other than `markdown` write frontmatter only (`serializeResourceFile`, `packages/graph/src/resource-file.ts`), so `harbour.md` in the fixture is an Image Resource with no Markdown in it. The extension claims the media type `text/markdown` for Image, Ur, Reference and Space Resources — the confusion between a kind and a media type that ADR 0120 separates. Folder intake finds Resource files by `*.md` (`src/aggregate-directory/space-directory.ts`, `src/aggregate-directory/aggregate-file.ts`).

**Decision needed (ADR):** either

- keep `.md` as the Resource file container, and say in `CONTEXT.md` that the extension names the container, not the kind; or
- let each kind's Resource file codec (ADR 0120) choose its extension — a Markdown Resource stays `.md`, other kinds take one that does not claim Markdown — and find Resource files by every registered codec's extension rather than by `*.md`.

The second changes the Aggregate directory format settled by ADR 0117 and ADR 0118, so it rolls fixtures, the `hyper-authoring` skill and Export forward in one change (ADR 0054).

**Depends on:** 01 (a missing kind is an Ur Resource) only if the second option is chosen, since a file's extension would then say its kind.
