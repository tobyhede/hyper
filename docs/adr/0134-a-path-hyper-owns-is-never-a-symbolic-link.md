# A path Hyper owns is never a symbolic link

Status: accepted
Refines: 0119, 0133

Import and Export disagreed about links. The disk source read a link to a regular file as the file it names, so that an author could share one file between directories. Export refuses to write or remove through any link (ADR 0119). A directory with a linked `space.json` therefore imported and opened, and then every write back failed. Under `pnpm hyper run` each quiet-period write was refused and retried, and the edits were lost when the run stopped. The GitHub source dropped a linked entry without saying so.

## The decision

- **A source lists a link as a link.** A listing names the files, the child directories and the symbolic links in a directory. A link is never listed as a file or a directory, whatever it names, and a source does not decide what one means.
- **The reader has one rule: a path Hyper owns is never a link.** Hyper owns what Import reads (ADR 0119): `hyper.json`, `images/` and the visible files in it, and in each Space directory `space.json`, the `*.md` beside it, `resources/`, and `resources/*.json` and `resources/*.md`. A link at any of them is a discovery failure naming the path. A Space directory whose `space.json` is a link is still a Space directory, refused rather than passed over. Every owned link in the Spaces and `images/` is reported together. A link at `hyper.json` or `images/` is refused at the root.
- **A link Hyper does not own is the author's.** A linked README, a linked notes file, a hidden file in `images/` or a linked directory that holds no `space.json` is neither read nor refused, as Export neither writes nor removes it.
- **Export meets the rule before it writes.** Export owns what the reader's scan finds (ADR 0133), so a destination holding an owned link is refused by that scan. Export's own check for links stays, for what changes between the scan and the write.
- **Every source answers the same way.** The disk, a source over bytes in memory and the GitHub source all list links, so `hyper import`, `hyper run`, Export and a mount refuse the same directory in the same words.

## Why

- **A directory that imports is one Export can write back.** Running makes the directory the durable copy (ADR 0117). A rule that let a directory open but never save lost edits silently, and only when the author stopped.
- **One rule in one place.** The disk source and Export each held half of the link rule, and the GitHub source a third. The reader already owns discovery, so it owns this too.

## Rejected

- **Export replaces a linked file with a regular file.** The edits would save, but the file would silently stop being shared, which is the one thing the link was for.
- **Export writes through the link.** It would edit a file outside the directory, which ADR 0119 refuses on purpose.
- **Keeping links readable and refusing only at Export.** This is the behaviour that lost edits.

## Cost accepted

- **An author can no longer share a file between aggregates with a link.** Copying it, or a git submodule for a shared directory, is how to share now.
- **A linked picture in `images/` is refused.** It was ignored before, but Export would have refused to write a picture over it.
