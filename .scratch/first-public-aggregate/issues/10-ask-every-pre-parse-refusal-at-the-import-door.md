# Ask every pre-parse refusal at the import door

Status: resolved
Blocked by: None

Surfaced by rebasing ticket `08` onto `c682f70`, which added a *second* pre-parse
check at domain intake — and made it visible that the importer had only ever been
given the first.

## What was wrong

`c682f70` fixed a version 1 document carrying the retired space-level `graphs`
being silently stripped: `spaceFileSchema` is a plain Zod object, so an
undeclared key is dropped, and a space-level `graphs` carried the whole topology
(ADR 0040). Its commit message says the check runs at both intakes "so neither a
file nor a commit can carry one".

A file still could. `readSingleSpace` parses against `importSpaceFileSchema`,
which is a plain object for the same reason, and ticket `08` had given it the
version check alone. Proven against the rebased tree before the fix:

```
input:  { version: 1, title: 'Talk', graphs: [{ id: …, title: 'Main', edges: [] }] }
result: IMPORTED, document = {"version":1,"title":"Talk"}
```

The whole topology discarded, the import reporting success. That is worse than
what `08` fixed: silent loss rather than a noisy refusal, at the one door a
human hand-authors.

## Answer

**The composition is the fix, not the second call.** Adding `retiredSpaceGraphs`
beside `unsupportedDocumentVersion` at the import call site would have repaired
this instance and left the mechanism that produced it: a door reaching for
pre-parse checks individually gets the ones its author knew about, and the next
check added at intake is missed again the same way.

So the two checks are now private, and `@project/graph` offers one composed
`documentRefusal(document): SpaceError | null` — version first, so a version 2
document is answered by its version rather than by the shape it happens to
carry. `loadSpace`, `loadSpaceSnapshot` and `readSingleSpace` each ask it once.
A third check added inside it reaches all three doors with nobody carrying it
there.

The package surface is *smaller* than ticket `08` left it: one value name
(`documentRefusal`) where there were a value and a type, and the checks it
composes cannot be named individually — which is the property that makes taking
some and missing others impossible rather than merely discouraged.

## What proves it

`test/unit/read-single-space.test.ts` — the retired key earns one diagnostic
naming it, and the message-identity test is now `it.each` over both refusals:
*a document intake refuses before parsing is refused here in the same words*.
That generalisation is the guard. A third refusal added at intake and not
composed in fails there, rather than being discovered by someone importing a
directory and quietly losing what they wrote.

## Bars

- `pnpm verify` — 96 test files, 961 tests.
- `pnpm e2e` — 72 passed.
