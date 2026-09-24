# An Edge may carry a Title

Spec for `.scratch/edge-toolbar/issues/02-an-edge-may-carry-a-title.md`. It is the domain half of the Edge toolbar effort: schema, intake, persistence and Space Authoring. It draws nothing — the toolbar, the `wire` Title and every surface that shows or edits a Title are `edge-toolbar/issues/05`, which is blocked on this.

The word is **Title**. It is the product's one word for an entity's authored name across Resources, Graphs and Maps; "label" is React Flow's render-layer word (`EdgeLabelRenderer`) and stays there. Whether one-line identities should be called Name product-wide is deferred and not reopened here.

## What an Edge Title is

- **Optional and absent by default.** An Edge drawn by any gesture has no Title, and nothing mints one — no `Edge N`, no copy of an endpoint's Title.
- **One line.** A Title containing a line break (`\n` or `\r`) is refused by the schema. There is no length cap.
- **Stored trimmed and non-empty.** The schema refuses an empty string; the Edit trims the draft, and an empty draft clears the Title rather than storing `""`.
- **The Edge's own content.** Its identity is unchanged: an Edge is still `(from, to)` within its Graph, an exact Edge still appears at most once, and drawing an existing Edge again still changes nothing — it does not clear, keep or merge a Title, because nothing was drawn.

## `titleHidden`

- Stored only as `titleHidden: true`; absent means shown. `false` is not a stored value.
- The schema refuses `titleHidden` on an Edge without a `title`.
- Clearing the Title clears `titleHidden` with it, in the same Edit.
- It is authored and persisted, not view state: it decides whether the Title draws at rest (`edge-toolbar/spec.md`). What it does while presenting is `edge-toolbar/issues/08`.

Per-Edge colour, style and tags stay out. `titleHidden` is admitted anyway because it governs the Edge's own content, not how the line is drawn — the line's appearance stays the Graph's.

## Schema — `packages/core/src/schema.ts`

```ts
export const EDGE_TITLE_ONE_LINE = 'edge-title-one-line';

const edgeTitleSchema = z
  .string()
  .min(1)
  .refine((title) => !/[\r\n]/.test(title), { params: { code: EDGE_TITLE_ONE_LINE } });

export const graphEdgeSchema = z
  .object({
    from: idSchema,
    to: idSchema,
    title: edgeTitleSchema.optional(),
    titleHidden: z.literal(true).optional(),
  })
  .strict()
  .refine((edge) => edge.titleHidden === undefined || edge.title !== undefined, …);
```

- The refusal identity rides on `params`, as `RESOURCE_TITLE_REQUIRED` does (ADR 0057): the domain names the rule and the application owns the wording.
- **`graphEdgeSchema` becomes `.strict()`.** It is a plain `z.object` today, so an unknown key is silently stripped, while the Map and space-file schemas around it are strict. With two optional keys on it, a misspelt `titlehidden` would vanish on the next save rather than fail intake. Any tracked Edge carrying an extra key surfaces here and is fixed at the source.
- The one-line rule is local to the Edge. Graph, Map and Space titles are also single-line by ADR 0083 but no schema refuses a line break in them; tightening those is a separate change, not taken here.
- `GraphEdge` is still `z.infer<typeof graphEdgeSchema>` and gains the two optional fields.

## Intake — `packages/graph`

- `repeatedGraphEdges` keeps keying on `(from, to)`: two Edges with the same endpoints and different Titles are still `duplicate-graph-edge`.
- `graphRenderEdgeId` stays `${graphId}::${from}::${to}`. `GraphRenderEdge` does **not** gain the Title here; carrying it to the canvas is `05`'s.

## Persistence

- Edges live inside the `spaces.document` JSON (`maps[].graphs[].edges[]`) on both PostgreSQL and SQLite, so there is **no migration** on either. This matches the last two optional document fields (`framing`, `openSize`), neither of which added one.
- **No version bump.** `SPACE_FILE_VERSION` and `AGGREGATE_FILE_VERSION` stay at 1: an absent field is the old shape, and the repo is the only source of state.
- The memory adapters hold whole snapshots and need nothing.
- The SQL fast path compares `JSON.stringify(maps)`, so a Title change leaves it and takes the complete-aggregate decision, as connect and delete already do. That is correct and needs no change.
- The HTTP protocol reuses `spaceSnapshotSchema` and needs nothing.

## Space Authoring — `packages/app/src/space-authoring.ts`

Two new `AuthoringCompletion` kinds, past tense like their neighbours, addressed as `deleted-edge` is — the Graph and the Edge's endpoints:

```ts
| { readonly kind: 'titled-edge'; readonly graphId: GraphId; readonly edge: GraphEdge; readonly title: string }
| { readonly kind: 'hid-edge-title' | 'showed-edge-title'; readonly graphId: GraphId; readonly edge: GraphEdge }
```

Both go through the shared Graph-scoped arm (owned-Graph lookup, `graph-not-owned`, `replacing()`), and both find the Edge with `indexOfEdge` / `sameEdge` — by `(from, to)`, never by deep equality, because the `edge` a surface holds may carry a Title that is stale by the time the completion lands.

**`titled-edge`**
- The draft is trimmed. Empty after trimming: remove `title` and `titleHidden`.
- A draft containing a line break is refused `edge-title-one-line`. The single-line field cannot produce one by typing, but a paste or a programmatic caller can, and a refusal is honest where silent folding would store something the author did not see.
- The same Title as stored is `unchanged` (a no-op clear of an untitled Edge included); the final `sameSnapshot` check covers it too.
- Otherwise the Edge is replaced in place with the new `title`, keeping its position in `graph.edges` and its `titleHidden`.

**`hid-edge-title` / `showed-edge-title`**
- Hiding an Edge without a Title is refused `edge-title-required`. (Surfaces keep the eye disabled without a Title, per `05`; the refusal is for the caller that ignores that.)
- Hiding an already hidden Title, or showing a shown one, is `unchanged`.
- Showing removes the key; it never writes `titleHidden: false`.

Refusals shared with the existing Edge Edits: `edge-not-found`, `graph-not-owned`, and `MapRequiredOperation` gains the three kinds. The application's refusal presentation gains wording for `edge-title-one-line` and `edge-title-required`.

**Embedded Maps.** The three kinds are not added to `EmbeddedResourceCompletion` or `EmbeddedContextCompletion`. An Open Space Resource's embedded Map draws no Edge toolbar, so nothing there could send them; admitting them is a decision for when it does.

## Existing Edits must not drop a Title

Code that rebuilds an Edge from `{from, to}` would strip a Title silently once one exists.

- **`connected-resources` / `create-and-connect`** build a fresh `{ from, to }` — correct: a new Edge has no Title.
- **`reconnected-edge`** (`reconnectOutcome`) builds `{ from, to }` from the moved endpoint. Reconnect is removed in `05`, but it is live between this change landing and that one. Until then it keeps the Edge's Title and `titleHidden` (`{ ...edge, [endpoint]: resourceId }`), with a test, so no Title is lost by a gesture that is still on the canvas. The decision that a redrawn Edge carries nothing over applies to Delete-then-draw, not to this interim path.
- **Removing a Resource from a Map** filters Edges and keeps survivors whole (`snapshot-edits.ts`) — correct as is; covered by a test with a titled survivor.

## Tests

- `core`: schema accepts an untitled Edge, a titled one, a titled and hidden one; refuses `""`, a Title with `\n` or `\r` (with `EDGE_TITLE_ONE_LINE` on the issue), `titleHidden` without `title`, `titleHidden: false`, and an unknown key.
- `graph`: `duplicate-graph-edge` fires for two same-endpoint Edges with different Titles.
- `space-authoring`: each outcome above — set, rename, trim, clear (dropping `titleHidden`), unchanged, `edge-title-one-line`, hide, show, hide-untitled refusal, `edge-not-found` after the Edge is deleted, `graph-not-owned`; a completion whose `edge` carries a stale Title still finds its Edge; the Edge keeps its index; reconnect keeps the Title.
- `test/support/repository-contract.ts`: a titled, hidden Edge round-trips through commit and load — which runs it against PostgreSQL, SQLite and memory.
- Aggregate export/import round trip preserves both fields.

No fixture needs rolling forward: absence is the default, so every tracked document stays valid. Fixtures that exercise a titled Edge arrive with `05`, which is the first change that draws one.

## Records

- **ADR** (next number, `0104`): an Edge may carry a Title — optional, absent by default, never minted, one line, no cap; identity stays `(from, to)`; `titleHidden` is admitted as the Edge's own content while per-Edge style is out, with the rejected alternative (Title visibility as a Graph- or view-level setting) and why; reconnect is dropped, so Delete-then-draw loses the Title and appends the redrawn Edge — it becomes the last choice at a fork — accepted, with fork order deferred to `edge-toolbar/issues/08`. "Title, not Label" is recorded with its reason.
- **`CONTEXT.md`**: the Edge entry says an Edge may carry a one-line Title, absent unless authored, which may be hidden at rest; its _Avoid_ list gains *label* for the Title. The Selected Edge entry stops saying its controls "reconnect".

## Out of scope

- Drawing, editing or hiding a Title on the canvas, the toolbar, and removing reconnect — `edge-toolbar/issues/05`, `06`.
- Titles while presenting and fork order — `08`.
- A one-line rule for Graph, Map and Space titles.
- Name versus Title.
