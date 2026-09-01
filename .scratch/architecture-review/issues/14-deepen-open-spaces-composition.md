# Deepen Open Spaces composition

Status: ready-for-agent
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

- [ ] Define the Open Spaces interface and state ownership before Enter/Exit UI
      implementation begins.
- [ ] No public opening helper can silently manufacture a second registry.
- [ ] One Space Id has one live session across direct URL opening, Enter and
      switching.
- [ ] Per-Space navigation selection survives switching without becoming
      authored Space state.
- [ ] Closing follows `space-cards/12` for pending, failed, conflicted and
      rejected persistence, and Meta cannot close.
- [ ] Replace helper-level composition tests with behavioural tests through the
      Open Spaces interface.

## Persistence-safety acceptance absorbed from `space-cards/12`

- [ ] Switching Spaces awaits an in-flight commit on the Space being left.
- [ ] An inactive Space whose session has failed or conflicted remains
      discoverable; conflict resolution waits until that Space is active.
- [ ] Closing waits on an in-flight commit and refuses for `failed` or
      `conflicted`, so recoverable authored state cannot be discarded.
- [ ] Closing warns and permits the action for `rejected`, where no recovery
      justifies trapping the Space indefinitely.
- [ ] Opening or Entering an already-open Space reuses its Space-Id-owned session
      and retained Layout/Graph selection.
- [ ] The permanent Meta Space cannot close.
