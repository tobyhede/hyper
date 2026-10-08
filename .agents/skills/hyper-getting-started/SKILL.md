---
name: hyper-getting-started
description: Set a person up to run Hyper on their own content from a clone of this repository — tools, install, a content directory in its own git repository, `pnpm hyper init` and `pnpm hyper run`. Use when someone wants to start, try or run Hyper, or open a talk or design directory in it.
---

# Getting started with Hyper

Hyper runs from a clone of this repository. `pnpm hyper init <dir>` creates an Aggregate directory, and `pnpm hyper run <dir>` **runs** one: it reads `<dir>`, serves the application, and writes every edit back into `<dir>`. The person's work is that directory, kept in its own git repository; git is their undo and their history.

Work from the root of the Hyper clone. Each step ends on its completion criterion.

## Steps

1. **Tools.** Run `node --version` and `pnpm --version`. Node must be at least the version in `.node-version` (`package.json` `engines`), and pnpm must be 9 (`packageManager`). If either is missing or too old, tell the person what to install and wait for them; a Node version manager that reads `.node-version`, and `corepack enable` for pnpm, are the usual routes.
   Done when both commands print versions that meet those bounds.

2. **Install.** Run `pnpm install`.
   Done when it exits zero.

3. **Content directory.** Ask the person where their work lives, or should live. It is any path outside the Hyper clone, for example `~/talks/rust-async`.
   - **New work:** run `pnpm hyper init <dir>`. The directory must be missing or empty; dot-entries such as `.git` and `.DS_Store` do not count, so a fresh `git init` directory is empty. It writes a new aggregate, prints `Created a new aggregate; run it with: pnpm hyper run <dir>` and exits zero without serving. A directory that is not empty is refused and nothing is written: ask the person whether they meant existing work there, or another path.
   - **Existing work:** the directory must hold `hyper.json` at its top. A directory holding only `space.json` is one Space, not an Aggregate directory, and is refused.

   Done when you know the absolute path and `<dir>/hyper.json` exists.

4. **Start.** For the person, in their terminal: `pnpm hyper run <dir>`. It prints the address it serves (port 4173, or the next free port) and opens their browser. Add `--port <port>` to choose the port and `--no-open` to leave the browser alone.
   If you start it yourself, use `pnpm hyper run <dir> --no-open`, read the printed `Running <dir> at <url>` line for the address, and stop it with SIGINT to the process group you started, so its last write lands. A stop that wrote everything prints `Stopped; <dir> holds every edit.` and exits zero; one that prints `Stopped, but the last edits were not written:` and exits 1 has lost those edits, so tell the person what it printed rather than treating the directory as written. A missing or empty directory is refused with the `pnpm hyper init` command that creates one, so go back to step 3. Any other refused directory exits non-zero and prints its problems; fix those (the `hyper-authoring` skill covers the format) and start again.
   Done when the `Running … at <url>` line has printed and the URL answers.

5. **Git.** Make the directory a git repository if it is not in one: `git -C <dir> init`. It can be done before `init`, before the first run, or while Hyper runs.
   Done when `git -C <dir> rev-parse --show-toplevel` succeeds.

6. **Explain how the run treats their files.** Tell the person, in your own words:
   - Edits are written into the directory about a second after they stop editing, and again when they press Ctrl-C. A second Ctrl-C exits without waiting.
   - **Git is the undo.** To recover an edit, or after a `git pull` or a second run on the same directory, use git: Hyper's next write replaces what is on disk with what it holds. Pull, and edit files by hand, with Hyper stopped.
   - Killing Hyper outright within that second, or a second Ctrl-C, loses the edits not yet written. A write can also fail, for example on a full disk: Hyper prints `Could not write the directory:` and tries again, but if the write on stopping fails it prints `Stopped, but the last edits were not written:`, exits 1, and those edits are lost. Check that stopping ends with `Stopped; <dir> holds every edit.` before treating the directory as complete.
   - Hyper writes only its own files, in place, and changes only the ones whose content changed. Anything else in the directory (`.git`, a README at the top, a `notes/` directory) is left alone. A crash in the middle of a write can leave some files new and some old; git restores them.
   - A `*.md` file beside `space.json` is read as a Resource and removed or rewritten by the next write, so notes belong in another directory.
   - Uploaded pictures are written to `images/` and committed with everything else.
   - Commit from the content directory: `git -C <dir> add -A && git -C <dir> commit`.

   Done when the person has the address and has been told each point above.

The full description of Running is the README's "How Running works"; the file format is `docs/aggregate-directory.md`.
