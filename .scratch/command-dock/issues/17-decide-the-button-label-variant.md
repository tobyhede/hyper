# 17 — Decide `Button`'s `label` variant, which has no consumer

Status: needs-triage
Blocked by: nothing. `09` is what left it without one.

**The decision to take:** delete `packages/ui/src/Button.tsx`'s `label` variant,
or decide deliberately to keep it and say why here.

**Why it is a file rather than a sentence.** `09` converted the Dock's withheld
Space name from a `buttonVariants({ variant: 'label', size: 'compact' })` span
to a disabled `ToolbarButton`, which was the variant's last consumer. `09`'s
review argued the repo's rule about deleting unreachable branches should take it
and `09` declined — rightly, because removing a variant from a shared primitive
is a `@project/ui` decision rather than one ticket's. But declining left the
question in the tail of a resolved ticket, which is the one place
`docs/agents/issue-tracker.md` says work cannot be scanned for. `16` exists
because this effort already made that mistake once over the registry `Drawer`.

It briefly lived in `16` as a fourth table row. That was wrong: `16`'s whole
argument is about a vendored registry component drifting from an upstream that
`shadcn add` could regenerate, and a CVA variant neither drifts nor regenerates.
Two questions, two files.

## What has no consumer

| | |
| --- | --- |
| `Button`'s `label` variant | `` `quietAppearance` + `cursor-default` ``, one key in the CVA map. |

Confirmed unconsumed at `37e44bc2`, in both spellings the variant can be reached
by: no `variant="label"`, `variant: 'label'` or `variant={'label'}` as a JSX
prop or object literal anywhere, and no `buttonVariants({ variant: 'label' })`
call — which matters because the variant's own doc comment advertises calling
`buttonVariants` directly on a non-button element, and that is how its last
consumer used it. `buttonVariants` has exactly one caller now, inside `Button`
itself.

## What deleting it would take with it

- The one key in `Button`'s CVA variant map, and its doc comment.
- Nothing from `packages/ui/src/index.ts` — the variant exports no name of its
  own.
- `quietAppearance` (`Button.tsx:6`) has exactly two users, `ghost` and `label`.
  With `label` gone it has one, so it can be inlined into `ghost` or left as a
  named string; that is a taste call inside the same edit, not a second one.
- No inventory entry and no stylesheet rule. `ui:catalog:check` has nothing to
  say about a CVA key, which is the half of `16`'s "deletion is the guarded
  path" argument that does **not** carry over — a kept-but-unused variant fails
  no check and drifts from nothing, so it can sit here indefinitely without
  anyone noticing. That cuts both ways and is the thing to weigh.

## The two arguments

**For deletion.** `CLAUDE.md`'s anti-slop rules and the repo's own habit take
unreachable code. A variant nothing selects is a menu entry for a dish the
kitchen has stopped making: the next author reads the map, sees five options,
and spends a decision on one that has never been used in production.

**For keeping.** `CLAUDE.md` says in terms that `@project/ui` tolerates a
primitive with no consumer — `Select` and `Textarea` each spent a while with
none and both came back. `label` is the natural spelling for the next control
that must look like a Button and do nothing, and the reason it lost its consumer
was `09` deciding that *this particular* control should be a disabled button
instead. That is a finding about one control, not about the variant.

**Worth weighing against both:** ADR 0083 and the Dock's own comment argue a
name with no Edit behind it should not be drawn as a command at all. If that
generalises, `label` is not waiting for a consumer — it is waiting for a mistake.

## Evidence

`packages/ui`, so all three bars if anything changes: `pnpm verify`, `pnpm e2e`,
`pnpm e2e:ladle`. If the decision is to keep it, nothing is owed but this file.

## Sites that cite this ticket

- `.scratch/command-dock/issues/09-rename-a-space-as-a-real-edit.md` — the
  deliberately-left finding that raised it.
