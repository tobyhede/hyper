# 04: Author a running aggregate over MCP

**What to build:** a chat application with no filesystem (ChatGPT, Claude.ai) edits a talk that `pnpm cube run` is serving, through an MCP server the run offers. Its tools are authoring operations, such as add a Resource, place it on a Map or add an Edge to a Graph, each answered by Space Authoring's completed, unchanged or refused, so the refusal cascade applies to an agent as it does to the canvas. Edits appear in the open browser and are written back to the directory as every run writes them (ADR 0117).

**Blocked by:** `03-edit-an-aggregate-directory-over-mcp.md`, and ADR 0141 accepted

**Status:** needs-triage — deferred by Toby (2026-10-31): the OAuth authorization server it needs is more than he wants to build now. ADR 0141 stays proposed until this is picked up again.

Open before this is ready: where the MCP endpoint is served and how ChatGPT, which needs a public HTTPS endpoint, reaches a local run; whether Space Authoring can run outside the browser composition today; whether this earns an ADR (a second writer beside the browser).

- [ ] A tool call that Space Authoring refuses answers with its refusal code, and changes nothing
- [ ] An edit made over MCP appears without a reload in an open browser on the same run that holds no unsaved work
- [ ] A browser on the same run that holds unsaved work keeps it, and is answered with the conflict it answers today (keep local work or accept the stored Space)
- [ ] A tool call naming a stale revision is refused with the current revision, so a repeated call writes nothing twice
- [ ] A call without an OAuth token the run issued for its own endpoint is refused and writes nothing, and every token stops working when the run stops
- [ ] The run writes it back to the directory

## Comments

2026-10-31: ADR 0141 (proposed) answers the open questions: the server runs inside `cube run`, Space Authoring is composed outside the browser, and the run pushes a new revision to an open page. It waits on Toby's choice between this, file tools over the directory, and deferring. Once accepted, this ticket splits into: compose Space Authoring where the run can reach it; push a new revision to the page; the MCP server and its tools.

2026-10-31: Toby chose file tools over the directory as ticket 03 and this as ticket 04, after it. It stays needs-triage until ADR 0141 names its credential and is accepted.

2026-10-31: Toby chose OAuth 2.1 (MCP's authorization specification) over a static bearer token, and deferred the ticket.
