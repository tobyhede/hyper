# 03 — Build the Space Card lifecycle and aggregate persistence

**What to build:** Add the `space` Card kind, complete Meta-rooted intake, one
authored commit interface and atomic Space creation/deletion.

**Blocked by:** none.

**Status:** ready-for-agent
Tags: release/v1

- [ ] Add `spaceCardSchema`: `kind: 'space'`, an immutable target `spaceId`, and
      optional Space View and Graph selections. Space Card files and single-Space
      snapshots round-trip through intake and canonical Space export.
- [ ] `loadSpace` refuses direct self-reference. Complete aggregate intake is the
      only multi-hop cycle policy; navigation does not carry ancestry as an
      integrity mechanism.
- [ ] Enforce Space Card target immutability in domain authoring. The same-kind
      Card edit must not retarget a Space Card.
- [ ] Add `SpaceAggregate`, the complete intake over a configured `metaSpaceId`
      and every Space snapshot. It loads each Space through `loadSpace`, resolves
      every Space Card target and explicit Space View/Graph selection, permits
      convergence, and rejects duplicate Card Ids across Spaces, dangling
      targets, cycles and unreachable ordinary Spaces. Layout and Graph Ids may
      repeat in different Spaces.
- [ ] Move pure Computed View subject membership into `@project/graph` so
      aggregate intake and rendering share whether a Graph belongs to a selected
      Computed View. Strategies, names and UI stay outside that module.
- [ ] Add a consistent `loadAggregate()` repository/backend read returning
      `metaSpaceId` and every `LoadedSpace`. Normal navigation keeps its lazy
      single-Space load.
- [ ] Add the singleton repository-state record and migration that stores
      `metaSpaceId`; `loadAggregate()` and integrity-affecting commits use it.
      `v1-release/01` owns bootstrap, startup and retirement of mutable Entry
      selection.
- [ ] Replace `commitSpace` and any proposed second aggregate operation with one
      `commit({ changes })` interface across the browser backend, HTTP protocol,
      stored repository, PostgreSQL and memory adapters. A non-empty change set
      creates a snapshot, updates one with its expected revision, or deletes one
      with its expected revision. One update is the ordinary Space-session case.
- [ ] Commit changes name unique Space Ids and snapshot Ids match them. Create
      requires absence; update/delete require presence and the expected revision.
      Success returns assigned revisions and deleted Ids, conflicts return every
      conflicting current value, and aggregate refusals carry stable identities
      and locations.
- [ ] The commit implementation chooses its validation path. A singleton update
      that cannot affect cross-Space integrity may keep the existing compare-and-
      swap path; every topology, selectable Space View/Graph, creation or
      deletion change validates the complete candidate aggregate. Callers never
      select a persistence method or validation policy.
- [ ] PostgreSQL serialises every integrity-affecting transaction on the singleton
      repository-state row; memory uses the equivalent critical section. The
      ordinary integrity-preserving singleton CAS path remains unlocked.
- [ ] Add one session registry owning one live session per Space Id. It derives
      singleton and multi-Space change sets, waits for participating in-flight
      work, installs returned revisions and conflicts together, and evicts
      deleted sessions.
- [ ] Creating a new ordinary Space atomically creates its first Space Card and
      the target's initial Markdown Card, authored Layout and empty Active Graph.
      One supplied title seeds the Card and Space, after which their titles are
      independent. One shared normal-Space initializer supplies this shape to
      ordinary creation and Meta bootstrap. Creating another Space Card may
      reference an existing Space.
- [ ] Deleting a Space Card preserves its target while another reference
      survives. Deleting the last reference atomically deletes the complete
      newly unreachable closure. Every changed or deleted existing Space carries
      its expected revision; a mismatch conflicts the whole change set. No
      soft-delete and no independent Delete Space operation.
- [ ] A surviving reference found in authoritative state makes an incomplete
      deletion proposal conflict and reload. Do not add an aggregate revision.
- [ ] Deleting a Layout or Graph explicitly selected by a Space Card is refused
      until those selections change; aggregate intake never stores a dangling
      selection.
- [ ] Memory, HTTP and PostgreSQL contract tests prove singleton commits,
      create/link/converge/delete changes, complete conflicts, rollback,
      transaction serialization, aggregate-wide Card identity, reachability,
      cycle rejection and every optional Space View/Graph selection combination,
      including default-renderer fallback and later default changes.

## Not in scope

Meta bootstrap and startup (`v1-release/01`), aggregate CLI files
(`v1-release/08`), authoring controls
(`entity-url-addressability/07`), and opening or entering a Space Card
(`space-cards/01`, `entity-url-addressability/08`).
