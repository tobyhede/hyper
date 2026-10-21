# The aggregate reader pulls from a source

Status: accepted
Refines: 0130

ADR 0130 gave the directory reader a pure core that read an aggregate from a map of relative paths to bytes, fed by a filesystem shell and by the GitHub source, so that anything the CLI refuses the browser refuses in the same words. A map of bytes meant each caller chose and fetched the files first. Each caller therefore listed its directory, asked the core which paths Importing reads, read them with its own concurrency and its own failure policy, and checked for `hyper.json` itself. The two callers already refused the same directory differently: a missing `hyper.json` in different words, every unreadable file on the CLI but only the first in a mount, and a 25 MiB cap in a mount alone.

## The decision

- **The reader takes an aggregate source.** A source names itself, lists one directory at a time (its files and child directories, a missing one empty), reads one file (answering its bytes or why it could not), and says how many reads it allows at once. Neither operation throws.
- **The reader decides everything else.** It decides which directories to list and which files to read. It checks that `hyper.json` is present and parses before anything else is read. It runs every read through one pool within the source's bound, and it words every refusal. It collects every directory that could not be listed and every file that could not be read, and reports them together. It still imports nothing from `node:`.
- **Three sources.** The filesystem source under root `src/` reads the disk. The GitHub source reads one listed tree and its blobs. A source over bytes already in memory serves Export's read-back and the tests.
- **What stays a source's own is how it reaches its files**: the GitHub source's rate limits, retries and largest fetched file. A file a source will not or cannot fetch is reported as one the reader could not read.
- **Export's ownership is the reader's listing.** One listing-only operation answers the files Importing reads, in read order, and the Space directories among them. Export owns what it finds there.

## Rejected

- **Keeping the map and sharing a scan of paths.** Every caller would still list, select, fetch, bound and collect for itself, and the policies would keep drifting.
- **A plan of reads the caller executes.** It keeps the reader pure, but it moves sequencing, bounding and failure collection back onto each caller.
- **A flat listing of every path.** GitHub has one, but the disk would have to walk everything under the directory, `.git` included.

## Cost accepted

- **The reader is no longer pure.** It awaits its source, but it stays browser-safe.
- **Every Space directory without a `resources/` costs one listing that finds nothing.** Every source lists locally, so no request is made.
