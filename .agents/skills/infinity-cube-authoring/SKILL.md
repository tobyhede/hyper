---
name: infinity-cube-authoring
description: Write or change an InfinityCube Aggregate directory's files — a talk or design's `aggregate.json`, `space.json` Maps, Graphs and Edges, Resource files and their Markdown, `images/` — on disk or through a `pnpm cube mcp` server's tools. Use to add, change, connect or remove Resources, Maps, Graphs or Edges by hand, or to fix what `pnpm cube check` or a refused `pnpm cube run` reports. Setting InfinityCube up or starting a run is `infinity-cube-getting-started`.
---

# Authoring an Aggregate directory

An **Aggregate directory** is InfinityCube's on-disk form: `aggregate.json` naming the Meta Space, one directory per Space named for its Id, each holding `space.json` and a `resources/` directory of JSON Resource files (with a Markdown Resource's source in its `<id>.md` sidecar), and `images/` holding stored pictures. The reference is [`docs/aggregate-directory.md`](https://github.com/tobyhede/infinity-cube/blob/main/docs/aggregate-directory.md): the authority on every key and rule. Read it before writing: the copy in your InfinityCube clone when you have one, since the format moves with the code and `main` may be ahead of that clone, otherwise the link. This skill is the order to work in and the traps.

You reach the directory one of three ways, and each step says what differs:

- **Shell:** you run commands, from an InfinityCube clone, with `<dir>` absolute. With no clone, make one where the person agrees: `git clone https://github.com/tobyhede/infinity-cube`, then `pnpm install` in it, with Node at the clone's `.node-version` and pnpm 9.
- **MCP:** you have only the tools of a `pnpm cube mcp` server (`list_files`, `read_file`, `write_file`, `delete_file`, `check`), scoped to the directory, with paths relative to it. `read_file` and `write_file` take `encoding: "base64"` for a binary file.
- **Neither:** you can write files but run nothing. Work as for MCP, and the directory ends unchecked.

## Steps

1. **Stop the run.** After each edit made in the app, a `pnpm cube run` serving the directory writes it from memory, overwriting the files you changed and deleting Resource files you added. Stop it (Ctrl-C, or SIGINT to the process group you started) and wait for it to exit; a run you did not start, ask the person to stop.
   - Shell: done when this prints nothing: `if d=$(cd "<dir>" && pwd -P); then ps -Aww -o pid=,command= | sed -n 's/^ *\([0-9][0-9]*\) .*run-process.ts \(.*\) [0-9]* \(no-\)\{0,1\}open$/\1 \2/p' | while read -r pid held; do [ "$held" -ef "$d" ] && echo "$pid"; done; else echo "cannot enter <dir>"; fi`. It prints the process id of each run on the directory, or `cannot enter <dir>` when `<dir>` is wrong.
   - MCP or neither: done when the person confirms no run is serving the directory.

2. **Read what is there.** Read `aggregate.json`, every Space's `space.json` and the Resource files you will touch. Shell: also run `git -C "<dir>" status`; if it is dirty or not a repository, ask the person to commit first, as `infinity-cube-getting-started` step 4 does. A new directory needs an aggregate first: shell, `pnpm cube init "<dir>"` writes a starter aggregate to a missing or empty directory; otherwise write `aggregate.json` and a Meta Space directory with a `space.json` from the reference.
   Done when you can name the Meta Space, every Space, and the Ids of the Maps, Graphs and Resources you will touch.

3. **Write the change.** Follow the reference. The rules that most often refuse, or silently hide, a hand-written change:
   - A Space's directory name **is** its Id, and every new Id is a lower-case UUID. Shell: mint with `node -e 'console.log(crypto.randomUUID())'`. Otherwise: write a random version-4 UUID in lower case.
   - Resource Ids are unique across the whole aggregate, and Graph Ids across the whole Space.
   - Give every Map and Graph you write an `id`; an Id Import mints cannot be referred to.
   - A Resource is `resources/<id>.json`: `{ "id", "title", "kind", "content" }`, all four required. A Markdown Resource's `content` is `{ "path": "<id>.md", "mediaType": "text/markdown" }`, and its source is the plain `resources/<id>.md` beside it, with no frontmatter. Each kind's `content` is in the reference's table.
   - A Resource appears on a Map only when that Map's `positions` holds it, and is presented only when an Edge of a Graph reaches it. `check` accepts a Resource on no Map, so place each new one and usually connect it.
   - An Edge joins only Resources its Map positions, and every Map owns at least one Graph.
   - Every ordinary Space is reached by a Space Resource elsewhere in the aggregate (`"kind": "space"`, `content` holding `spaceId`, `map` and `graph`), so it needs a Map and a Graph for that Resource to name. Only the Meta Space may have no Maps.
   - Every object, `content` included, is strict: spell keys exactly as the reference does.
   - A stored picture is `images/<content-id>.<ext>`: the content id is the SHA-256 of its bytes as unpadded base64url, not hex, and the extension is the format the bytes are (`png`, `jpg`, `webp`, `gif`); the reference shows the command. The Resource's `content.url` is `/images/<content-id>`. Without a shell, write a picture only when the person gives its bytes and content id (MCP: `write_file` with `encoding: "base64"`); otherwise use an `https:` URL.
   - Keep notes outside Space directories: a `*.md` there that is not a Markdown Resource's sidecar is refused.

   Done when every file you meant to add or change is written.

4. **Check it.** Shell: `pnpm cube check "<dir>"` from the clone. MCP: call `check`. Both Import the directory as a run does and write nothing. Accepted answers `<dir> is a valid aggregate.`; refused lists each problem by file path or by Space and Ids. Fix and check again until it is accepted, since fixing one round can reveal the next.
   Neither: ask the person to set up a clone and run the check, or to start a `cube mcp` server as [Editing over MCP](https://github.com/tobyhede/infinity-cube/blob/main/docs/aggregate-directory.md#editing-over-mcp) shows; failing both, tell the person the directory is unchecked and ask them to run `pnpm cube check` before they commit it.
   Done when the check answers that the directory is valid, or you have told the person it is unchecked.

5. **Hand over.** Tell the person:
   - to review the diff and commit in the content directory's own repository;
   - to start the run again (`pnpm cube run "<dir>"`) to see the change, since a run reads the directory only when it starts;
   - that the first edit a run writes rewrites the directory in canonical form: every Resource as `resources/<id>.json` in a fixed key order, minted Ids filled in, and a `defaultMap` recorded for a Space opened without one.

   Done when the person has been told all three.
