# 05 — Mount addressing

Status: ready-for-agent

**What to build:** where a mounted page gets its GitHub location, and how the location stays in the address (ADR 0130).

- The location is the `source` query parameter, else a build-time default, else the page asks for one. Asking for a location is a small form, built with the `shadcn-first-ui` skill.
- Product URLs do not change. The browser-location module carries `source` across every history write it makes, and a destination resolver never sees it.
- Every successful mount writes the complete resolved GitHub location from 04, with a commit SHA, into `source` using `history.replaceState`, including when the location came from the build-time default. Replace the address only when it differs. A reload, a shared link and the Notes window then read the same commit even after a deployment changes the default, and the page shows which commit it is reading. The bare domain opens the current deployment default.
- The Notes window opened from a mounted page mounts the same `source`. Scope mounted presentation communication by resolved repository, directory, commit and Space ID. Two revisions of the same Space on the same origin cannot follow or control each other; windows of the same resolved source and Space keep the existing following behavior.
- That scoping lives in `packages/app/src/browser-presentation-channel.ts`. There, `presentationChannelName(spaceId)` names the one `BroadcastChannel` per Space, and in a mounted session it also takes the resolved source. A server session keeps today's name. The presence lock, `presentationPresenceName`, is already keyed by a minted presentation id and needs no change.

**Depends on:** 02, 04.

**Acceptance:**

- `packages/app/test/browser-location.test.ts`: `source` survives a Map move, a Graph move, Present, Enter and a browser traversal, and both explicit locations and build-time defaults become complete commit-pinned locations in the address without a redundant history replacement.
- A test shows the build-time default used when `source` is absent and overridden when it is present.
- A copied URL still mounts its original commit after the deployment default changes. Opening the bare domain uses the new default.
- Mounted Notes tests open two revisions with the same Space ID on the same origin: each Notes window follows and controls only its own revision. Windows of the same resolved source and Space still follow normally.
