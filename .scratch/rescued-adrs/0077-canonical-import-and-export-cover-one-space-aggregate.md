# Canonical import and export cover one Space aggregate

Status: accepted
Refines: 0030, 0074
Related: 0054, 0056, 0075, 0076

The public CLI imports and exports the complete Meta-rooted Space aggregate,
not one Space or an unlabelled batch. Its repository-friendly directory is:

```text
<aggregate>/
  hyper.json
  <space-uuid>/
    space.json
    cards/
      <card-uuid>.md
```

`hyper.json` is a versioned aggregate header containing `metaSpaceId`. Immediate
child directories are the aggregate membership and retain the existing
per-Space `space.json` plus Card Markdown contract. Canonical export names those
directories by Space UUID, but identity remains inside the authored files. A
root `space.json` continues to mean one lower-level Space directory and is not
used to make the Meta Space structurally different.

Every aggregate Space Id is explicit because `hyper.json` and Space Cards name
Spaces. Import may continue minting a missing Card, Layout or Graph Id when
nothing references it; canonical export writes every minted Id explicitly.
Optimistic repository revisions are not authored content and never enter the
files.

Public import requires `hyper.json`. It either initialises an empty repository
or, under `--dangerous-truncate`, atomically replaces the complete aggregate,
including repository Meta identity. It preserves authored references exactly,
validates the complete aggregate before writing, and never manufactures direct
Meta Space Cards for imported Spaces. Raw batches of Space directories remain
available only to internal seeds and fixtures.

The public commands become `hyper export <destination>`, `hyper
<aggregate-path>` and `hyper <aggregate-path> --dangerous-truncate`. The mutable
`hyper entry` command and Space-scoped public export are retired. Administrative
bootstrap and import stay outside the browser's authored commit interface but
reuse the same complete aggregate intake and transactional implementation.

Export reads one consistent `loadAggregate()` result and stages exactly those
Space directories before atomically replacing the destination. It may preserve
root files the aggregate reader ignores and undiscovered contents inside a
retained Space directory, as the single-Space exporter does, but no obsolete
immediate child Space directory survives as aggregate membership. Only after
replacement does export record each captured Space revision through the existing
independent bookkeeping. A process interruption may conservatively leave a Space
marked changed since export; it cannot produce partial authored files, and the
next export corrects the marker. No aggregate export lock or atomic revision-map
protocol is added.

This rejects deriving Meta identity from graph shape, putting a `meta` field in
one authored Space, treating a directory name as identity, and merging an
unlabelled imported batch into the current Meta Space. Each makes a canonical
artifact depend on inference or silently changes the authored reference graph.
