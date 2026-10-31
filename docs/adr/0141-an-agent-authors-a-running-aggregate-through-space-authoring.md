# An agent authors a running aggregate through Space Authoring, and the browser sees its edits

Status: proposed
Related: 0117, 0124, 0130

Chat applications such as ChatGPT and Claude.ai have no filesystem, so the Aggregate directory and the `infinity-cube-authoring` skill do not reach them. They reach tools through remote MCP servers ([modelcontextprotocol.io](https://modelcontextprotocol.io)), as Figma's and Miro's servers let them edit a design or a board. This is how such an application edits a talk.

**An agent's edit is an Authoring completion.** The MCP server's tools are the authoring operations, such as create a Resource, place it on a Map, or add an Edge to a Graph, and each is answered as the canvas's are: completed, unchanged, or refused with its refusal code ([`authoring-refusal-cascade.md`](../agents/authoring-refusal-cascade.md)). An agent cannot write a Space that Space Authoring would refuse, and it learns why in the same words the canvas uses.

**The server runs inside `cube run`.** The run already holds the aggregate in its memory store and writes every committed edit back to the directory (ADR 0117), so an agent's edit is written exactly as a browser's is. A database host and a mounted talk (ADR 0130) offer no MCP server: a mounted talk has no server to offer one, and an agent edits it through its repository's files.

**The browser sees an agent's edit without a reload.** The run tells an open page that the stored Space moved, and the page takes the stored Space when it holds no unsaved work of its own. Without this, the page's next commit answers `conflict`, and the author is asked to keep local work or accept the stored Space for an edit they did not see happen.

**Each tool call names the revision it read.** As the browser's commits do, an agent's write carries the Space's revision, and a stale one is refused with the current revision rather than applied. A call repeated after a timeout therefore cannot create a second Resource.

**Nothing is written without a credential.** The server answers only a caller holding a credential bound to that run, which the run issues and which stops working when the run stops. A public endpoint makes this a requirement, not a refinement: an open tunnel to an unauthenticated server lets anyone who finds its address rewrite the talk. MCP's own [authorization specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization) is OAuth 2.1, which ChatGPT and Claude.ai speak; whether a run implements it or issues a simpler bearer token for clients that accept one is left to the ticket, and the ADR is not accepted until that is chosen.

This needs two things the code does not have today. Space Authoring is composed in `packages/app` over Navigation and a `SpaceSession`, so the run must compose it in Node, or the operations it checks must move to a package the run can import. The HTTP application answers requests and pushes nothing, so the page needs a channel on which the run announces a new revision.

**Rejected: a tool that commits whole Space snapshots.** Wrapping `POST /api/spaces` asks the agent to build the next snapshot itself and send it against a revision. Intake then refuses a Space that is invalid on its own, but not an edit that is invalid as a change: a Reference Resource's Target is immutable (`reference-target-immutable`), and a Resource placed over others displaces them in the Edit that places it (ADR 0084, ADR 0093), and neither is a property of the snapshot alone. The agent must also re-send the whole Space to change one title.

**Rejected: file tools over the directory.** A server with tools to read, write and check the directory's files is small and works today in clients that run a local server, but the editing is the skill's, with a tool in the way, and it does nothing for a client that needs a remote server. While a run serves the directory its next write would overwrite the agent's files.

**Cost accepted:** a second writer to a run, a push channel from the run to the page, Space Authoring composed outside the browser, and an authorization server or token issuer inside the run. A ChatGPT session needs a public HTTPS endpoint, so a run on a laptop needs a tunnel the author opens.
