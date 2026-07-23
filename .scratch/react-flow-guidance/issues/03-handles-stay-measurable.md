# Assert handles stay measurable

Status: resolved

## Context

React Flow measures every handle's box to work out where an edge attaches. Its docs are explicit: *"If you want to hide your handles, do not use `display: none`… Use either `opacity: 0` or `visibility: hidden`"*, because `display: none` reports a width and height of 0.

`CardNode` currently dims non-active routes' handles with `opacity`, which is correct — but it reads as an ordinary styling choice, and the graph CSS is hand-rolled in `packages/app/src/styles.css` where a later tidy-up could plausibly reach for `display: none` on `.rf-card-node__port`. React Flow emits **no warning** for this, so `01` cannot catch it; the edges just quietly attach at the wrong point.

This is a small ticket. It exists because the failure is silent, not because it is likely.

## Task

One e2e assertion (naturally added alongside `01`, same file or adjacent): with the graph loaded, `.react-flow__handle` elements exist, and each has a non-null bounding box with non-zero width and height. A `display: none` element has no bounding box in Playwright, so this catches the rule directly rather than by inspecting computed styles.

Assert against the handles actually present in the fixture rather than a hardcoded count — the fixture's route/card shape is documented as free to change (`fixture/README.md`).

## Acceptance

- Passes on the current tree.
- Setting `display: none` on `.rf-card-node__port` fails it; `opacity: 0` does not.

## Answer

Shipped as `handles stay measurable, so edges attach where the layout put them`
in `presentation.spec.ts`: reads every `.rf-card-node__port`'s
`getBoundingClientRect()` and asserts non-zero width and height, with a
`length > 0` guard so it can't pass vacuously. Count is not hardcoded — the
fixture's shape is free to change.

`getBoundingClientRect` rather than computed style is what makes this catch the
actual rule: a `display: none` element reports a 0x0 rect, which is precisely the
state React Flow mismeasures. `opacity: 0` keeps its box and passes, as it should.
