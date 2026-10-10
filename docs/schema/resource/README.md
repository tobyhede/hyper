# Resource file schema

The JSON Schema (draft 2020-12) for a Resource file: the `resources/<id>.json` that [ADR 0128](../../adr/0128-every-resource-kind-is-a-module-and-a-resource-file-is-json.md) makes every Resource. It is the specification of that format; **it is accepted and not yet built**: intake still reads Markdown with frontmatter until `.scratch/resource-kind-modules/issues/07-json-resource-files-on-disk.md` lands.

- `resource.schema.json` is the core's envelope, `{ id, title, kind, content }`, and dispatches `content` to the built-in kind's schema by `kind`.
- `kinds/*.schema.json` is one schema per built-in kind, the file half of that kind's module. A vendor kind (`vnd.<owner>.<name>`, ADR 0120) brings its own; this schema accepts its `content` as any object, because it cannot know which kinds a build registers.
- `locator.schema.json` is the shared content locator: `{ path, mediaType }` for a file the Resource owns beside its Resource file, or `{ url }` for content it does not own. Markdown takes only the path form, Image only the URL form.
- `examples/` holds one valid Resource file per kind.

What a schema cannot say is left to intake: a Title is normalized before it is stored (ADR 0083), a sidecar must exist, a Target, Space, Map or Graph must resolve, and a kind must be registered.
