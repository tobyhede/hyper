# A Layout carries `routes` and `activeRoute`

Status: open
Blocked by: 01

`positionedLayoutSchema` gains two optional fields (ADR 0026):

- `routes: string[]` — the subset this Layout shows. Absent means every route.
- `activeRoute: string` — which visible route is active on open. Absent means the first visible one.

Shape only, as everywhere in `core/src/schema.ts`. That both name real routes, and that `activeRoute` is inside the visible set, need the whole space in view and belong to `03`.

The `Layout` type in `types.ts` picks them up derived. Note `exactOptionalPropertyTypes` — anything constructing a Layout spreads these conditionally rather than passing `undefined`.

Both are independent: a Layout may filter without naming an active route, or name one without filtering.
