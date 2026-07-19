# loadSpace: one call that parses, validates and indexes

Status: open

## Task

Introduce a single intake that turns raw input into a validated, indexed Space, or a list of errors. It subsumes `safeParseManifest` + `validateReferences` + the ad-hoc lookups, so the order can no longer be got wrong and the derivation functions cannot run on an unvalidated space.

Fold the `Array.find` lookups into the index built during intake.

Decide during design: does `Space` stay a plain data value with a separate index, or does intake return a value whose lookup functions close over the index? The former keeps `core` free of behaviour; the latter gives a smaller interface.

## Acceptance

- One call validates shape *and* references.
- Lookups are O(1).
- No consumer can reach a derivation function with an unvalidated space.
- `pnpm verify` green.
