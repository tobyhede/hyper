# 01 — Settle the three open decision sheets

Status: resolved

**What to build:** Nothing. Three Ladle sheets existed to be looked at and chosen
from, and none could be settled by an agent — they are taste over drawn
alternatives. All three are now answered, and what each answer was is below.

The sheets themselves are `06`'s to delete; this ticket is where the reasoning
lands so that deleting them costs nothing.

- [x] `space-trail.stories.tsx` — **the parent, and a switcher** (the sheet's
      `switcher` candidate). The bar names one step and the switcher holds the
      rest.
- [x] `space-switcher.stories.tsx` — **indent guides**, and no Space glyph on any
      row (the sheet's `guides` candidate).
- [x] `dock-feedback.stories.tsx` question **A** — **no resting cue at all.** The
      answer is not one of the sheet's four candidates; see below.
- [x] Record each answer where it belongs. ADR 0082 is not amended: it does not
      bind any of this, and an accepted ADR takes no edit but its status line.

## The trail — the parent, and a switcher

Nine schemes drawn at one, three and six crossings in both dock orientations.
Every scheme that spends a mark per crossing loses the same way: by four
crossings it is a row of collapsed glyphs saying "two Spaces, and you will have
to hover to learn which". One named step — the Space you came from, which is
the one a reader actually reaches for — costs a word, and everything above it
moves behind the switcher.

What that buys beyond width is the thing no trail could offer at all: the
switcher lists the **open set** rather than the path, so a Space opened from the
root and left behind is in it beside the branch you are standing on. A trail can
only show what is above you, so an open Space that is not an ancestor had
nowhere to be, and leaving one meant losing it.

The switcher discloses whatever the bar is not already naming — so it arrives at
the Space after those: the third ordinarily, the second at the root, where there
is no parent step to spend a name on. It stays at the root rather than vanishing
there, because a switcher reachable from everywhere except the top makes the top
the one place a reader cannot get back from.

**The cost was accepted knowingly.** The sheet's cost line says this scheme
changes what leaving means: the set is something you move around rather than
unwind, so nothing closes on its own and a Close has to be designed rather than
inherited from Exit. That design is `05`, and it is built — `exitSpace` in
`dock-model.ts` closes one Space, re-homes the rows below it, refuses the root
and refuses a Space that cannot save.

**What holds it:** `trailControls` in `dock-model.ts`, proved by
`packages/app/test/dock-trail.test.ts`. The rule was inline JSX in `ParentSpace`
until this ticket closed; it is a value now, so a rewrite in `07` that changes
it fails a test rather than passing quietly.

## The switcher — indent guides

Six Space glyphs down the left edge of a six-row menu say "a Space" once and
nothing the other five times, while the indent — the only thing carrying
structure — is the quietest mark on the panel. A hairline per level puts the ink
where the meaning is: siblings are visibly siblings, and the row you are on is
visibly three deep without anyone counting pixels.

The cost stands as the sheet wrote it: rules are furniture, and a six-row menu
is a small place to put furniture in. The specific thing given up is that each
level is drawn through the whole height of its last row rather than stopping at
the turn — which is the one thing `Branch marks` does better, and the reason
that candidate existed.

**What holds it:** the story, and nothing else. `dock-proto__guides` is drawn
from `row.depth`, and `openTree`'s depth derivation is proved in
`dock-session.test.ts`, but the *scheme* — hairline per level, no glyph — is a
drawing and a node test cannot hold a drawing. If `07` should not be free to
re-add the glyph, that wants a `ladle-e2e` spec asserting the row's markup, and
there is no such spec today. Deliberately not written here: `07` mounts this in
production and that is the surface worth testing, not the prototype.

## Feedback A — no resting cue at all

The sheet drew four placements and the answer is a fifth: `PersistenceIndicator`
is not called, and the Dock carries no cue in any state. A commit settles faster
than a dot can be read, so a permanent slot in a five-cluster strip spent
reporting the expected outcome is a slot spent on nothing.

This is **not** the sheet's `only-when-wrong` candidate, which still shows a cue
at the far end once saving stops and pays that candidate's reflow cost. Nothing
appears in the bar at any point. What reports instead is what B and C settled:
the standing `PersistenceNotice` hanging off the dock on its own `MENU_SIDE`,
the portalled `AlertDialog`s for a conflict and a rejection, and a dot on the
switcher row saying *which* Space is unwell. The states worth drawing are the
three that need a reader — `failed`, `rejected`, `conflicted` — and all three
have a surface.

**What holds it:** `dock-report.test.ts` holds the vocabulary, and the
`SaveFailed`, `SaveRejected`, `SaveConflict` and `SaveFailedElsewhere` stories
hold the four ways it arrives.

## Two notes for `06` and `07`

`space-switcher.stories.tsx`'s header already claimed indent guides "won, and
are now built", which is a decision recorded only in a file `06` deletes. That
is now here instead, which is the whole point of this ticket.

`space-switcher.stories.tsx:246` builds its branch-mark class with a template
literal missing a separator, so a last sibling gets the single unmatched class
`switcher__cornerswitcher__corner--last` and draws no corner and no stem. Three
of the five nested rows in the fixture are last siblings. `Branch marks` was
therefore rejected against a drawing missing the feature it existed to show. It
is not being fixed: the decision is taken, the reasoning above does not rest on
that drawing, and `06` deletes the sheet.
