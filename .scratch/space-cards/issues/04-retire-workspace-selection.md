# 04 — Complete Meta Space startup and import reachability

**Status:** superseded by `v1-release/01` and `v1-release/08`
Tags: release/v1

The chooser retirement landed here. The remaining scope was two independent
pieces and is now recorded without duplication:

- `v1-release/01` owns explicit singleton repository Meta state, bootstrap,
  startup and removal of mutable Entry Space selection.
- `v1-release/08` owns canonical complete-aggregate import/export through
  `hyper.json`.

The earlier requirement to manufacture one direct Meta Space Card for every
imported Space is withdrawn. It would alter an authored DAG, create references
that were not exported and prevent expected deletion cascades. Complete import
instead restores the exact Meta-rooted aggregate.

## Answer

The multi-Space startup chooser and its selection branch are deleted. The
remaining startup and file boundaries are settled in the prototype's accepted
aggregate ADRs, so their dedicated V1 issues replace this mixed handoff.
