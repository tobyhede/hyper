# ADR 0041 claims to change vocabulary only, while changing the document contract

Status: ready-for-human

Surfaced by: review of PR #39

## Context

ADR 0041 opens its scope statement with:

> This ADR changes vocabulary only. It does not change any invariant recorded by
> ADR 0040.

Its own "The first-public document" section then declares version 1, nests
`graphs` under Layouts, and rules:

> There is no compatibility parser, migration, dual-write period, version 2
> export or `route`-key alias.

Refusing a compatibility parser is a contract decision, not a rename. So is
choosing the version number and the nesting.

The sentence is defensible read narrowly — "no invariant recorded by 0040
changes" is true — but the two clauses sit together and the first reads as
governing the whole document.

**Three independent passes have now snagged on it**: a CodeRabbit review of #36,
a CodeRabbit review of #39, and a manual read. That is the signal worth acting
on. A sentence that misleads three readers in a row is not being read wrongly.

## Direction

Scope the claim to what it means. Something in the shape of: this ADR changes
vocabulary and, with ADR 0040, the public document shape it is written in; it
changes no invariant ADR 0040 records. Then say plainly that the version number,
the nesting and the compatibility posture are contract decisions carried here.

Worth resolving in the same edit: **the version number goes backwards, 2 → 1,
and nothing explains why.** ADR 0030's version 2 was a pre-release shape and
version 1 is the first *public* contract, so the numbering restarts on purpose —
but a reader meeting `"version": 1` after `"version": 2` has no way to tell that
from a typo.

## Constraint that must survive

ADR 0041 is accepted, and its body is not historical yet in the sense ADR 0041
itself defines — it is the current decision. Editing it is legitimate. Do not
take the same liberty with the ADRs it refines.

## Acceptance

- The scope sentence distinguishes preserved invariants from intentional
  contract changes.
- The 2 → 1 version decrement is explained where it is first stated.
