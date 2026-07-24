# A space with no Layout gets one when it opens

Status: accepted
Refines: 0013

Opening a space that carries no Layout creates one from the resolved strategy's output, so the space is editable from the moment it is on screen. The working surface is always positioned; an automatic strategy computes where the cards start and is then done. ADR 0013 put this behind Auto-arrange, as "an explicit act with a visible result" — that is what changes.

The explicit on-ramp is discoverability-hostile in a way that only shows up once you imagine using it. Someone who wants to move a card will try moving the card. Nothing happens, and nothing on screen suggests that a button labelled Auto-arrange is what makes dragging work, because its name announces rearranging rather than enabling. Worse, the visible result ADR 0013 wanted from that act does not exist: the space is already laid out by exactly the strategy the button runs, so pressing it moves nothing. The user would press a button that appears to do nothing in order to unlock a capability the button does not mention.

This does not reverse ADR 0013's rejection of a stray drag silently materialising a Layout. The distinction is *when*: the Layout here exists from the moment the space opens, before any gesture, so no edit is ever the thing that brings it into being. What ADR 0013 refused was a Layout that appears as a side effect of a drag, and that stays refused.

What narrows is ADR 0013's consequence that an automatic view is read-only. Its thesis is untouched — editing still requires a Layout, and that is still the only thing that decides editability, with no edit mode. But you no longer reach a read-only view by opening a hand-authored space, because opening one gives it a Layout. You reach it by switching to a reading view when you already have a Layout to return to. Automatic strategies stop being a state a space can be stuck in and become what the spike concluded they were: a seed, and a way to read.

The mechanism has one consequence worth stating, because it is not free. A strategy is uniformly async and consumes a built layout graph — the visible cards, their handles, the route edges, the card size — none of which exists during view resolution. So the Layout cannot be created there; it is created from the first layout result. A space is therefore not editable for the frame before its layout resolves, which is the same window `layoutReady` already gates the initial fit on.

The created Layout is not in the file, so it does not survive a reload until something writes it. That is consistent with saving being what makes anything durable, and it means the first increment of editing is honestly ephemeral rather than pretending otherwise.

The costs accepted: a space you only meant to read now has a Layout created for it, so "opened it" and "began editing it" are no longer distinguishable — nothing records that you did not mean to. Where a never-arranged space's cards start depends on which strategy resolved, so the same space seeded by the grid and by ELK gives different authored positions the moment either is saved. And Auto-arrange loses half its stated purpose, surviving only as what its name says: re-run the automatic strategy and take the result.
