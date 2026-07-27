# An alias has no body field at all

Status: open
Type: task

`aliasCardSchema` gives an alias a `body` constrained to `z.literal('')`. That models absence as a sentinel: the field exists, and one particular value is agreed to mean "not applicable". It should not exist.

## Nothing reads it

Every read of a card's content in the app goes through `resolveContentCard` first:

```
App.tsx:55          resolveContentCard(space, cardId)?.body ?? ''
projection.ts:152   resolveContentCard(space, card.id)?.body ?? ''
```

That function resolves an alias to its target, and ADR 0009 makes aliasing a single hop — a target is never itself an alias. So every `.body` read in the codebase is a read of a **markdown** card's body. The empty string on an alias is a field no reader touches.

## The value already means something else

`''` is a legitimate markdown body. `new-space.ts` mints exactly one: a new space's card, empty because nobody has written anything into it yet (ADR 0018). So the same value now carries two unrelated meanings — *this document is empty*, and *this kind of card does not have documents*. A reader cannot tell them apart, and neither can a type.

## The glossary already ruled on this

AGENTS.md: *"`body` is the field, `content` is the domain word, and they are not synonyms to be reconciled... `Card.body` is what a **markdown** card's content is stored as."* CONTEXT.md makes content kind-specific — markdown's content is its body, an alias's is its target's, a space card's is a graph.

Which is also why the sentinel does not scale. When ADR 0001's space cards land, their content is a graph, so `body: ''` on one would be the same nonsense a second time. A discriminated union member that simply lacks the field extends to three kinds; a sentinel needs a new excuse for each.

## What to change

```ts
export const aliasCardSchema = aliasCardFrontmatterSchema;
```

No `.extend({ body })`. Asking an alias for its body then becomes a compile error, which is what it is.

Two consequences worth expecting rather than discovering:

`resolveContentCard` currently returns `Card | undefined`, and both callers assume the result has a `.body`. It should return the content-bearing card type, which by the single-hop rule it always does. That is the change that converts this from "a field disappeared" into actual type safety — today the assumption is load-bearing and unstated.

`serializeCardFile` destructures `body` off the card. An alias writes as frontmatter and a fence with nothing after it. The round-trip property covers this once the arbitrary stops generating a body for aliases.

`CardNode.tsx` reads `data.body`, which is projection data rather than a `Card`, and is unaffected.

## What this also removes

`loadSpace` currently rebuilds a `Card` with a ternary:

```ts
card.frontmatter.kind === 'alias'
  ? { ...card.frontmatter, body: '' }
  : { ...card.frontmatter, body: card.body }
```

At runtime both branches produce the same value, because `cardSchema` has already validated an alias's body as `''`. It is there for the typechecker: `ParseCardFileResult` declares `body: string`, widening the literal away, so the alias branch's `''` is what supplies the type back. Removing it fails `tsc` — verified, not assumed.

With no `z.literal('')` in the union there is no literal to widen, and the ternary goes away on its own rather than needing a comment explaining why it looks redundant and is not.

`parseCardFile` returning the `Card` it already validated — rather than splitting it into `frontmatter` + `body`, which is strictly lossier than what it holds — would fix the same seam from the other end, and is worth considering while here. It is a wider change: the property tests and `serializeCardFile` are written against the split shape.

## Not in scope

Whether a space card carries a body. It does not, for the same reason, but space cards are ADR 0001 and unbuilt — this ticket is the alias case and the union shape that makes the third kind cheap when it arrives.

## Prior state

`aliasCardSchema` had `body: z.string()` until the current working-tree change tightened it to `z.literal('')`, alongside a `cardSchema` pass in `parseCardFile` that rejects an alias file carrying prose instead of silently discarding it. That was the right direction and this finishes it: the load error stays, the field goes.
