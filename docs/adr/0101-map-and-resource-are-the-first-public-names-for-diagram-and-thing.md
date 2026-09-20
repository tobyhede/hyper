# Map and Resource are the first-public names for Diagram and Thing

Status: proposed
Refines: 0085
Related: 0038, 0041, 0047, 0050, 0054, 0056, 0069, 0092

The first-public domain calls the single addressable piece of a Space a **Resource**, and calls the authored resource-to-rect map a **Map**. Both are exact renames of what ADR 0085 named Thing and Diagram. **Space** and **Graph** are unchanged, so the four nouns are Space, Resource, Graph and Map.

A Resource keeps the same identity, Title, kind, kind-owned fields, Open/Closed behaviour, Open Size, aggregate-global id and durable web address. A Map keeps the same identity, title, positioned kind, position map, Resource membership-by-position-key, non-empty ordered owned Graph collection, Active Graph resolution and Space ownership. Thing and Diagram do not remain as aliases, subtypes, document keys or second entities.

This ADR decides vocabulary. Every invariant ADR 0040, ADR 0051, ADR 0064, ADR 0066, ADR 0070, ADR 0079, ADR 0084, ADR 0089, ADR 0092 and ADR 0093 records survives it unchanged and is restated in the renamed vocabulary rather than re-decided here.

## The four nouns say four different things

The renames are taken together because the argument is one argument: each noun now names exactly one job, and the four of them compose into ordinary English.

| Noun | What it names |
| --- | --- |
| Space | The containing universe, and the namespace |
| Resource | An identifiable thing that exists in the Space |
| Graph | A defined network of relationships between Resources |
| Map | A visual spatial arrangement of Resources and Graphs |

The test is whether the product can be described without a qualifier in every sentence. It can: *A Space contains Resources. Resources form Graphs. Maps arrange them.* And in the imperative: *Open a Space. Create a Resource. Put it on a Map. Connect Resources into a Graph.* ADR 0085 could not write those sentences — it had to say "the thing that arranges Things", and it spent a whole preparatory change substituting *entity* for the generic word its own noun had taken.

## Why Diagram became Map

**Map and Graph now split topology from geography, and Diagram could not.** A Graph is the network of relationships — which Resources connect, and in which direction. A Map is where things sit and how they look. Diagram names both at once: a diagram is a drawing *of relationships*, so "the Diagram's Graphs" is a drawing of relationships owning networks of relationships, and every sentence about the pair had to work to keep them apart. Map does no such work. A map is where the territory is; a graph is what connects to what.

That the entity is a territory rather than a technical drawing is the second reason. A Diagram is produced to explain a system, read once, and filed. This entity is composed, inhabited and traversed — presenting *moves through* it. Map also reads better everywhere the name surfaces: `/spaces/:spaceId/maps/:mapId`, "Add Map", "the Map's Resources".

## Why Thing became Resource

**Resource is the word for an identifiable thing, and identifiability is what this entity has.** ADR 0069 gave every entity a durable web address; ADR 0016 gave it a UUID that survives every rename and move. The model already treats the entity as something you can name and point at from elsewhere — a Reference Resource points at one, a Space Resource points at a Space, a Graph Edge names two. Resource is the ordinary word for that, and the name and the identity mechanism finally agree. Thing named the same property by declining to name any property at all.

**Resource is the honest supertype for the kinds that are coming.** ADR 0085 defended Thing on the ground that the entity "genuinely has no shared content shape beyond a Title and a kind", and that a name declining to describe content is truer than one describing content only one kind has. That held while the kinds were markdown, space and reference. It stops holding as the set grows toward image, file, url, code, dataset and embed: those have a shared shape, and it is *addressable content of a declared type* — which is what Resource says and what Thing was chosen specifically not to say. The generality that was honest for three kinds is evasive for nine.

**Thing's recorded cost is what it kept costing.** ADR 0085 accepted that "thing stops being available as the casual generic in prose, in a codebase whose doc comments lean on it heavily — every future writer pays a small tax to say entity instead." That tax was paid on 2,144 sites of `nothing`/`something`/`anything`/`everything` that a sweep has to mask, and on every comment written since. Resource takes the word back and reclaims nothing else: *entity* remains the correct generic, and the substitution ADR 0085 made is not reversed.

## Map's costs are real and are accepted

ADR 0085 set the test a domain noun has to pass, and rejected *Object* on it. Map does not pass cleanly. It is taken anyway, with the costs measured rather than assumed, so that a later session finds the argument already made rather than making it again.

**Map is also a verb here, on 1,103 lines.** This is the same defect that retired Layout: ADR 0085 records that Layout "was doing two jobs in one word … the two have needed a distinguishing qualifier in every sentence since." `.map(` and `.flatMap(` are that collision at far greater density. It is accepted because the collision is *positional* rather than genuine: `.map(` is unambiguous in method position, where the overwhelming majority of the verb's uses sit. What the collision costs is prose, and prose is answered by convention below rather than by a tool.

**Map is a global in the type namespace.** ADR 0085 rejected Object partly on this ground. The measured breakage is four lines in three files — `render-adapter.ts:292` and `:313`, `canvas-thing-authoring.ts:44`, `edge-lanes.ts:55` — and only where the module also imports the domain type. `new Map(…)` resolves in the value namespace and does not shadow; `ReadonlyMap` and `WeakMap` are separate identifiers and do not shadow. The four sites take `ReadonlyMap` where the semantics allow and an aliased import where they do not. **The number is four, not thirty-two**: a count of files containing any Map-family token is not a count of collisions, and this ADR records the distinction because the larger number is the one a reader reaches for.

**Map is not greppable.** `Map` bare matches 1,243 word-boundary sites, so the question "where does the code name this entity?" can no longer be asked of the bare noun. The compounds remain the handle — `MapId`, `MapPosition`, `ResolvedMap`, `defaultMap`, `maps:` — and are as unambiguous as `RouteId` ever was. **This is a permanent loss and it is not a defect to be fixed.**

**The retirement guard is unaffected**, which is why the loss is affordable. `test/unit/current-domain-vocabulary.test.ts` scans for the *retired* word, and Diagram and Thing are both clean in identifier shape. The instrument that made ADR 0041 and ADR 0085 stick works for this rename exactly as it worked for those.

## The conventions that make Map survivable

These are not style preferences. They are what stands in for the guard the bare noun cannot have, and they belong in `CONTEXT.md`.

- The domain noun is **always capitalised** in prose: "a Map", "the Map's Resources". Lowercase bare `map` is the verb and only the verb.
- No domain value is bound to a local named `map`. The domain initial is `(m)`.
- `.map(` and `.flatMap(` are untouched and need no qualifier.
- A `…Map` suffix on an identifier means the entity. The lookup-table sense gives the suffix up: `graphColorMap`, `optionsMap` and `iconMap` become `…ByGraphId`, `…ById` and `…ByKind` in the same change.
- `MiniMap`, `flatMap`, `ReadonlyMap`, `WeakMap` and the generated `TypeMaps` are foreign names and are not swept.
- `@@map` is Prisma's attribute and is not a spelling of the entity.

## Recorded negatives

**Do not rename `LayoutStrategy` to `MapStrategy`.** ADR 0085's argument is unchanged and is restated here so it survives the rename that would otherwise look like an oversight: a LayoutStrategy takes resources and edges and returns them with geometry filled in. It does not produce a Map, and `gridStrategy` has no Map behind it at all. The word "layout" there is the verb, which is exactly what releasing the noun freed it to be. `packages/graph/src/layout.ts` keeps its filename. `LayoutStrategyThing` becomes `LayoutStrategyResource`, that member naming the entity being arranged.

**Do not rename `kind` to `type`.** The word a Resource's kind is written in looks like it should follow the entity, and it does not, because it is not the Resource's word. `kind` is this repository's discriminant for every union it has — `kind: 'completed'`, `kind: 'refused'`, `kind: 'conflict'`, `kind: 'update'`, `kind: 'unchanged'`, `kind: 'positioned'` — 4,354 lines across 310 files, most naming nothing a Resource has. Renaming all of it buys no domain clarity; renaming only the Resource's leaves one union spelled `type` while every sibling stays `kind`, which is worse than either. `type` is also the least available word in a TypeScript codebase, sitting beside 1,180 lines of `type X =` and `import type`. ADR 0051 is unchanged and a Resource kind still owns everything past the Title.

**Do not reintroduce Diagram or Thing as a second word**, in a comment, a test id, a CSS class or a document key. `CONTEXT.md` gains both under `_Avoid_`.

**Do not re-litigate Map from the numbers above.** They are recorded as accepted costs, not as open defects.

## What this ADR does not decide

The vocabulary this rename comes from describes a model reaching further than the rename does. Three of its parts are **structure, not spelling**, and the standing rule is that a rename never rides with a structural change — the diff stops being readable and a failure cannot be attributed. Each is named here so it is visibly deferred rather than quietly dropped.

- **A Resource's URN.** The UUID stays exactly what it is: the internal identifier, minted once and durable (ADR 0016), addressed as unpadded base64url in product URLs (ADR 0069). A URN is an **attribute a Resource carries**, not a replacement for either. Adding one is a change to the document contract, both database contracts and intake — small, but structure rather than spelling, and it wants its own ADR. Nothing here anticipates it.
- **The kinds beyond the three that exist.** image, file, url, code, dataset and embed are the *argument* for Resource, not part of it. This ADR renames the supertype. It adds no kind, and `markdown`, `space` and `reference` are what a Resource can be when it lands.

What this ADR does decide is the four nouns and nothing beneath them.

## The document contract

Version stays **1** and does not advance. The renamed keys are a new shape of version 1: Hyper is unreleased (ADR 0054, ADR 0056), so there is no compatibility parser, migration, dual-write period or `diagram`/`thing` key alias. `spaceFileSchema` is `.strict()`, so a file still spelling `diagrams` or `defaultDiagram` is rejected outright rather than stripped.

Keys: `diagrams` → `maps`, `defaultDiagram` → `defaultMap`, `activeGraph` unchanged, `positions` unchanged, `graphs` unchanged. A Resource is still a Markdown file with frontmatter and the directory is still the inventory (ADR 0020); the directory is named `resources/`. The Space Resource frontmatter key `diagram` becomes `map`; `target` and `graph` are unchanged.

## Domain and module interfaces

| ADR 0085 name | First-public name |
| --- | --- |
| `Thing` / `ThingId` | `Resource` / `ResourceId` |
| `thingSchema`, `thingFrontmatterSchema` | `resourceSchema`, `resourceFrontmatterSchema` |
| `markdownThingSchema`, `spaceThingSchema` | `markdownResourceSchema`, `spaceResourceSchema` |
| `things` | `resources` |
| `Diagram` / `DiagramId` | `Map` / `MapId` |
| `DiagramPosition` | `MapPosition` |
| `diagrams`, `defaultDiagram`, `selectedDiagramId` | `maps`, `defaultMap`, `selectedMapId` |
| `resolveDiagram`, `requireDefaultDiagram`, `diagramThings`, `DiagramNotFoundError` | `resolveMap`, `requireDefaultMap`, `mapResources`, `MapNotFoundError` |
| `LayoutStrategyThing` | `LayoutStrategyResource` |
| `CanvasThing`, `ThingNode`, `ThingRail`, `ThingContent` | `CanvasResource`, `ResourceNode`, `ResourceRail`, `ResourceContent` |
| `ThingSearchCombobox`, `ThingKindIcon`, `ThingsPopover` | `ResourceSearchCombobox`, `ResourceKindIcon`, `ResourcesPopover` |
| `MarkdownThingBody`, `EmbeddedDiagramAuthoring` | `MarkdownResourceBody`, `EmbeddedMapAuthoring` |
| Space Thing, Reference Thing | Space Resource, Reference Resource |

`nextThingTitle` and `nextDiagramTitle` become `nextResourceTitle` and `nextMapTitle`, minting the author-visible `Resource N` and `Map N`.

**`SpaceResourceRepository` is not ours to keep.** `packages/persistence/src/repository.ts` already uses Resource in the HTTP sense for the stored seam — `SpaceResourceRepository`, `SpaceResource`, `AggregateResource`, 35 sites. After this rename those read as "a repository of Space Resources", which is not what they mean. They are renamed **before** the sweep, to the seam's own vocabulary, exactly as ADR 0085 deleted the `CardContent as CardSection` alias rather than sweeping it.

## Persistence, transport and addresses

The model `Thing` becomes `Resource` and `@@map("things")` becomes `resources`, in **both** database contracts (`src/prisma/contract.prisma` and `src/sqlite/contract.prisma`). `prisma-next` has no table-rename operation, so each is a `dropTable` plus `createTable` and **destroys every row in `things`**. That is accepted under ADR 0056 — every database here is derived and no byte outlives a reset — and the recovery is `export` before and `import` after. Two forward migrations, one per database; existing snapshots are history and are not rewritten. Migrations are generated offline with `prisma-next migration plan --from <head-hash>`; omitting `--from` plans from `<empty>` and forks the migration graph.

Product URLs follow the vocabulary (ADR 0069): `/spaces/:spaceId/things/:thingId` becomes `/resources/:resourceId`, and `/spaces/:spaceId/diagrams/:diagramId` becomes `/maps/:mapId`. Ids remain unpadded 22-character base64url over canonical UUIDs; the `/api/spaces` resource tree and the optimistic protocol do not change. Test ids, CSS classes, accessibility labels and diagnostics follow the product vocabulary.

## Roll-forward discipline

**One codemod, both words, one commit.** The two are independent — "Map" contains no "thing" and "Resource" contains no "diagram", and the one compound of both (`space-thing-diagram`, 60 sites) rewrites correctly in a single pass. ADR 0085 ran its two words as two sweeps and paid for every step twice: two mask tables, two prettier runs, two path passes, two reviews and two replays. This does not.

**The sweep runs on a clear tree.** Five branches are live and carry 1,144 vocabulary-bearing diff lines between them; replaying onto one branch of three commits was a three-ticket effort last time. Each is landed or killed first. Every ticket completed after the sweep adds new surface in the retired vocabulary; every branch alive during it is a full-range replay from the merge-base — never a tips-only rewrite, which changes the shape of the conflicts without reducing them.

**The mask table carries what the previous cycle learned.** `nothing`, `something`, `anything`, `everything` and their capitals — 2,144 sites the substring substitution would otherwise wreck. Citation shapes under `.scratch/` and ADR slugs, plus a post-sweep check that every backticked `feature/NN` still resolves, which is what caught nothing last time and let two dangling citations through. `pnpm-lock.yaml`, `skills-lock.json`, `migrations/`, `migrations-sqlite/` and the vendored registry are not opened at all.

Accepted ADR bodies and titles remain historical and are not rewritten; their status blocks point here. Records under `.scratch/` and `superseded/` keep Thing and Diagram as provenance. `CONTEXT.md`, `AGENTS.md`, `README.md` and `docs/agents/*.md` are current-state and change with the code.

The implementation is complete when `current-domain-vocabulary.test.ts` proves both retired words gone in every shape they were written in — PascalCase both directions, camelCase, screaming, kebab, snake, quoted-string, lowercase English suffix, and bare within implementation source — when `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass, and when both database integration suites prove the vocabulary through import, storage, load and export.

## Cost

Roughly 22,700 Thing-shaped and 8,700 Diagram-shaped occurrences across 543 and 300 files — about double ADR 0085's sweep — plus ~100 filenames, the on-disk directory, two database models and the product URLs.

The permanent costs are two. The bare noun `Map` stops being greppable. And a domain noun now shares its spelling with a JavaScript builtin and an Array method, which is a thing this repository said it would not do, said twice — against Object and again in the argument that retired Layout — and is now doing deliberately, with the four sites it actually breaks written down above so the decision can be judged on what it costs rather than on what it looks like it might.

The cost that is **not** permanent is the one ADR 0085 recorded as such: the generic word returns to prose. That is a repayment, not a new charge.

This is the second rename of these two entities in as many months, and the third counting ADR 0092. That is the real risk, and it is not answered by an argument — it is answered by the vocabulary holding still afterwards. The four nouns above are a complete set that composes into sentences, which neither of the two previous vocabularies did; if that is not enough to stop the next one, nothing in this document will be.
