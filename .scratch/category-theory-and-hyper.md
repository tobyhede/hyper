# Category theory and Hyper

Exploratory notes. This is a conceptual lens, not an accepted domain decision or a proposal to replace Hyper's vocabulary.

## The strongest intersection

A Hyper **Route** can be treated as a directed graph that generates a category, while a presentation **Walk** can be treated as a morphism in that generated category.

For a Route `r`, let:

\[
G_r = (V_r, E_r, s, t)
\]

where `V_r` is the set of Cards touched by the Route, `E_r` is its set of authored Edges, and `s` and `t` give each Edge's source and target.

The free, or path, category `Path(G_r)` has:

| Hyper concept | Categorical reading |
| --- | --- |
| Card | Object |
| Authored Edge | Generating morphism |
| Walk | Composite morphism: a finite path |
| Active Card | Codomain of the Walk so far |
| Advance | Compose with one outgoing generator |
| Fork | Choice among generators with the same domain |
| Merge | Distinct paths arriving at the same object |
| Empty Walk | Identity morphism |
| Self-edge or cycle | Endomorphism and its repeated powers |

This is only an interpretation of Route traversal. Hyper itself should not be described wholesale as a category, and an authored Edge should not be called a morphism without this qualification.

## Generating morphisms

A **generating morphism** is a basic arrow from which longer morphisms can be composed.

Suppose a Route contains the authored Edges:

\[
A \xrightarrow{e} B \xrightarrow{f} C
\]

Here `e` and `f` are generating morphisms: they are primitive connections explicitly drawn by the author. Composing them derives:

\[
f \circ e : A \rightarrow C
\]

That composite represents the Walk `A -> B -> C`. It does **not** create or imply a new authored Edge directly from `A` to `C`.

In Hyper terms:

- a generating morphism is one authored Route Edge;
- a composite morphism is a Walk containing consecutive Edges;
- an identity morphism is the empty Walk that stays at one Card.

"Generating" means that identities and composition freely build the rest of the path category from these basic arrows. Different paths remain different morphisms unless explicit equations identify them; Hyper currently declares no such equations.

## Why one category per Route

The whole Space should not generate one undifferentiated path category. Two Routes may contain the same `A -> B` pair, and Hyper treats those as different Edges because each belongs to its Route. Presenting also keeps exactly one Route active.

Combining every Route before freely generating paths would admit a path that follows an Edge from one Route and then an Edge from another. That is not a valid presentation of either Route.

A better model is therefore an indexed family:

\[
r \longmapsto Path(G_r)
\]

The categories share Card objects but retain Route-specific morphisms. Equivalently, a Space is a route-coloured graph whose valid presentation paths must be monochromatic.

Reducing the structure to a reachability preorder would lose important information. It would retain only that some path exists from `A` to `B`, while forgetting which Route permits it, which path was taken, and how many times a cycle was traversed.

## Traversal consequences

An advance extends the current Walk by composing it with a selected outgoing generating morphism. A fork offers several such generators. A merge permits several distinct Walks to have the same Active Card.

Retreat is not composition with an inverse. Route Edges are not generally invertible. Retreat removes the last generator from the recorded factorisation of the Walk. This is why Hyper must retain the Walk: after a merge, the Active Card alone cannot reveal which incoming path was actually taken.

A self-edge `e: A -> A` generates `e`, `e^2`, `e^3`, and so on, although the stored Route remains finite. This does not create an infinite runtime process because a presenter must deliberately perform each traversal.

Category theory does not select a Route's starting Card. A disconnected Route may have several source-like Cards; a fully cyclic Route has none. Hyper's starting rule remains an application policy, not a categorical universal property.

## Aliases

An Alias remains a separate Card object. It owns its title, position, and Route incidence while delegating content to another Card.

It would therefore be misleading to call an Alias equal or isomorphic to its target, or to interpret its target reference as a Route morphism. A simpler model is an object-level projection:

\[
contentSource : CardOccurrence \rightarrow ContentSource
\]

Several Card occurrences may map to the same content source. The Alias target belongs to this content-attribution layer, not to traversable Route topology.

## Layouts and strategies

A Layout attaches geometric data to Card objects and may filter which Route layers are visible. It does not alter the generated path categories. The topology-to-geometry dependency remains one-way.

A LayoutStrategy may be described informally as an interpretation of a graph into a geometric diagram, but it is not automatically a categorical functor. That would require defined categories of graph transformations and geometric diagrams, plus a demonstration that the strategy preserves identities and composition. "Functor" should not be used merely as a synonym for a function.

## Nested Spaces and hypergraph categories

When nested Spaces are implemented, each Space could retain its own local family of path categories. Opening a space-Card would change context rather than flatten every level into a single global category. Flattening would otherwise introduce cross-level paths that Hyper's per-Space Routes do not author.

Despite Hyper's name, its current topology is not a categorical hypergraph. Every Edge has exactly one source and one target; a fork is several ordinary Edges rather than one multi-input or multi-output hyperedge.

Hypergraph categories or decorated cospans may become relevant if Spaces eventually acquire explicit input and output boundaries and can be plugged together as reusable open diagrams. They are unnecessary for the current presentation graph.

## Possible practical value

Category theory could help Hyper by:

- specifying presentation semantics as paths in the free category of the Active Route;
- preserving distinct Walks between the same Cards rather than collapsing them to reachability;
- treating Route membership as edge colouring and preventing cross-Route composition;
- keeping authored Edges as generators and composite Walks as derived runtime values;
- providing graph-rewriting tools later if structural deletion, Space substitution, or import merging becomes difficult.

The recommendation is to retain **Card**, **Route**, **Edge**, and **Walk** as the domain language. The path-category model is a useful semantic lens, not replacement vocabulary.

## References

- Brendan Fong and David I. Spivak, [*Seven Sketches in Compositionality*](https://dspivak.net/7Sketches.pdf), section 3.2 on free categories.
- Brendan Fong and David I. Spivak, [*Hypergraph Categories*](https://arxiv.org/abs/1806.08304).
- Martin Schmidt, [*Functorial Approach to Graph and Hypergraph Theory*](https://arxiv.org/abs/1907.02574).

