# 03: Edit an Aggregate directory over MCP

**What to build:** `pnpm cube mcp <dir>` serves a local MCP server over stdio, scoped to one Aggregate directory, for a client that calls MCP tools but has no shell or filesystem of its own, such as Claude Desktop without its filesystem tools. Its tools list, read, write and delete the directory's files, and check the directory exactly as `pnpm cube check` does. The editing is the `infinity-cube-authoring` skill's: the server gives the agent no operation the files do not, and intake answers for what it writes. A running talk sees nothing until it is restarted, and ticket 04 is the live route.

**Blocked by:** None (01 and 02 are resolved)

**Status:** resolved

- [x] `mcp` is listed by `cube help` among the author's verbs, after `check`
- [x] `list_files` answers every file under `<dir>` by its path relative to `<dir>`, leaving out dot-entries such as `.git`
- [x] `read_file` answers a file's text, and `write_file` creates or replaces one, creating its parent directories, by renaming a written temporary file over it
- [x] `delete_file` removes one file
- [x] `check` answers what `pnpm cube check` prints, for an accepted and a refused directory alike, from the same reading of the directory
- [x] A path that is absolute, leaves `<dir>`, names a dot-entry or reaches outside `<dir>` through a symbolic link is refused, and nothing is read, written or deleted
- [x] A missing `<dir>` is refused before serving, naming `pnpm cube init`, and a path that is not a directory is refused; an empty directory is served, so a client can write a new aggregate into it
- [x] Nothing but the protocol is written to standard output, so a client reading it is not interrupted
- [x] `docs/aggregate-directory.md` and the authoring skill say how a client starts the server, and that a run serving the same directory overwrites what it writes
