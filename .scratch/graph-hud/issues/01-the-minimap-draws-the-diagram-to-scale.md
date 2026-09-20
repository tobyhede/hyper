# 01 — The canvas HUD's minimap draws the Diagram to scale

Status: resolved
Superseded by: 04 — the numeric width this introduced is deleted there, because the
nesting that made a width necessary is what ticket 04 removes. The regression
assertion added here survives unchanged.
Blocked by: nothing — can start immediately. It blocks nothing either; ticket 03
touches the same component, so whoever goes second rebases.

**What to build:** The minimap in the canvas HUD shows the open Diagram's Things
as a readable overview at the viewport React Flow is showing. Today it is a flat
light-grey box with one blue edge, and has been for as long as the HUD has
existed.

## What is actually wrong

The minimap's `viewBox` is the string `"NaN NaN NaN NaN"`, and its mask path
begins `MNaN,NaN`. React Flow's `MiniMap` has **no `width` or `height` props**;
it reads both off `style`, uses them as the divisor for its own scale, and
writes them onto the SVG it renders:

```js
const elementWidth = (style?.width as number) ?? defaultWidth;   // 200
const elementHeight = (style?.height as number) ?? defaultHeight; // 150
const scaledWidth = boundingRect.width / elementWidth;
const viewScale = Math.max(scaledWidth, scaledHeight);
// …
<svg width={elementWidth} height={elementHeight} viewBox={`${x} ${y} ${width} ${height}`} />
```

The cast is a lie. The HUD passes `width: '100%'`, which survives it, so
`boundingRect.width / '100%'` is `NaN` and every number derived from it is too.
An SVG with an invalid `viewBox` falls back to 1:1, so the first node — 260 by
146 user units — is drawn over the whole 86-pixel-tall box. **The grey is that
node's fill and the blue edge is its Active Graph stroke**: what looks like an
empty map is one Thing magnified.

Verified against the installed 12.11.2 bundle and against
[`MiniMap.tsx` on upstream `main`](https://github.com/xyflow/xyflow/blob/main/packages/react/src/additional-components/MiniMap/MiniMap.tsx);
the [API reference](https://reactflow.dev/api-reference/components/minimap)
confirms there is no sizing prop and offers no other sizing route. A numeric
`style.width` is therefore not a workaround, it is the only supported way to
size one.

## What the fix costs

A number is the panel's own content width, and the panel states its width as a
Tailwind class. Writing `212` beside `w-[214px]` is two numbers that have to
agree and nothing holding them together — the border is what makes them differ.
Reconcile them rather than duplicating them; a reader who widens the panel must
not be able to leave the map behind.

## Why nothing caught it

`issue-06-graph-hud-and-edge-controls.spec.ts` counts five
`.react-flow__minimap-node` rects and asserts the map sits below the last key
row. Both are true of a `NaN` viewBox — the rects are in the DOM at full size
and the map is still below the key. The regression assertion has to be one that
fails on the current build before the fix lands (`docs/agents/workflow.md`:
prove a bug fix against the defect, not against a test written afterwards).

## Acceptance

- [ ] The minimap's `viewBox` is four finite numbers, and its mask path holds no `NaN`
- [ ] A Thing's rect on the minimap is smaller than the minimap, at every Diagram in the catalogue
- [ ] The new assertion fails on the pre-fix build — demonstrate it, do not assume it
- [ ] The panel's width and the number React Flow divides by cannot drift apart
- [ ] `pnpm e2e:ladle` green; `pnpm verify` green
