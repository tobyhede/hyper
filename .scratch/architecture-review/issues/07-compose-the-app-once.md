# Compose the app once

Status: resolved

Surfaced by: the 2026-08-21 architecture review, candidate 2, then settled by a
grilling loop. The candidate that was ranked above it — the catalogue's
story-evidence walk — shrank on verification and is now issue 09.

Blocked by: None.

## The defect

"What an opened Space is composed of" is a fact about this system with no module
of its own, so it is written twenty times: once in production and nineteen times
in tests.

`App.tsx:40-84` builds ten things in an order that is not free:

```
readWorkingSpace = createWorkingSpaceReader()                        snapshot.ts:32-41
currentSpace     = () => readWorkingSpace(spaceSession.getState().working)
resolveRenderer  = createRendererResolver({ newGraphId: newUuid })
initialSelection = defaultRenderer(space)
initialRenderer  = resolveRenderer(space, initialSelection)
navigation       = createNavigation(currentSpace, resolveRenderer, initialSelection, space)
initialPlacement = initialRenderer.kind === 'view' ? null : Placement.fromLayout(...)
authoring        = createSpaceAuthoring({ session, navigation, currentSpace, resolveRenderer, initialPlacement })
adapter          = createRenderAdapter(authoring)
edgeAuthoring    = createEdgeAuthoring({ authoring, adapter, connections })
```

The resolver must exist before Navigation, the resolved renderer before the
placement, Authoring before the adapter, and both before Edge Authoring. Every
one of them must close over **the same** `currentSpace`, because that is what
gives them one `Space` identity to share — which `App.tsx:41-44` says out loud:
"both see the same `Space` identity, which is what the render memos below hang
on." None of it is written down anywhere a caller can read.

**Two consequences, both live.**

**Tests run an identity regime production does not.** Eighteen session-backed
sites across seven files write a `currentSpace` closure, and all eighteen are
byte-identical:

```ts
const currentSpace = () => {
  const result = loadSpaceSnapshot(session.getState().working);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result.space;
};
```

Every one re-parses on every call, so every call answers a fresh `Space`
identity, while production memoises on snapshot identity. The nineteenth
(`navigation.test.ts:646`) is `vi.fn(() => space)` and belongs to a different
problem.

**The ADR 0016 seam is withheld at the one composition that should offer it.**
`createApp` takes `{ space, spaceSession }` and nothing else. `newGraphId` is
hardcoded to `newUuid` at `App.tsx:52`, and `createSpaceAuthoring` is handed no
`newId` at all, so it falls back to its own default. The result is that
`card-creation.test.tsx`, `card-authoring.test.tsx` and `Workspace.test.tsx` —
the only tests that drive the *real* composition — cannot assert on a single
minted identity, which is exactly what ADR 0016 says composition-time injection
exists to make possible.

**What the duplication costs, in numbers.** Six private helpers across five test
files absorb 96 of the call sites and each re-derives the same closure, the same
three-argument `createNavigation`, and its own deterministic `newGraphId`
counter. Eighteen of eighteen sites pass a deterministic Graph-id minter and none
uses `newUuid`, in five distinct shapes. Two of the helpers carry independent
copies of the same `exactOptionalPropertyTypes` conditional-spread boilerplate
(`space-authoring.test.ts:216-233`, `render-adapter.test.ts:125-127, 159-160`)
that a single forwarding signature deletes.

## What to build

### 1. `packages/app/src/compose-app.ts`

Two functions, layered, because fourteen of the eighteen sites stop at Authoring
and have no reason to hold a render adapter subscribed to it.

```ts
composeCore({ space, spaceSession, selection?, newGraphId? })
  → { currentSpace, resolveRenderer, navigation }

composeApp({ space, spaceSession, selection?, newGraphId?, newId?,
             initialPlacement?, reportObserverError?, connections? })
  → { currentSpace, resolveRenderer, navigation, authoring, adapter, edgeAuthoring }
```

- `currentSpace` closes over **one** `createWorkingSpaceReader`, so every
  collaborator shares one `Space` identity. This is the defect's fix.
- `selection` defaults to `defaultRenderer(space)`. Production passes nothing;
  every test passes the `CanvasRendererId` it already names.
- `newGraphId` and `newId` both default to `newUuid` and are passed
  **explicitly** to `createRendererResolver` and `createSpaceAuthoring`, so
  `createSpaceAuthoring` stops defaulting on its own and both identities acquire
  one visible source.
- `createNavigation` is called with **three** arguments. See §2.

A new `.ts` module rather than a second export on `App.tsx`: that file is 732
lines and building a component tree, and a test that wants collaborators should
not load it.

### 2. Drop the fourth `createNavigation` argument

`App.tsx:60` passes `space` as `initialSpace`, and that `Space` is a *different
identity* from `currentSpace()` — `openStoredWorkspace` parses the snapshot
(`open-workspace.ts:25-34`) and `openSpaceSession` then `structuredClone`s it
(`persistence/src/session.ts:51`). Production's own composition therefore mixes
two identities at startup, which is the regime this ticket exists to unify.

`navigation.ts:167` already declares `initialSpace: Space = currentSpace()`, so
omitting the argument changes nothing but which object Navigation resolves its
initial renderer against. It matches what all eighteen tests already do.

**This is the one behaviour change in the ticket.** `pnpm e2e` green *and
unchanged* is what proves it harmless.

### 3. A Graph-id minter beside `mintingIds`

`packages/app/test/minting.ts` covers `createSpaceAuthoring({ newId })` only,
which is why the Graph-id counter is written out three times
(`space-authoring.test.ts:190-212`, `space-authoring-operations.test.ts:83-95`,
`space-authoring.property.test.ts:170-177`) and the literal
`() => uuidSchema.parse('…00ff')` four more. Add the equivalent for
`newGraphId`, with the same exhaustion-throws behaviour, and have the migrated
sites pass it.

`stories/support/spaces.ts`'s `storyGraphIds()` stays as it is — it mints for a
fixture, not for an assertion.

### 4. Migrate all eighteen session-backed sites

| Group | Sites | Migrates to |
|---|---|---|
| Full chain, through `createEdgeAuthoring` | `edge-authoring.test.ts:87` (32 calls), `edge-authoring.test.ts:346`, `edge-authoring-react.test.tsx:183` (17 calls) | `composeApp` |
| Through `createRenderAdapter` | `render-adapter.test.ts:135` (4 calls) | `composeApp` |
| Through `createSpaceAuthoring` | `space-authoring.test.ts` ×11, `space-authoring-operations.test.ts` ×2, `space-authoring.property.test.ts` ×1 | `composeApp`, ignoring the adapter members — or `composeCore` plus their own `createSpaceAuthoring` where they wrap a collaborator |
| Navigation wrapped before Authoring | `space-authoring.test.ts:967, 1872, 2030` | `composeCore`, then their own `createSpaceAuthoring` over the wrapper |

`edge-authoring-react.test.tsx:183` keeps substituting `ConnectionCompletion`
through `composeApp`'s `connections?` argument; the reason it does so is written
at `:174-182` and does not change. `space-authoring.test.ts:249`'s
`attachAuthoring` derives its `initialPlacement` by calling
`resolveRenderer(currentSpace(), renderer)` exactly as `App.tsx:63-67` does, and
`composeCore` returns both, so it keeps that derivation.

### 5. Out of scope

- The two Navigation-only modules (`navigation.test.ts:14-30` and its 22 call
  sites, `stories/support/navigation.ts:54-107`). They need an arbitrary
  `currentSpace` thunk with no session behind it — a counting closure, a
  `vi.fn`, a reassignable `let` — which is a different problem.
- The eleven `createRenderAdapter(spy.authoring)` sites over the hand-written
  `SpaceAuthoring` stub at `render-adapter.test.ts:58-101`. They build no Space
  and no session; a composition helper has nothing to offer them.
- `stories/support/WorkspaceSidebarFixture.tsx:167-171` and
  `stories/support/navigation.ts`. Both are React-lifetime compositions whose
  indirection exists to survive a re-render, which `composeCore` does not serve.
  Touching them makes this a story change and drags `pnpm e2e:ladle` and ADR
  0052's parity evidence into a refactor that needs `verify` and `e2e` only.

## Acceptance criteria

- [x] `packages/app/src/compose-app.ts` exports `composeCore` and `composeApp` with the signatures above; `createApp` is that call plus the component it already builds, and its own signature is unchanged.
- [x] No `const currentSpace =` survives in `packages/app/test` outside the Navigation-only sites named in §5.
- [x] A test asserts that `composeCore`'s `currentSpace` memoises: two calls with no intervening commit answer the same `Space`. This is the regression guard — it states the property all eighteen closures got wrong.
- [x] `createSpaceAuthoring` receives an explicit `newId` from the composition; no collaborator falls back to `newUuid` on its own.
- [x] A Graph-id minter sits beside `mintingIds`; the three hand-rolled counters and the four `…00ff` literals are gone from the migrated sites.
- [x] The `exactOptionalPropertyTypes` conditional-spread blocks at `space-authoring.test.ts:216-233` and `render-adapter.test.ts:125-127, 159-160` are gone, and `anti-slop/no-conditional-empty-object-spread` stays green.
- [x] `pnpm verify` passes, with real output quoted.
- [x] `pnpm e2e` passes **green and unchanged**. This is a behaviour-preserving refactor with one deliberate behaviour change (§2), and an unchanged e2e run is the guard that proves it.

## Decided — do not re-open

- **`composeApp` forwards a dependency the collaborator itself already declares,
  and invents none.** `connections`, `initialPlacement`, `reportObserverError`
  and the two minters are all declared by the collaborators that receive them.
  Anything beyond that turns the module into a dependency-injection container,
  which is the same instinct ADR 0016 records as "do not manufacture a port or
  adapter seam when the dependency has one in-process implementation". No ADR
  for this; ADR 0016 already carries the general rule and an ADR that restates an
  accepted one weakens the log.
- **The record is returned, and its width is accepted.** Seven names come back.
  Hiding them behind pass-through methods fails the deletion test — App reads all
  six directly and the pass-throughs would hold no logic. Depth here is in the
  ordering and the shared identity, which a caller can no longer state wrongly
  because it never states them at all.
- **No `decorateNavigation` hook.** The three sites that wrap the real Navigation
  take `composeCore` and keep their own `createSpaceAuthoring` call, because that
  seam is what those tests are about. A hook would hide it and start `composeApp`
  down the container road.
- **Not called `createWorkspace`.** `CONTEXT.md` lists *workspace* under Space's
  `_Avoid_`, and the code already says it 26 times in `packages/app/src`. See
  issue 08; this ticket deliberately adds nothing to that debt.
- **All eighteen sites in one ticket, not one exemplar first.** A helper adopted
  by one file is the twentieth spelling of the composition. The acceptance line
  above is only checkable if the sweep is complete.
- **That no test depends on the fresh-identity behaviour was traced, not run.**
  `loadSpaceSnapshot` is pure and the session installs a `structuredClone` onto a
  new state object every time (`session.ts:51, 147, 169, 180`), so a
  snapshot-keyed memo and a fresh parse differ only in object identity and parse
  count. The suite is what settles it. The site nearest to depending on freshness
  is `edge-authoring-react.test.tsx:1109`, which already passes while the arrays
  it feeds are fresh on every render, so memoising can only strengthen it.

## Answer

`packages/app/src/compose-app.ts` states the composition once. `composeCore`
answers `{ readWorkingSpace, currentSpace, resolveRenderer, navigation }` and
`composeApp` adds `{ authoring, adapter, edgeAuthoring }` — the seven names the
ticket predicted. `createApp` is one `composeApp` call plus the component it
already built, and all eighteen session-backed sites now go through one of the
two. `packages/app/test/compose-app.test.ts` holds the regression guard: two
`currentSpace()` calls with nothing committed between them answer the same
`Space`, which is the property all eighteen hand-written closures got wrong.

Four things landed differently from the written plan, all recorded here rather
than left to be rediscovered from a diff.

**`composeCore` takes no `space`.** §1 wrote `space` into the signature and §2
took away the only thing it was for. Once `createNavigation` resolves its
opening renderer against `currentSpace()`, `defaultRenderer(space)` is the last
read of the parsed-on-open object — value-equal to the session's
`structuredClone` of it and a different identity — so keeping the parameter
would have preserved in the new module exactly the mix §2 exists to remove. It
is gone; `createApp`'s own signature is unchanged (`{ spaceSession }:
OpenedSpace`), and `OpenedSpace.space` is still what `openStoredWorkspace`
validates through.

**`readWorkingSpace` comes back as a fourth core member.** App's render path
reads the snapshot *React is rendering* while `currentSpace` reads the session's
live one, and sharing one reader is what gives both the same `Space` identity to
memoize on. Without it App would need a second reader and the fix would not
hold. This is the seventh name the ticket's "Decided" section counted.

**`composeApp` derives `initialPlacement` when it is absent.** Acceptance 1
requires `createApp` to be one call, and production cannot derive the opening
placement before the resolver the call creates. Absent means "whatever the
opening renderer says" (ADR 0025), an explicit `null` means none, and a
`Placement` means that one. `attachAuthoring` keeps its derivation in the sense
that mattered — it still opens on the selected Layout's own map — but the
arithmetic moved inside the composition.

**§2 changes one thing more than the ticket claimed, and it needed a fix rather
than a note.** `createNavigation`'s `initialSpace: Space = currentSpace()`
default now runs at composition, so a working snapshot that fails domain intake
throws out of `createApp` — which `Workspace.tsx` called *outside*
`WorkspaceFailure`, blanking the page in the one case that boundary exists to
report. `mountWorkspace` now guards composition as well as rendering, both paths
answering the same sentence through `WorkspaceFailureView`. The open-time test
stands unchanged, and a second case covers the boundary's own path — a snapshot
that stops loading under a mounted workspace.

Two smaller consequences: `createSpaceAuthoring.newId` is now **required**, so no
collaborator falls back to `newUuid` on its own; and `reportObserverError` is
forwarded only to the two collaborators that declare that name, leaving the
connection completion's `reportInvariant` — an invariant violation at the React
Flow seam, not an observer that threw — on its own default.

`SpaceAuthoringDependencies.reportObserverError`,
`EdgeAuthoringDependencies.reportObserverError` and
`ConnectionCompletionDependencies.reportInvariant` were widened to
`?: T | undefined` so one forwarding signature carries them; that widening is
what deletes both `exactOptionalPropertyTypes` conditional-spread blocks rather
than moving them.

## Verification

`pnpm verify`, exit 0. The suite gained the seven `compose-app.test.ts` cases and
the second `Workspace.test.tsx` boundary case, and lost none:

```
 Test Files  150 passed (150)
      Tests  1601 passed | 8 skipped (1609)
```

`pnpm e2e`, exit 0. One hundred and fifteen tests, the count the branch
inherited — no e2e file is touched by this change, which is what makes the run
the guard §2 asked for:

```
  115 passed (59.0s)
```

`pnpm build`, exit 0. Not part of `verify`, run because `App.tsx` changed.

`pnpm e2e:ladle` was not run: no component with a story changed, and
`stories/support/` is untouched by design (§5).
