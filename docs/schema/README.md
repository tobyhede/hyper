# Aggregate directory schemas

JSON Schema (draft 2020-12) for the files of an Aggregate directory ([`docs/aggregate-directory.md`](../aggregate-directory.md)):

- `hyper.schema.json` is `hyper.json` at the directory's root: the format version and the Meta Space's Id. It describes the format as built.
- `space.schema.json` is each Space directory's `space.json`: the Space's title, its Maps, their placements and the Graphs they own. It describes the format as built, as intake reads it: the Space, Map and Graph ids that Export always writes may be omitted by a hand-written file.
- `resource/` is the Resource file, `resources/<id>.json`, which [ADR 0128](../adr/0128-every-resource-kind-is-a-module-and-a-resource-file-is-json.md) accepts and which is not yet built. Its own [README](resource/README.md) says what that means.
- `id.schema.json` is the Id every file shares: a UUID.

The examples of `hyper.json` and `space.json` are the ones in [`docs/aggregate-directory.md`](../aggregate-directory.md).

`@project/core`'s Zod schemas remain the intake; these schemas specify the same shapes for editors and other tools, and `test/unit/aggregate-json-schema.test.ts` holds `hyper.schema.json` and `space.schema.json` to the intake's answers and to that document's examples. What a schema cannot say is left to intake: every Id, placement, `activeGraph`, `defaultMap` and Edge endpoint must resolve inside its Space, Ids must be unique, an Edge appears once in a Graph, an Ur Resource is never Open and is the only kind that takes a non-rectangle Shape, and a Space directory's name must be its Id. The schemas refuse only what intake refuses; intake refuses more.

The schemas assume Ajv's draft 2020-12 validator in strict mode with no formats added: they use no `format` keyword.
