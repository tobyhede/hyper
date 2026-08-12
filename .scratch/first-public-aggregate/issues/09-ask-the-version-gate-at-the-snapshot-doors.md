# Ask the version gate at the snapshot doors

Status: needs-triage
Blocked by: None — can start immediately

Surfaced by the review of ticket `08`, which gave the file importer the intake
version gate and, in doing so, made it checkable which doors still do not ask it.

## What is wrong

`unsupportedDocumentVersion` in `@project/graph` is the one answer to which
document version this build reads. Three doors ask it before the schema that
would otherwise answer: `loadSpace`, `loadSpaceSnapshot`, and `readSingleSpace`.

Two do not. `decodeSnapshot` (`packages/persistence/src/http-protocol.ts`) and
`parseSnapshotShape` (`src/persistence/postgres-space-repository.ts`) both parse
`spaceSnapshotSchema` directly, and `loadSpaceSnapshot`'s gate sits behind them.
A version 2 snapshot arriving on the wire or read back from storage is therefore
refused with the Zod cascade — `document.version invalid literal value, expected
1; document.layouts.0.graphs required; …`, summarised to the first three issues
— rather than with the sentence naming the version that arrived.

This is exactly the defect ticket `08` fixed, one door over.

## Why it is smaller than `08` was

Rejection is never in doubt and nothing reaches the repository, so this is
diagnostic quality, not soundness. And unlike a Space directory, nobody
hand-authors a snapshot: the wire door is fed by this app's own client, and the
stored door by rows this app wrote. A version 2 snapshot appears in practice
only when a database predates the version 1 aggregate, which is the case where
the cascade is least likely to be read by a human at all.

That is why `08` left it. It is worth doing because the gap is now *stated* in
three places, and a stated gap either closes or rots.

## The shape of the fix

Both decoders already own a shared diagnostic format — the first three issues,
then a count of the rest — deliberately restated rather than exported, and
`test/unit/postgres-import-decoding.test.ts` holds them to each other. Asking the
gate first means one more thing the two owe each other, and neither should move
alone.

Do **not** answer this by deciding a version in either decoder, or by adding a
version check to `spaceSnapshotSchema`. Ask `unsupportedDocumentVersion` on the
snapshot's `document`, exactly as `loadSpaceSnapshot` already does.

## Acceptance criteria

- [ ] A version 2 snapshot on the wire earns one diagnostic naming the version.
- [ ] A version 2 snapshot read back from PostgreSQL earns the same.
- [ ] The two doors still agree on their shared failure format, and the test that
      holds them to it still does.
- [ ] `unsupportedDocumentVersion` is still the only place that decides.
