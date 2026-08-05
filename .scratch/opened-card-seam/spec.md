# The opened-Card seam

Status: resolved

Source: code review of PR #25 ("An alias delegates content authoring to its
target"), after it merged as `1ab90b2`.

Decision it serves: ADR 0039 — an alias delegates content authoring to its
target. Nothing here changes that decision; all three items are about whether
the code can still hold it when something around it moves.

## Why a new effort rather than `card-authoring/04`

`.scratch/card-authoring/spec.md` is `Status: resolved`. Appending to it would
reopen a closed effort to carry follow-ups that are not the feature — these are
seam and guard questions raised *by* reviewing the merged result, and they end
where the seams do.

## Problem statement

ADR 0039 ends on a negative: a future review will read a delegated pane that
cannot rename what it shows and propose putting a title field on it, and that
field would rename the target from a surface reached through the alias, whose
own title is the one drawn on the graph behind it. Two cards' titles, one field.

Three things in the merged code stood between that negative and the running app,
and each of them was an argument rather than a mechanism:

1. `OpenCardProps` took `opened: Card` and `content: ResolvedContentCard` as two
   independent props, related only by every caller happening to satisfy
   `content === resolveContentCard(space, opened.id)`. Delegation was then
   *derived* from `opened.kind === 'alias'` — the right answer today by proxy,
   and the wrong one for any later kind that resolves its content elsewhere.
2. `App` renders the pane only when both the opened Card and its content
   resolve. If the second could fail while the first did not, the pane would
   vanish while `openedCardId` stayed set, and every affordance that could
   recover is withdrawn for exactly as long as a Card is open.
3. `OpenCard`'s delegated path passes a stored title straight through, and the
   fallback error message beside it exists only because
   `markdownCardDocumentSchema` is `markdownCardSchema` less its `id`. Nothing
   enforced that equality, and the symptom of divergence is a `Done` button that
   does nothing.

## Issues

- `01` — the props seam carries no invariant (resolved)
- `02` — is the frozen-authoring window reachable? (resolved: no)
- `03` — pin the schema equality that keeps a silent `Done` unreachable (resolved)

## Not in scope

The delegated pane still renames nothing and an alias's own description still
has no authoring surface. Both are costs ADR 0039 accepted and named; neither is
a defect to be closed here.
