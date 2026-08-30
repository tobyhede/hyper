# 05 — Migrate and contract the Card content slot

**What to build:** Move every production and stable-story Markdown Card onto the deep contract, leaving React Flow responsible only for authored state, operations and geometry, then remove the legacy content slot so callers cannot reconstruct or contradict the Card's internal rendering protocol.

**Blocked by:** 04 — Deepen the Markdown Card contract.

**Status:** done
Tags: release/v1

- [x] The React Flow adapter supplies Markdown source, open/edit state and authored operations without constructing the Card's body surface.
- [x] Stable stories and title/body editing examples supply state and operations without constructing the Card's body surface.
- [x] Alias, preview and presenting Cards retain their existing behavior without acquiring irrelevant Markdown state.
- [x] The legacy content slot is removed from the public interface and no caller imports the Markdown body merely to fill a Canvas Card.
- [x] Unit, Ladle and application evidence prove Card body rendering, Open/Close, title editing and Markdown editing remain coherent.

## Answer

The React Flow adapter now passes one Markdown front carrying source, authored open state and the optional live editor. The public package barrel no longer exports `MarkdownCardBody`; consumers can use only the deep Card interface and its small editor-operation type. The unused Markdown branch of `OpenCard`, its stable pane story and its pane-specific tests are removed. Alias keeps a distinct `onOpen` capability on its own front, so its metadata pane remains reachable without acquiring Markdown expansion state.

Application tests now exercise rendered Markdown, Open/Close and body editing through the real in-place Canvas Card. The component, adapter and application unit seams pass; Ladle passes 46 tests; the affected application browser specs pass 39 tests. Final repository-wide command results are recorded in the implementation handoff.
