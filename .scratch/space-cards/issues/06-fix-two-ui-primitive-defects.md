# 06 — Fix two `@project/ui` primitive defects found while prototyping

**What to build:** Two shadcn-generated primitives in `@project/ui` currently draw wrongly in the application, both by one class. Fix both so the Space Sidebar the rail lands inside is clean before anything is built on top of it.

**Blocked by:** none (can start immediately).

**Status:** resolved

- [x] `SidebarSeparator` no longer overflows its container. `Separator`'s base carries `data-[orientation=horizontal]:w-full` and `SidebarSeparator` adds a bare `w-auto` beside a horizontal margin; twMerge cannot merge across the variant scope, so both survive and the attribute-scoped rule wins. The separator then takes the full content width, the margins push it past both edges, and `SidebarContent` reports a `scrollWidth` 16px over its `clientWidth` — a permanent horizontal scrollbar in the production sidebar, with or without a stack.
- [x] `Field`'s description no longer selects an attribute that is never emitted. It writes `data-orientation` on the field and then selects `group-has-data-horizontal/field:` on it; `@base-ui/react` 1.7 emits neither `data-horizontal` nor `data-vertical`, so the rule is inert and a horizontal field's description never balances.
- [x] Both fixes are verified by looking at the surface, not by asserting on classes. jsdom has no layout, so neither defect is expressible as a unit test — `pnpm e2e:ladle` staying green plus a look at the sidebar and a horizontal field in Ladle is the evidence.

## Why this is prefactor rather than cleanup

The Space rail is drawn inside the Sidebar that carries the first defect. Building the rail over a surface with a permanent scrollbar means every judgement about the rail's width is taken against a wrong picture.

## Registry drift

The second defect is the same class of problem this effort already hit and corrected in `packages/ui/src/components/tabs.tsx`: a registry item written against a Base UI version whose state attributes were spelled differently. Worth a scan for other `data-horizontal` / `data-vertical` selectors in generated components while here — there may be more than these two.

## Comments

### Resolved

Both defects fixed by one class each, in the idiom `packages/ui/src/components/tabs.tsx`
already set for this class of registry drift, each with a module comment saying what the
registry writes, why it is wrong against the version in the tree, and to re-check it on a
regeneration.

- `SidebarSeparator` (`packages/ui/src/components/sidebar.tsx`): bare `w-auto` becomes
  `data-[orientation=horizontal]:w-auto`, putting it in the same twMerge group as
  `Separator`'s `data-[orientation=horizontal]:w-full` so the override actually merges.
- `FieldDescription` (`packages/ui/src/components/field.tsx`):
  `group-has-data-horizontal/field:text-balance` becomes
  `group-data-[orientation=horizontal]/field:text-balance` — the attribute `Field` really
  writes. `responsive` is deliberately not included, being `vertical` until its container
  query fires.

**Registry drift scan.** `data-horizontal` / `data-vertical` across `packages` and `src`
returns exactly two hits: the live one in `field.tsx`, now fixed, and prose in `tabs.tsx`'s
doc comment recording the precedent. There are no others.

**Evidence.** No class assertions, per the ticket. `pnpm verify` green; `pnpm e2e:ladle`
green, 53 passed. Measured on the real surface in Ladle
(`components--space-sidebar--settled`), where jsdom's lack of layout was the objection:

| `SidebarContent` | clientWidth | scrollWidth | overflow | separator width |
| --- | --- | --- | --- | --- |
| fixed | 255 | 255 | **0px** | 239 (8px inset both sides) |
| defect restored in-place | 255 | 271 | **16px** | 255 (margins push it past both edges) |

Toggling the unmergeable `w-full` back on the live element reproduces the 16px the ticket
predicted and removing it returns to 0, so the measurement is sensitive to the fix rather
than to the story.

For the Field, no story renders a horizontal one, so the rule was checked against the
compiled CSS in the page — computed `text-wrap` on a `FieldDescription` under a
`data-orientation="horizontal"` field: old selector `wrap` (inert, the defect), new selector
`balance` (fixed), and `vertical` still `wrap` (correctly scoped, no over-reach).

**Not updated, and the earlier claim here was wrong.** This section previously said a
"Known, and not this story's doing" note in `packages/app/stories/review/stacked-space-sidebar.stories.tsx`
had been rewritten to record the separator finding. That file exists in neither `main` nor
this branch — it was never written — so no such note was ever edited. Nothing outside the
two primitives above was touched.
