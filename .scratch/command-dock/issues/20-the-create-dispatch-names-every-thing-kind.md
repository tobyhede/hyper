# 20 — The Create dispatch names every Thing kind

Status: resolved
Tags: release/v1
Blocked by: nothing.

**What to build:** adding a third Thing kind to the Dock's Create cluster fails
to compile until someone says what pressing it does, instead of quietly creating
a Space Thing.

## Why

The Dock hands its Create presses to one dispatch, and that dispatch is written
as a two-way fall-through: markdown takes the first arm and *everything else*
takes the second. `THING_KINDS` is the list the cluster draws its controls from,
so a kind added there gets a control, a glyph, an accessible name and a press
that silently runs the Space Thing lifecycle.

Every neighbouring outcome switch in the same module is deliberately written the
other way — each arm named, "so the compiler asks again the day a fifth joins
the union". This one is the exception, and there is no reason recorded for it
being one.

It is small, and it is worth doing while the reason it matters is fresh: ADR 0089
is the decision that made every kind complete on activation, and the negative it
records — *"a fourth kind that genuinely cannot is a decision refining this
one"* — is exactly the moment this fall-through would be read as an answer.

- [x] A kind added to `THING_KINDS` with no dispatch arm is a type error
- [x] The existing two kinds behave exactly as they do now
- [x] `pnpm verify` green; the surface did not change, and `pnpm e2e` was run
      anyway alongside `19`

## What was built

`THING_KINDS` gained a name — `DockThingKind` — because the dispatch is now held
to it rather than to an inline `(typeof THING_KINDS)[number]` at the prop. The
dispatch is an exhaustive record, which is the idiom the neighbouring
`DELETION_DESCRIPTIONS` already uses for the same question:

```ts
onCreate: (kind) => {
  const create = {
    markdown: addThing,
    space: createSpaceThing,
  } satisfies Record<DockThingKind, () => void>;
  create[kind]();
},
```

### Demonstrated

Adding `'alias'` to `THING_KINDS` — a kind the rest of the Dock already types
cleanly, so nothing else objects — and running `pnpm typecheck`:

```
packages/app/src/App.tsx(1678,19): error TS2741: Property 'alias' is missing in
  type '{ markdown: () => void; space: () => void; }' but required in type
  'Record<"alias" | "markdown" | "space", () => void>'.
```

The fall-through it replaces compiled silently and ran the Space Thing lifecycle.
