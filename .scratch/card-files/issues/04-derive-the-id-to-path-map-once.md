# Derive a card's id, path and source bytes once, at load

Status: open
Type: task

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
