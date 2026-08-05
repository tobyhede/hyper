# The opened-Card props seam carries no invariant

Status: resolved

## Context

Verified against `1ab90b2`. `OpenCardProps` was:

```ts
export interface OpenCardProps {
  opened: Card;
  content: ResolvedContentCard;
  onComplete: (card: ResolvedContentCard) => void;
  onCancel: () => void;
}
```

Two independent props with a relation between them —
`content === resolveContentCard(space, opened.id)` — that nothing stated and
nothing checked. Any two Cards typechecked. A mismatched pair draws one Card's
title on the dialog and authors another Card's content, which is a Card the
author never opened, silently.

Separately, `const delegated = opened.kind === 'alias'` keyed the delegation
decision on the **kind** rather than on the relation between the two props. That
is the right answer for every kind that exists, and the wrong one for any later
kind whose content resolves elsewhere: `delegated` would be false, the pane
would draw a Title field, and that field would rename the *content* owner while
the graph behind it went on drawing the *opened* Card's title. That is precisely
the negative ADR 0039's final section exists to prevent, reached without anyone
proposing it.

## Direction

Make the mismatched pair unrepresentable and make delegation the discriminant
rather than a derivation. A direct open names one Card — which is its own
content, so there is no pair to get wrong. A delegated open names both, and says
which is which.

## Constraint that must survive

A pure refactor of a seam: no user-visible behaviour changes. `editing.spec.ts`
and `overview.spec.ts` pass untouched. Delegated opens keep the banner, the
hidden Title field, the qualified Description/Markdown labels and the two-card
accessible name; direct opens are unchanged.

## Answer

`OpenCardProps` is now a discriminated union over two variants:

```ts
{ card: ResolvedContentCard; through?: never; content?: never }
| { through: Card; content: ResolvedContentCard; card?: never }
```

`through` is the prop name because it is the relation the pane already names on
screen — "Opened through A again" — and because CONTEXT.md's alias entry defines
opening an alias as preserving *that occurrence* as the opened context.

The absent halves are declared `?: never` rather than left off. That turns each
rejection into a real assignability failure rather than an excess-property check
a spread or an intermediate variable would slip past, and it is what lets the
type test assert them without depending on where TypeScript chooses to report a
JSX error.

`App` discriminates on the **relation**, `openedCard.id === openedContent.id`,
never on the kind. A Card that resolves to itself is a direct open; anything
else was reached through an occurrence. Inside `OpenCard` the variant is read
once, and `delegated` is what the caller declared.

`packages/app/test/OpenCard-types.test.tsx` pins it. Eight assertions: seven
`expectTypeOf`, two of them positive so both variants stay reachable, and one
`@ts-expect-error` in JSX — the form a caller actually writes. As AGENTS.md
records for `space-http-app-types.test.ts`, `expectTypeOf`
is a runtime no-op without `test.typecheck`, so the root `pnpm typecheck` is the
enforcer; the file is reached by it because the root program's `include` carries
`packages/*/test`. Verified by breaking it: relaxing `DirectOpen`'s
`content?: never` to `content?: ResolvedContentCard` leaves `vitest` green (5
passed) and fails `pnpm typecheck` with two errors — a failed `.not.toExtend`
reported as `TS2554: Expected 1 arguments, but got 0`, and `TS2578: Unused
'@ts-expect-error' directive`. Restored, and both are green again.

### Documentation

Neither `CONTEXT.md` nor ADR 0039 needs a word changed. This is a code seam, not
a decision: the glossary's alias entry already says an alias's occurrence is
preserved as the opened context and that content authoring delegates to the
target, and the union is that sentence expressed in types rather than a new
claim. ADR 0039 is accepted and append-only regardless; had a correction been
needed it would have been a new ADR with a `Refined by:` line, not an edit.
