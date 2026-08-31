# A Layout is optional; the app supplies an algorithmic default, and editing makes it positioned

Status: superseded
Superseded by: 0075
Supersedes: 0013, 0017
Refines: 0018
Refined by: 0028, 0029, 0031, 0040, 0041
Related: 0002, 0005, 0014, 0021, 0027

A space opens its default Layout. A space need not have one: with no Layout, the application renders it through an **app-configured default layout**. These are algorithmic — a grid, cards by name ascending or descending, and whatever further orderings the app offers. They are LayoutStrategies with no Layout data behind them (ADR 0014), and an algorithmic layout cannot be overridden or customised.

**Editing converts.** Any user interaction that touches a card or a route turns the layout into a positioned Layout, immediately. Canvas interactions — pan, zoom, fit — do not: they move the camera, not the space. If the space is then saved, it carries a new positioned Layout and opens with it.

## Conversion copies what is on screen

The new Layout takes its positions from the arrangement the author is looking at — the strategy's resolved output for **every** card, not only the one touched. So **conversion is visually a no-op**: nothing moves at the moment it happens, and the edit is the only change the author sees.

That is a requirement, not an implementation note. Three ways to get it wrong, each of which makes cards jump under the author's hand: recording only the edited card's position and leaving the rest unplaced; re-running the strategy *after* the edit rather than before; or converting into the output of a different strategy than the one on screen. Any of them turns an edit into a rearrangement, which is the surprise this design exists to avoid.

**There is still no edit mode.** ADR 0013's "there is no edit mode, no flag, and no state to keep in sync" survives intact — what it loses is only the read-only state on the other side of the line. The author does not enter editing, and nothing should announce that they have. What becomes visible instead is that the space is **dirty**: a Layout now exists that is not in the file. That is a save-state indicator, not a mode indicator, it is needed regardless of this decision, and it is what answers 0017's worry about an edit nobody meant to make — you see the space is unsaved, you do not save, and nothing durable happened.

## What this replaces

ADR 0013 made the layout kind decide editability — "a positioned layout is draggable and an automatic one is not" — which made automatic views read-only outright. ADR 0017 kept that rule and routed around it, creating a positioned Layout at open so the surface was always positioned before any gesture. 0017 was explicit about why: it would not allow "a stray drag silently materialising a Layout", which 0013 refused and 0017 preserved the refusal of.

Both are replaced by permitting exactly the thing they refused. An algorithmic layout is editable, and the edit materialises the positioned Layout. This removes the read-only state 0013 created and removes the create-at-open 0017 introduced to escape it. A space that is only read now keeps no Layout, so 0017's stated cost — that "opened it" and "began editing it" are no longer distinguishable — is paid back.

**0017's mechanism survives its trigger.** The copy-what-is-on-screen rule above is 0017's, worked out for a different reason — the Layout "is created from the first layout result" — and it is reused unchanged. Only what fires it moves, from opening the space to editing it.

## What editing means

Any interaction that touches a card or a route. Moving a card, creating one, deleting one, editing its content, drawing an edge, removing an edge. Panning and zooming the canvas do not.

This is wider than 0013's definition, which was interactions that *write placement*. Drawing an edge between two existing cards writes structure and no position (ADR 0021), and it converts anyway — because the resulting Layout captures the strategy's output for every card, an edit that places nothing still fixes where everything sits. That is intended. After any edit the arrangement stops moving under the author, which is the property that makes the next edit predictable.

## What this changes in 0021

ADR 0021 leans on 0013 explicitly: "Connecting and creating both write structure or placement, and only a positioned layout has anywhere to write them, so both gestures live there and an automatic view offers neither." That last clause no longer holds. Both gestures are edits, so an algorithmic layout offers them too, and converting is what gives them somewhere to write.

0021's authoring surface is otherwise untouched — drag to connect, drag to empty canvas to create, a single neutral handle. Only its precondition moves: it is available on any layout rather than only on one that was already positioned.

## The negative 0013 carried, restated

0013 recorded a finding that superseding it must not bury: **do not seed or constrain ELK to honour a drop point.** Three spike increments — append, then branch, then seeded and interactive ELK — each reshuffled the *existing* cards and placed the new one by global optimisation, so the drop landed somewhere arbitrary. The failure is structural, not a matter of tuning. The harness was deleted and the write-up is `.scratch/graph-editing/`. This ADR supersedes 0013's thesis, not this.

## The cost we accept

An edit is consequential in a way a pan is not: touching one card fixes the position of every card, and there is no way back to the algorithmic arrangement except to discard the Layout. Re-running a strategy is Auto-arrange's job — the half of its purpose 0017 said survives, "re-run the automatic strategy and take the result" — and it stays an explicit act.

Where cards start depends on which algorithmic layout resolved, so the same space converted from a grid and from name-ascending yields different authored positions. 0017 named this cost and it stands.

**A sorting layout stops sorting once converted.** A space arranged by name ascending and then edited holds those positions literally; renaming a card afterwards moves it in no list, because there is no longer a list — only positions that happened to come from one. This is the same "the arrangement stops moving under the author" property that makes the design predictable, and it is welcome when the author placed the cards and surprising when they only sorted them. Re-sorting is Auto-arrange, explicitly, and it discards the positions.

A future review will find that an ordinary drag creates authored content and suggest gating conversion behind an explicit "start editing" action, as 0013 originally had. That suggestion is this ADR. 0017 already established why the explicit on-ramp fails — "someone who wants to move a card will try moving the card", and a button named Auto-arrange does not announce that it unlocks dragging — and 0017's own answer, creating the Layout at open, made every opened space an edited one. Converting on the edit is the remaining option, and it is the one that matches what the author actually did.
