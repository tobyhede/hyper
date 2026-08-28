# An Alias pane authors only the Alias

Status: superseded by ADR 0070
Refines: 0039, 0046, 0048
Refined by: 0051
Related: 0009, 0037, 0042

Opening an Alias opens an editor for the Alias's own metadata: its **Title** and
its **Target**. It does not expose or author the Target's title, description or
content. To author those, the Target Card must be opened explicitly.

This replaces ADR 0039's delegated content editor and ADR 0046/0048's combined
pane. The two metadata fields still pend to one **Done**, which submits one
`edited-card` completion on the Alias. Cancel and Escape discard both drafts.

## Why

The combined pane had two edit subjects. A single Done first edited the Alias
and then edited the Card that owned its content. Retargeting from A to B made the
meaning especially poor: the content fields still authored A, even though a
successful press immediately made the Alias show B.

The two completions also could not be atomic. If retargeting succeeded and the
content edit was refused, the Alias immediately resolved to B. React correctly
remounted the form under B's identity, discarding A's draft and the refusal that
had just been recorded on the old form.

Keeping one edit subject per pane removes both the ambiguity and the partial
result. The type of the Alias variant carries no resolved content Card and no
content completion callback, so delegated content authoring cannot be wired
back in accidentally.

## What this costs

Shared content takes an explicit second navigation to edit. This is accepted:
the author chooses the source Card whose content will change, and the resulting
editor has one identity, one draft and one completion.

## The negative to remember

Do not add Target content fields to the Alias form, and do not resolve the
Alias's Target merely to feed a content completion into that pane. Retargeting
and editing shared content are separate interactions because they author
different Cards.
