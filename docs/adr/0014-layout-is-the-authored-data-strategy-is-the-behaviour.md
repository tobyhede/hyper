# A Layout is the authored data; the behaviour is a LayoutStrategy

Status: accepted
Refines: 0005, 0013
Refined by: 0038, 0040, 0041
Related: 0025

`Layout` now names the authored card-to-position map a space carries, and `LayoutStrategy` names the function that arranges cards. ADR 0005 gave the word to the function — "a Layout is a named strategy" — which was right while placement was always computed, because a strategy was the only layout-shaped thing in the system. ADR 0013 changed that: a positioned layout is a value the author writes, holds, and edits. Two things then wanted one word, and the code resolved the collision the way code does when nobody decides — by prefixing. `AuthoredLayout` shipped for about an hour before it was obvious that it named a property every layout in the file has by construction, so it distinguished nothing.

What the split buys is that three sentences stop needing a paragraph of context each. *Every Layout has a strategy that renders it; not every strategy has a Layout behind it* — that asymmetry is ADR 0013's whole content, and calling both ends "layout" actively hid it. *Editing requires a Layout* becomes nearly a tautology in the useful sense: you can write placement only where there is somewhere to write it, so the presence of the data is the permission, with no edit mode and no second concept. And Auto-arrange is `LayoutGraph → Layout` while the positioned strategy is `Layout → LayoutGraph`, so the one crossing between computed and authored placement reads as a pair of type signatures pointing opposite ways rather than as a rule to remember.

The factories were renamed with the type: `gridStrategy`, `elkStrategy`, `positionedStrategy`. Keeping `elkLayout` was tempting, because "the ELK layout" is idiomatic English and matches how the layout libraries name things, but it would have left the one name a reader meets first still saying that a strategy is a layout.

We rejected the disambiguating prefixes first — `AuthoredLayout`, `SpaceLayout`, `StoredLayout` — because each buys the collision off rather than settling it, and the last is affirmatively wrong given ADR 0013 holds that positions are content rather than a cache of something computed. We also rejected leaving `Layout` on the function and never naming the union: viable while the union has one member, but tickets 03–06 all add layout call sites, and `docs/agents/workflow.md` is explicit that a rename runs alone and early because every ticket finished before it adds new surface in the old vocabulary. This was the last cheap moment.

ADR 0040 later deepens the authored value without reopening this vocabulary: a Layout's card-to-position keys are explicit Card membership, and the Layout also owns its ordered Routes. A LayoutStrategy still arranges the View subject it is given and owns none of that authored structure.

The costs accepted: ADR 0005's central sentence is now false as vocabulary, though its actual decision — no `Arrangement` type, geometry as optional fields on the elements — is untouched and still binding. `LayoutGraph`, `LayoutCard` and `LayoutPort` keep their names while belonging to the strategy rather than to a Layout, which is a residual ambiguity resolved only by "layout" reading as a mass noun there. And two representations of a point survive, `LayoutPoint` in the strategy contract and `LayoutPosition` in the authored data, because `core` cannot import `graph` — that duplication is structural, not an oversight.
