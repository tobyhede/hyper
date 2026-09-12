# Aggregate directory module

Surfaced by the 12 September 2026 architecture review (candidate 1: one module
owns the Aggregate directory format). Settled in the grilling loop; tickets
implement that decision.

## Decision

One module — `src/aggregate-directory/` — owns the on-disk **Aggregate
directory**: layout, Space-directory I/O (read scan ≡ write remove), identify
(with injected `newId`), and the export helpers that answer "what does this
directory mean to the format?" (prune obsolete Space directories, assert
exportable destination). Byte-canonical helpers and discovery stay private.

Export orchestration (repository load, staging, replace, verify, markExported)
and import door routing stay outside. CLI refusal prose stays in `cli/`.

## Not in scope

Folding staging / replace / repository doors into this module. Collapsing
`import-aggregate`'s result-union renaming.
