# Deepen Open Spaces composition

Status: resolved
Tags: release/v1, Improvement
Blocked by: none — PR 134 delivered the low-level session registry
Related: `entity-url-addressability/08`; `space-cards/12`; `v1-release/01`

Surfaced by: the 31 August 2026 Space Cards architecture review, candidate
“Deepen Open Spaces composition”. Validated against the in-flight
`feat/space-cards-03` tree at `1625117c`.

## The problem

One live session per Space Id depends on every opening path sharing one exact
`SpaceSessionRegistry` instance. That identity is implicit:

- `createSpaceStartup` closes over one registry;
- `openLoadedSpace` accepts a registry but manufactures a new one by default;
- `openStoredSpace` does not accept the registry and therefore takes that
  default;
- Space Card lifecycle correctness assumes the registry containing every live
  participant;
- Enter, Exit and retained per-Space selection are still spread across future
  URL/navigation work.

The helper interfaces make the most important ownership rule optional. A new
opening caller can compile while creating a second writer for a Space that is
already open.

## Direction to investigate

Make Open Spaces one in-process deep module that owns:

- the one session registry;
- opening and composing a Space exactly once by Space Id;
- the active Space and each open Space's retained Layout/Graph selection;
- Enter and independently-open semantics;
- switching and safe closing, including the wait/refuse/warn rules from
  `space-cards/12`;
- the permanent Meta Space's non-closable rule.

The interface should be domain-shaped—open, enter, select/switch and close—not
a bag of a registry plus helper functions callers must order. Remove registry
defaults from lower-level opening helpers; internal composition may still use
them privately.

Tests should cross the Open Spaces interface and observe shared live state. A
test that enters or independently opens the same Space must receive the same
session and retained selections, while closing exercises the real persistence
state rules rather than a mocked navigation callback.

## Release relationship

This is the composition shape `entity-url-addressability/08` and
`space-cards/12` need. Those tickets should build through this module rather
than independently adding Enter/Exit state and persistence waiting to `App.tsx`
or URL handling. It also lets `v1-release/01` hand startup into the same owner
without making startup itself the long-lived registry.

## V1 disposition

This is the binding Open Spaces implementation ticket. It consumes PR 134's
low-level session registry and absorbs every acceptance criterion from
`space-cards/12`, including wait/refuse/warn behavior. It must complete before
`entity-url-addressability/08` builds Enter, independent opening, History and
their UI evidence. No second Open Spaces owner or optional registry path remains.

## Implementation acceptance

- [x] Define the Open Spaces interface and state ownership before Enter/Exit UI
      implementation begins.
- [x] No public opening helper can silently manufacture a second registry.
- [x] One Space Id has one live session across direct URL opening, Enter and
      switching. **`enter` is currently `open` under a second name** — Entering
      has no semantics of its own yet, so this box is proven for opening and
      switching only. CONTEXT.md's "Entering is not Opening", and Exit as the
      name of the closing action, are `entity-url-addressability/08`'s to build.
- [x] Per-Space navigation selection survives switching without becoming
      authored Space state.
- [x] Closing follows `space-cards/12` for pending, failed, conflicted and
      rejected persistence, and Meta cannot close.
- [x] Replace helper-level composition tests with behavioural tests through the
      Open Spaces interface. The `open-space.ts` helper and its tests are gone
      and `spaceCards` is exercised through `createOpenSpaces`.
      `packages/app/test/space-card-lifecycle.test.ts` still composes registries
      directly: it is a test of registry coordination rather than of Open Spaces
      composition, and moving it beside `packages/persistence` is its own change.

## Persistence-safety acceptance absorbed from `space-cards/12`

- [x] Switching Spaces awaits an in-flight commit on the Space being left.
- [x] An inactive Space whose session has failed or conflicted remains
      discoverable. **Gating conflict resolution on the Space being active is
      not built** — nothing in Open Spaces reads `activeSpaceId` on the recovery
      path, and there is no surface offering recovery for an inactive Space to
      gate. It follows the Enter/Exit UI that creates the situation.
- [x] Closing waits on an in-flight commit and refuses for `failed` or
      `conflicted`, so recoverable authored state cannot be discarded.
- [x] Closing warns and permits the action for `rejected`, where no recovery
      justifies trapping the Space indefinitely.
- [x] Opening or Entering an already-open Space reuses its Space-Id-owned session
      and retained Layout/Graph selection.
- [x] The permanent Meta Space cannot close.

## Answer

`createOpenSpaces` is the one in-process owner of the session registry, the
in-flight and completed Space compositions, the visible Open Spaces collection
and its active Space. `open` and `enter` share the same concurrent opening path,
so one Space Id produces one `SpaceSession` and one `ComposedApp`; a later
opening reactivates that entry without replacing Navigation's retained Space
View or Active Graph. Browser startup now hands its resolved destination to this
owner, and the old public opening helpers and their helper-level tests are gone.

Switching waits for pending persistence on the Space being left. Closing waits
for the target, refuses with the applicable recovery for failed or conflicted
work, returns a warning before permitting rejected work to be discarded, and
never closes Meta. A completed close retires the idle registry session and its
composition; a later open loads and composes a fresh entry, while an entry that
remains open can never acquire a second writer. The owned registry's Space Card
lifecycle is composed from Open Spaces' identity minter and exposed as one
domain capability; the registry itself never escapes.

`packages/app/test/open-spaces.test.ts` crosses only the Open Spaces interface
and covers concurrent direct/Enter reuse, retained selection, switching and
closing waits, inactive recoverable entries, rejected confirmation, fresh
reopening and the permanent Meta rule. It also covers what review found the
first implementation got wrong: an edit queued behind a Space Card coordination
is committed before the Space closes rather than discarded, the injected
identity minter reaches each composed Space, a superseded activation does not
reinstate itself when the Space being left settles, `openPath` reports the
selection a reused composition actually kept, and closing retires the
composition along with the session.
