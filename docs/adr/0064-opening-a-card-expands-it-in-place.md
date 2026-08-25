# Opening a Card expands it in place, and expansion is a Layout property

Status: accepted
Supersedes: 0006
Refines: 0037
Related: 0011, 0024, 0025, 0027, 0036, 0040, 0045, 0048, 0051, 0058, 0063

Opening a Card draws its content **on the Card**, by growing that Card on the canvas it already sits on. There is no surface over the canvas: the Card keeps its rail, its paper, its ink and its Edges, and changes size. Several Cards may be open at once, which is the capability a covering surface forecloses by construction and the thing the rest of this cost buys.

Which Cards are open is **authored**. A Layout's placement stops being a card-to-position map and becomes a card-to-**rect** map: where a Card sits, whether it is expanded, and how big it is when it is. Expanding a Card is therefore an Edit, it survives a reload, and it is exported with the Space. A collapsed Card carries no size — it is the ratio constant `card.ts` argues for, and nothing about expanding needs that to change.

The prototype this decision was taken on is `packages/app/stories/review/expanding-cards.{tsx,css,stories.tsx}`, and its findings are `.scratch/space-cards/expanding-cards-prototype.md`.

## An expanded Card displaces its neighbours, and the displacement is never authored

A Layout's positions were authored for collapsed Cards. Expand one and it is over its neighbours immediately. The rule: a Card `+x` of an expanded Card takes that Card's growth on its own `x`, and the same for `y`, summed over every expanded Card, with both comparisons reading **authored** coordinates on both sides so the result does not depend on the order Cards are visited.

That displacement is **derived from which Cards are expanded and never written down**. It is not an Edit to the neighbours. Collapsing removes it exactly rather than approximately, the authored Layout is what the author wrote whatever is open, and a Layout that opens with Cards already expanded is arranged the same way as one an author expanded by hand.

Two alternatives were rejected. **Editing the neighbours out of the way** — a real Edit to their positions, or a strategy re-run over the Layout — makes opening a Card rewrite the placement of Cards the author never touched, and collapsing cannot put them back, because by then their authored positions *are* the displaced ones. **Letting Cards simply overlap** was the honest do-nothing, and it is still one switch away in the prototype; it was rejected because the overlap is immediate, total and unavoidable rather than an edge case, and because the Card that grew is the one thing on screen the author is looking at.

The cost accepted is that the rule is defined on origins and is a step function. A Card that starts left of an expanded Card's `x` but overlaps its width is not moved, so the expanded Card grows over it. And dragging a Card across an expanded Card's authored `x` flips which side of it that Card is on, so the drawn position jumps by that Card's growth mid-drag. Both are visible, and both are what any rule with a boundary does at the boundary.

## Editing is a gesture, and this is not the mode ADR 0037 deleted

An expanded Card shows its title and its Markdown source. A **double click on either puts a caret in it** — `Enter` completes a title, `Mod-Enter` completes the source, `Escape` abandons either, and a click away completes either. One caret at a time, canvas-wide.

ADR 0037 deleted a reading state and left a negative behind: a future review will propose a read-only default with an action that turns reading into editing, and "that is this decision reversed, not extended". This looks like exactly that, and it is not, for a reason that did not exist when 0037 was written.

0037's surface was one Card, filling the screen, entered by a deliberate gesture. A read-only step in front of it is pure friction — you asked for this Card, so of course you want the caret. Under this decision expansion is a **property of the Layout**: a Card is open because the author arranged it that way, possibly weeks ago, possibly several at once. A live caret in every expanded Card is not "the thing the author came for"; it is several editors competing for a keyboard on a canvas where `Escape`, the arrow keys and ordinary typing all already mean something. The double click does not answer *is this readable or writable* — the bytes are identical either way, which was 0037's whole argument and is still true. It answers *which of the things on screen is the keyboard talking to*, which is the question selection answers for a Card and the question the title's own double click has answered since ADR 0036, on the graph, throughout 0037's life.

Two things 0037 decided are untouched. There is still no rendered read outside presenting — an expanded Card shows source (ADR 0011, ADR 0024), and drawing it rendered would be a different feature and a different ADR. And the title is still editable in both places, writing the same Card through Space Authoring.

## What ADR 0006 keeps

0006 decided a Card in the graph draws its title and not its content. That sentence is what this decision reverses, and it is worth being precise about what reversing it does *not* cost, because 0006's two stated consequences both survive.

**A Card's size is still not a measurement.** 0006's payoff was that a bounded, uniform Card makes size a constant rather than something read from the DOM, which deleted the measure-then-reflow work React Flow's elkjs example needs. An expanded Card's size is **authored** — the author drew that box — so it is still not measured, and the strategies still reason about rects they were given rather than rects they discovered.

**Content still leaves the projection for Cards that are not open.** 0006 removed eager `markdownByCardId` embedding of every Card's body. Body is still loaded for the Cards that are open, and the open set is small and authored.

What does not survive is 0006's framing of "show full content" as a **View** setting. It is a per-Card Layout property, which is the specific sentence that moves. Its rejected alternatives are answered rather than ignored: silent clipping and unreadability at overview zoom were both consequences of *every* Card drawing content at a size nobody chose, and neither applies to an author-chosen Card at an author-chosen size. The third, the scroll fight, is answered below.

## Three behaviours decided off

Each was a switch in the prototype so it could be felt both ways. Each is now off, and each buys one rule that holds everywhere on the canvas instead of a rule with holes in it.

**Scroll is not contained.** React Flow's `nowheel` would stop a wheel over an expanded Card reaching the canvas, which fixes ADR 0006's third objection mechanically and moves the cost: every expanded Card becomes a hole the canvas cannot be wheel-panned across, and the better the feature works the more of the canvas is hole. Off, the wheel is the canvas's everywhere. A Card showing less than its source is **resized**, not scrolled — which is what an authored rect means — so at rest there is no second scroll region and therefore no fight. The cost is real and narrow: while a source is being edited, CodeMirror scrolls its own content, so a wheel there both scrolls the document and moves the canvas. The narrower variant — `nowheel` while editing only — was considered and rejected for now: it is a hole that appears and disappears under the pointer, and the editing gesture is short. If it proves intolerable in use, that variant is the change to make, and it is one line.

**No 16:9.** `card.ts` couples a Card's silhouette to the presentation surface so that clicking a Card, presenting it, and seeing the same shape is a promise the graph keeps. Holding an expanded Card to that ratio keeps the promise and gives the author the box the ratio allows, which is rarely the box a document wants. Off, the **collapsed** Card keeps the silhouette — and the collapsed Card is what an overview shows and what predicts what an audience sees — while an expanded one is whatever the author drew. The promise moves to where it is actually read rather than being dropped.

**The camera does not follow.** Bringing the camera to a Card as it expands makes the source legible at once, and the further that is followed the more it becomes the surface this decision deleted, with the backdrop removed. Off, the Card grows where the author put it and the author travels to it, which is the infinite-canvas answer. The cost is that expanding a Card at overview zoom produces something too small to read until you go to it.

## What this deletes

`openedCardId` in `packages/app/src/navigation.ts` with `openCard`/`closeCard`, its readers in `App.tsx` and `SpaceCanvas.tsx`, and the covering pane itself. Opening stops being transient viewer state and becomes Layout data, the same shape as ADR 0037 deleting the reading mode and ADR 0058 deleting `WorkspaceSelection`. The Alias *creation* surface is not affected: creating a Card that does not exist yet is not opening one.

## The cost that is not yet paid

Opening a Card is now an Edit, so **opening a Card on an Algorithmic View converts it into a Layout** under ADR 0025, exactly as moving one does. Reading a Card therefore authors something. This is the one consequence of this decision that is surprising in a bad way rather than a good one, and it is accepted rather than solved: the alternatives are transient expansion, which loses the whole point — that an author arranges open Cards and they stay arranged — or two mechanisms for opening depending on what is drawing the canvas, which is worse than the surprise. `CONTEXT.md`'s **Algorithmic View** entry already says every edit converts before writing, so nothing there gains an exception; what changes is that the list of gestures that convert now includes opening.

## The negatives to remember

**Do not propose storing the neighbour displacement.** It is derived on purpose, and writing it down is what makes collapsing lossy.

**Do not propose a read-only expanded Card with an Edit action on it.** The double click is not that (above), and adding an explicit mode on top of it would be ADR 0037 reversed for real.

**Do not propose `nowheel` on every expanded Card.** It was measured, it works, and the hole it makes in the canvas is the reason it is off.

**Do not propose measuring an expanded Card to fit its content.** The rect is authored. A Card that does not fit its content is an authoring decision, exactly as a Card that does not fit the presentation frame already is.

## What this does not decide

What a Card of each kind draws when expanded is the kind's own decision (ADR 0051). Markdown is settled — title and source, per ADR 0037. An **Alias** expanded should presumably draw its Target's content, since that is what an Alias *is*, but that displaces the Alias metadata surface and leaves retargeting without a home; that earns its own decision. A **Space Card** expanded is issue 01, needs the `space` kind in `core` first, and is the only kind that needs sub-flows — ADR 0058's navigation into a nested Space stands until then.

Whether a pointer gesture on the **body** of a collapsed Card may open it is ADR 0036's question and is left exactly as 0036 answered it: nothing a pointer does to the body opens a Card, and the rail's control is how it is opened. The premise 0036 reasoned from — a Card centres its title, so the centre of a Card is the rename target — is no longer true of the Card front ADR 0051 built, so the question is re-openable. It is not re-opened here.
