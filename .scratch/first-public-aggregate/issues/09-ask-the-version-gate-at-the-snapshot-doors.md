# Ask the version gate at the snapshot doors

Status: wontfix
Blocked by: None

Surfaced by the review of ticket `08`, which gave the file importer the intake
version gate and, in doing so, made it checkable which doors still do not ask it.

## What was seen

`unsupportedDocumentVersion` in `@project/graph` is the one answer to which
document version this build reads, and three doors ask it before the schema that
would otherwise answer: `loadSpace`, `loadSpaceSnapshot`, `readSingleSpace`.

Two do not. `decodeSnapshot` (`packages/persistence/src/http-protocol.ts`) and
`parseSnapshotShape` (`src/persistence/postgres-space-repository.ts`) parse
`spaceSnapshotSchema` directly, with `loadSpaceSnapshot`'s gate behind them, so a
version 2 snapshot is refused there with the Zod cascade rather than the sentence
naming the version.

## Why it will not be actioned

**There are no version 2 spaces.** Hyper is unreleased, the pre-release shape was
disposable, and nothing in the wild or in this repo emits one — the fixture, the
exporter, `newSpace` and the repository all write version 1 from
`SPACE_FILE_VERSION`. A better diagnostic for a document that does not exist buys
nothing.

Rejection is sound either way: a version 2 snapshot never enters, at either door,
and nothing reaches storage. What is left is the wording of a refusal nobody will
read, on a door no human hand-authors — the wire is fed by this app's own client
and the stored door by rows this app wrote.

Ticket `08` was worth doing on different grounds: a space *directory* is the one
thing a human hand-authors, so its diagnostics are read by someone who can act on
them. That argument does not carry here.

## What would reopen it

A real corpus of version 2 documents — a database predating the version 1
aggregate that someone actually has to migrate off. If that appears, the fix is
to ask `unsupportedDocumentVersion` on the snapshot's `document` at both
decoders, never to decide a version inside either one or to put the check on
`spaceSnapshotSchema`. The two decoders share a failure format on purpose
(`test/unit/postgres-import-decoding.test.ts` holds them to it), so neither moves
alone.
