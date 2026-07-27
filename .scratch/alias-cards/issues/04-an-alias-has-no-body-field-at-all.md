# An alias has no body field at all

Status: resolved
Type: task

`aliasCardSchema` gives an alias a `body` constrained to `z.literal('')`. That models absence as a sentinel: the field exists, and one particular value is agreed to mean "not applicable". It should not exist on the domain value.

## Decision evidence

ADR 0009 is explicit about the shape: an alias is `{ id, title, kind: 'alias', target }`, it "holds a pointer, not content", and exactly one card owns the content. `CONTEXT.md` says the same thing in domain language: Markdown content is written directly by the author, while an alias shows its target's content and carries only its own title. The original discriminated union in `4b56914` followed that decision and gave the alias no content field.

The sentinel is later and accidental. ADR 0020's card-file cutover (`8397e36`) extended both union members with `body: z.string()` because every card is stored in a Markdown file. Commit `7d09f5c` tightened the alias member to `z.literal('')` so prose after an alias's frontmatter could no longer be accepted and silently discarded. Neither change superseded ADR 0009's domain decision; they coupled the physical post-frontmatter region of a card file to the in-memory `Card` shape.

ADR 0020 creates a wording wrinkle, not a contrary model: every card is physically one Markdown file, but only a Markdown card owns the file body's content. For an alias the post-frontmatter region must be empty and must not become a domain field.

## Content readers already resolve first

The two production display reads are:

```
packages/app/src/App.tsx
packages/react-flow-adapter/src/projection.ts
```

Both call `resolveContentCard` before reading `.body`. ADR 0009's single-hop validation guarantees a valid alias target is not itself an alias, so neither display read needs or uses an alias's sentinel body.

"Nothing reads it" is true of content semantics, not literally of all code. `parseCardFile`, `loadSpace`, `serializeCardFile`, test helpers, and tests currently manipulate or assert the sentinel as structure. Those are precisely the seams this task must remove.

## The value already means something else

`''` is a legitimate Markdown body. `newSpace()` mints exactly one (`packages/graph/src/new-space.ts`), empty because nobody has written it yet (ADR 0018). The same value therefore carries two unrelated meanings today: *this Markdown document is empty* and *this kind of card has no document body*. The discriminant can express that distinction directly; a sentinel cannot.

The distinction also keeps the union extensible. `CONTEXT.md` and ADR 0001 reserve a space-card whose content is a graph, not a Markdown body. A union whose kinds carry only their own payload makes that third member cheap; another `body: ''` would repeat the storage/domain confusion.

## Important trap: the one-line schema change is not sufficient

The desired domain schema is still:

```ts
export const aliasCardSchema = aliasCardFrontmatterSchema;
```

But applying only that line would regress `7d09f5c`. The current parser constructs `{ ...parsed.data, body: split.body }` and passes it to `cardSchema.safeParse`. Zod 3 object schemas strip unknown keys by default: once `body` is absent from the alias schema, an alias file containing prose parses successfully and the prose disappears again. The existing load error must remain, enforced explicitly at the card-file boundary.

This is the central correction to the issue's prior proposal. "The load error stays" does not follow from removing `z.literal('')`; it requires its own check.

## Implementation plan

1. **Make the domain union honest in `packages/core`.** Define `aliasCardSchema` directly from `aliasCardFrontmatterSchema`, update the comments on `cardSchema`/`CardFrontmatter`, and keep `Card` derived from the schema. Add a schema assertion that the parsed alias domain value has no `body`; Markdown cards continue to require a string body.

2. **Keep the file invariant at intake in `packages/graph/src/card-file.ts`.** After parsing frontmatter, reject `split.body !== ''` when `kind === 'alias'`, preserving the `invalid-frontmatter` result, file path, and the regression test introduced by `7d09f5c`. Do this before constructing the domain card so Zod cannot strip the evidence.

3. **Deepen the successful parser result to `{ card: Card }`.** `parseCardFile` already validates enough to produce the domain value; returning `{ frontmatter, body }` immediately tears it apart and widens the alias case back to `body: string`. Its only production caller is `loadSpace`; the remaining callers are tests. Return the validated Markdown card with its body, or the validated alias frontmatter as the bodyless alias. Then `loadSpace` can push `card` directly and the typechecker-only reconstruction ternary disappears.

4. **Serialize by kind.** In `serializeCardFile`, destructure and emit `body` only for a Markdown card. Emit an alias's own frontmatter plus the same empty post-fence region the parser accepts. Keep the exact-byte examples for both kinds and the parser/serializer inverse property.

5. **Narrow content resolution.** Change `resolveContentCard` from `Card | undefined` to an exported resolved-content type that excludes the alias member (for example `Exclude<Card, { kind: 'alias' }> | undefined`), and defensively return `undefined` if an impossible alias target reaches it. This states the single-hop guarantee without baking in "Markdown forever": when ADR 0001 adds a non-alias space card, it naturally joins the return union and `.body` consumers must handle the content kind.

6. **Update the affected tests and fixtures-as-tests.** The exact test-side blast radius from current references is:

   - `packages/core/test/schema.test.ts`: assert the alias member parses without and produces no `body`.
   - `packages/graph/test/card-files.ts`: remove `body: ''` from the alias domain helper (the card-file helper remains an empty physical body).
   - `packages/graph/test/card-file.test.ts` and `card-file.property.test.ts`: assert the successful `{ card }` result, with a bodyless alias card.
   - `packages/graph/test/card-file-round-trip.property.test.ts`: remove the alias-body arbitrary and compare the parsed `Card` directly.
   - `packages/graph/test/serialize-card-file.test.ts`: construct the alias without `body` while retaining the exact empty-file output assertion.
   - `packages/graph/test/space.test.ts`: preserve the explicit non-empty-alias-body rejection introduced by `7d09f5c`; no relaxation to the error is acceptable.
   - `packages/graph/test/lookup.test.ts`: retain the value assertion and add a type assertion, if useful, that resolved content excludes aliases.
   - `packages/app/test/space-files.test.ts`: assert aliases lack a `body` property rather than carry an empty one.

   The production files expected to change are exactly `packages/core/src/schema.ts`, the stale `CardFrontmatter` commentary in `packages/core/src/types.ts`, and `packages/graph/src/card-file.ts`, `space.ts`, and `lookup.ts`. `packages/app/src/App.tsx`, `packages/react-flow-adapter/src/projection.ts`, and `CardNode.tsx` should compile unchanged; their reads are already behind resolution or use projection data.

`CardNode.tsx` is unaffected: `data.body` is projection data containing already-resolved Markdown, not a `Card` field.

## Risks and guardrails

- **Silent data loss is the material regression risk.** The explicit alias-file body check and the existing `7d09f5c` regression test are non-negotiable.
- **A file body and a domain field are different things.** The fence parser may still expose the raw post-frontmatter string internally; it must not put that string on an alias `Card`.
- **Do not type the resolver as permanently Markdown-only.** That would make this task pass today but recreate the same invalid `.body` assumption when space cards arrive.
- **Serialization byte shape matters.** Saving must not manufacture prose for an alias or change the accepted empty-body convention, and the round-trip property should cover the bodyless alias arbitrary.
- **No adapter projection change is required.** Its optional `CardNodeData.body` belongs to a render projection and remains valid.

## Scope

Whether a future space card carries a `body` is not part of this task. It should not, for the same domain reason, but ADR 0001 is unbuilt. This task removes the alias sentinel, preserves rejection of authored alias prose, and leaves a union/resolver seam that makes the third kind visible to the typechecker.

## Conclusion

The issue's central claim remains accurate and is directly supported by ADR 0009, `CONTEXT.md`, and the original alias union. Its earlier implementation sketch was incomplete: removing the schema field alone silently accepts and strips alias prose under Zod's default object behaviour. The safe change is bodyless domain data plus an explicit empty-file-body invariant at intake, preferably with `parseCardFile` returning the `Card` it has already validated.

## Answer

Built test-first. `pnpm verify` is green (27 test files, 365 tests), and `pnpm e2e` is green (35 tests).

**Domain shape.** `aliasCardSchema` is now exactly `aliasCardFrontmatterSchema`, so an alias carries its own metadata and `target` but no `body`. A Markdown card still carries `body: string`, including the legitimate empty document. The schema test and the authored fixture test assert that an alias has no body property at runtime, while typed alias fixtures make the same distinction compile-time visible.

**File intake.** `parseCardFile` explicitly rejects a non-empty post-frontmatter region for an alias before constructing the domain value. That preserves `7d09f5c`'s data-loss guard rather than relying on Zod, which would strip an alias's now-unknown `body` key. Its successful result is `{ card: Card }`; `loadSpace` pushes that value directly, deleting the reconstruction ternary and its sentinel.

**Round trip and resolution.** `serializeCardFile` branches by kind: Markdown emits its body, while an alias emits only its frontmatter and the accepted empty region. The fast-check inverse property now compares the parsed card directly with the card serialized. `resolveContentCard` returns `ResolvedContentCard`, the non-alias portion of `Card`, and defensively refuses an impossible alias target; the app and adapter's body reads therefore follow a type-level content-resolution guarantee.
