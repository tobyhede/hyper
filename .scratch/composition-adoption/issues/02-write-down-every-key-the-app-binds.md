# 02 — Write down every key the app binds, and hold it there

**What to build:** One tracked list of every keyboard binding in the repository — the key, the surface that owns it, and what it does — and a check that fails when a module binds a key the list does not name. Nothing changes behaviourally. This exists because the next ticket has to decide which targets the canvas must not shadow, and that decision is currently unmakeable: the bindings are spread across nine modules in two packages, plus the key codes handed to React Flow, and no reader can see the map.

**Blocked by:** None (can start immediately). It gates issue 03.

**Status:** done

- [x] A tracked module declares the bindings as data: each entry names the key or chord, the surface that owns it, and the behaviour. Both packages' surfaces appear in it — the Markdown source editor's withheld keys, the Markdown Card body, the registry Sidebar's own shortcut, the Canvas Card, the canvas itself, the open Card, presenting, Edge authoring and the selected-Edge controls — along with the key codes handed to React Flow as props.
- [x] A test under the repo-level unit suite scans both source trees and fails on a key literal no entry names, in the manner of the vocabulary and CodeMirror-encapsulation scans that already live there. It fails in both directions: an entry naming a binding no module makes is also a failure, so the list cannot outlive the code.
- [x] The scan's shape is written into the test as a comment: what counts as a binding (a key comparison, a keymap entry, a React Flow key-code prop), and what does not. A primitive's own internal key handling is out of scope — Base UI owns those and we do not bind them.
- [x] Where two surfaces bind the same key, the list says so explicitly rather than recording one and losing the other. That overlap is the finding this ticket exists to surface, and ADR 0048 and ADR 0051 already decide who wins in the cases they cover.
- [x] The list is reachable from `docs/agents/ui.md`, which currently documents key ownership in prose across several bullets and names no single place to look.
- [x] `pnpm verify` is green and reported.

Verification: `pnpm verify` passed after review fixes (160 test files, 1,833
tests passed and 8 skipped). The inventory test first failed with all 25 live
occurrences missing, then passed once the tracked rows named them. Review found
that inline React Flow key-code props and CodeMirror-style keymap entries could
evade the first scanner; two focused regressions failed on those shapes before
the structural scanner support made them pass.

## Not in scope

Central dispatch. The reference this borrows from puts every binding on one root component and hands surfaces a subscription hook; that is a different decision from the one ADR 0048 and ADR 0051 took, which is that Escape and commit belong to the surface conducting the interaction. This ticket adopts the *inventory*, not the dispatcher, and takes no position on the dispatcher.

## Expect the list to be wrong the first time

The value is in what the first honest pass turns up. Record what is found rather than tidying it away — a key bound twice, a binding no surface documents, a React Flow subscription nobody remembered — because issue 03's guard is only as good as this map.
