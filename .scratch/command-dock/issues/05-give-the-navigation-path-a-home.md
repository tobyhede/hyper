# 05 — Wire the Dock to the Exit that already exists

Status: resolved

**Exit is built.** `packages/app/src/open-spaces.ts` implements `exit`, and
`retireOpenSpace` is `CONTEXT.md:141` verbatim: it waits via
`registry.waitUntilRetirable`, refuses `failed` with recovery `retry`, refuses
`conflicted` with `resolve-conflict`, warns on `rejected` and proceeds only with
`{ warning: 'persistence-rejected' }`, refuses Meta as `meta-space-permanent`,
closes **one** Space, and moves the active Space if it was the one closed.
`packages/app/test/open-spaces.test.ts` covers all of it.

**What is missing is the surface.** Nothing in `packages/app/src` calls `close` —
only tests do. `enter`, `switchTo` and `open` are equally built and equally
unwired.

**The prototype reimplemented it rather than calling it.** `closeSpace`
(`command-dock.stories.tsx:540`) invents a cascade that closes a whole subtree
and invents refusal semantics that `ExitSpaceResult` already declares. Delete it
and call the real one.

## What to build

- [x] **Delete `closeSpace` from the prototype and call `openSpaces.exit`.** It
      closes one Space. There is no cascade in production and none is wanted:
      ADR 0068 — *"closing one Space never closes another"* — is what the built
      implementation already does.
- [x] **Render the three `ExitSpaceResult` arms.** `exited` needs nothing;
      `warning: 'persistence-rejected'` needs a confirmation that re-calls with
      the confirmation token; `refused` needs the reason, and for
      `persistence-recovery-required` the named recovery (`retry` or
      `resolve-conflict`). ADR 0082 obliges the surface to name which Space is
      unwell, so a silent refusal is not an option.
- [x] **The switcher indents, so the opened-from field is added.** `01` settled
      the indent-guide scheme, which is what this was waiting on. It is
      display-only, exactly as written: nothing acts on it, and Exit stays a
      one-Space operation.

## Note for whoever picks this up

This ticket asserted three times that Exit was unbuilt. It was built all along,
under the name `close` — so a search for the domain word found only
`exitPresenting`. The module has since been renamed, so `exit` is now findable by
its own name. Read the `OpenSpaces` interface, which lists every session
operation in one place, before concluding anything is missing.

## What happened

**The cascade is gone and the semantics are production's.** `closeSpace` and its
subtree walk are deleted. `exitSpace` in `dock-model.ts` closes one Space, and
its rules are `retireOpenSpace`'s rather than this file's: the root refuses as
`meta-space-permanent`, `failed` refuses with `retry` and `conflicted` with
`resolve-conflict`, `rejected` warns once and proceeds only on the confirmation
token, and the canvas falls to the first entry still open. It answers
production's own `ExitSpaceResult`, imported as a type, so an arm added there is
a compile error here. The Space menu now says **Exit Space** — `CONTEXT.md` gives
the word to this action — and `ExitReport` draws the two arms that are not
`exited` in a portalled `AlertDialog`, naming the Space and, for
`persistence-recovery-required`, the recovery that exists.

**Removing the cascade made the orphan question real, and it is answered by
re-homing rather than by tombstones.** The Spaces below the exited one hang off
its own opener, which is the nearest Space still open. A lazy "walk to the
nearest still-open ancestor" is not available: the closed entry is gone, so its
`from` is gone with it and the chain cannot be followed. Re-homing on exit gives
the same answer eagerly and keeps `openTree`'s walk total, so a Space whose
opener exited stays in the list that is the only way back to it. It is
display-only either way — nothing acts on it.

**It is a stand-in, not the call — and that is the finding ticket 07 needs.**
`exit` is a closure over a `SpaceSessionRegistry` of live `SpaceSession`s: it
decides by awaiting `waitUntilRetirable` and reading
`session.getState().persistence`, then releases the session and disposes a
`ComposedApp`. Reaching it from a story means standing up `createOpenSpaces` over
a `SpaceBackend`, composing a full app per open Space — Navigation, Space
Authoring, the Zustand render adapter, Edge Authoring, a `HistoryApi` writing the
iframe's history — and driving five Spaces into `failed`, `rejected` and
`conflicted` through `MemorySpaceBackendTestControl`, which the prototype gets
today by handing a story a plain persistence value. That is the promotion, not a
wiring.

**The seam that would have made this a call**: the *decision* is not separable
from the machinery. There is no exported function taking a persistence state, a
Meta Id and an optional confirmation and answering `ExitSpaceResult`; the four
concerns — wait for the barrier, read the session, decide, retire — are one loop
inside `retireOpenSpace`. Cutting the decision out of it would let both the
surface and the prototype call one implementation. It was not cut here, because
inventing a production seam to serve a throwaway prototype is the wrong reason to
move a boundary; ticket 07 is where it is worth deciding, with the real surface
in hand.

## The opened-from field, as built

**It is `openedFrom` on `OpenSpacesState`, not a field on `OpenSpace`.** The
ticket asked for a field on the entry and that turned out not to be available:
an entry's object identity is load-bearing in `open-spaces.ts` — `retired` is a
`WeakSet` of entries, `compositions` caches the promise that produced one, and
`followActiveSpace` compares `entry.app` by reference — so re-homing by
spreading a new entry would leave all three holding an object that is no longer
in `entries`. The opener is a fact about the session rather than about the
composition, so it is a `ReadonlyMap<UUID, UUID | null>` keyed by Space Id
beside them, published as part of the same state.

**`enter` stopped being an alias for `open`.** They were the same function, so
there was nothing to hang the distinction on. They still compose identically —
the existing test that races them and asserts one entry is untouched — but
`enter` records the Space on the canvas as the opener and `open` records `null`,
because an address is not a crossing. `openPath` records `null` for the same
reason, and `switchTo` spends no opener at all: the Space is already in the set,
and rewriting its opener would reshape the tree under a reader who was only
moving around in it. The opener is read before the first await, since it is the
Space the reader was standing in when they pressed rather than whichever Space
the canvas holds once the load settles.

**Exit re-homes eagerly, and the ticket's lazy alternative cannot work.** The
ticket suggested the derivation "walk to the nearest still-open ancestor". It
cannot: the exited entry is gone and its own opener with it, so by the time the
tree is drawn there is no chain left to follow. `retireOpenSpace` re-homes what
was entered from the exited Space onto that Space's own opener, which gives the
same answer at the one moment the information still exists, and keeps the record
total over `entries`. Without it a Space entered from one that later exits stays
open and vanishes from the list that is the only way back to it.

**Four tests, on a three-Space fixture.** Two Spaces can only show a Space
entered from another; re-homing needs three, because what it asserts is where
the Space *below* the exited one lands. The third Space is opt-in rather than
added to the shared fixture: a Space Card coordination is written over every
Space the backend holds, and putting a third in the default broke three
coordination tests that assert on the requests one makes. That is worth knowing
before anyone adds a fourth.

The derivation itself — opener plus entries to a row and a depth — is not here.
It is `openTree` in the prototype's `dock-model.ts`, and promoting it is `07`'s,
along with the surface that draws it.
