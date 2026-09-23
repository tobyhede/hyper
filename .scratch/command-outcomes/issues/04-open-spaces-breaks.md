# 04 — Enter, Exit and Open breaks through command outcomes

Status: ready-for-agent
Blocked by: 01

**What to build:** Enter (`App.tsx:1018-1035`), Exit (:1422-1451) and the Dock's Open Spaces `onSelect` (:1540-1554) run their Open Spaces operation through `run('space-command', …, { subject: title })`. The channel has no refusal arm; its three break sentences ("… could not be entered/exited/opened.") move into the module as one break describer per operation, each a function of `subject`. See `../spec.md`.

**Why:** Three hand-written try/catch → `reportBreak` → `setSpaceCommandBreak` copies.

## Build

- [ ] `spaceCommandBreak` is deleted from App.
- [ ] `exitReport` / `EXIT_REPORT` are untouched — the Dock's exit report is out of scope; only Exit's throw moves.
- [ ] `space-command` is not cleared by a Map change, as today. Its three sentences are distinguished by which operation `run` was given, not by three channels.

## Tests

- [ ] `command-outcomes.test.ts`: each of the three sentences on a throw, naming the `subject` it was given.
- [ ] One `Application` test: a failing Enter shows "Space command failed" with "… could not be entered."

## Done when

- [ ] `rg "setSpaceCommandBreak" packages/app/src` is empty.
- [ ] `pnpm verify` and `pnpm e2e` are green. `pnpm e2e:ladle` is not applicable.

## Comments
