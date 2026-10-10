# 07 — A Resource file is a JSON manifest

Status: ready-for-agent

**What to build:** ADR 0128's file format, as `docs/schema/resource/` specifies it. Each Resource is `resources/<id>.json` holding `{ id, title, kind, content }`; manifests are strict at both levels (core keys, then the kind's `content` keys) and a manifest with no `kind` is refused. A content kind locates a file of its content with `{ path, mediaType }` or `{ url }`:

- Markdown: `{ "path": "<id>.md", "mediaType": "text/markdown" }`, a plain Markdown sidecar with no frontmatter, beside its manifest, written and removed with its Resource. A sidecar no manifest names is refused at intake, so a stray `.md` is not silently ignored.
- Image: `{ "url": … }` only, an external URL or `/images/<content-id>` for a stored image whose bytes travel in `images/` (ADR 0118); optional `mediaType` and `naturalSize`.

Each kind's file codec maps the locator to and from the document's `content`. Discovery reads `resources/*.json`; Export writes manifests and sidecars in place (ADR 0119).

**Roll forward in the same change (ADR 0054):** every tracked Resource file under `packages/app/fixture/` and `packages/app/example/`, the Export and Import tests, `docs/aggregate-directory.md`, the `hyper-authoring` skill and `docs/agents/editing-and-persistence.md`'s file-format section, which carries the "accepted, not built" note until this lands.

**Depends on:** 06.

**Acceptance:** a test holds intake and the JSON Schema to the same answers: every example under `docs/schema/resource/examples/` loads, and a table of invalid manifests is refused by both (Ajv 2020 is already in the lockfile transitively; adding it as a dev dependency is part of this issue). Every tracked aggregate round-trips through Import and Export unchanged; `pnpm hyper run` on a temp directory writes manifests and sidecars; no Resource file is `.md` unless it is a sidecar.
