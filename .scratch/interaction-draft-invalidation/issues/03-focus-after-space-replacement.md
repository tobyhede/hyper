# App focus restoration cannot distinguish Card close from Space replacement

Status: ready-for-human

Surfaced by: resolving `02-interaction-draft-invalidation-is-mostly-already-covered.md`

## Context

ADR 0042 requires App composition to focus the canvas only after a stored Space
replacement is complete. App currently has a focus effect written for a
different transition: closing an opened Card returns focus to the Card that was
open.

`packages/app/src/App.tsx` remembers `openedCardId` and, whenever it changes
from a Card to `null` outside presenting, queries the canvas for a React Flow
node carrying that Card id and focuses it. `acceptStoredSpace` calls
`navigation.openFresh`, which also changes `openedCardId` to `null`, so the
effect cannot distinguish an ordinary close from a wholesale replacement.

That leaves two replacement outcomes:

- If the accepted Space has no Card with the old id, the query finds nothing
  and focus can fall to `body`.
- If the accepted Space reuses the id, focus lands on a Card in the replacement
  merely because it shares an identity with the Card that was open before.

Edge Authoring's replacement invalidation is separate and built: cancelling its
draft publishes a canvas focus request. This issue is only about the App-level
opened-Card restoration effect and the semantic target of ADR 0042's phrase
"focuses the canvas".

## Decision required

Choose the focus target after a successful stored-Space replacement. Plausible
targets are the React Flow container, the first focusable Card, or the control
whose Accept-remote action initiated the replacement. The choice must account
for keyboard and screen-reader navigation; reusing the previously opened Card
id is not a valid replacement policy.

## Direction

Teach the focus restoration path to distinguish an ordinary Card close from a
replacement epoch change. Preserve the existing close behavior, and apply the
chosen replacement focus policy only after the accepted Space and its canvas
have completed their published transition.

Do not fold general draft acknowledgement into this issue. If a reachable
surface can hold destructive local prose until Accept remote is invoked, file
that product decision against the concrete interaction.

## Acceptance

- [ ] The replacement focus target is chosen and recorded here.
- [ ] Closing an opened Card still restores focus to that Card.
- [ ] Accepting a stored Space does not attempt to focus a node solely because
      it has the previously opened Card's id.
- [ ] Successful replacement places focus on the chosen target after the new
      canvas is ready.
- [ ] A surface-specific test pins ordinary-close focus and replacement focus
      as distinct transitions.
