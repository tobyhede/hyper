# 04 — Deepen the Markdown Card contract

**What to build:** Let callers describe a Markdown Card's source, open state and operations while the production Card owns how its Markdown body, rail and editing treatment are composed. Add the deep form beside the legacy content slot so every existing caller remains valid while the new interface is proven through the real component.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] A caller can render a closed or open Markdown Card without constructing the Card's body surface or using body presence as an implicit state flag.
- [x] The Card derives Open and Close, rendered Markdown and its body-edit lifecycle from one coherent Markdown-front description.
- [x] Closed and open title editing continue to use the same Card and Title treatment.
- [x] Stable component stories and accessible behavior tests use the deep interface, including closing and reopening the long-Markdown example.
- [x] The legacy content slot remained available until the production migration in 05 completed the contraction.

## Answer

`CanvasCardFront` now describes closed or open Markdown authored state directly. Only the open arm can carry a live editor, so body presence, editor presence and rail behavior cannot contradict one another. `CanvasCard` constructs the Markdown body internally, and the Open/Close, title-editing and Markdown-editing stories all cross that public seam.
