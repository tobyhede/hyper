# After conversion, the Layout is what renders

Status: open
Type: task
Blocked by: 12
Prerequisite for: ADR 0021

`App` re-runs `view.strategy(graph)` whenever `graph` changes identity, and feeds the result into `projectCardNodes`. `reconcile` protects *existing* cards by keeping the live node — but a card the store has never seen takes the projection wholesale, which is the strategy's position computed against a graph whose other cards are no longer where that computation put them.

Dead today, because `graph` never changes. Live the instant ADR 0021's drag-to-empty-canvas creates a card, and it is ADR 0025's second named way to get conversion wrong: *"re-running the strategy after the edit rather than before"*. That makes it the strongest of the 0021 prerequisites.

Decide and pin what happens to the arrangement when the graph changes after conversion. The likely answer is that a converted space stops re-running `view.strategy` at all and renders from the store's map through `positionedStrategy`, with a new card placed by the gesture rather than by the strategy. `moved` is the precedent for the shape — it already does the analogous thing for routed edge geometry, dropping the layout's routing the moment a card leaves the arrangement that routing assumed.

The bulk of the work is a regression test that can actually change the graph, which does not exist yet. That is a reason to do this before ADR 0021 rather than inside it: the test is the thing 0021 will be developed against.
