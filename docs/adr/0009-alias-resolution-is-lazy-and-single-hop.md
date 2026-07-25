# Alias resolution is lazy, non-destructive, and single-hop

Status: accepted
Refines: 0004
Related: 0012, 0023

An **alias** is a card that shows another card's content at a second position (`CONTEXT.md`; the gap ADR 0004 left open when it retired the authored Node). This records how an alias resolves to its target, and two things we deliberately do *not* do.

## The decision

An alias card holds a pointer, not content: `{ id, title, kind: 'alias', target }`. Resolving it — turning that pointer into the content to draw — is **lazy and non-destructive**, lives in `@project/graph`, and follows **exactly one hop**.

- **Lazy and non-destructive.** The parsed manifest keeps alias cards *as* alias cards. A resolver in `graph` walks an alias to its target's content, called on read by whatever needs content (the projection, the deck). `parseManifest` never rewrites an alias into its target's content.
- **In `graph`, not `core`.** Resolving an alias is a cross-card lookup, and cross-card referential logic is `graph`'s job by the existing package boundary. `core` stays shape-only.
- **Single hop.** An alias's `target` must be a *non-alias* card. An alias pointing at another alias is a validation error (`alias-targets-alias`), so chains do not exist.

## Why not flatten at intake

The obvious alternative is to resolve at parse time — replace each alias with its target's content so downstream code only ever sees content. We rejected it because **flattening destroys the fact the rest of the system needs.**

Two decisions depend on a card still knowing it is an alias after parsing:

- **Routing.** A route stepping `C … C'`, where `C'` aliases `C`, is an author-requested *redraw* — a fresh forward-readable box — as opposed to `C … C`, a revisit that loops back (ADR 0003, and this feature's spec). That distinction is only visible if `C'` is still an alias node with its own id at its own position. Flattened, `C'` becomes an ordinary content card and the redraw semantics vanish.
- **Rendering.** The viewer needs a signal that they are seeing the same content again rather than new material (issue `alias-cards/03`). There is nothing to signal if intake has erased that this card is an alias.

Single-source-of-truth — "editing the target changes every place it appears" — holds either way within one load, but non-destructive keeps it literally true: exactly one card owns the content, the alias owns only a pointer, so nothing is copied and nothing can drift.

The cost we accept: every consumer that reads a card's content must go through the resolver, because an alias card has no `content` field of its own. That is a real ergonomic tax on `graph` and adapter code, and it is the price of keeping alias identity alive past intake.

## Why single-hop, not chains

Allowing `x → y → z` would mean the resolver walks the chain to the first non-alias, which needs cycle detection (a seen-set while walking; a bug there is a hang). We rejected chains because single-hop is strictly simpler and loses nothing anyone asked for:

- **It makes cycles unrepresentable.** If every alias must point at a non-alias, `x → y → x` cannot be formed. The whole cycle failure class disappears before validation runs — there is deliberately no alias-cycle check, because there can be no alias cycle.
- **It keeps the source of truth unambiguous.** The glossary says an alias has "a single source of truth." With a chain, is `x`'s source `y` or `z`? A single hop means every alias names its source directly.
- **No authoring need.** The MVP need is "show card A's content at a second position." `B → A` covers it; `C → B` buys nothing an author cannot get from `C → A`, and reads less clearly.

The cost we accept: an author who writes `C → B` (both aliases of `A`) gets a validation error and must point `C` at `A` directly. Small, clearly messaged, and it points them at the real source.

## What this does not decide

The **specific** visual treatment of the "same content again" signal — a badge, a border, an on-screen affordance — is left to issue `alias-cards/03`, decided with it on screen. A differently-titled alias (an alias carries its own title, inheriting only content) is already one such signal.
