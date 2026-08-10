# A stored `defaultView: "graph"` no longer parses

Status: ready-for-human

Surfaced by: review of PR #36, filed after it merged

## Context

ADR 0041 renames the ELK-backed Algorithmic View from Graph to Flow, and PR #36
landed that as a value change rather than only a type change:

- `packages/core/src/schema.ts` — `BUILT_IN_VIEW_IDS` went from
  `['graph', 'grid']` to `['flow', 'grid']`
- `packages/core/src/schema.ts` — `defaultView: z.union([z.enum(BUILT_IN_VIEW_IDS), uuidSchema]).optional()`

**This is live on `main`.** A stored document naming `"graph"` fails
`spaceDocumentSchema.parse` outright. Not a soft fallback to `DEFAULT_VIEW_ID`:
the parse rejects before `packages/app/src/view.ts` ever reads the field, so the
Space does not open at all. `packages/graph/src/validate.ts` would reject it a
second time through `isBuiltInViewId` if it got that far.

The repository cannot produce the broken value, which is why nothing is red:

| writer | what it writes |
|---|---|
| `packages/app/src/snapshot.ts` (`updatePositionedLayout`) | the Layout's UUID |
| `packages/graph/src/new-space.ts` | nothing — a new Space names no `defaultView` |
| `packages/app/e2e/seed.ts` | a Layout UUID |

Both fixtures omit the field, and no `"graph"` literal appears in a
`defaultView` position anywhere in the tree. The exposure is entirely outside
it: a PostgreSQL Space written before the rename — including a local
development database — or a hand-authored `space.json` imported through the CLI.

ADR 0041 rules out compatibility parsing and ADR 0030 makes PostgreSQL the live
write model, so "replace the unreleased shape directly" is a decision already
taken. What is not recorded is whether anyone checked that no live database
carries the superseded value, and what a person should do when one does.

## Direction

Decide, and write the decision down rather than discovering it when a Space will
not open. Three postures, in the order they cost:

1. **Nothing.** Confirm no reachable stored document names `"graph"` and record
   that as the reason. Cheapest, and probably correct — but it is a claim about
   data, so it needs a query against the live database, not a grep.

   **A database query does not discharge it on its own.** The other exposure
   named above is a hand-authored `space.json`, and `importSpaceFileSchema`
   (`packages/core/src/schema.ts:287`) extends `spaceFileSchema` overriding only
   `id`, `graphs` and `layouts` — not `defaultView` — so the CLI's
   `safeParse` in `src/import/read-single-space.ts:109` rejects `"graph"`
   identically. No query against stored rows can say anything about a file
   somebody imports next week. Posture 1 has to answer both, or narrow itself to
   the database and leave the import path to posture 2.
2. **A better failure.** Keep the strict schema and make the rejection legible:
   name the superseded value and its replacement in the parse error, so the
   failure reads as "this document predates ADR 0041" rather than as a
   malformed union.
3. **A one-shot normalisation.** Map `"graph"` to `"flow"` before
   `spaceDocumentSchema.parse` sees it. This is the option ADR 0041 argues
   against, and taking it means amending the ADR rather than quietly adding a
   compatibility path beside it.

## Constraint that must survive

`"flow"` stays the canonical value and `"graph"` does not return as a supported
built-in view id. Whatever is chosen, the resolution chain stays where it is —
`space.defaultView` → `DEFAULT_VIEW_ID`, answered once in
`packages/app/src/view.ts` — and no second place learns to interpret the field.

## Acceptance

- A recorded answer, including how the live-database claim was checked if
  posture 1 is taken, and what it says about a hand-authored file imported
  later.
- If posture 2 or 3, coverage for a document naming the superseded value.
