# Reference Thing is the first-public name for Alias

Status: accepted
Refines: 0009, 0039, 0051, 0070, 0085, 0089
Related: 0004, 0054, 0069

The first-public domain calls the Thing that is a reference to another Thing a
**Reference Thing**. This is an exact rename of what earlier decisions and the
built prototype call an Alias. A Reference Thing keeps the same identity, Title,
immutable Target, single-hop resolution, read-only Open, creation-from-Target,
Diagram membership, Graph Edges, Open/Closed state and Open Size. Alias does
not remain as an alias, subtype, document key or second kind.

This ADR decides vocabulary. Every invariant ADR 0009, ADR 0039, ADR 0070 and
ADR 0089 records survives it unchanged and is restated in the renamed
vocabulary rather than re-decided here.

## Why the name changed

Alias was chosen so the glossary could refuse **reference** and **link**: an
Alias showed content and did not merely jump. That line treated two acts of one
pointer Thing as two concepts. Authors do not hear it. They already fail the
word, and the product then withholds the Target's name (ADR 0083) and has not
shipped Jump to Target, so the kind has nothing left to teach with but a glyph
that says Alias.

Reference is the ordinary word for a pointer you can follow. A Reference Thing
is a reference to a Target Thing, and Open is a read-only view of that Target.
The rhyme with Space Thing is deliberate and stops there: a Space Thing is a
reference to a Space; it is not a Reference Thing, and Reference is not a
family both kinds belong to.

## What this is not

Do not keep `kind: 'alias'` in the stored document once the rename lands. The
unreleased prototype rolls forward (ADR 0054). Do not rename `SpaceReferenceError`
or `validateReferences`: those names mean a failed cross-id check, not this
kind. Do not decide Copy link to Target, Jump to Target, or highlight-on-select
here — the first is a later command, the second stays deferred under ADR 0069,
the third is optional chrome.

## The cost we accept

**Reference** already appears as ordinary English for pointing (Space Thing →
Space, “referenceable” Ids) and as intake vocabulary. Overloading the word is
the price of putting the pointer in the kind's name. Teaching “shown again
here” under Alias, or picking Occurrence / Showing so the pointer-word stayed
free, were the rejected alternatives: the first is the failure this rename
exists to end; the second names the view and hides the relationship authors
already miss.
