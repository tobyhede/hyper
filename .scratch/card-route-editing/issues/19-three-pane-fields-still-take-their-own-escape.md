# Three pane fields still take their own Escape, which ADR 0048 withdrew

Status: resolved — delivered with the Card Editor migration in PR #69.

Surfaced by: rebasing the Edge Authoring branch onto package 4a and reconciling
the two edits both branches made to the keyboard authoring contract

## Context

ADR 0048 decides Escape by the surface rather than by the field, and the
keyboard contract now carries that amendment in full:

> **In a pane** (the Card editor, the Alias creation state), Escape is an alias
> of Cancel: it discards every pending field and closes. Fields do not intercept
> it.

Three fields shipped with package 4 do intercept it, each deliberately and each
with a test that pins the behaviour:

- `app/src/components/CardPicker.tsx` — a non-empty search consumes Escape and
  clears itself; only an empty one reaches `onCancel`.
- `app/src/components/NewAlias.tsx` — "Both fields take their own first Escape
  and stop it there".
- `app/src/components/OpenCard.tsx` — "draft takes the first Escape and puts
  back what the Card is".

`packages/ui/src/Command.tsx` states the withdrawn rule as the reason it leaves
Escape to its caller, and `card-creation.test.tsx` asserts it three times
(`spends the first Escape on the search draft and the second on the surface`,
and the Alias title and Alias rename equivalents), with matching e2e at
`editing.spec.ts:1730`, `:1786` and `:1887`.

So the ADR, the contract and the code disagree, and the tests currently hold the
code to the withdrawn rule rather than to the decision.

## Not introduced by the Edge Authoring branch

Both halves are `main`'s. Package 4 built the fields and package 4's own review
round accepted ADR 0048; the contradiction landed between them. The Edge
Authoring branch reconciled the *document* — its own edit restated the withdrawn
paragraph, which was dropped in favour of the amendment — and deliberately did
not change three shipped interactions and their nine tests as a side effect of a
rebase. `CardCombobox`, the one picker that branch added, follows ADR 0048: it
intercepts nothing and lets Radix's own dismissal close it.

## What has to be decided

Which way the disagreement resolves, because both readings are defensible and
only one is written down:

1. **The ADR stands.** The three fields stop intercepting, the nine tests invert,
   and a pane's Escape always means Cancel. Clearing a search then needs another
   affordance, or none — the pane is closing anyway.
2. **The ADR is narrowed.** A *search* field is not a draft: it holds no pending
   value, and clearing it is closer to Radix's own "Escape closes the layer you
   are in" than to reverting an edit. That reading would keep `CardPicker` and
   retire only the two title/content drafts, which *are* pending values ADR 0048
   names.

Reading 2 is the one worth interrogating first — the ADR's argument is that a
field draft's Escape "was never a primitive's behavior — no Radix or shadcn
component and no platform behavior reverts a text input on Escape". A combobox
search that clears on Escape *is* a documented primitive behaviour, so the
argument may not reach it.

## Proof either way

`card-creation.test.tsx` and `editing.spec.ts` already exercise every path; the
work is deciding what they should assert, not building a way to observe it.
