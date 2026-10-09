# 01: The memory repository is a production store

**What to build:** The memory `SpaceRepository` that the E2E and fixture hosts use becomes production code, so that Running (ticket 03) can stand on it. Behaviour is unchanged: it moves out of test support into production source, and every current consumer — the E2E memory runtime, its commit-counting subclass, the fixture importer and the shared repository contract test — imports it from its new home.

**Blocked by:** None (can start immediately).

**Status:** resolved — delivered in PR #339.

- [x] The memory repository lives in production source and no longer in test support
- [x] It passes the shared `SpaceRepository` contract from its new home
- [x] The E2E memory runtime, its subclass and the fixture importer import it from there and behave as before
- [x] `pnpm typecheck`, `pnpm typecheck:packages`, eslint on touched files and the affected unit tests pass locally; the draft PR's `CI passed` is green (PR #339: `CI passed` green)
