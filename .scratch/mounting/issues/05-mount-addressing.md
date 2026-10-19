# 05 — Mount addressing

Status: ready-for-agent

**What to build:** where a mounted page gets its GitHub location, and how the location stays in the address (ADR 0130).

- The location is the `source` query parameter, else a build-time default, else the page asks for one. Asking for a location is a small form, built with the `shadcn-first-ui` skill.
- Product URLs do not change. The browser-location module carries `source` across every history write it makes, and a destination resolver never sees it.
- When the location named a branch, the resolved SHA from 04 replaces the ref in `source` with `history.replaceState`. A reload, a shared link and the Notes window then read the same commit, and the page shows which commit it is reading.
- The Notes window opened from a mounted page mounts the same `source`.

**Depends on:** 02, 04.

**Acceptance:**

- `packages/app/test/browser-location.test.ts`: `source` survives a Map move, a Graph move, Present, Enter and a browser traversal, and a branch is replaced by its SHA exactly once.
- A test shows the build-time default used when `source` is absent and overridden when it is present.
