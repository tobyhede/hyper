# Card kinds own everything beyond the Title

Status: accepted
Refines: 0006, 0020, 0037, 0039, 0046, 0048, 0049

A Card has one shared authored field beyond its identity and kind: its **Title**.
Everything else belongs to the Card kind, including its additional fields, its
opened editor, and what its Card front draws around the shared Title. Markdown
therefore owns its body, Alias owns its Target, and neither carries a shared
Description.

This keeps the common Card contract about identity rather than presentation.
A future kind may define summary-like content when that content has meaning for
the kind, but it does not thereby create a universal Card subtitle or metadata
field. Card fronts still have uniform geometry: a kind controls what appears
inside the common footprint, not the authored size of that footprint.

## What this replaces

ADR 0006 left room for an optional short Description beneath the Title, and ADR
0048 included Description among the Markdown editor's pending fields. We reject
that shared synopsis model. It gives every kind a field whether or not the kind
has a use for it, and makes the common Card contract prescribe content that
should follow from the kind instead.

There is no migration or compatibility contract. Hyper is prerelease
experimental software and has no existing authored Description data; values in
tracked fixtures are examples to remove with the field.

## What this costs

A title-only Markdown front carries less information at a glance. Authors must
use a sufficiently descriptive Title or open the Card. We accept that cost
rather than recreate a universal synopsis as a Description, excerpt, or
generated summary under another name.

## The negative to remember

Do not add a shared Description, subtitle, summary, excerpt, or second content
slot to Card. If a Card kind needs information beyond Title, give that field and
its presentation semantics to the kind. Do not use kind-specific presentation
as a reason to vary Card geometry; placement remains stable across kinds.
