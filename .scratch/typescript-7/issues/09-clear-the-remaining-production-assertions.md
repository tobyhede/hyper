# 09 — The remaining production assertions

**What to build:** Nothing scheduled. This is a reference list of where the suppressed assertions are, for whoever is already editing one of these files.

**Status:** ready-for-human

**Why the framing changed:** written when issue 06 meant a cleanup. Under ADR 0062 these are in the suppressions baseline and drain as files are touched for other reasons. A project to empty the list is the cleanup that ADR explicitly rejected, arriving under a different name.

The production entries in `eslint-suppressions.json` that are neither the React Flow class (issue 07) nor the problem-details decoder (issue 08). **Counted from the committed baseline, which is the gate, rather than by hand** — an earlier revision of this list said 10, totalled 12 across its own bullets, gave `packages/graph/src/space.ts` two bullets for its single baseline entry, and omitted three files entirely. The real figure is **17 assertions across 11 files**:

| File | Count | What is there |
| --- | --- | --- |
| `packages/app/src/space-authoring.ts` | 3 | One is `operation as LayoutRequiredOperation` inside a predicate that is about to test membership in `LAYOUT_ONLY`. A `Set` whose `has` narrows, or a lookup returning the narrowed value, removes the assertion and is what the code already means. **The best candidate on this list.** |
| `packages/graph/src/placement.ts` | 2 | `positions as Placement` and `cardId as CardId`. |
| `packages/ui/src/components/sidebar.tsx` | 2 | |
| `packages/app/src/components/AuthorableEdge.tsx` | 2 | Two `cardId as CardId` on combobox change handlers, where the primitive hands back a plain string. |
| `packages/app/vite-space-http-plugin.ts` | 2 | `loaded as SpaceHttpRuntime`, guarding a dynamic import. |
| `packages/graph/src/space.ts` | 1 | The file carries both `as Card[]` (line 274) and the ADR 0010 intake brand at line 344, `(space: Omit<Space, typeof SPACE_INTAKE>): Space => space as Space` — a construction proof written as an assertion. Only one is a baseline entry. Probably irreducible; worth understanding once rather than repeatedly rediscovering. |
| `packages/graph/src/card-file.ts` | 1 | `candidate as DecodedCandidate<T>`. |
| `packages/app/src/card.ts` | 1 | `as CSSProperties`, for CSS custom properties React genuinely does not type. **No fix exists.** These stay. |
| `packages/app/src/components/OpenCard.tsx` | 1 | The same `as CSSProperties`. **No fix exists.** |
| `packages/ui/src/components/input-group.tsx` | 1 | |
| `src/persistence/postgres-space-repository.ts` | 1 | |

Regenerate this table from `eslint-suppressions.json` rather than editing it by hand; a count here that disagrees with the baseline is wrong by definition, and the last checkbox below exists to stop that.

- [ ] When you are in one of these files for another reason, look at its assertion. If it has a clean answer, take it and let `--prune-suppressions` lower the ceiling.
- [ ] If it does not, leave it. It already states its invariant.
- [ ] Record here what was resolved and why, so the list stays accurate rather than becoming a stale inventory.

**Do not** open a branch to work through this list.
