# Pin the schema equality that keeps a silent `Done` unreachable

Status: resolved

## Context

Verified against `1ab90b2`. `OpenCard`'s delegated path draws no Title field, so
it passes the stored title through untrimmed and validates the whole Card with
`markdownCardSchema`. It also has nowhere to report a title refusal: there is no
title field and no error node beside one. A stored title that the *document*
schema accepts and the *card* schema refuses therefore surfaces as a `Done`
button that does nothing and says nothing.

`OpenCard` already carries a generic fallback message for that case, and a test
that manufactures it (`says something when a delegated edit is refused for its
target's title`). Both exist because the state is unreachable *today* — the
comment beside them says so, and names why:

> `markdownCardDocumentSchema` **is** `markdownCardSchema` less its id … What
> makes it unreachable is an equality between two schemas that nothing enforces,
> and the day they diverge the symptom is a button that does nothing.

## Finding

The equality claim is **true**, and it is true by construction:
`packages/core/src/schema.ts:266` reads

```ts
export const markdownCardDocumentSchema = markdownCardSchema.omit({ id: true });
```

So there is no divergence to fix. What there is, is a load-bearing property of
two declarations that no test reads, in a file where re-declaring one of them
beside the other would look entirely reasonable.

## Answer

Guarded test-only, in `packages/core/test/card-document-equality.test.ts`, in
the spirit of the point-type guard from PR #24 (`8f2fe6a`, `5d028fa`): the thing
that must hold is a relation between two declarations, not a rule either could
carry, so it is checked where relations between declarations can be checked.

Three assertions, all deterministic:

1. The document schema's keys are the card schema's keys less `id`.
2. **Every field schema is the same instance.** This is the complete half:
   `omit` copies the field schemas by reference, so a rule that diverges needs a
   different object to live in and there is no way to write one this misses. A
   behaviour-preserving rewrite that builds fresh instances fails it too, and
   that is the intended reading — the document schema stops being *derived* at
   that point, and whoever makes it standalone owes the equality a proof that is
   not this one.
3. What that buys, in values: the two schemas agree over the cartesian product
   of the edges of the rules the pane depends on — titles of `''`/`' '`/`'   '`,
   descriptions absent/empty/120/121/multi-line, bodies absent/empty/present,
   `kind` absent/`markdown`/`alias`. 270 documents, each parsed both ways, with
   the parsed values compared where both succeed.

Proven against the defect, not only against the fix. Re-declaring
`markdownCardDocumentSchema` as a standalone `z.object` with `title: z.string()`
— the laxer-title divergence, which is the exact shape that produces the silent
`Done` — turns both (2) and (3) red, with (3) naming the six documents that
disagree. Restored, and green.

A **first** attempt used fast-check over generated documents and it **passed
against that same divergence**: with `numRuns` at its default and `body`,
`description` and `kind` all varying, the run did not reliably produce the one
combination (`title: ''`, `kind: 'markdown'`, `body` present) that exposes it. A
guard that finds the defect four times in five is not a guard, so the generator
was replaced by the enumerated table above. Recorded because a later reader will
reach for a property test here for the same good reasons, and should know it was
tried and measured.

No source change. The equality is real, the fallback message stays where it is,
and nothing in `core` had to be contorted to be checkable.
