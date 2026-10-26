# An Aggregate directory is rooted at `aggregate.json`

Status: accepted
Refines: 0117, 0133

The file at the root of an Aggregate directory, which names the format version and the Meta Space, is `aggregate.json`. It was named for the product, and the product is being renamed. The file's name is now the glossary's name for what it roots, so a later product rename does not touch the format.

## The decision

- **The root file is `aggregate.json`**, and its JSON Schema is `docs/schema/aggregate.schema.json`. Its contents are unchanged: `{ "version": 1, "metaSpaceId": "<id>" }`.
- **No fallback.** Import, Run, Export and a mount read `aggregate.json` and nothing else. A directory holding only the earlier root file is refused as a directory with no `aggregate.json`, in the words every source already uses. An author renames the file with `git mv` in the directory's own repository; nothing else in the directory changes.

## Why

- **Named for what it roots.** "Aggregate" is the term for the Meta-rooted collection (ADR 0088), and an Aggregate directory is its on-disk form. A file named for the product breaks every directory whenever the product's name changes; one named for the concept does not.
- **No compatibility to keep.** InfinityCube is unreleased, and every database and fixture in this repository is derived from tracked sources. The only directories outside it are authors' own talk repositories, where the move is one `git mv`. Reading two names would make every source, the scan and the refusal wording carry a rule that exists for one rename.

## Rejected

- **`space.json` at the root.** One file name throughout, but each Space directory already holds a `space.json`, its Map, Graphs and Edges. The root and a single Space directory would then differ only in what the file holds, so intake would tell them apart by shape, and a person reading a listing could not tell them apart by name. Refusing a single Space directory pointed at by Run, Import or a mount depends on the two names being different.
- **A root file named for the new product.** It keeps the convention, and repeats this break at the next rename.
- **Reading the earlier name as well.** See above: a permanent rule in every source, for a move an author makes once.
