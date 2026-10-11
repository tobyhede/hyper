# 09 — The kind's module is the one parser of its content

Status: resolved

**Why:** ADR 0128 says `content` becomes unknown to the core and is parsed by the kind's schema. Through ticket 08 it was not: `packages/core/src/schema.ts` restated every kind's content shape in three closed unions (`resourceSchema`, `resourceFileSchema`, `resourceDocumentSchema`), hand-strictening `framing` and `naturalSize` for the file, while the module's own `contentSchema` was read only to put Export's keys in order. A new kind had to edit `schema.ts` three times and `resource-content.ts` once. The architecture review of the kind-module stack found this, as its candidate A.

**What to build** (decided with Toby, 2026-10-11):

1. `content`'s TypeScript type stays a closed union, derived from the registry's modules: `Resource`, `ResourceDocument` and `ResourceFileDocument` are mapped over the registered kinds, so a kind is declared in its module and listed once in the registry.
2. Each kind declares one strict content schema, for a stored document and a Resource file alike. A kind whose file form differs (Markdown's sidecar locator) keeps a second schema on its file codec.
3. The envelope parses `kind` as a string and `content` as unknown, then `content` through the registered kind's schema. A kind no module registers is refused under `kind`.
4. `ResourceContent` is derived from each module's `resolveContent`. `ContentAction` stays, for the content-command candidate.
5. The JSON Schemas in `docs/schema/resource/` stay hand-written; `aggregate-json-schema.test.ts` reads its per-kind lists from `KIND_IDS`, so a registered kind without a schema fails.
6. Content errors read in the kind's own schema's words, under `content.…`; the tests that asserted the unions' messages are updated. No new ADR: this finishes ADR 0128.

**Depends on:** 08.

**Acceptance:** `schema.ts` and `resource-content.ts` name no kind; adding a kind needs its module and its registry line in the core, plus its JSON Schema.

## Answer

Built. `packages/core/src/kinds/registry.ts` derives each kind's content, file content and resolved content from its module, and from them `Resource`, `ResourceDocument`, `ResourceFileDocument` and `ResourceContent`; `contentParser` and `fileContentParser` give the parser of a kind's content from its module, correlated to its kind. `schema.ts` builds the three envelopes with `kind` and `content` open and parses `content` through those, so it names no kind; the per-kind Resource and document schemas are gone. Every kind's content schema, and its nested objects, is strict, and `KindFileCodec` carries the file content's schema (the kind's own unless the kind declares a codec). The stored envelope still strips a key it does not declare; only content is strict at every door.

An unregistered kind is refused at the schema, the one place that refuses it, as "names no kind this build registers" followed by the registered ids, without quoting the kind, because `describeSchemaFailure` folds case and the registered ids are lower case. The envelope and the content are each checked whatever the other answers, so a Resource failing both reports every issue at once (`resource-envelope-diagnostics.test.ts`). `graph/src/space.ts` no longer asserts its stored documents back to `Resource[]`: spreading an id into a `ResourceDocument` now types as a `Resource`. `resource-content.ts` still names kinds in two places, both kept: `ContentAction`'s closed union of each kind's content command (`edit-markdown`, `replace-image`, `author-space-view`), which item 4 keeps for the content-command candidate, and `ContentVia`'s `ReferenceKindId`, because content reached through a Reference Resource is the Reference kind's feature alone. So the Acceptance's "`resource-content.ts` names no kind" is not met; neither name is a quoted kind id or a `<kind>Kind.id`, so `kind-ids-in-modules.test.ts` does not count them.
