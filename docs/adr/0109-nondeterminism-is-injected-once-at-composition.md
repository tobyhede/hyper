# Nondeterminism is injected once, at composition

Status: accepted
Related: 0016, 0030, 0035, 0081

A module that mints identities, reads time or otherwise calls a nondeterministic in-process function receives that function when it is composed, as a required parameter with no default. Its operations then stay in domain language and do not take the function per call. Tests supply a deterministic one. Nothing spies on or mocks the ambient generator.

## Where the generator is named

The ambient generator, `newUuid`, is named where a process is composed: `createSpaceStartup`'s default in `packages/app/src/space.ts`, `src/cli/entry.ts` and `src/http/database-http-runtime.ts`. Below that it is a parameter. `createOpenSpaces` takes `newId` required and supplies it to every `composeApp` call it makes. `createSpaceAuthoring`, which mints the Resource, Map and Graph ids of a completed Edit, takes it required too. So is `initializeSpace` and `newSpace` in `@project/graph`, `identifySpace` at the aggregate-directory read boundary, and database startup. Every authored identity therefore has one visible source.

`composeApp` still defaults `newId` to `newUuid`, for a test that composes one Space by hand. It is the one place below a composition root where the ambient generator can come back unseen, and a production caller does not rely on it: `createOpenSpaces` always passes its own.

The same shape governs the two other ambient reaches a test has to observe or replace. The sink an observer failure is reported to is named once, at the composition, which answers it as `ComposedApp.reportObserverError`; a collaborator composed over a finished app, such as `createEmbeddedAuthoring`, takes it required rather than reaching for `console.error` itself. The browser's history is the `HistoryApi` that `createOpenSpaces` takes required (ADR 0081).

## Tests own a generator

Tests name the ids they assert on through a deterministic generator (`packages/app/test/minting.ts`, which throws once its named ids run out). They never use `vi.spyOn(crypto, 'randomUUID')` or any other global mock, for three reasons:

- **A constant collides.** A property test runs hundreds of cases, so a mock returning one value needs a counter, and at that point a generator exists anyway, hidden in a `beforeEach` that nothing at the call site admits to.
- **A CSPRNG cannot be seeded.** `crypto.randomUUID` is unseedable by design, so controlling it means owning it, which is injection by another name.
- **A mock goes silently inert.** If the implementation moves to UUIDv7, which reads the clock as well as the entropy pool, a spy on `randomUUID` stops controlling the output without failing.

These are the grounds ADR 0016 gave when `loadSpace` faced the same choice. ADR 0016 is rejected for its second identifier, and this argument was never part of what was rejected, so it is recorded here as a live decision.

## What is not injected

A deterministic rule is not injected. `titles.ts` mints `Resource N`, `Map N` and `Graph N` through three named operations, and there is nothing in them a test would want to replace. No port or adapter is made for a dependency with one in-process implementation. The parameter is the function itself.

## Rejected

- **A `crypto.randomUUID` default on the module that mints.** It lets any caller that omits the parameter reinstate the ambient generator, and nothing at the call site shows it happened. One test spy that named two ids for an Edit minting three let a Map quietly take its id from the real generator.
- **Global mocking**, for the three reasons above.
