# The browser location is one module

Status: resolved
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

## Answer

`packages/app/src/browser-location.ts` holds `HistoryApi` and
`createBrowserLocation`, built as specified. Two adapters: the `window` one is
`browserHistory()` in `space.ts`, and the recording one is
`packages/app/test/browser-history.ts`, whose `popTo` is Back and Forward.

Three things the ticket left open, decided here.

**`follow(app)` reads the addressed Card off the location.** The ticket fixes
`follow`'s signature at one argument, so the Card could not be handed in — and
should not be: it is a fact about a location and the Space now shown.
`follow` therefore runs `destinationRestoration` over the current pathname and
takes `opening.cardId`, which is the same value `openPath` computed from the
same pathname a moment earlier. It reports nothing, because the arrival report
belongs to `popstate` and to startup's own failure. Mount still writes nothing:
`createApp`'s opening `openGraph` / `openPresentation` notifies, the sync runs,
and `destinationSync` answers `none` because the location already opens that
exact position.

**Notification, not an effect's dependency list.** The module subscribes to
Space Authoring, which republishes on both its collaborators and coalesces an
Edit's several writes into one publication — the batching the React effect used
to get for free.

The module does **not** replace that batching. Each operation writes the whole
of its own state *before* it moves a collaborator, so a notification raised
part-way through already sees the settled position and decides what the
operation's own `settle` would decide; the second decision is then a no-op,
because `sync` skips a position it has recorded and `publish` skips a state that
has not changed. That is the functional-core rule `AGENTS.md` already asks for,
and it is why no window around an operation is needed.

The ordering is load-bearing rather than incidental, and `restore` is where it
bites: the restored Card is known the moment the restoration resolves, and
setting it after `arriveAt` would notify against a position still carrying the
Card the reader is leaving — taking a history entry over the one the browser has
just navigated to, which is the entry ADR 0081's `none` exists to refuse.

**`createSpaceStartup` takes the adapter as an optional third seam.**
`test/unit/app-http-startup.test.ts` composes it twelve times in the node
environment, so a hard-wired `window` made that file unrunnable. It now defaults
to `browserHistory()` beside the existing `backend` and `newId` defaults — the
composition root is where all three ambient things are named — and the node test
supplies the recording one. `createOpenSpaces` still requires it, with no
default.

**One deliberate behaviour loss.** `titleEdit.onBegin` also
cleared `destinationNotFound` — a tenth writer the ticket's table does not list.
Clearing the report is what asks the sync to correct the stale location, so
losing it means beginning a Layout or Graph rename no longer dismisses a
"Destination not found" alert or rewrites the dead path. Preserving it needs a
seventh member on an interface the ticket fixes at six, and beginning a chrome
title Edit is not a location event; the behaviour arrived untested in
`96f895d1` as one of nineteen review fixes. Recorded rather than routed around —
if it is wanted back, it belongs with the chrome title Edit module this ticket
parks.

Acceptance, each verified:

- `HistoryApi` is five members, required with no default on `createOpenSpaces`
  and on `createBrowserLocation`.
- `createBrowserLocation` publishes `addressedCardId` and
  `destinationNotFound`; `syncedPosition` and `syncedUnresolved` are closure
  variables with no accessor.
- `arriveAt` is private; `chooseLayout` and `activateGraph` share
  `deliberateMove`, and the test "answers the report from an activated Graph
  without disturbing the render adapter" pins the skipped adapter write against
  its contrast, "clears the published projection when a choice changes the
  Layout".
- `App.tsx` names neither `window.history` nor `window.location`. Its three
  surviving `window` mentions are the `beforeunload` listener and two comments;
  the focus queries are untouched.
- Six rules have node tests in `packages/app/test/browser-location.test.ts` (11
  tests, no DOM). "StrictMode's double invocation" is modelled as the same
  position decided a second time, which is the rule underneath it — the module
  is not re-created by a remount, so the redundant notification is the only form
  the double invocation now takes.
- Three mount tests remain: "spends a Layout choice on the injected History
  API" in `card-authoring.test.tsx`, and in `SpaceApp.test.tsx` the `popTo` half
  of the addressed-Card reveal and the chrome title draft a Back to another
  Layout discards. The `pushState` spy is gone, and so are the 23 history
  assertions behind it.
- `packages/app/e2e/space-routing.spec.ts` is byte-identical.
- `destination-coordination.ts` and `destination-opening.ts` are byte-identical.
- The `app` bullet is corrected in its own commit.

Three test files needed a location that agrees with the `opening` they pass,
which production gets for free because `openPath` builds both from one pathname:
the two clipboard tests and the Cards-drawer reveal in `SpaceApp.test.tsx` now
mount over a `recordingHistory` at the address that names their Card.

Final verification, on this branch rebased onto `main`: `pnpm verify` green —
171 test files, 2078 passed, 2 skipped. `pnpm e2e` green — 149 passed, no
flakes. `pnpm e2e:ladle` not run and inapplicable: no component with a story
changed, and `packages/ui`, `packages/app/stories` and `ladle-e2e` are
untouched.

## Not in scope

- **The chrome title Edit draft.** `setSpaceChromeEdit(null)` stays a call-site
  act in App. Giving that Interaction draft its own module is the 2026-09-04
  review's candidate "useSpaceChromeTitleEdit", and it now has its own ticket:
  `architecture-review/18`, which also carries the deliberate behaviour loss
  recorded above — `titleEdit.onBegin`'s clear of the destination report — as a
  decision to take rather than a debt to repay.
- **The clipboard.** `copyLink` and `clipboardFailure` stay in App. This module
  answers `href(destination)` and nothing about copying.
- **The disablement matrix, the authorable-selection answer and the resize
  draft.** Candidates 2, 3 and 4 of the same review; each is independent of this
  and shares no file except `App.tsx`.
- **Collapsing App's remaining concerns.** After this, App still holds the
  derivation chain, the projection pipeline, presenting wiring, persistence
  chrome and the JSX. That is a defensible composition root and is not what this
  ticket is measured against.

## Comments

Two amendments made after this ticket resolved, kept out of `## Answer` so the
decision above stays the decision that was taken.

**The depth counter went, and the ordering is what replaced it.** A counter
around each operation was written first and does work: it suppresses the
mid-operation notification, so the ordering stops mattering. It was replaced
because of what it cost in evidence rather than in lines. Four runs, each of the
thirteen tests, settled it:

| Module | Ordering | Result |
| --- | --- | --- |
| `settle` | Card before `arriveAt` | 13 passed |
| `settle` | Card after `arriveAt` | **1 failed** — the Back test |
| `settle` | `follow` ignores a second composition | **1 failed** — the follow test |
| depth counter | Card after `arriveAt` | 13 passed |

The last row is the argument. With the counter in place a wrong ordering is
invisible, so nothing in the suite could fail if a later operation got it wrong;
without it, the rule is stated in one comment and pinned by one test that does
fail. The counter's robustness was real and is the thing given up: it covered
any ordering mistake in any operation, where the rule now covers the operations
that have a test.

**The rebase onto `main` changed what the chrome title draft test can reach.**
`main`'s generalised entity-actions menu gives a Graph row its own Rename, which
is the subject that test now uses, and the reason it is worth having: a Graph
row belongs to the selected Layout, so a Back that changes the Layout unmounts
the row the draft was begun on. The draft is discarded anyway — by
`chromeEditingDisabled`, since the arrival clears the published projection and
`editable` reads `hasCardsOnCanvas` — but only the test says so, because the
clear that used to be spent on this path went to the Layout choice call site
with `arriveAt`.
