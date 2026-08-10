# ADR 0041 claims to change vocabulary only, while changing the document contract

Status: ready-for-human

Surfaced by: review of PR #39

## Context

ADR 0041 opens its scope statement with:

> This ADR changes vocabulary only. It does not change any invariant recorded by
> ADR 0040: every Graph belongs to exactly one Layout, every Edge endpoint names
> a Card in that Layout, […]

Its own "The first-public document" section then restates version 1 and the
nesting of `graphs` under Layouts, and rules:

> There is no compatibility parser, migration, dual-write period, version 2
> export or `route`-key alias.

Refusing a compatibility parser is a contract decision, not a rename.

**But the ADR is more defensible here than it first reads, and the ticket has to
say so.** Every one of those three is decided in ADR 0040, not 0041:

| decision | where it is actually made |
|---|---|
| Graphs nest under Layouts | `0040` — "The first-public document shape nests complete Routes under each Layout rather than storing Space-level Routes plus Layout filters." |
| version 1 | `0040` — "disposable development data rolls forward to the single version 1 shape rather than gaining a compatibility migration" |
| no compatibility migration | `0040`, same sentence |

0041 restates all three in the renamed vocabulary. The one clause genuinely its
own is the `route`-key alias, which is rename-specific by construction.

So the sentence is not false — it is doing too much work in too little space,
while sitting immediately above a section that reads like new contract.

The sentence is defensible read narrowly — "no invariant recorded by 0040
changes" is true — but the two clauses sit together and the first reads as
governing the whole document.

**Three independent passes have now snagged on it**: a CodeRabbit review of #36,
a CodeRabbit review of #39, and a manual read. That is the signal worth acting
on. A sentence that misleads three readers in a row is not being read wrongly.

## Direction

Scope the claim to what it means. Something in the shape of: this ADR changes
vocabulary; the document shape it is written in, its version number and its
compatibility posture are ADR 0040's decisions, restated here in the renamed
vocabulary rather than made here. Then the "first-public document" section reads
as the restatement it is, and the `route`-key alias stands out as the one
contract clause 0041 adds.

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
