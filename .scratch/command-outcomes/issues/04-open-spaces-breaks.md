# 04 — Enter, Exit and Open breaks through command outcomes

Status: resolved
Blocked by: 01

**What to build:** Enter (`App.tsx:1018-1035`), Exit (:1422-1451) and the Dock's Open Spaces `onSelect` (:1540-1554) run their Open Spaces operation through `run('space-command', …, { subject: title })`. The channel has no refusal arm; its three break sentences ("… could not be entered/exited/opened.") move into the module as one break describer per operation, each a function of `subject`. See `../spec.md`.

**Why:** Three hand-written try/catch → `reportBreak` → `setSpaceCommandBreak` copies.

## Build

- [x] `spaceCommandBreak` is deleted from App.
- [x] `exitReport` / `EXIT_REPORT` are untouched — the Dock's exit report is out of scope; only Exit's throw moves.
- [x] `space-command` is not cleared by a Map change, as today. Its three sentences are distinguished by which operation `run` was given, not by three channels.

## Tests

- [x] `command-outcomes.test.ts`: each of the three sentences on a throw, naming the `subject` it was given.
- [x] One `Application` test: a failing Enter shows "Space command failed" with "… could not be entered."

## Done when

- [x] `rg "setSpaceCommandBreak" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments

**2026-09-23, resolved.** `pnpm verify` green (236 files, 3052 tests). `pnpm e2e` was not run by this ticket's agent — the coordinator runs it for the branch — so the verify/e2e box stays open until it does.

- **Enter, Exit and Open are each one `commandOutcomes.run('space-enter' | 'space-exit' | 'space-open', async () => …, { subject })`.** Ticket 01 had already declared the three commands on `space-command` with exactly App's sentences, so the module changed only by a comment: the rationale that sat on App's deleted `spaceCommandBreak` slot (why these three are reported at all since the Sidebar went) moved to the channel's table entry. The thunks are `async` so a synchronous throw from `OpenSpaces` still arrives as a rejection and `run` stays promise-in/promise-out.
- **Exit keeps its Dock report and its busy flag in App.** `run` answers the `ExitSpaceResult` (or `COMMAND_BROKE`); App writes `exitReport` from anything but `exited`/`broke`, and clears `exiting` in the promise's `finally`, which never rejects because `run` answers `COMMAND_BROKE` for a throw. `space-exit`'s `settle` leaves the channel clear whatever the exit answered — a refusal or warning is the exit report's, not a notice.
- **Open's refusal still reads as "… could not be opened."** — `space-open`'s `settle` publishes it for `refused`, as App did.
- **Staleness now applies**, which it did not before: the notice lives on the composition the press was made in, so a settlement after that composition is disposed (an Exit of the Space on the canvas that throws after retiring its entry) is dropped in silence and only reaches the reporter. Before, the equivalent `setState` landed on an App no longer drawn, so nothing the reader sees changes.
- Tests: `command-outcomes.test.ts` gains each of the three sentences on a throw, naming its `subject`, with the reporter hearing each, and an Exit refusal leaving the channel clear. `enter-space-resource.test.tsx`'s existing "reports a failed Enter on the Space being left" now asserts the "Space command failed" title beside the sentence and dismisses the notice through the module, rather than adding a second test for the same press.

