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

**One gate, offered from `@project/graph`, asked by both doors.** The private
`unsupportedVersion` in `packages/graph/src/space.ts` became the exported
`unsupportedDocumentVersion`, returning a named `UnsupportedVersionError | null`.
`loadSpace` and `loadSpaceSnapshot` call it exactly where they already did, so
their behaviour is unchanged by construction rather than by re-testing.
`readSingleSpace` now asks it after `JSON.parse` and *before*
`importSpaceFileSchema`, and a non-null answer throws one `parsing` diagnostic —
`<space file>: <the gate's sentence>` — without parsing the cards.

Not migrating the cards is deliberate and matches intake: a document of a version
this build cannot read is not a document whose files are worth reporting either,
and `loadSpace` says so by answering exactly one error. The `read-single-space`
test writes a broken card beside the version 2 space file to pin that.

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
literal at the schemas ahead of it" sentence with the one gate, who asks it, why
the importer throws before reading cards, and the standing prohibition on a third
answer. No ADR: the decision is reversible, unsurprising, and records a placement
inside ADR 0030's existing rejection rule rather than a new trade-off. No
CONTEXT.md change — `version` is on its _Avoid_ list as domain vocabulary and
this adds none.
