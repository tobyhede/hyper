# 07 — Grill what the rail means, and what a tab's selection belongs to

Status: resolved
Type: grilling

## Context

`.scratch/space-cards/issues/05-grill-space-card-navigation.md` asked how a Space Card is navigated into and parked the answer. A review prototype under `packages/app/stories/review/` has since exercised it, and the user has ruled on most of what 05 asked: navigation is take-over-view rather than infinite-canvas zoom; the Space Sidebar survives the crossing and carries a rail of open Spaces beside it; the rail is horizontal so depth costs a row and never any width; tabs are persistent, so selecting one switches and closes nothing and Exit is an explicit action.

What the prototype could not settle is below. Each is a trade rather than a lookup, and one of them is a contradiction with an ADR rather than a gap in it.

## Task

Walk the decision tree with the user (`/grilling`), covering at minimum:

- **Whose selection is it?** ADR 0068 says the Space View and Graph selection belongs to the Space Card — "every placement of one Space Card therefore shows the same selection", and showing a different view of the same Space requires another Space Card. The prototype gave each *open tab* its own live selection, held in that level's Navigation and surviving being looked away from. These are different models. If the Card owns the selection, changing the view while inside an entered Space is either an Edit to the Card in the parent Space or is not possible; if the tab owns it, ADR 0068's paragraph needs amending.
- **Enter on a Space that is already open** — focus the existing tab, or open a second? ADR 0068's per-Card selections make both defensible, and the answer follows from the question above: if two Space Cards can select different views of one Space, two tabs on that Space are meaningful.
- **Rail at depth one** — drawn always, so it costs its width in the state an author is in most of the time to show one tab that is a choice between one thing; or drawn from two, so entering resizes the live sidebar at the same moment it swaps the canvas and the whole screen moves at once. The prototype has a toggle.
- **A status mark on a tab.** ADR 0053 says status is not a command. Whether a rail of open Spaces is chrome rather than a command list, and so whether a Space that has gone `conflicted` may say so on its tab, is unruled.
- **What "new tab" means now.** ADR 0069 makes entities addressable, which 05 could not assume. A Space that has a durable web address can be opened in a browser tab, which may be the whole of the answer or may be beside an in-app one.

## Not in scope

The gestures and visual treatment ADR 0068 already calls hypotheses are settled by the prototype and do not need re-grilling. This ticket is only the five above.

## Resolved

Grilled 2026-08-28. All five questions ruled, plus five more the tree raised while asking. Everything below is written into ADR 0068, which is now accepted.

| Question | Ruling |
| --- | --- |
| Whose selection is it | Neither model as stated. An entered Space carries a **live navigation context**, seeded from the Space Card and stored nowhere. Changing it is navigation, not an Edit, so the Card's stored selection and the Space's own are both untouched. This is the mechanism ADR 0069 already establishes for an explicit URL context, reached by a gesture instead. |
| Enter on a Space already open | Focus the existing entry. Two live selections over one Space identity would leave the second showing a stale derivation. Two views at once is what a second browser tab is for. |
| The surface at one open Space | Draws from two. A choice between one thing does not earn permanent width from a spatial canvas — the cost ADR 0053 weighed once already. |
| A status mark | Allowed, for `conflicted`, `failed` and `rejected` only. ADR 0053's "status is not a command" forbids status in a *command list*; an entry is a place. The save lifecycle stays in that Space's Sidebar footer. |
| What "new tab" means | The browser's, and the application builds none of its own. ADR 0069 makes it a link. |

Five more, raised by the documents rather than by this ticket:

| Question | Ruling |
| --- | --- |
| Where an entered Space gets its first Space View | From the Space Card, so the view does not change under you at the moment the canvas swaps. |
| Does an entry remember how it was reached | No. Closing one Space never closes another. Back is the browser's history, not a pop. |
| Where Exit lives | The Space's own Sidebar, so a refusal and its recovery sit together. Escape does not exit — it keeps ADR 0048's meaning. |
| Exit on a Space that cannot save | Waits on an in-flight commit. Refuses on `failed` and `conflicted`. Warns and allows on `rejected`, because a refusal that names no recovery is a trap. |
| Naming | "Rail" stays ADR 0073's, for a Card's toolbar. The surface is **Open Spaces** and its items are **entries**. "Tab" is not a domain word. "Stack" named the rejected model. `CONTEXT.md` carries all of it. |

### Two corrections this session made to the tickets

The context above says "the rail is horizontal". It is not: the prototype's surface is a vertical set — `orientation="vertical"`, a 36px column, `[writing-mode:vertical-rl]` on each label. Depth costs a row and never any width, which is what that sentence was reaching for.

Tickets 09 and 11 said "stack" throughout, which is the name of the model that lost. The prototype implements both and names them `stack` and `tabs`; `tabs` was chosen.

### Deferred, deliberately

One idea was raised and set aside without being explored: a breadcrumb of crossings in the top panel. It is not recorded as explored and nothing was decided about it.
