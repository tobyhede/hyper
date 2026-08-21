# 09 — The remaining production assertions

**What to build:** Nothing scheduled. This is a reference list of where the suppressed assertions are, for whoever is already editing one of these files.

**Status:** ready-for-human

**Why the framing changed:** written when issue 06 meant a cleanup. Under ADR 0062 these are in the suppressions baseline and drain as files are touched for other reasons. A project to empty the list is the cleanup that ADR explicitly rejected, arriving under a different name.

The 10 production sites that are neither the React Flow class (issue 07) nor the problem-details decoder (issue 08), measured at `f5506ce`:

- `packages/app/src/space-authoring.ts` — 3. One is `operation as LayoutRequiredOperation` inside a predicate that is about to test membership in `LAYOUT_ONLY`. A `Set` whose `has` narrows, or a lookup returning the narrowed value, removes the assertion and is what the code already means. **The best candidate on this list.**
- `packages/graph/src/space.ts` — 1, `as Card[]`.
- `packages/graph/src/card-file.ts` — 1, `candidate as DecodedCandidate<T>`.
- `packages/graph/src/space.ts:344` — the ADR 0010 intake brand, `(space: Omit<Space, typeof SPACE_INTAKE>): Space => space as Space`. A construction proof written as an assertion. Probably irreducible; worth understanding once rather than repeatedly rediscovering.
- `packages/app/src/card.ts` and `packages/app/src/components/OpenCard.tsx` — 2 × `as CSSProperties`, for CSS custom properties React genuinely does not type. **No fix exists.** These stay.
- `packages/ui/src/components/sidebar.tsx` — 2, `input-group.tsx` — 1.
- `src/persistence/postgres-space-repository.ts` — 1.

- [ ] When you are in one of these files for another reason, look at its assertion. If it has a clean answer, take it and let `--prune-suppressions` lower the ceiling.
- [ ] If it does not, leave it. It already states its invariant.
- [ ] Record here what was resolved and why, so the list stays accurate rather than becoming a stale inventory.

**Do not** open a branch to work through this list.
