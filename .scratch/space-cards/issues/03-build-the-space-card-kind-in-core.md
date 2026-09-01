# 03 — Build the Space Card lifecycle and aggregate persistence

**What to build:** Add the `space` Card kind, complete Meta-rooted intake, one
authored commit interface and atomic Space creation/deletion.

**Blocked by:** none.

**Status:** resolved — merged by PR 134 (`67ec0371`)
Tags: release/v1

The merged foundation supplies complete aggregate intake, `loadAggregate()`,
the unified `commit({ changes })` contract, repository Meta state, coordinated
sessions and one live session per Space Id. Its recorded follow-ups are owned by
the V1 critical path; do not split or reschedule this delivered umbrella.

- [x] Add `spaceCardSchema`: `kind: 'space'`, an immutable target `spaceId`, and
      optional Space View and Graph selections. Space Card files and single-Space
      snapshots round-trip through intake and canonical Space export.
- [x] `loadSpace` refuses direct self-reference. Complete aggregate intake is the
      only multi-hop cycle policy; navigation does not carry ancestry as an
      integrity mechanism.
- [x] Enforce Space Card target immutability in domain authoring. The same-kind
      Card edit must not retarget a Space Card.
- [x] Add `SpaceAggregate`, the complete intake over a configured `metaSpaceId`
      and every Space snapshot. It loads each Space through `loadSpace`, resolves
      every Space Card target and explicit Space View/Graph selection, permits
      convergence, and rejects duplicate Card Ids across Spaces, dangling
      targets, cycles and unreachable ordinary Spaces. Layout and Graph Ids may
      repeat in different Spaces.
- [x] Move pure Computed View subject membership into `@project/graph` so
      aggregate intake and rendering share whether a Graph belongs to a selected
      Computed View. Strategies, names and UI stay outside that module.
- [x] Add a consistent `loadAggregate()` repository/backend read returning
      `metaSpaceId` and every `LoadedSpace`. Normal navigation keeps its lazy
      single-Space load.
- [x] Add the singleton repository-state record and migration that stores
      `metaSpaceId`; `loadAggregate()` and integrity-affecting commits use it.
      `v1-release/01` owns bootstrap, startup and retirement of mutable Entry
      selection.
- [x] Replace `commitSpace` and any proposed second aggregate operation with one
      `commit({ changes })` interface across the browser backend, HTTP protocol,
      stored repository, PostgreSQL and memory adapters. A non-empty change set
      creates a snapshot, updates one with its expected revision, or deletes one
      with its expected revision. One update is the ordinary Space-session case.
- [x] Commit changes name unique Space Ids and snapshot Ids match them. Create
      requires absence; update/delete require presence and the expected revision.
      Success returns assigned revisions and deleted Ids, conflicts return every
      conflicting current value, and aggregate refusals carry stable identities
      and locations.
- [x] The commit implementation chooses its validation path. A singleton update
      that cannot affect cross-Space integrity may keep the existing compare-and-
      swap path; every topology, selectable Space View/Graph, creation or
      deletion change validates the complete candidate aggregate. Callers never
      select a persistence method or validation policy.
- [x] PostgreSQL serialises every integrity-affecting transaction on the singleton
      repository-state row; memory uses the equivalent critical section. The
      ordinary integrity-preserving singleton CAS path remains unlocked.
- [x] Keep one live session and optimistic revision per Space Id. Space Card
      lifecycle owns the domain-shaped multi-Space Edit interface from ADR 0076;
      callers never submit replacement snapshots or participant sets. Its
      private coordination places one browser-wide persistence barrier, derives
      from the latest working Spaces, installs and publishes participants
      atomically, and resolves shared persistence outcomes together. Delivery is
      split across `space-cards/15`–`17`.
- [x] Creating a new ordinary Space atomically creates its first Space Card and
      the target's initial Markdown Card, authored Layout and empty Active Graph.
      One supplied title seeds the Card and Space, after which their titles are
      independent. One shared normal-Space initializer supplies this shape to
      ordinary creation and Meta bootstrap. Creating another Space Card may
      reference an existing Space.
- [x] Deleting a Space Card preserves its target while another reference
      survives. Deleting the last reference atomically deletes the complete
      newly unreachable closure. Every changed or deleted existing Space carries
      its expected revision; a mismatch conflicts the whole change set. No
      soft-delete and no independent Delete Space operation.
- [x] A surviving reference found in authoritative state makes an incomplete
      deletion proposal conflict and reload. Do not add an aggregate revision.
- [x] Deleting a Layout or Graph explicitly selected by a Space Card is refused
      until those selections change; aggregate intake never stores a dangling
      selection.
- [x] Memory, HTTP and PostgreSQL contract tests prove singleton commits,
      create/link/converge/delete changes, complete conflicts, rollback,
      transaction serialization, aggregate-wide Card identity, reachability,
      cycle rejection and every optional Space View/Graph selection combination,
      including default-renderer fallback and later default changes.

## Not in scope

Meta bootstrap and startup (`v1-release/01`), aggregate CLI files
(`v1-release/08`), authoring controls
(`entity-url-addressability/07`), and opening or entering a Space Card
(`space-cards/01`, `entity-url-addressability/08`).

## Answer

The Space Card kind, Meta-rooted aggregate intake, aggregate-aware commit
contract and atomic create/link/delete lifecycle are built across core, graph,
HTTP, persistence and application composition. ADR 0076 completes the browser
side with a domain-shaped lifecycle instead of a generic snapshot-submit seam:
private coordination acquires one browser-wide barrier, derives every
participant from the latest working sessions, validates and installs them
atomically, and resolves success, retry, conflict, rejection and recovery for
the complete Edit together. Tickets 15–17 contain the focused delivery record.

## Follow-ups recorded by PR 134

The merge review deliberately left Meta initializer convergence to V1/01,
Space Card deletion integration and uncommitted-sibling policy to entity URL 07,
structured refusal transport to V1/17, restored HTTP wire-policy proof to V1/18,
and ordinary-commit/read locking optimization beyond V1 unless measured as a
checkpoint blocker.
