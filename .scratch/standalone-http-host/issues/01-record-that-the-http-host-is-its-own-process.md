# 01 — Record that the HTTP host is its own process

**What to build:** An ADR stating that the Fetch-native Hono application runs in its own Node server, which composes its database target, establishes Meta, and closes its database when it stops. Vite, in dev and in preview, serves the application shell and assets and forwards everything else to that server. Nothing is built by this ticket.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Why:** The API runs inside the Vite dev server as a plugin that loads the runtime module and memoizes one host for the server's lifetime. That was carried over from the pre-ADR 0030 file-backed prototype rather than chosen, and ADR 0034 already names it "prototype composition, not architectural constraints". It is why a Vite restart re-runs composition and opens a second database client in the same process, against ticket 14's one-runtime-per-process rule, and why nothing owns closing the database (review finding on ticket 15). A separate process gives the host an ordinary lifecycle: start, serve, stop and close.

**Decided in conversation (2026-09-17):**

- The host answers more than `/api`. Product addresses (the root address and `/spaces/…`) receive a redirect, not-found, method-not-allowed or service-unavailable answer from the host before the shell is served, and fall through to the shell otherwise. So a plain `/api` proxy rule is not enough.
- Vite keeps a thin forwarding middleware: `/api` is proxied to the host, and a product address is resolved by asking the host over HTTP, serving the host's answer when it has one and the shell when it does not. Static assets and HMR stay Vite's alone. Rejected: Vite forwarding every non-asset request and the host passing the shell back, which makes the host serve the shell and couples it to Vite's HTML transform.
- The database target the host composes is ticket 26's (`.scratch/database-persistence/issues/26-one-database-target-composition.md`), so this effort follows 26 rather than amending it.

- [ ] An ADR records the decision above, refining ADR 0034's "selected current Node composition" and stating the rejected alternatives, including hosting the application inside Vite, so a later review does not re-suggest it.
- [ ] The ADR states how a product address falls back to the shell, and what a browser sees when the host is not reachable.
- [ ] The ADR index is updated.
