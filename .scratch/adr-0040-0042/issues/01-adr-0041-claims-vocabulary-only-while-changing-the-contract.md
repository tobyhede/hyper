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

## Research, not an answer

**No edit was made to ADR 0041.** The work below verified what the fix would
have to say; making it is human-gated, for the reason in the Note. What follows
is the research, so whoever makes the edit does not repeat it.

**The ticket's mapping holds against the ADR text, exactly as written.** Both
citations are verbatim. ADR 0040 nests the document at its `## Consequences`
head — "The first-public document shape nests complete Routes under each Layout
rather than storing Space-level Routes plus Layout filters" — and decides
version 1 and the compatibility posture in one sentence two paragraphs later:
"disposable development data rolls forward to the single version 1 shape rather
than gaining a compatibility migration". A case-sensitive scan of 0040 for
`alias`, `parser`, `dual-write` and `version 2` returns nothing, so the
`route`-key alias really is the one clause 0041 adds. It could not be otherwise:
only a rename can create a legacy key to refuse.

**What the scope paragraph should say.** The narrow reading was always true and
should be kept — this ADR decides vocabulary, and every invariant 0040 records
survives it unchanged. What is missing is the sentence beside it: that this is
not the same as leaving the document contract untouched, because the nesting,
the version number and the refusal of a compatibility path are 0040's decisions
restated in the renamed vocabulary, and the `route`-key alias is the one
contract clause 0041 adds. With that said, the "first-public document" section
below reads as the restatement it is.

**The version decrement is a reuse, not just a restart, and that is what needed
saying.** The ticket assumed version 2 was a pre-release shape and version 1 the
first public contract. True, but the tree is one step stranger: `version 1` is
being *reused*. The prototype opened at `z.literal(1)` in the initial commit and
became the version 2 ADR 0030 describes in `9ed79a0`, "Migrate persistence
identity to UUIDs". So there were two disposable pre-release shapes, numbered 1
and 2, and neither was ever public. The explanation belongs at the head of "The
first-public document", where version 1 is first stated and immediately above
the `"version": 1` literal, and it has to say the counter *restarts* rather than
continues, so a reader meeting 1 after 2 sees the restart and not a typo. Saying
only "version 1 is the first public contract" leaves the obvious next question —
why was 1 free? — unanswered in the record.

## Note

**This ticket's own "Constraint that must survive" was wrong, and that is why
nothing was edited.** It held that 0041's body may be edited because 0041 is the
current decision rather than a historical one. `docs/agents/workflow.md` records
no such distinction — it says the status line "is the only edit an accepted ADR
ever receives" — and 0041's own roll-forward section says accepted bodies
"remain historical and are not rewritten". Issue `05` cited that second rule
when it confined itself to a status-block edit.

An agent-authored change did make the body edit under this ticket's direction,
and it was reverted. The rule stands as written, and no carve-out is being added
to `workflow.md`: a rule agents obey would become a rule agents interpret, and
"clarifying edit that changes no decision" is precisely the judgement an agent
discovers it has made after the fact. This ticket is the evidence — the conflict
surfaced only because the implementing agent flagged it afterwards.

So the exception is manual and human-gated. A human may edit their own accepted
ADR knowingly; nothing automated may, and the process text does not invite it.
The two routes left are a deliberate human edit to 0041, or a new ADR refining
it that carries the scope clarification and the version-1 explanation. The
second is heavy for what is genuinely only clarification, which is an argument
about which route to take and not about whether the rule holds.

Issue `06` meets the same wall — fixing 0040's ownership argument is a body
change to another accepted ADR — so whichever route is chosen here sets the
shape of that fix too.
