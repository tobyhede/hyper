# Implementation review

Reviewed from `b15fbcbf`, including the implementation working tree, on 2026-10-03. Independent delegated reviews covered standards and spec. All confirmed findings below were fixed before publishing the implementation.

## Standards

- The browser-exit guard omitted unsaved work in only-drawn Spaces. The aggregate guard now observes every composed Space; failed/conflicted target regressions proved the defect and recovery.
- Embedded node flags replaced transient availability with static policy, allowing dragging during image replacement and peer editing during a live editor. Shared availability now gates those interactions. The browser regression measured 32px of unintended movement before the fix and no authored movement afterward; duplicate-editor tests pass.
- A dangling selected Map mounted a surface that threw. The drawing now withholds that mount while leaving its selection controls available. The existing missing-Map regression passes.
- An explicit context with a Graph its Map no longer owns attempted to store an invalid active Graph. A new regression proved the exception; completion now refuses `graph-not-owned` without changing the Space.

## Spec

- Go to Opener could not select a held but unlisted source. It now lists and selects that recorded Opener while reusing its composition.
- Target-owned Map creation outcomes sent the caret to the target’s root drawing. The requesting rail now owns the continuation and drops it when its source context disappears. Application and Ladle menu parity pass.
- Embedded clipboard failure was discarded. The shared notice area now names its Space and offers dismissal; the application regression passes.
- Done could withdraw the containing Resource’s rail after an embedded Edge had owned selection. It now selects the containing Resource as editing ends, and the application parity proof passes.
- Empty Alt-drop creation selected the Resource without starting its title. The shared creation path now requests naming for a newly created Resource, while connecting an existing target keeps its existing selection behavior. Unit and browser proofs pass.

## Validation

Changed-file Vitest run: 614 passing tests. Adjacent regression run: 289 passing tests. Vocabulary guard: 94 passing tests. Additional final regressions cover clipboard, rail continuation and Alt-drop naming. Root and package TypeScript checks, toolchain check, UI catalog check and changed-file lint passed locally. Focused Chromium proofs cover only-drawn replacement/navigation, locked image dragging, Alt-drop preview/naming, image drop/paste and Map-menu parity; the Ladle menu proof passed. Full verify, application shards, Ladle and database proofs remain the draft PR’s CI gate.

Undo/Redo remains deferred by the user until history exists. PR #331 remains the approved stack base; merges are left to the user.
