# The browser location is one module

Status: ready-for-agent
Tags: Improvement
Blocked by: none
Related: `architecture-review/16` (ADR 0081, which this completes); ADR 0016

Surfaced by: the 4 September 2026 architecture review, candidate 1, then settled
by a grilling loop. The rejected alternatives are recorded under "Decided" so
none is re-opened.

## The defect

ADR 0081 settled that Navigation answers its own address and never learns what a
URL is, and removed the five `moves = getState().x !== y` comparisons that had
each stood in for one. It did not give the other half a home. The browser's
location is still App's, spread across nine pieces with no module between them:

| Piece | Site |
| --- | --- |
| `addressedCardId` | `App.tsx:89` |
| `destinationNotFound` | `App.tsx:119` |
| `syncDestination` | `App.tsx:120–128` |
| `copyProductDestination` | `App.tsx:129–133` |
| `installDestinationOpening` | `App.tsx:467–490` |
| `selectLayoutRow` | `App.tsx:501–512` |
| `activateGraph` | `App.tsx:522–526` |
| `syncedPosition`, `syncedUnresolved`, the sync effect | `App.tsx:545–615` |
| the `popstate` effect | `App.tsx:617–636` |

`App.tsx` is the only non-component module in `packages/app/src` that reaches
`window` at all, at four sites (`:124`, `:125`, `:132`, `:602`, `:623`, `:634`).
`main.tsx:13` already passes `window.location.pathname` *into*
`spaceStartup.resolve` rather than reading it inside, so the composition edge
already treats the location as an injected value; App is the exception.

**The duplication is one hand-rolled copy, not three divergent ones.** The
review first reported three clear-sets; verified against the tree there are two.
`installDestinationOpening` clears the report; both public wrappers clear the
report *and* the address — `selectLayoutRow` gets the report clear transitively
through `installDestinationOpening`, while `activateGraph` (`:522–526`) writes
the same two clears inline and does not call `installDestinationOpening` at all.
Its skip of the render-adapter write is correct and must survive: activating a
Graph does not change the Layout.

**The consequence is that six rules are reachable only by mounting the tree.**
`destinationSync` and `destinationRestoration` are already pure and already
tested in the node environment; what has no test surface is everything around
them — the two refs, the skip-if-already-decided guard, the hold-the-arrival
guard, and the ordering that clears the report by writing the location. The
unit suite carries 29 history assertions, 23 of them in
`card-authoring.test.tsx`, all behind a full mount and a
`vi.spyOn(window.history, 'pushState')`. The test says so itself at
`card-authoring.test.tsx:442`: *"a spy on `pushState` is the only way to see
that from here."*

That is the same shape ADR 0081 removed, one level out: a rule with no owner,
proved by the only instrument that can reach where it happens to live.

## What to build

**1. `HistoryApi` in `packages/app/src/browser-location.ts`** — five members,
the whole of what the browser is asked for:

```ts
export interface HistoryApi {
  readonly pathname: () => string;
  readonly href: () => string;
  readonly push: (path: string) => void;
  readonly replace: (path: string) => void;
  readonly onPopState: (listener: () => void) => () => void;
}
```

Injected at composition, **required with no default** — the same rule ADR 0016
already applies to `newId` and `reportObserverError`, and for the same reason: a
default reinstates the ambient one behind the owner's back. Two adapters make
the seam real rather than hypothetical — one over `window`, one recording fake
for tests.

**2. `createBrowserLocation(history: HistoryApi)`** in the same module, holding
its state behind `createObservableState` as Navigation, Space Authoring, Edge
Authoring and Open Spaces already do. Six members:

```ts
follow(app: ComposedApp): void      // the one Space the location now names
chooseLayout(layoutId: LayoutId): void
activateGraph(graphId: GraphId): void
href(destination: ProductDestination): string
getState() / subscribe(listener)    // { addressedCardId, destinationNotFound }
dispose(): void
```

`arriveAt(opening)` — today's `installDestinationOpening`, minus its
`setSpaceChromeEdit(null)` — is **private**, and is what both `popstate` and
`chooseLayout` run through. `activateGraph` starts sharing the internal
"a deliberate move clears the address and answers the report" step instead of
hand-rolling it, and keeps skipping the render-adapter write.

`syncedPosition` and `syncedUnresolved` become private module state with no
reader outside the sync; publishing them would let a caller decide a position
twice, which is what the refs exist to prevent.

The module registers `onPopState` itself and releases it in `dispose`.

**3. Composed once in `createOpenSpaces`**, not per-Space in `composeApp`. There
is one browser location and one history stack; `open-spaces.ts:271` already owns
`openPath`, the pathname-to-opening direction, and this is its inverse. Open
Spaces calls `follow(app)` on every switch. The module holds one `ComposedApp`
at a time and knows nothing about how many Spaces exist.

**4. `App.tsx` loses all nine pieces** and reads two published fields through
one `useSyncExternalStore`. It keeps exactly two things it already owns: the
`setSpaceChromeEdit(null)` that opens `installDestinationOpening` today — that
is an Interaction draft being discarded and belongs to whichever module owns the
chrome title Edit — placed at the call site before `chooseLayout`; and the
clipboard half of Copy link, which calls `browserLocation.href(destination)` and
keeps `copyLink` and `clipboardFailure`.

The four surviving readers of `addressedCardId` are unchanged in behaviour: the
canvas-selection effect (`:97–101`), the Cards View reveal (`:253–272`),
`CardsDrawer.revealedCardId` (`:1045`) and the addressed-Card surface
(`:1089–1092`), whose "is it drawn" derivation reads `liveProjection` and stays
in App because it is the render adapter's fact, not this module's.

**5. Delete** the `syncDestination` callback, both refs, both effects, and the
`pushState` spy in `card-authoring.test.tsx`.

The `destination-*` modules are **unchanged**. `destinationSync`,
`destinationRestoration`, `destinationOpening`, `AddressedPosition` and
`samePosition` keep their names, stay pure, and stay where they are. This ticket
adds the one module above them that knows a browser exists.

## Decided

Recorded so none is re-opened.

- **A factory, not a React hook.** A hook would preserve the effect's dependency
  list and be a far smaller diff, but every test would stay a jsdom mount, which
  is the thing this exists to fix. Converting the dependency list into an
  explicit subscription to Navigation is the work of this ticket, not a side
  cost.
- **Session-level, not per-Space.** `composeApp` is per-Space and Navigation is
  per-Space, which argues for symmetry. Against it: a factory constructs at
  compose time rather than mount time, so `onPopState` in `composeApp` would
  register N live listeners for N open Spaces, each holding its own
  `syncedPosition` — N modules disagreeing about one history, which is the
  defect shape this ticket removes. Today that is safe only because one `App` is
  mounted at a time.
- **Push, not pull.** The module takes `HistoryApi` alone and is handed the
  current composition by `follow`. Given `OpenSpaces` instead, every node test
  would have to build an Open Spaces to reach it. `follow` also states in the
  type what is currently implicit in the mounting: the location follows exactly
  one Space at a time.
- **The name.** `createProductLocation` was rejected — "product" appears **zero**
  times in `CONTEXT.md`; it is `@project/http`'s word for its own contract, and
  naming an `app` module after it promotes one package's internal vocabulary
  into another package's structure. `createDestinationCoordination` was rejected
  because `packages/persistence` already spends "coordination" on the
  multi-Space commit protocol. Extending the `destination-*` family was rejected
  because every name left in it is already one of its own functions, and
  `destination-history` collides with `CONTEXT.md`'s Traversal history. Putting
  the members on `OpenSpaces` was rejected because `architecture-review/14`
  deepened that interface to be domain-shaped, and push/replace/href re-widens
  exactly what it narrowed. `browser-location` spends no domain term: "location"
  is `window.location`'s own word, used the way `CONTEXT.md`'s render-layer
  section licenses for a platform vocabulary we build directly against.
- **Nothing enters `CONTEXT.md`.** The domain has no browser in it, which is
  ADR 0081's point.
- **No new ADR.** This places a seam ADR 0081 already decided the rule for. It
  does not change what Navigation knows, and it does not change the push /
  replace / none decision.

## Behaviour that changes, deliberately

- `popstate` is registered when Open Spaces composes rather than when `App`
  mounts. One listener exists for the session instead of one per mounted `App`.
- `addressedCardId` belongs to the followed Space rather than to a mounted
  component's lifetime. There is one location naming one Card in one Space, so
  `follow` replacing the composition is what makes the addressed Card belong to
  the Space now shown; a reader switching away and back observes the same thing
  they do today, when unmounting resets it.

## Acceptance

- [ ] `HistoryApi` has five members and is required with no default, at every
      composition site (ADR 0016).
- [ ] `createBrowserLocation` publishes exactly `addressedCardId` and
      `destinationNotFound`; `syncedPosition` and `syncedUnresolved` are private.
- [ ] `arriveAt` is private, and `activateGraph` shares its clear-set rather than
      hand-rolling one — while still not writing to the render adapter.
- [ ] `App.tsx` names `window.history` and `window.location` nowhere. The
      `beforeunload` listener at `:649` and the `document.querySelector` focus
      calls at `:440` and `:308–318` stay — different concerns, out of scope.
      Product-URL reads and writes exist only in the one `window` adapter and in
      `main.tsx:13`.
- [ ] The six rules have node tests against a recording `HistoryApi`, with no
      DOM: mount writes nothing whatever the location says; a repeated Layout
      choice corrects an unresolved location without pushing; presenting from an
      unresolved location clears the report and pushes once; a Back onto a dead
      address reports rather than corrects; StrictMode's double invocation writes
      nothing; advance-then-retreat across a self-Edge takes no further entries.
- [ ] Two mount tests remain, one per direction, proving App is wired to the
      module — a Layout choice reaches `HistoryApi`, a synthetic `popstate`
      reaches Navigation. The `pushState` spy is gone.
- [ ] `packages/app/e2e/space-routing.spec.ts` is untouched: it proves the real
      browser honours what the fake stands in for, which a fake cannot.
- [ ] The `destination-*` modules are unchanged, and still have no `window`.
- [ ] `CLAUDE.md`'s `app` bullet is corrected — it currently says "one effect in
      `App.tsx` hands that address … to `destinationSync`", which this makes
      stale. ADR 0081's body needs no change.
- [ ] `pnpm verify` and `pnpm e2e` green, with real output reported. `e2e:ladle`
      is inapplicable unless a story changes; say so rather than omitting it.

## Not in scope

- **The chrome title Edit draft.** `setSpaceChromeEdit(null)` stays a call-site
  act in App. Giving that Interaction draft its own module is the 2026-09-04
  review's candidate "useSpaceChromeTitleEdit" and wants its own ticket.
- **The clipboard.** `copyLink` and `clipboardFailure` stay in App. This module
  answers `href(destination)` and nothing about copying.
- **The disablement matrix, the authorable-selection answer and the resize
  draft.** Candidates 2, 3 and 4 of the same review; each is independent of this
  and shares no file except `App.tsx`.
- **Collapsing App's remaining concerns.** After this, App still holds the
  derivation chain, the projection pipeline, presenting wiring, persistence
  chrome and the JSX. That is a defensible composition root and is not what this
  ticket is measured against.
