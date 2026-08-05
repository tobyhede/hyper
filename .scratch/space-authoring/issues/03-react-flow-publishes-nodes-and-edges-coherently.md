# 03 — React Flow publishes nodes and Edges coherently

**What to build:** Make the React Flow adapter publish projected Card nodes,
their declared handles and Route Edges as one coherent render state, so the
Space's first Route identity is minted only by the successful Edit that creates
it.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] A render that first contains an Edge also contains both endpoint handle
      declarations under the Edge's actual Route id.
- [x] The application no longer reserves a future first-Route UUID while a
      route-less Space is merely open.
- [x] Cancelling or rejecting a connection changes no Space identity or authored
      content.
- [x] The successful first connection mints one Route identity and renders its
      Edge without an intermediate state containing stale node handles.
- [x] Consecutive connections in one browser session continue resolving their
      declared handles without forced DOM remeasurement.
- [x] Existing route-independent spatial authoring handles and per-Route
      overview handles retain their distinct render responsibilities.
- [x] Real-browser coverage fails on React Flow warning #008 and proves both the
      first and a consecutive connection remain warning-free.
- [x] The pinned React Flow release remains unchanged.
- [x] `pnpm verify` and `pnpm e2e` pass.

## Answer

Implemented by PR #12. The render adapter publishes nodes, declared handles and
Edges as one projection. The successful completion mints the first Route id;
cancelled attempts reserve nothing. Declarative handle coverage includes first
and consecutive real-browser connections and rejects React Flow warning #008.
