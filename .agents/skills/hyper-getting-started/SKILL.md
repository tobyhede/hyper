---
name: hyper-getting-started
description: Set a person up to run Hyper on their own content from a clone of this repository — tools, install, a content directory in its own git repository, and `pnpm start`. Use when someone wants to start, try or run Hyper, or open a talk or design directory in it.
---

# Getting started with Hyper

Hyper runs from a clone of this repository. `pnpm start <dir>` **runs** an Aggregate directory: it reads `<dir>`, serves the application, and writes every edit back into `<dir>`. The person's work is that directory, kept in its own git repository; git is their undo and their history.

Work from the root of the Hyper clone. Each step ends on its completion criterion.

## Steps

1. **Tools.** Run `node --version` and `pnpm --version`. Node must be at least the version in `.node-version` (`package.json` `engines`), and pnpm must be 9 (`packageManager`). If either is missing or too old, tell the person what to install and wait for them; a Node version manager that reads `.node-version`, and `corepack enable` for pnpm, are the usual routes.
   Done when both commands print versions that meet those bounds.

2. **Install.** Run `pnpm install`.
   Done when it exits zero.

3. **Content directory.** Ask the person where their work lives, or should live. It is any path outside the Hyper clone, for example `~/talks/rust-async`.
   - **New work:** leave the directory missing or empty; the first run creates a new Space in it. Dot-entries such as `.git` and `.DS_Store` do not count, so a fresh `git init` directory is empty.
   - **Existing work:** the directory must hold `hyper.json` at its top. A directory holding only `space.json` is one Space, not an Aggregate directory, and is refused.

   Done when you know the absolute path and whether it is new or existing.

4. **Start.** For the person, in their terminal: `pnpm start <dir>`. It prints the address it serves (port 4173, or the next free port) and opens their browser. Add `--port <port>` to choose the port and `--no-open` to leave the browser alone.
   If you start it yourself, use `pnpm start <dir> --no-open`, read the printed `Running <dir> at <url>` line for the address, and stop it with SIGINT to the process group you started, so its last write lands. A refused directory exits non-zero and prints its problems; fix those (the `hyper-authoring` skill covers the format) and start again.
   Done when the `Running … at <url>` line has printed and the URL answers.

5. **Git.** Make the directory a git repository if it is not in one: `git -C <dir> init`. It can be done before the first start or while Hyper runs.
   Done when `git -C <dir> rev-parse --show-toplevel` succeeds.

6. **Explain how the run treats their files.** Tell the person, in your own words:
   - Edits are written into the directory about a second after they stop editing, and again when they press Ctrl-C. A second Ctrl-C exits without waiting.
   - **Git is the undo.** To recover an edit, or after a `git pull` or a second run on the same directory, use git: Hyper's next write replaces what is on disk with what it holds. Pull, and edit files by hand, with Hyper stopped.
   - Killing Hyper outright within that second loses the edits not yet written; stopping it normally never does.
   - A `*.md` file beside `space.json` is read as a Resource and removed or rewritten by the next write, so notes belong in another directory.
   - Uploaded pictures are written to `images/` and committed with everything else.
   - Commit from the content directory: `git -C <dir> add -A && git -C <dir> commit`.

   Done when the person has the address and has been told each point above.

The full description of Running is the README's "How Running works"; the file format is `docs/aggregate-directory.md`.
