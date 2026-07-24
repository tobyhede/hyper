# The domain model's root is a Space, loaded by `loadSpace`; "manifest" is retired

Status: accepted
Refined by: 0019

The single top-level domain value is a **Space**. `loadSpace(input) → Result<Space, SpaceError[]>` is the only intake: it parses the shape, validates references, and builds an index, so a Space is consistent and O(1)-indexable *by construction*. Everything downstream — `getCard`, `buildCardHandles`, `buildRouteEdges`, the projection, the store — takes a Space, never a loosely-parsed value.

This retires **manifest** entirely. The `Manifest` type, `parseManifest`/`safeParseManifest`, `app/manifest.ts`, and the idea that `graph.json` is "a manifest" all go. Card, Route, RouteStep — the inner types inferred from the schema — stay; only the top-level container was misnamed.

## Why "manifest" is wrong, not just disliked

A manifest is a shipping or cargo ledger: a fixed list of what has already been loaded. That connotation is the opposite of what this value is — an authored world that a person reshapes, routes, and (soon) edits. The word quietly frames the space as a static record. The glossary already scopes file-format words out of the domain (`CONTEXT.md`), and manifest was the one that had leaked into the domain types.

## The three roles editing will split, and what we name now

The load → edit → save round-trip turns today's single value into three:

- **the file** — the serialized form on disk, what load reads and save writes.
- **the edit buffer** — a *mutable* working copy that must tolerate being transiently invalid (a card deleted before the route referencing it is fixed, an id half-typed).
- **the Space** — the validated, indexed, read-only value the views consume.

The load-bearing negative: **a Space cannot also be the edit buffer.** "Consistent by construction" and "freely editable through invalid states" are contradictory in one value. So:

- **Space** means only the validated value. Do not widen it to cover the edit buffer.
- The **edit buffer is a future `Draft`** — deliberately unbuilt and unnamed in the model now. Editing does not exist yet; inventing its type early is speculative structure (scope discipline).
- The **file has no grand domain noun.** It is "the space file" (`space.json`); we rejected minting `Document` or `Source` now, because that vocabulary should be designed with the Draft when editing is real, not guessed at.

## What we accept

**The serialized shape is private to `loadSpace`.** The zod schema still exists, but its output type is an implementation detail behind the intake, not a public domain type. If it needs a name it is file-flavoured (`spaceFileSchema`), never bare `space` — a value that merely passes the schema is not yet a Space — and never `manifest`.

**A repo-wide rename.** `Manifest` → `Space` at every call site is exactly the `space-intake` work; it is not a separable "rename first" pass, because Space is a *stronger* concept than today's parsed value (validated + indexed), not a new spelling of it.

**The root, and the recursion.** `loadSpace` returns the *root* space. A card may itself be a space (ADR 0001), so spaces nest; nested spaces are reached by opening a space-card. The `space` card kind is still deferred in code, so nesting is reserved, not built.

## The cost we accept

A future review will see `loadSpace` with no `Manifest` type and may propose reintroducing one for "the file," or collapsing the edit buffer into `Space` once editing lands. This ADR is that suggestion's answer: manifest was retired for its connotations, and Space is kept narrow on purpose so the edit buffer has somewhere separate to live.
