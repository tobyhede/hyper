# The chrome title Edit draft is one module

Status: needs-triage
Tags: Improvement
Blocked by: none
Related: `architecture-review/17` (which parked this and named the one behaviour
it cost); ADR 0042 (a replacement discards every open Interaction draft)

Surfaced by: the 4 September 2026 architecture review, candidate
"useSpaceChromeTitleEdit". Deferred by `architecture-review/17` rather than
solved there — that ticket's scope was the browser's location, and this shares
no concern with it beyond the file both live in.

## The defect

Renaming a Space, a Layout or a Graph from the chrome is one Interaction draft,
and `App.tsx` holds it as raw component state with its rules spread around the
file. `spaceChromeEdit` is declared at `:337`; what may write it, what must
discard it, and what it withdraws while it is open are seven separate sites:

| Piece | Site |
| --- | --- |
| the draft itself | `App.tsx:337` |
| `chromeEditingDisabled`, its own precondition | `App.tsx:344` |
| discard when that precondition turns | `App.tsx:371–372` |
| discard on a replacement (ADR 0042) | `App.tsx:375–377` |
| the `SpaceChromeTitleEdit` the surfaces take | `App.tsx:397–411` |
| `entityEditsAvailable`, which reads both terms | `App.tsx:434` |
| what it withdraws while open | `App.tsx:738`, `:752`, `:774`, `:926` |

Two of those are the same rule written twice over: `chromeEditingDisabled`
already means "no chrome title Edit may begin", and four call sites re-derive
"and none is open" by adding `spaceChromeEdit === null` beside it.

**A draft with no owner is discarded by whoever happens to notice.** That is not
a hypothesis. `architecture-review/17` moved the `popstate` arrival out of
`App.tsx` and into `browser-location.ts`, and with it the
`setSpaceChromeEdit(null)` that `installDestinationOpening` used to spend on
both the Layout-row choice and the Back. The Layout choice kept its clear at the
call site; the Back kept none. The behaviour survives only because the arrival
clears the published projection, so `editable` reads `hasCardsOnCanvas` as false
for a frame and `chromeEditingDisabled` discards the draft on that account
instead. One clear standing on another clear's condition is exactly what a draft
without an owner looks like, and `SpaceApp.test.tsx`'s "discards an open chrome
title draft when a Back moves to another Layout" is the only thing that says so.

## The behaviour this owes

`architecture-review/17` recorded one deliberate loss, and it belongs here.
`titleEdit.onBegin` used to clear `destinationNotFound` as well as opening the
draft. Clearing that report is what asks the browser location to correct a stale
path, so beginning a rename dismissed a "Destination not found" alert and
rewrote a URL that would 404 on reload — which is also the URL Copy link copies.
Preserving it needed a seventh member on an interface that ticket fixed at six,
and beginning a chrome title Edit is not a location event, so it was recorded
rather than routed around.

Whether it comes back is a decision this ticket takes, not an assumption it
starts from. Beginning a rename is a poor thing to hang a URL correction on, and
the honest alternative may be that the location answers its own stale report
without help.

## What to decide before building

- **Where the module lives, and whether it is a hook.** `architecture-review/17`
  rejected a hook for the browser location because every test would have stayed
  a jsdom mount. The reasoning may not carry: this draft is component state that
  four surfaces read, and it has no ambient dependency to inject.
- **Whether `chromeEditingDisabled` moves with it.** It is the draft's own
  precondition, and it reads `editable`, `presenting`, `creatingAlias`,
  `editingCardBody` and `editingCardTitle` — five terms App owns.
- **Whether the withdrawal matrix is this module's.** `architecture-review/17`
  lists "the disablement matrix" as a separate candidate. The two overlap at
  `:738`, `:752`, `:774` and `:926`, and settling one without the other risks
  answering the same question twice.

## Not in scope

- **The browser's location.** `browser-location.ts` is built and settled. This
  does not reopen `HistoryApi`, the six-member interface, or the push/replace/
  none decision.
- **Card title editing.** `editingCardTitle` is the canvas's inline rename and a
  different Interaction. It appears here only as a term of the precondition.
