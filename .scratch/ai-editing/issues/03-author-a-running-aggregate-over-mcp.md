# 03: Author a running aggregate over MCP

**What to build:** a chat application with no filesystem (ChatGPT, Claude.ai) edits a talk that `pnpm cube run` is serving, through an MCP server the run offers. Its tools are authoring operations, such as add a Resource, place it on a Map or add an Edge to a Graph, each answered by Space Authoring's completed, unchanged or refused, so the refusal cascade applies to an agent as it does to the canvas. Edits appear in the open browser and are written back to the directory as every run writes them (ADR 0117).

**Blocked by:** None (can start immediately)

**Status:** needs-triage

Open before this is ready: where the MCP endpoint is served and how ChatGPT, which needs a public HTTPS endpoint, reaches a local run; whether Space Authoring can run outside the browser composition today; whether this earns an ADR (a second writer beside the browser).

- [ ] A tool call that Space Authoring refuses answers with its refusal code, and changes nothing
- [ ] An edit made over MCP appears in an open browser on the same run without a reload
- [ ] The run writes it back to the directory
