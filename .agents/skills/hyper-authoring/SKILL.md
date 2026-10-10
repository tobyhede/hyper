---
name: hyper-authoring
description: Write or change Hyper content as files — an Aggregate directory's `hyper.json`, Space directories, `space.json` Maps, Graphs and Edges, Resource Markdown and `images/`. Use when writing or editing the files of a Hyper talk or design on disk rather than in the browser; setting Hyper up or starting a run is `hyper-getting-started`.
---

# Authoring an Aggregate directory

An **Aggregate directory** is Hyper's on-disk form: `hyper.json` naming the Meta Space, one directory per Space named for its Id, each holding `space.json` and its Resources' Markdown, and `images/` holding stored pictures. The complete reference is [`docs/aggregate-directory.md`](../../../docs/aggregate-directory.md) in the Hyper repository. Read it before writing, and treat it as the authority on every key and rule; this skill is the order to work in and the traps.

## Steps

1. **Stop the run.** If `pnpm hyper run` is running on this directory, stop it (Ctrl-C, or SIGINT to the process group you started) and wait for it to exit. A running Hyper writes every file it owns from memory after every edit, so its next write replaces anything you change in those files underneath it.
   Done when nothing is serving the directory: `pgrep -fl "run-process.ts <dir> "`, with `<dir>` absolute and the trailing space kept so a sibling directory sharing its prefix does not match, prints nothing.

2. **Read what is there.** If the directory exists, read `hyper.json`, every Space's `space.json` and its Resource files, and check `git -C <dir> status` so your change starts from a clean or known state. A new directory needs a `hyper.json`, and a Meta Space directory with a `space.json`, before anything else: `pnpm hyper init <dir>` from the Hyper clone writes both to a missing or empty directory.
   Done when you can name the Meta Space, every Space, and the Ids of the Maps, Graphs and Resources you will touch.

3. **Write the change.** Follow the reference. The rules that most often refuse a hand-written directory:
   - A Space's directory name **is** its Id: a lower-case UUID. Mint new UUIDs with `uuidgen | tr A-Z a-z` or `node -e 'console.log(crypto.randomUUID())'`.
   - **Write the Id of anything another file names.** Ids may be left out and are minted on Import, but a minted Id cannot be referred to. So every Resource a Map positions or an Edge joins needs its frontmatter `id`, and a Map or Graph needs its `id` if `defaultMap`, `activeGraph` or a Space Resource names it.
   - A Map's `positions` keys are its membership, and an Edge may only join Resources its Map positions.
   - Every Map owns at least one Graph.
   - Resource Ids are unique across the whole aggregate, not just within a Space.
   - Every ordinary Space must be reached by a Space Resource (`kind: space`, with `spaceId`, `map` and `graph`) somewhere else in the aggregate, so it needs a Map and a Graph for that Space Resource to name. Only the Meta Space may be written without Maps.
   - Every object in `space.json` is strict: an unknown or misspelt key is refused. Resource frontmatter is not: an unknown key there is accepted and dropped, so a misspelt optional key is lost without a word.
   - A picture is `images/<content-id>.<ext>`, named by the SHA-256 of its bytes; the reference shows the command. The Resource's `url` is `/images/<content-id>`.
   - Keep prose that is not a Resource out of a Space directory and its `resources/`: every `*.md` there is read as a Resource, and the next write rewrites or removes it.

   Done when every file you meant to add or change is written.

4. **Check it.** Run a headless copy, so the check never writes the person's files: from the Hyper clone, `tmp=$(mktemp -d) && cp -R <dir>/. "$tmp"`, then `pnpm hyper run "$tmp" --no-open`, which takes port 4173 or the next free one. A refused directory exits non-zero and prints each problem, naming a file by its path and a broken reference by its Space and Ids; fix them in `<dir>`, copy again and repeat, since a second round of problems can follow the first. When it prints `Running … at <url>`, stop it with SIGINT.
   Done when a run starts cleanly and has been stopped.

5. **Expect the canonical rewrite.** Hyper rewrites what it reads in a fixed form the first time an edit is written: every Resource becomes `resources/<id>.md`, minted Ids are filled in, and opening a Space that names no `defaultMap` records one, which is itself an edit. Starting and stopping a run with no edit changes nothing. Tell the person to review the diff and commit in the content directory's own repository.
   Done when `git -C <dir> status` shows only the changes you intended plus, after an edit in the browser, that rewrite.
