---
name: infinity-cube-getting-started
description: Set a person up to run InfinityCube on their own content from a clone of this repository — tools, install, a content directory in its own git repository, `pnpm cube init` and `pnpm cube run`. Use when someone wants to set up, try or run InfinityCube, or open a talk or design directory in it; writing or changing the directory's files by hand is `infinity-cube-authoring`.
---

# Getting started with InfinityCube

InfinityCube runs from a clone of this repository. `pnpm cube init <dir>` creates an Aggregate directory, and `pnpm cube run <dir>` **runs** one: it reads `<dir>`, serves the application, and writes every edit back into `<dir>`. The person's work is that directory, kept in its own git repository; git is their undo and their history.

Work from the root of the InfinityCube clone. With no clone at hand, as when this skill is installed from the `infinity-cube` plugin, make one where the person agrees to: `git clone https://github.com/tobyhede/infinity-cube`. Each step ends on its completion criterion.

## Steps

1. **Tools.** Run `node --version` and `pnpm --version`. Node must be at least the version in `.node-version` (`package.json` `engines`), and pnpm must be 9 (`packageManager`). If either is missing or too old, tell the person what to install and wait for them; a Node version manager that reads `.node-version` is the usual route for Node, and `npm install -g pnpm@9` for pnpm, since Node no longer bundles corepack (`corepack enable` works only where corepack has been installed separately).
   Done when both commands print versions that meet those bounds.

2. **Install.** Run `pnpm install`.
   Done when it exits zero.

3. **Content directory.** Ask the person where their work lives, or should live. It is any path outside the InfinityCube clone, for example `~/talks/rust-async`.
   - **New work:** run `pnpm cube init <dir>`. The directory must be missing or empty; dot-entries such as `.git` and `.DS_Store` do not count, so a fresh `git init` directory is empty. It writes a new aggregate, prints `Created a new aggregate; run it with: pnpm cube run <dir>` and exits zero without serving. A directory that is not empty is refused and nothing is written: ask the person whether they meant existing work there, or another path.
   - **Existing work:** the directory must hold `aggregate.json` at its top. A directory holding only `space.json` is one Space, not an Aggregate directory, and is refused. One holding `hyper.json` instead of `aggregate.json` is refused too: rename the file with `mv <dir>/hyper.json <dir>/aggregate.json`, which works whether or not the directory is a git repository yet; step 4 then commits the rename before the first run.

   Done when you know the absolute path and `<dir>/aggregate.json` exists.

4. **Git.** Make the directory a git repository if it is not in one: `git -C <dir> init`; it can also be done before `init`. Then commit what is there before the first run: `git -C <dir> add -A && git -C <dir> commit -m "Before InfinityCube"`. A repository with no commit has nothing to restore, and the first write rewrites existing files into InfinityCube's own form (every Resource becomes `resources/<id>.json`, with a Markdown Resource's source in `resources/<id>.md`), so the commit is what makes git the undo for that first edit. If `git -C <dir> status --porcelain` already prints nothing, there is nothing to commit.
   Done when `git -C <dir> rev-parse --show-toplevel` succeeds and `git -C <dir> status --porcelain` prints nothing.

5. **Start.** For the person, in their terminal: `pnpm cube run <dir>`. It prints the address it serves (port 4173, or the next free port) and opens their browser. Add `--port <port>` to choose the port, which fails if that port is taken rather than moving on, and `--no-open` to leave the browser alone.
   If you start it yourself, use `pnpm cube run <dir> --no-open`, read the printed `Running <dir> at <url>` line for the address, and stop it with SIGINT to the process group you started, so its last write lands. A stop that wrote everything prints `Stopped; <dir> holds every edit.` and exits zero; one that prints `Stopped, but the last edits were not written:` and exits 1 has lost those edits, so tell the person what it printed rather than treating the directory as written. A missing or empty directory is refused with the `pnpm cube init` command that creates one, so go back to step 3. Any other refused directory exits non-zero and prints its problems; fix those (the `infinity-cube-authoring` skill covers the format) and start again.
   Done when the `Running … at <url>` line has printed and the URL answers.

6. **Explain how the run treats their files.** Tell the person, in your own words:
   - Edits are written into the directory about a second after they stop editing, and again when they press Ctrl-C. A second Ctrl-C exits without waiting.
   - **Git is the undo.** To recover an edit, or after a `git pull` or a second run on the same directory, use git: InfinityCube's next write replaces what is on disk with what it holds. Pull, and edit files by hand, with InfinityCube stopped.
   - Killing InfinityCube outright within that second, or a second Ctrl-C, loses the edits not yet written. A write can also fail, for example on a full disk: InfinityCube prints `Could not write the directory:` and tries again, but if the write on stopping fails it prints `Stopped, but the last edits were not written:`, exits 1, and those edits are lost. Check that stopping ends with `Stopped; <dir> holds every edit.` before treating the directory as complete.
   - InfinityCube writes only its own files, in place, and changes only the ones whose content changed. Anything else in the directory (`.git`, a README at the top, a `notes/` directory) is left alone. A crash in the middle of a write can leave some files new and some old; git restores them.
   - A `*.md` file beside `space.json` is refused by the run, naming it, and removed by the next Export, so notes belong in another directory.
   - Uploaded pictures are written to `images/` and committed with everything else.
   - Commit from the content directory: `git -C <dir> add -A && git -C <dir> commit`.

   Done when the person has the address and has been told each point above.

The full description of Running is the README's "How Running works"; the file format is `docs/aggregate-directory.md`.

To show a talk on the web from its public GitHub repository, read-only and with no server, and to point a domain at it, follow `docs/deploy-cloudflare.md`.
