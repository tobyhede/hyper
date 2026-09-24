# 03: Extract Space Resource lifecycle planning into a pure module

**What to build:** The decisions of the Space Resource lifecycle — what a create, link, update or delete changes across Spaces, and when it is refused — as pure functions from the Spaces involved and an operation to a plan outcome. The registry calls them instead of deciding inside its closure. They can be tested in Node without a backend or a session.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Planning and refusal logic lives in its own module with no session, backend or observable-state dependency
- [ ] The new module has direct unit tests, with a property test where an invariant is stated (e.g. a plan never leaves a Space Resource dangling)
- [ ] 02's tests pass unchanged
- [ ] `pnpm verify` green
