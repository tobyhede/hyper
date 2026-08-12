# Give the file importer one version answer

Status: resolved
Blocked by: None — can start immediately

Surfaced by ticket `06`, which pinned the current behaviour rather than
repairing it, on the ground that deciding where the answer lives is not an
integration ticket's call.

## What is wrong

`loadSpace` reads a document's declared version **before** parsing, so a
version 2 document earns exactly one error naming the version. That check exists
precisely to avoid the alternative.

`readSingleSpace` does not. It hands the JSON straight to
`importSpaceFileSchema`, so a version 2 space directory earns the version
diagnostic **and** the whole cascade of moved keys — `layouts.0.graphs:
Required` and the rest — which the CLI then prints in full. That is verbatim the
cascade the intake check exists to prevent, arriving through the one door a
human hand-authoring a Space actually uses.

Rejection is never in doubt and nothing reaches the repository, so this is
diagnostic quality rather than soundness. It is pinned as-is in
`test/unit/import-space.test.ts`, with the difference from `loadSpace` written
beside it.

## The decision it needs

Adding the check to `readSingleSpace` creates a **second** answer to "which
version is supported", and two answers drift. So the question is not whether to
add a check but where the single answer lives:

- One version gate the import path and the intake path both call.
- Or the import path routed through `loadSpace`'s existing gate.
- Or the schema itself carrying the version discrimination, so a wrong version
  short-circuits before key validation.

That is a design decision about where a version is decided, not a repair.

## Acceptance criteria

- [x] A version 2 space directory earns one diagnostic naming the version, with
      no cascade of moved-key errors behind it.
- [x] Exactly one place in the tree answers which document version is supported.
- [x] `loadSpace`'s existing behaviour is unchanged.

## Answer

> **Refined by ticket `10`, in this same branch.** Everything below holds, except
> the name and shape of what is offered: `unsupportedDocumentVersion` went back
> to private and `@project/graph` now offers the *composed* `documentRefusal`,
> which asks it and the retired-`graphs` check together. `10` has why — this
> ticket gave the importer one of intake's two pre-parse checks, and the door
> reaching for them individually is what left the other behind.

**One gate, offered from `@project/graph`, asked by both doors.** The private
`unsupportedVersion` in `packages/graph/src/space.ts` became the exported
`unsupportedDocumentVersion`, returning a named `UnsupportedVersionError | null`.
`loadSpace` and `loadSpaceSnapshot` call it exactly where they already did, so
their behaviour is unchanged by construction rather than by re-testing.
`readSingleSpace` now asks it after `JSON.parse` and *before*
`importSpaceFileSchema`, and a non-null answer throws one `parsing` diagnostic —
`<space file>: <the gate's sentence>` — without parsing the cards.

Not *parsing* the cards is deliberate and matches intake: a document of a version
this build cannot read is not a document whose files are worth reporting either,
and `loadSpace` says so by answering exactly one error. The `read-single-space`
test writes a broken card beside the version 2 space file to pin that.

Their bytes are still read — one `allSettled` over the whole directory, whose
deterministic failure order is pinned — but the refusal is decided from the space
file alone and answered *before* those read failures are. So a version 2
directory containing an unreadable card answers the version, not the card.

> Originally left the other way round, with the read failure winning, and the
> reasoning written here was that a read failure is the import saying it could
> not see what it was asked to import. That is true of the **space file** and
> not of a card: with no space file there is no document and the gate decides
> nothing, but a card cannot change what the space file already says. Answering
> the card first sends its author to fix a file permission and only then tells
> them the document was never going to load. Both directions are now tested —
> the corner this paragraph admitted nothing covered.

### The two alternatives, and why not

- **Route the import path through `loadSpace`'s gate by routing through
  `loadSpace`.** It cannot: import documents legally omit the ids `loadSpace`
  requires, which is the whole reason `importSpaceFileSchema` exists. Routing
  through it would mean minting identities before validation could reject the
  document, inverting the order ADR 0030 sets.
- **Put the discrimination in the schema** (`z.discriminatedUnion('version', …)`,
  so a wrong version short-circuits before key validation). It would work, and it
  is the wrong home: the message becomes Zod's "Invalid discriminator value"
  rather than a sentence naming the version that arrived and the one this build
  reads, and the answer would then live in `core` while the *named*
  `unsupported-version` error stayed in `graph` — two homes for one decision,
  which is what this ticket exists to avoid.

The `version` literal on `spaceFileSchema` stays. It is not a second answer: it
reads the same `SPACE_FILE_VERSION`, and it is the shape check for a version that
is absent or not a number, which the gate deliberately declines to speak for.

### What this does not reach

`decodeSnapshot` (`packages/persistence/src/http-protocol.ts`) and
`parseSnapshotShape` (`src/persistence/postgres-space-repository.ts`) parse
`spaceSnapshotSchema` before `loadSpaceSnapshot` is reached, so a version 2
snapshot is refused at those two doors by cascade rather than by name — the same
defect this ticket fixed, one door over. It does **not** cost acceptance
criterion 2: those doors decide no version, they only fail to ask.

Raised as ticket `09` and closed **wontfix**. There are no version 2 documents to
have a diagnostic about, and nobody hand-authors a snapshot; this ticket was
worth doing because a Space *directory* is the one thing a human writes by hand
and so the one place a bad diagnostic reaches someone who can act on it.

### What proves it

- `test/unit/read-single-space.test.ts` — one diagnostic naming the version even
  with a malformed card beside it, and a second test asserting the importer's
  diagnostic *contains the message `loadSpace` produces for the same document*.
  That second test is what holds the two doors to one answer behaviourally, so a
  future second gate fails a test rather than merely reading oddly.
- `test/unit/import-space.test.ts` — the pinning test from ticket `06` retightened
  from "the version is said first" to "the version is the whole of it", with the
  comment rewritten from the old behaviour to the current one.
- `test/unit/graph-package-surface.test.ts` — `unsupportedDocumentVersion` and
  `UnsupportedVersionError` added to the offered lists, which is the deliberate
  act that guard exists to require.

### Bars

- `pnpm verify` — 96 test files, 954 tests, all green.
- `pnpm e2e` — 72 passed in 32.8s.
- PostgreSQL integration not run: nothing here touches a repository, and the
  import path this changes is exercised by that suite only on the happy path,
  which is untouched.

### Docs

AGENTS.md's ADR 0030 entry replaced its "by name at intake and on the `version`
literal at the schemas ahead of it" sentence with the one gate, who asks it, the
two doors that still do not, and the standing prohibition on a third answer.
`packages/core/src/schema.ts`'s `SPACE_FILE_VERSION` docblock said the constant
was named for `loadSpace`'s pre-parse read; it now names the gate and says what
the literal beside it is for. Ticket `06`'s "the file importer does not share
intake's pre-parse check" paragraph gained a superseded note rather than an edit,
since a resolved ticket records what was true when it was written.

No ADR: the decision is reversible, unsurprising, and records a placement inside
ADR 0030's existing rejection rule rather than a new trade-off. No CONTEXT.md
change either — but not for the reason first written here. `version` appears on
an _Avoid_ list belonging to **Replacement epoch**, which rejects it as a name for
*that counter* and says nothing about document versions. The real reason is that
this ticket introduces no domain vocabulary: `unsupportedDocumentVersion` is a
function, and the glossary names concepts.
