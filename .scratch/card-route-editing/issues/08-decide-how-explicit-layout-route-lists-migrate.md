# Decide how the pre-release document shape rolls forward

Type: grilling
Status: resolved
Blocked by: 04

## Question

Where and how should disposable stored database aggregates and imported
development Spaces be upgraded when the first-public document contract changes,
without leaving two runtime meanings of Layout or making ordinary application
intake perform hidden persistence work?

## Answer

No compatibility migration belongs in this effort. Hyper is unreleased, so the
repository's current version 2 snapshots, imported directories and local
database rows have no compatibility obligation and are disposable development
data.

The repository rolls forward to one first-public canonical version 1 format.
That format contains UUID identities, explicit Layout Card membership and
positions, Layout-owned ordered Routes, and Routes whose `edges` lists may be
empty from the outset. Runtime intake, the importer and the exporter support
only that version 1 shape. Schemas, tracked fixtures, examples, tests and
accepted design documents are corrected in place rather than preserving a
fictional public format history.

No version 2 importer, document upgrader, PostgreSQL JSONB data migration, dual
runtime schema or migration-only module is built. Existing development database
rows are reset and re-imported, and untracked directories are updated manually.
Incompatible input fails clearly; database startup never rewrites it as a
hidden side effect.

The existing database migration history continues to describe the physical
PostgreSQL schema. Because this decision changes only the canonical JSONB
document contract before release, it adds no data migration to that history.

This ticket is closed as out of scope and intentionally does not appear in the
map's **Decisions so far**: ruling out compatibility work is a boundary around
the destination, not a decision step toward the Card and Route interaction
specification.
