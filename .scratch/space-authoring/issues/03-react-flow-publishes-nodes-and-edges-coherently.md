# 03 — React Flow publishes nodes and Edges coherently

**What to build:** Make the React Flow adapter publish projected Card nodes,
their declared handles and Route Edges as one coherent render state, so the
Space's first Route identity is minted only by the successful Edit that creates
it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A render that first contains an Edge also contains both endpoint handle
      declarations under the Edge's actual Route id.
- [ ] The application no longer reserves a future first-Route UUID while a
      route-less Space is merely open.
- [ ] Cancelling or rejecting a connection changes no Space identity or authored
      content.
- [ ] The successful first connection mints one Route identity and renders its
      Edge without an intermediate state containing stale node handles.
- [ ] Consecutive connections in one browser session continue resolving their
      declared handles without forced DOM remeasurement.
- [ ] Existing route-independent spatial authoring handles and per-Route
      overview handles retain their distinct render responsibilities.
- [ ] Real-browser coverage fails on React Flow warning #008 and proves both the
      first and a consecutive connection remain warning-free.
- [ ] The pinned React Flow release remains unchanged.
- [ ] `pnpm verify` and `pnpm e2e` pass.
