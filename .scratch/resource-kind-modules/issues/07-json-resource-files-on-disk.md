# 07 — A Resource file is JSON

Status: ready-for-agent

**What to build:** ADR 0128's file format, as `docs/schema/resource/` specifies it. Each Resource is `resources/<id>.json` holding `{ id, title, kind, content }`; Resource files are strict at both levels (core keys, then the kind's `content` keys) and a Resource file with no `kind` is refused. A content kind locates a file of its content with `{ path, mediaType }` or `{ url }`:

- Markdown: `{ "path": "<id>.md", "mediaType": "text/markdown" }`, a plain Markdown sidecar with no frontmatter, beside its Resource file, written and removed with its Resource. A sidecar no Resource file names is refused at intake, so a stray `.md` is not silently ignored.
- Image: `{ "url": … }` only, an external URL or `/images/<content-id>` for a stored image whose bytes travel in `images/` (ADR 0118); optional `naturalSize`.

Each kind's file codec maps the locator to and from the document's `content`. Discovery reads `resources/*.json`; Export writes Resource files and sidecars in place (ADR 0119).

**Roll forward in the same change (ADR 0054):** every tracked Resource file under `packages/app/fixture/` and `packages/app/example/`, the Export and Import tests, `docs/aggregate-directory.md`, the `hyper-authoring` skill and `docs/agents/editing-and-persistence.md`'s file-format section, which carries the "accepted, not built" note until this lands. Mark AGENTS.md's ADR 0128 entry built, and drop `docs/schema/resource/README.md`'s "not yet built" sentence.

**Depends on:** 06.

**Acceptance:** a test holds the JSON Schema to refusing only what intake refuses — necessary, not sufficient: every Resource file under `docs/schema/resource/examples/` passes the schema and decodes through its kind's file codec, and a table of invalid Resource files records, row by row, whether both refuse it or only intake does. Rows only intake refuses include an Image `url` of `"https://"` and of `"https://exa mple.com/a.png"`, a Markdown `path` naming another Resource's `<id>.md`, and a Reference Target or Space that does not resolve; Reference and Space resolution is also held by a tracked fixture. Two Resource files naming one sidecar are refused, and deleting a Markdown Resource removes only its own sidecar. Ajv is a dev dependency, and `test/unit/aggregate-json-schema.test.ts` already compiles the Resource schema and holds it to the published examples. Every tracked aggregate round-trips through Import and Export unchanged; `pnpm hyper run` on a temp directory writes Resource files and sidecars; no Resource file is `.md` unless it is a sidecar.
