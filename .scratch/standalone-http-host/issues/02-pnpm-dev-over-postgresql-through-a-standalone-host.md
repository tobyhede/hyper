# 02 — `pnpm dev` over PostgreSQL through a standalone host

**What to build:** Tracer bullet. `pnpm dev` still starts everything with one command, but the PostgreSQL-backed HTTP application now runs as its own Node server, and Vite forwards `/api` and product addresses to it through the thin middleware ADR (01) describes. A browser sees no difference.

**Blocked by:** 01 — Record that the HTTP host is its own process; database-persistence 26 — One database target composition.

**Status:** ready-for-agent

- [ ] One command starts the host and Vite, and stopping it stops both; neither is left running.
- [ ] The host composes the PostgreSQL target, establishes Meta before serving, keeps the existing establish → retry → give-up behaviour, and closes its database when it stops.
- [ ] Through Vite: the Space collection, a Space and a commit behave as before; the root address opens the Meta Space; an unknown entity address is not found; a database that is down answers service-unavailable at the root. Each is covered by a test that drives the forwarding middleware against a real host.
- [ ] A host that is not reachable gives the browser a clear failure rather than the shell with a silently failing API.
- [ ] A Vite restart does not re-compose the host or open a second database client.
- [ ] The host's address is trusted composition only; no request can name it, a database URL or a file path.
- [ ] The other Vite configurations are untouched and still work through the in-process plugin until their own tickets move them.
