# Letting AI tools edit Spaces and Maps

Status: in-progress

Toby asked (2026-10-30) how tools such as ChatGPT and Claude should edit Spaces and Maps: an MCP server, skills, or the source files.

## Decision

Files and skills first; an MCP server second, for chat applications that have no filesystem.

- **The Aggregate directory is the surface.** It is the durable copy (ADR 0117), it has JSON Schemas (`docs/schema/`) and the `infinity-cube-authoring` skill, and git is its undo. It is also the only route to a mounted talk, which reads a GitHub commit (ADR 0130) and has no server to call. Precedent: Obsidian's JSON Canvas (https://jsoncanvas.org), an open file format that tools and LLMs edit directly; Agent Skills (https://agentskills.io), which Claude and Codex both read.
- **What is missing is a check.** Today an agent finds out whether intake accepts a directory by starting a whole `pnpm cube run` on a copy. `pnpm cube check <dir>` answers the same question, refusing exactly what `run` refuses, without serving or writing.
- **An MCP server is for chat applications.** ChatGPT and Claude.ai reach tools only through remote MCP servers (https://modelcontextprotocol.io). Its tools would be authoring operations (add a Resource, place it on a Map, add an Edge to a Graph) answered by Space Authoring's refusal cascade, not a wrapper over `POST /api/spaces`, which commits a whole Space snapshot against a revision. Precedent: Figma's and Miro's MCP servers.

## Tickets

- `issues/01-check-an-aggregate-directory.md`
- `issues/02-install-the-authoring-skill-outside-the-repository.md`
- `issues/03-author-a-running-aggregate-over-mcp.md`
