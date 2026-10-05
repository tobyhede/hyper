# Export writes in place, and git answers for a partial write

Status: accepted
Refines: 0030, 0117, 0118

Every Export writes the Aggregate directory **in place**: Running's write-through after each edit (ADR 0117), and `pnpm hyper export` and `pnpm hyper:sqlite export` alike. Hyper gives no whole-write atomicity, keeps no backup and leaves no recovery copy. A directory an author keeps their work in is under git, and git is the guarantee.

## What it is

- **The directory is never moved.** `<dir>` is not renamed, moved or recreated, and neither is any Space directory inside it. A shell, editor or file watcher inside either stays valid across a write. Nothing is staged or backed up beside `<dir>`. A missing `<dir>` is created.
- **Hyper owns exactly what Import reads, and nothing else.** That is `hyper.json`; each Space directory's `space.json`, the `*.md` beside it and `resources/*.md`; and the visible regular files in `images/`. Every other entry, such as `.git`, a README at the root, a `notes/` directory, or a dotfile or subdirectory in `images/`, is never read, copied or touched.
- **One write is three steps.**
  1. The complete set of files the aggregate serialises to is computed in memory, and checked the way Import reads it: parsed by Import's own parsers and judged by the ordinary aggregate intake. A set that would not read back is refused, and nothing is written.
  2. Each file whose bytes on disk already match is skipped. Every other file is written to a dot-prefixed temporary file beside it and renamed over it, so no file is ever seen half-written. This per-file rename is the only care the write takes.
  3. Each file Hyper owns that the aggregate no longer serialises to is removed: a removed Resource's file, a `*.md` beside `space.json`, a picture no Resource shows (ADR 0118), the files of a Space the aggregate no longer holds. Then each directory that removal left empty is removed.
- **A symbolic link is still refused.** Export does not write or remove through a link at `<dir>`, at any file it writes or removes, or at any directory between them, and it checks every one before it writes or removes anything. A temporary file is created fresh, never opened where something already stands.
- **A crash part-way leaves a mix.** Some files are new and some old, and the directory may not import until it is restored. Git restores it. The revision each Space was exported at is still recorded only after every file is written.

## Why

The staged Export copied the whole destination beside itself, rewrote the copy, verified it and swapped it in by two renames, keeping the previous directory as a recovery copy until both landed. That bought whole-write atomicity at three costs, and Running made all three worse:

- **It replaced the directory.** A shell `cd`'d into it, an editor's open folder or a watcher found itself in a directory that no longer existed after every write, and Running writes after every edit.
- **It copied and rewrote everything.** Every write copied the author's whole directory, `.git` included, and touched every file whether it changed or not.
- **It guarded against what git already answers.** ADR 0117 already makes git the answer for history, undo and concurrent writers. A partial write is one more case of the same thing.

## Considered options

- **Keep the staged swap for the CLI and write in place only while Running.** Rejected. Two write paths would disagree about what a write touches, and an author who exports with the CLI keeps the same kind of directory under git.
- **Write in place, but keep a backup copy beside the directory.** Rejected. It is the cost of the swap without its benefit, and a second copy of the work that git does not know about.
- **Write every file without the per-file rename.** Rejected. A crash mid-file would leave a truncated file that neither the old nor the new version describes. The rename is cheap and removes that case.

## Consequences

The atomic replacement ADR 0030 recorded for the CLI exporter, and the staged write ADR 0117 and ADR 0118 name, no longer exist. What Exporting replaces and keeps is unchanged, with one exception: a removed Space's directory loses only the files Hyper owns, and is removed only when that leaves it empty, so an author's notes inside it survive.
