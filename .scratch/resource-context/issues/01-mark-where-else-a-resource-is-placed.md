# 01 — The Resources list marks where else a Resource is placed

Status: resolved
Blocked by: None.

**What to build:** A row in the Resources Popover says which other Maps place the Resource and which of each Map's Graphs stop at it, without growing the row past one line.

## The complication

A Graph is owned by exactly one Map, and its colour does not name it. A new Graph takes its colour from its position in its Map (`nextGraphColor(ownedGraphs.length)`), and a stored Graph with no colour takes one by its position across the whole Space (`graphColorsByGraphId`). Either way two Maps' Graphs can share a colour — every Map's first new Graph is the same blue. So a flat run of Graph dots on a row cannot say which Map a colour belongs to, and any treatment has to keep each Map's colours inside that Map.

## Compared

Ten treatments were drawn over one fixture in a throwaway Ladle review sheet (`Review/Resource Context`, deleted with this change): flat dots, Map capsules, initialled capsules, the Map glyph with its cells filled by Graph colour, a second line naming each Map, capsules with detail on hover/focus, sections grouped by Map, and marking only Resources in no Map.

- **Flat dots** fail on the complication above.
- **A second line** is unambiguous but doubles row height and truncates past two Maps.
- **Grouped by Map** repeats a Resource once per Map, breaking one row per Resource and the filter counts.
- **Initials** collide once two Maps share a letter.
- **The filled Map glyph** is the most compact but illegible at row size.

## Chosen

**Capsules at rest, names on hover and keyboard focus.** One outlined `Badge` per other Map that places the Resource, holding a dot per Graph of that Map with an Edge at it, or a hollow ring for placed-on-no-Graph. The capsule is the boundary that makes a colour readable. The row's `Tooltip` names each Map and its Graphs and opens on focus as well as hover; because a Base UI tooltip is not announced, the same words are the row's `aria-describedby` description.

The capsule is square-cornered: the registry `Badge`'s `rounded-4xl` is replaced with `rounded-chrome-sm`, whose value is zero like every chrome radius step.

## Built

- `packages/ui/src/components/badge.tsx` — the registry's `base-nova` badge with the chrome radius token.
- `packages/app/src/map-memberships.ts` — `otherMapMemberships`, `membershipsOf`, `describeMembership`; colours come from `graphColorsByGraphId`, so the row agrees with the canvas.
- `ResourcesPopover` takes `memberships`; `App` derives it for the selected Map and the Dock passes it through.
- Parity claim `resources-popover-marks-where-else-a-resource-is-placed` on `Surfaces/Resources Popover → PlacedElsewhere`, proved by `ladle-e2e/resources-popover.spec.ts` and `e2e/editing.spec.ts`.
- The row's gesture hint moved from the native `title` into the same `Tooltip`, on every row, and is now one line for every kind of row: "Add to Map: click to centre on canvas, drag to place". A Space row nothing takes the drag of drops ", drag to place", for the reason it draws no grip (`ResourcesPopover.test.tsx`, "names no drag on a Space row nothing takes the drag of"). The old pair ("Add to Map, or drag it onto the canvas", and the Space row's "Add a Space Resource for this Space to the Map") read as two outcomes when both gestures add; what differs is where the Resource lands — a click at the visible centre, a drag where it is dropped. Deliberate: keeping `title` beside a Base UI tooltip draws two tooltips on a placed row, and keeping it only on unplaced rows gives the list two tooltip behaviours. One cost: the native `title` was also the row's accessible description, so the hint is no longer announced; the drag it describes is a pointer shortcut and "Add … to Map" stays the label.
- At most three capsules are drawn and a `+N` outlined `Badge` counts the rest. Uncapped, twelve other Maps squeezed the title to zero width and pushed the capsules 169px past the row (measured in a throwaway Ladle story); the tooltip and the description still name every Map. `ResourcesPopover.test.tsx` ("draws at most three capsules and counts the rest…") holds it.
- Inside a capsule, likewise, at most three Graph dots are drawn and a `+N` counts the rest, since capping Maps alone left a Resource on many Graphs unbounded; the tooltip and the description still name every Graph. `ResourcesPopover.test.tsx` ("draws at most three dots in a capsule and counts the rest…") holds it.
- The per-Map entry is `MapMembership` (`packages/app/src/map-memberships.ts`), not `ResourcePlacement`: that name is already `@project/core`'s rect entry, and `CONTEXT.md` calls a Map having a Resource its **membership** while reserving Placement for the rect map.
- The tooltip wraps each Map's line, so a Resource on many Graphs keeps every Graph name inside the tooltip's `max-w-xs` rather than overflowing it and the viewport. The `PlacedElsewhere` story draws that case from `widelyPlacedSnapshot` (Resource 4 on ten Graphs), and `ladle-e2e/resources-popover.spec.ts` ("…named on focus and wrapped inside the tooltip") holds it.
