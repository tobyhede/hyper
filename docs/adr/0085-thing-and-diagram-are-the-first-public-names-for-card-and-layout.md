# Thing and Diagram are the first-public names for Card and Layout

Status: accepted
Refines: 0001, 0002, 0004, 0005, 0009, 0014, 0018, 0020, 0024, 0036, 0038, 0039, 0040, 0046, 0051, 0064, 0065, 0066, 0068, 0069, 0070, 0073, 0074, 0076, 0079, 0080
Related: 0010, 0041, 0047, 0050, 0054, 0056

The first-public domain calls the single addressable piece of a Space a
**Thing**, and calls the authored thing-to-rect map a **Diagram**. Both are
exact renames of what earlier decisions and the built prototype call a Card and
a Layout. **Space** and **Graph** are unchanged, so the four nouns are Space,
Thing, Graph and Diagram.

A Thing keeps the same identity, Title, kind, kind-owned fields, Open/Closed
behaviour, Open Size, aggregate-global id and durable web address. A Diagram
keeps the same identity, title, positioned kind, position map, Thing
membership-by-position-key, non-empty ordered owned Graph collection, Active
Graph resolution and Space ownership. Card and Layout do not remain as aliases,
subtypes, document keys or second entities.

This ADR decides vocabulary. Every invariant ADR 0040, ADR 0051, ADR 0064,
ADR 0066, ADR 0070, ADR 0074 and ADR 0079 records survives it unchanged and is
restated below in the renamed vocabulary rather than re-decided here.

## Why the names changed

Card was named for HyperCard's card (`CONTEXT.md`), and that lineage is the
strongest argument for keeping it. It is being spent deliberately. The word
carries a fixed-size, sequential, deck-shaped connotation the model has grown
out of: a Card here may be Markdown, a live projection of another Space, or an
Alias of any of those; it opens in place at an author-chosen size, sits in many
Diagrams at different coordinates, and belongs to no deck. Card promises a
uniform small rectangle in a stack. `CONTEXT.md` already spends four avoid-list
entries — deck, slide, page, tile — pushing back on exactly the reading the name
invites.

Thing takes the opposite position, and the philosophy under it is the reason to
prefer it: **objects stand apart; things belong to worlds.** Nothing in this
model stands apart. A Thing cannot exist outside a Space, a Graph belongs to
exactly one Diagram, and a Diagram "belongs to the Space and is part of what the
Space is." The generality is honest rather than evasive — the entity genuinely
has no shared content shape beyond a Title and a kind (ADR 0051), and a name
that declines to describe the content is a truer name than one that describes
content only one kind has.

Diagram replaces Layout because Layout was doing two jobs in one word. ADR 0005
called the arranging behaviour a Layout; ADR 0014 had to correct it once the
authored value became a thing you can hold, and the two have needed a
distinguishing qualifier in every sentence since. Diagram names the authored
artifact — a drawing an author composed — and leaves "layout" to mean the verb
it always was.

## Object was rejected

The alternative vocabulary was Space, Object, Graph, Diagram. Object has better
philosophical, mathematical and software pedigree than Thing, and reads better
in a URL and a table name. It was rejected on one ground: it cannot be enforced.

The Route to Graph rename (ADR 0041) stuck because
`test/unit/current-domain-vocabulary.test.ts` scans every tracked file for the
retired vocabulary in identifier shape. That test's own comments record three
sites the manual sweep missed and the scan caught. The instrument works because
compound shapes are unambiguous: nothing writes `RouteId` by accident.

That property does not hold for Object. A scan for the compound shapes
`Object[A-Z]`, `[A-Za-z]Object`, `object[A-Z]` and `OBJECTS?` matches **287
sites already in the tree** — `RefObject`, `isJsonObject`, `toMatchObject`,
`spaceFileObjectSchema`, and oxlint's own `ObjectExpression` and
`TSObjectKeyword`. The same scan for Thing matches **zero**. A domain word whose
guard would need 287 exceptions has no guard, and a rename of this size with no
guard is a rename that half-lands and then drifts back.

Object also shadows a global in the type namespace of every module that declares
it, and would leave `spaceFileObjectSchema` reading as "the Object's file schema"
when it means "the space file's JSON object schema."

Thing's cost is the mirror image and is smaller. It collides in **prose**, not in
identifiers: 323 bare uses of "thing" in code comments and 13 in `CONTEXT.md`,
where it is currently the generic supertype word — "a referenceable thing — a
Space, Card, Layout, or Graph." Left alone, that sentence would list Thing as one
member of a set whose collective noun is *thing*. The repository already has the
correct generic word and uses it 181 times, including a live `Entity*` component
family: **entity**. Those sentences take entity, and the substitution is
greppable, bounded and mechanical. `test/unit/ui-catalog.test.ts` uses `Thing`
~30 times as its placeholder for an arbitrary export in synthetic fixtures;
those take a different placeholder.

## Diagram reverses a recorded avoid-list entry

`CONTEXT.md` currently lists *diagram* under Layout's `_Avoid_`. That entry
landed in the original glossary commit with no argument recorded and no ADR
behind it, and the domain has moved: a Diagram now owns its Graphs, so it draws
lines between shapes rather than only positioning them, which is what the word
describes. This ADR reverses it explicitly, which is what a reader who finds the
old avoid-list entry in the history needs.

`CONTEXT.md` also uses "diagram" once in ordinary prose, describing what a
Markdown Thing's content may be. That sentence changes.

## LayoutStrategy keeps its name

This is the part a future review will otherwise re-suggest, so it is recorded as
a negative: **do not rename `LayoutStrategy` to `DiagramStrategy`.**

A LayoutStrategy is `(LayoutStrategyGraph) => Promise<LayoutStrategyGraph>` — it
takes things and edges and returns them with geometry filled in. It does not
produce a Diagram. Two of its three implementations have no Diagram behind them
at all: `gridStrategy` and `elkStrategy` compute placement from the things alone
and, as `grid.ts` says, "no Layout stands behind it" (ADR 0025, refined by ADR
0079). Only `positionedStrategy` reads an authored document. Naming the contract
after the entity would assert a relationship two of three members do not have,
and would reintroduce precisely the conflation ADR 0014 was written to correct.

The word "layout" in `LayoutStrategy` is the verb. Once the entity releases the
noun, the name stops being ambiguous without anyone touching it. `LayoutStrategy`,
`LayoutStrategyGraph`, `LayoutStrategyPort`, `LayoutStrategyEdge`,
`LayoutStrategyEdgeSection` and `buildLayoutStrategyGraph` are unchanged.
`LayoutStrategyCard` becomes `LayoutStrategyThing`, because that member names the
domain entity being arranged rather than the behaviour arranging it.

`packages/graph/src/layout.ts` keeps its filename for the same reason.

## The document contract

The one public document remains version 1 and the number does not advance. The
renamed keys are a new shape of version 1, not a version 2: Hyper is unreleased
(ADR 0054, ADR 0056), so there is no compatibility parser, migration, dual-write
period or `card`/`layout` key alias.

```json
{
  "version": 1,
  "id": "<space uuid>",
  "title": "Example",
  "defaultDiagram": "<diagram uuid>",
  "diagrams": [
    {
      "id": "<diagram uuid>",
      "title": "Diagram 1",
      "kind": "positioned",
      "positions": {
        "<thing uuid>": { "x": 0, "y": 0, "open": false }
      },
      "graphs": [
        {
          "id": "<graph uuid>",
          "title": "Graph 1",
          "color": "#4f7cff",
          "edges": [{ "from": "<thing uuid>", "to": "<thing uuid>" }]
        }
      ],
      "activeGraph": "<graph uuid>"
    }
  ]
}
```

`spaceFileSchema` is `.strict()`, so a file still spelling `layouts` or
`defaultLayout` is rejected outright rather than stripped or migrated. That is
the correct answer and the existing one: the schema declines every key it does
not declare, so it never names a retired one (ADR 0056).

A Thing is still a Markdown file with frontmatter and the directory is still the
inventory (ADR 0020). The directory is named `things/`. The Space Thing
frontmatter key `layout` becomes `diagram`; `target` and `graph` are unchanged.

## Domain and module interfaces

| Superseded name | First-public name |
| --- | --- |
| `Card` / `CardId` | `Thing` / `ThingId` |
| `cardSchema`, `cardFrontmatterSchema` | `thingSchema`, `thingFrontmatterSchema` |
| `markdownCardSchema`, `aliasCardSchema`, `spaceCardSchema` | `markdownThingSchema`, `aliasThingSchema`, `spaceThingSchema` |
| `cardPlacementSchema` | `thingPlacementSchema` |
| `cards` | `things` |
| `Layout` / `LayoutId` | `Diagram` / `DiagramId` |
| `layoutSchema`, `positionedLayoutSchema` | `diagramSchema`, `positionedDiagramSchema` |
| `layouts`, `defaultLayout`, `selectedLayoutId` | `diagrams`, `defaultDiagram`, `selectedDiagramId` |
| `resolveLayout`, `requireDefaultLayout`, `layoutCards`, `LayoutNotFoundError` | `resolveDiagram`, `requireDefaultDiagram`, `diagramThings`, `DiagramNotFoundError` |
| `LayoutStrategyCard` | `LayoutStrategyThing` |
| `CanvasCard`, `CardNode`, `CardRail`, `CardContent` | `CanvasThing`, `ThingNode`, `ThingRail`, `ThingContent` |
| `CardSearchCombobox`, `CardKindIcon`, `AddCardControl`, `CardsDrawer` | `ThingSearchCombobox`, `ThingKindIcon`, `AddThingControl`, `ThingsDrawer` |
| `MarkdownCardBody`, `NewSpaceCard`, `EmbeddedLayoutAuthoring` | `MarkdownThingBody`, `NewSpaceThing`, `EmbeddedDiagramAuthoring` |
| Space Card, Alias, Meta Space | Space Thing, Alias, Meta Space |

`nextCardTitle` and `nextLayoutTitle` become `nextThingTitle` and
`nextDiagramTitle`, minting the author-visible `Thing N` and `Diagram N`.

**The shadcn registry primitives keep their names.** `Card`, `CardHeader`,
`CardTitle`, `CardContent`, `CardDescription`, `CardFooter` and `CardAction` in
`packages/ui/src/components/card.tsx`, the Tailwind tokens `bg-card` and
`text-card-foreground`, and the `--card-*` custom properties and `data-slot`
values that belong to them are vendored vocabulary and are not ours to sweep
(ADR 0047, ADR 0050). This rename **resolves** an existing collision rather than
creating one: `packages/ui/src/index.ts` currently re-exports the registry's
`CardContent as CardSection` to avoid the domain `CardContent`. Once the domain
name is `ThingContent`, that alias is deleted and the registry component is
exported under its own name.

## Persistence, transport and addresses

The PostgreSQL model `Card` becomes `Thing` and `@@map("cards")` becomes
`things`. This is one forward migration; the existing migration snapshots are
history and are not rewritten.

Product URLs follow the vocabulary (ADR 0069). `/spaces/:spaceId/cards/:cardId`
becomes `/spaces/:spaceId/things/:thingId`. The Diagram URL shape
`/spaces/:spaceId/views/:layoutId` becomes `/spaces/:spaceId/diagrams/:diagramId`
— `views` was already a third word for the entity, left behind when ADR 0079
retired the View, and this rename is where it is settled rather than carried.
Ids remain unpadded 22-character base64url over canonical UUIDs; the `/api/spaces`
resource tree and the optimistic protocol do not change.

Test ids, CSS classes, accessibility labels and diagnostics follow the product
vocabulary rather than preserving the old words as an invisible compatibility
surface. `packages/app/stories/design-system-inventory.ts` records five class
names that move with them.

## The point split this forces

`LayoutPosition` is `core`'s schema-derived `{ x, y }`, and it is currently used
for two different things: the position an author stored in a Diagram, and the
bend points ELK computes for an edge that no author wrote and no schema parses.
`packages/graph/src/layout.ts` already flags this as wrong and defers it —
"constrain authored positions somewhere that only authored positions pass
through, or split the two again deliberately."

The rename forces the call rather than raising it, because the authored sense now
wants to be `DiagramPosition` and the computed sense plainly does not. They split:
the authored position is `DiagramPosition` and the strategy's routed geometry
takes a bare `Point`. ADR 0038 said a point has one type; this does not reopen it,
because these were never one point — one is parsed authored content and the other
is engine output, and sharing the schema meant a constraint added for the first
would silently bind the second.

## Roll-forward discipline

Two behaviour-preserving changes, in this order, neither carrying feature work:
Layout to Diagram first, because it is the smaller and cleaner half and is
independent; then Card to Thing, which includes the prose substitution to
*entity*.

The vocabulary guard gains both retired words. Layout is straightforward. Card
needs one carve-out and it is a file exemption, not a shape one, exactly as the
guard already makes for the Lucide facade: `packages/ui/src/components/card.tsx`
and the `@project/ui` index line that re-exports it hold a foreign name that
arrives with the registry.

Accepted ADR bodies and titles remain historical and are not rewritten; their
status blocks point here. Resolved issue records under `.scratch/` and the
superseded tree keep Card and Layout as provenance. `CONTEXT.md`, `AGENTS.md`,
`README.md` and `docs/agents/*.md` are current-state documents and change with
the code.

The implementation is complete when a case-sensitive repository scan finds no
domain `Card`, `CardId`, `cards`, `Layout`, `LayoutId`, `layouts` or
`defaultLayout` outside the historical trees, the registry carve-out and
qualified layout-strategy prose; when `pnpm verify`, `pnpm e2e` and
`pnpm e2e:ladle` pass; and when the PostgreSQL integration suite proves the
vocabulary through import, storage, load and export.

## Cost

A deliberately broad pre-release rename: roughly 15,000 Card-shaped and 6,000
Layout-shaped occurrences across 384 and 240 files, ~100 filenames, 141 test ids,
11 CSS classes, the on-disk directory, the database model and the product URLs.
Five live worktrees, two of them Card-focused, will conflict across most of what
they touch.

The permanent costs are two. The HyperCard lineage that explains the project's
own name is severed, and no sentence in the glossary will explain "hyper" again.
And "thing" stops being available as the casual generic in prose, in a codebase
whose doc comments lean on it heavily — every future writer pays a small tax to
say entity instead.

Against that: two nouns that describe what the model actually became, a Diagram
that no longer needs a qualifier in every sentence to distinguish it from the
behaviour, and a rename the repository can prove it finished.
