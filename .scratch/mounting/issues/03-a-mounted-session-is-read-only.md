# 03 — A mounted session is read-only

Status: ready-for-agent

**What to build:** read-only as an answer of the whole session (ADR 0130).

- `authoring-availability.ts` gains a mounted answer. It withholds every Edit: Open and Close, renames, deletes, Resource, Map and Graph creation, drags, connects, resize and content editing. It keeps selecting Resources, navigating (Space, Map and Graph choice, Open Spaces, Enter, Exit) and Present.
- Do not use the `read-only` Map surface policy for this. `surfaceOffers` withholds Present under it, and `withSurfacePolicy` withholds every node gesture, which leaves Enter unreachable (`packages/app/src/map-surface-policy.ts`). That policy keeps meaning an embedding that is not yours.
- The in-page HTTP application from 02 refuses every write rather than storing it.
- The Command Dock shows a read-only mark. A mounted session reports no persistence state, `Persisted` included. Use the `shadcn-first-ui` skill for the mark.

**Depends on:** 02.

**Acceptance:**

- `authoring-availability` tests: the mounted answer offers Present, Enter, Exit and navigation, and offers no Edit.
- A test over 02's composition shows that a write sent to the backend is refused.
- A component or story test shows the mark, with no persistence status beside it.
