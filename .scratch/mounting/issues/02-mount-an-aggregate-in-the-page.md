# 02 — Mount an aggregate in the page

Status: ready-for-agent

**What to build:** the mount module, and a composition of browser startup that uses it (ADR 0130).

- One operation: given an Aggregate directory's files as a path-to-bytes map, read them with 01's core, establish a fresh memory repository from them through the aggregate lifecycle, and return either the reader's refusal or what `createSpaceStartup` takes: a `SpaceBackend` and a stored-image display.
- The backend is the existing `HttpSpaceBackend` given a `fetch` that dispatches to `createSpaceHttpApp` in the page, over that repository. The same intake, commit decision, working-space loader and destination resolution answer every request.
- `/` resolves in the client to the Meta Space's address, as the Space host's redirect does on a server.
- A stored image's `/images/<content-id>` resolves to an object URL over the mounted bytes, through one display resolver supplied at composition. On the server composition the resolver is the identity.
- A refusal is shown on the application's own failure surface with the reader's diagnostics.

**Depends on:** 01.

**Acceptance:**

- A test composes startup from a path-to-bytes map of `packages/app/fixture` and sees the Meta Space opened with its Resources.
- A broken map shows Import's diagnostics.
- A stored image draws from an object URL.
- Prior art: the startup and composition tests that call `composeCore`/`composeApp`.
