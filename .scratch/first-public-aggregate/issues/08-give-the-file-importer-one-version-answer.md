# Give the file importer one version answer

Status: needs-triage
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

- [ ] A version 2 space directory earns one diagnostic naming the version, with
      no cascade of moved-key errors behind it.
- [ ] Exactly one place in the tree answers which document version is supported.
- [ ] `loadSpace`'s existing behaviour is unchanged.
