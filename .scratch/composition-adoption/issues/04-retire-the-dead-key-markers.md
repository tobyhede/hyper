# 04 — Retire the dead key markers

**What to build:** The presentation package stops carrying React Flow's workaround. Once the canvas owns the delete key, the marker class that hides a surface from React Flow's `document` listener reads to nobody, and it is currently written into eight primitives in a package that depends on `core` alone — a Popover, a Select and its popup, the dropdown menu, the registry Sidebar, the Add Card control, the Card picker and the App shell — plus the app's Sidebar header and a review story.

**Blocked by:** 03. The markers are only dead once nothing subscribes.

**Status:** done

- [x] Establish first, and record in the ticket, which key subscriptions React Flow still makes once the delete key code is gone — the zoom and pan activation key codes are the ones to check. A marker a live subscription still reads stays, with a comment saying which subscription that is. Deleting on the assumption that delete was the only one is the way this ticket goes wrong.
- [x] Every marker no live subscription reads is removed, along with the comments explaining it, in both packages and in the review story that carries one.
- [x] `docs/agents/ui.md` is rewritten where it asserts the marker as load-bearing. Several bullets currently state it as a standing requirement for portalled popups and chrome controls, and a reader following those would put it back. What replaces them is the guard from issue 03 and where it lives.
- [x] The interaction the markers protected is still protected, proven by the tests issue 03 rewrote rather than by the markers' absence.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green and reported.

## Why this is worth a ticket of its own

It is the boundary fix the previous ticket earns. A package whose whole contract is presentation-agnostic components, depending on `core` only, should not encode the listener behaviour of a canvas library it is forbidden to import. That the marker is a bare string in a class list is what let it accumulate quietly.

## Evidence

The installed `@xyflow/react` 12.11.2 still defaults `panActivationKeyCode` to
Space and `zoomActivationKeyCode` to Meta/Control. Both flow through
`useKeyPress`, but only the unmodified Space path asks `isInputDOMNode` to read
a `.nokey` ancestor; the modifier-based zoom path deliberately acts inside
inputs. The node keyboard handler uses the same exclusion directly. React Flow
deletion is disabled with `deleteKeyCode={null}`, so Backspace/Delete now
reaches only the application-owned `SpaceCanvas` listener and its semantic
target guard.

Production popups and chrome retain `.nokey` for the live Space-key pan
subscription, with comments naming that reader. The unused `Select` trigger and
popup have no mounted production consumer and lose the marker. The Markdown
editor loses its wrapper marker because CodeMirror's actual target is
contenteditable, already excluded from React Flow's node-keyboard handler. No
review story directly carries a marker in the current tree; stories compose the
production components whose retained markers are audited above.

TDD: the focused UI tests first failed in two places while `Select` and
`MarkdownCardBody` still emitted `.nokey`, then passed after those dead markers
were removed; 90 focused tests passed. `pnpm verify` passed, `pnpm e2e` passed
139 tests, and `pnpm e2e:ladle` passed 52 tests. The two-axis code review found
no standards or specification findings.
