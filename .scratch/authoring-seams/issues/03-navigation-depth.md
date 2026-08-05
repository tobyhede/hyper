# `Navigation` is shallow

Status: needs-triage

## Context

`packages/app/src/navigation.ts` presents fifteen interface members in a
197-line module. Many of them are single-statement field writes with
exactly one caller each — and it is the same caller, `App.tsx`, where they are
unwrapped one per line.

Examples:

```ts
openCard: (cardId) => setState({ openedCardId: cardId }),
closeCard: () => setState({ openedCardId: null }),
exitPresenting: () => setState({ mode: 'overview', walk: [], branchIndex: 0 }),
```

What genuinely decides something is smaller: `activateRoute`'s existence check,
`advance`'s no-outgoing-edge guard, `retreat`'s edge reselection, and the shared
`openedState` definition. Roughly thirty lines of real behaviour.

Applying the deletion test: most of it would merely move, not concentrate.

## Consequence in the tests

`space-authoring.test.ts` mocks `Navigation` by casting a four-method object
through `as unknown as Navigation`, which asserts in test code exactly which four
of fifteen members `performCompletion` touches. Adding a fifth call makes that
fail with a `TypeError` rather than a diagnosis.

## Direction, to be grilled

Keep the members that decide something; fold the pure setters into one state
update. Also worth deciding: `selectBranch` takes a delta, so every caller with an
absolute index does the subtraction itself (`App.tsx` computes
`index - moves.findIndex((m) => m.selected)` in JSX).

## Caution

This is a rename-adjacent change touching many call sites. `docs/agents/workflow.md`
says a rename must not ride along with a structural change — keep it its own commit.
