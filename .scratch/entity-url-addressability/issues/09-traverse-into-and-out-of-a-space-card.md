# 09 — Traverse into and out of a Space Card

**What to build:** An author can connect a containing Graph into and out of a target Graph across one Space Card, and a presentation follows those Edges with the containing Graph context needed to offer the correct exits.

**Blocked by:** 07 — Author a Space Card reference; 08 — Enter and independently open a Space Card.

**Status:** ready-for-agent

- [ ] Entry and exit Edge authoring use the accepted canvas interaction and store symmetric qualified endpoints owned by the containing Graph.
- [ ] Intake resolves every endpoint, rejects cycles or dangling references, and deletion refuses externally targeted entities rather than silently editing other Spaces.
- [ ] Presentation carries one containing Graph context per crossed Space Card; local and exit Edges form ordinary forks, and Back retraces crossings.
- [ ] Independent presentation of the target Graph sees none of another Space's entry or exit Edges.
- [ ] `pnpm verify`, `pnpm e2e` and the relevant Ladle E2E evidence pass.
