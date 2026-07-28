# Derive a card's id, path and source bytes once, at load

Status: superseded by ADR 0030
Type: task

ADR 0030 makes PostgreSQL the live write model and files a canonical
import/export format. Hyper therefore retains neither source bytes nor file
paths through an editing session, and this optimization is no longer work the
target architecture needs.

The mapping from a card's id to where it lives and what it says is derived **three times** from the same bytes, by three pieces of code, at two different moments.

1. `loadSpace` parses every card file at startup and builds `pathById` — id to path — to detect duplicate ids. Then it discards it. `Card` carries no path, and the `Space` carries no map.
2. `space.ts` re-parses every card file to build `cardSource`, id to original text, so a save can send the bytes it read rather than a re-serialization.
3. `cardPathById` re-scans the space directory at **save time**, re-reads every card file, and re-parses each frontmatter to rebuild the same id-to-path map `loadSpace` already had.

Each of the three is individually defensible and together they are a structure nobody chose. Everything needed is known at load; only the reading of it is scattered.

## What this has already cost

The three derivations used **two different readers** of the same bytes — a YAML parser in intake, a regex on the save path — and they disagreed on `id: intro # note`. Consequences: `parseSavedSpace` requires the envelope id to equal the card's own, so such a card could not be saved at all; and had it got past that, the writer would have missed the existing file and dropped a duplicate in `cards/`. Fixed in `f41bfa4` by making them share `cardFileId`.

That fix addressed the disagreement, not the duplication. Three readers that agree are still three readers, and the next divergence has the same shape.

## The constraint that shapes any fix

**The client must never name a path.** An endpoint accepting one from the browser is an arbitrary-file-write primitive for any page the human has open — it is why `CARD_ID` bounds an id to a bare slug, and why the endpoint derives every path itself. So "model the filename in the client and send it" is exactly the door that stays shut.

The server does not need the client's help. It scanned the directory to build the virtual module in the first place, and it is the only thing allowed to know about paths.

## Shape of the fix

`loadSpace` retains what it already computed. It is handed the card files, it parses them, it builds the id-to-path map — keeping id to path and id to source text on the result costs nothing and adds no I/O. That kills `cardSource` in `space.ts` outright.

Where it goes wants a moment's thought rather than a guess: `Space` is the indexed, derived domain value, and reading bytes stays outside it (ADR 0010), so hanging raw file text off `Space` is probably wrong. The `LoadSpaceResult` beside the space is the likelier home.

The plugin keeps its startup scan's id-to-path map instead of rebuilding it in the middleware.

The payload's envelope `id` is a denormalization worth revisiting in the same pass. The text already contains the id, and `parseSavedSpace` validates that the two agree — a check that exists only because the id is transmitted twice. Sending texts alone and reading the ids server-side would be one reader, one place. Weigh that against the envelope id being what lets the server route without parsing, which it does not currently achieve anyway since it parses on both sides.

## Not a blocking question

An earlier pass treated "cache the map at load or re-scan it at save" as a decision needing conflict detection, mtime baselines and a 409. **It does not.** That analysis assumed a directory changing under an open page, which does not happen in normal use — nothing watches the space, deliberately, and the one case that does move files (`git checkout` to throw away a save) already requires a reload to be seen. Do not resurrect that design; capture the map at load because it is already there, not to defend against a second writer that does not exist.

## Investigation

The duplication is present exactly as described, with one important distinction:
there are two runtimes. The browser's `loadSpace` call and the Vite server's
directory scan cannot literally share a `Map`, but each can derive its index once
from the bytes it already owns. What can disappear are the second browser parse
in `packages/app/src/space.ts` and the second server scan in `writeSpace`.

### The seam

Raw card-file provenance does **not** belong on `Space`. ADR 0010 makes `Space`
the validated, indexed domain value, while ADR 0020 keeps reading bytes outside
`loadSpace`. A path and the author's exact source text are persistence inputs,
not card properties. Putting them on `Space` would make every graph caller learn
filesystem facts it cannot use.

They belong beside `space` on the successful `LoadSpaceResult`. `loadSpace`
already has the parsed id, `CardFile.path`, and `CardFile.text` in the same loop
where it detects duplicates. Its success result should retain the source bytes
keyed by that parsed id. The app can then pass that map to `saveSpace` directly,
and `packages/app/src/space.ts` no longer imports `cardFileId` or reparses every
file. The result need not expose paths to ordinary graph callers: only the
source map has a browser consumer, while path ownership remains server-side.

On the server, `spaceModule` already calls `readCardFiles(dir)` to construct the
virtual module. That scan should also build the server-owned id-to-relative-path
map and retain it in the plugin closure. The middleware passes the retained map
to `writeSpace`; `writeSpace` no longer calls `cardPathById`, so a save performs
no directory scan and no card-file read. A newly derived `cards/<id>.md` path can
be added to the retained map after its write. Vite's existing invalidation means
the next full page load naturally rebuilds both the virtual module and the map.

This leaves two deep modules at the existing seams:

- `loadSpace(rawSpace, cardFiles)` owns parsing, validation, indexing, and the
  source-by-id result used by browser persistence.
- The Vite plugin owns directory discovery and the path-by-id index used by the
  filesystem writer.

Neither the persistence call nor the browser payload gains a path. That
preserves the security property that a browser value can select only an existing
server-known path, or supply a bounded id from which the server invents a path.

### Remove the duplicated envelope id

The `{ id, text }` payload repeats identity. `parseSavedSpace` already calls
`cardFileId(text)` and rejects a mismatch, so the envelope does not save a parse
or make routing cheaper. Send card source texts only. At the server boundary,
parse each text once, reject text without a non-empty frontmatter id, and produce
the internal `{ id, text }` value that `writeSpace` needs. This removes an
impossible-to-keep-in-sync representation rather than weakening validation: the
identity that selects the server-owned path is the identity in the bytes that
will be written there.

### Concrete work

1. In `packages/graph/src/space.ts`, extend successful `LoadSpaceResult` with a
   read-only source-by-card-id map populated in the existing intake loop. Keep
   it beside `space`, not on `Space`.
2. In `packages/app/src/space.ts`, delete the `cardFileId` import and the second
   `cardSource` construction; pass through the map returned by `loadSpace`.
3. In `packages/app/src/persist.ts`, serialize the save payload's `cards` as
   source-text strings. Existing cards use the retained source; cards with no
   source still use `serializeCardFile`.
4. In `packages/app/space-file-io.ts`, make `parseSavedSpace` derive each card id
   from its text, change `writeSpace` to accept the server-owned path map, and
   remove the save-time `cardPathById(dir)` scan. Keep `readCardFiles` as the one
   directory reader.
5. In `packages/app/vite-space-file-plugin.ts`, build and retain path-by-id when
   `spaceModule` reads the card files, pass it into `writeSpace`, and update it
   for newly created card paths.

Tests should pin the interfaces rather than the removed helpers:

- `packages/graph/test/space.test.ts`: a successful load returns exact authored
  source bytes keyed by the schema-parsed id, including a YAML-commented id.
- `packages/app/test/persist.test.ts`: the payload contains exact source texts
  and serializes a card with no source, without a second id field.
- `packages/app/test/space-file-io.test.ts`: payload parsing derives ids from
  text; writing reuses an injected known path; a new card derives a bounded
  path and updates the map; no client-supplied path exists in the accepted
  shape.

### Risks and non-goals

- Do not put raw source or paths on `Space`; that widens the domain interface
  with persistence mechanics and contradicts ADR 0010.
- Do not send the retained path map through the virtual module or save payload.
  The browser already receives relative paths as part of `CardFile`, but making
  one authoritative for writes would turn client input into filesystem routing.
- Do not add mtimes, conflict responses, file watchers, or a rescan fallback.
  This issue removes duplicate work under the existing reload model; it does not
  introduce concurrent editing.
- Preserve duplicate-id intake errors and their two source paths. The retained
  source map is created only from a successful, unambiguous load.

Primary evidence: ADR 0010, ADR 0020, `packages/graph/src/space.ts`,
`packages/app/src/space.ts`, `packages/app/vite-space-file-plugin.ts`,
`packages/app/space-file-io.ts`, `packages/app/src/persist.ts`, their adjacent
tests, and commit `f41bfa4`.
