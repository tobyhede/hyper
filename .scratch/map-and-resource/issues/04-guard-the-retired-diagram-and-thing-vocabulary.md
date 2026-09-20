# 04 — Guard the retired Diagram and Thing vocabulary

**Status:** resolved
**Blocked by:** 03 — Rename the Thing model to Resource, in both databases.

**What to build:** A block in `test/unit/current-domain-vocabulary.test.ts` for each retired word, reporting it in every identifier shape it was written in, with a mirror block proving the guard reads those shapes and stays silent on the foreign ones.

**Why:** ADR 0085 rejected *Object* on the single ground that its guard would need 287 exceptions, and `docs/agents/workflow.md` states the rule this ticket exists to satisfy: **a rename is not finished until this guard can prove it.** Both retired words are clean in identifier shape — a compound of either is never written by accident — so the instrument that made ADR 0041 and ADR 0085 stick works here unchanged.

## Write all eight arms at once

Four renames have each discovered an arm the one before it lacked, every time by shipping green and being caught later. They are known now, so none of them is a discovery this time. The Card block alone needed four follow-up commits.

1. **PascalCase compound, opening** — `Thing[A-Z]`, `Diagram[A-Z]`.
2. **PascalCase compound, closing** — `[A-Za-z]Thing\b`, `[A-Za-z]Diagram\b`.
3. **camelCase compound** — `\bthing[A-Z]`, `\bdiagram[A-Z]`.
4. **Screaming** — `\bTHINGS?\b`, `\bTHING_[A-Z]`, and the same for the other.
5. **kebab-case.** `docs/agents/workflow.md` says this in as many words: a hyphen is not a word character, so `\b` lands either side of the retired word and **every PascalCase and camelCase arm reads straight past** `thing-not-found`, `space-must-keep-diagram` and `.canvas-thing` — which is the shape a rename mostly carries.
6. **snake_case**, which the Card block closed only in a follow-up.
7. **A lowercase English suffix.** `diagramless` went green through `verify` on a whole branch and was caught by a human reader: a retired word carrying an English suffix offers no capital, no word boundary and no hyphen, so every compound arm reads past it. Rule the plural out by name so the compound arms keep owning it.
8. **Quoted string** — `["']things?["']`, for `@@map("things")` and `table: 'things'`, which matches none of the shapes above. Without it the model rename could land with every table still named for the retired word and the guard silent.

Also carry forward the **collection-field** shapes the Graph block uses — `\bthings["']?\s*[:=]` and `\.things\b` — and the **wrapped-doc-comment separator**, `spanningHits`, for any two-word term: `hits` reads line by line, and a term a wrap split was invisible to it in either half.

## Two things specific to this rename

**The domain-initial arm's justification changes and must be rewritten.** The Graph block bans the retired Route's initial `(r)` where a Graph collection introduces the binding, and argues for it in a comment: "the repo's convention is the domain initial — `(t)` for thing, `(d)` for diagram — so a binding introduced over `graphs` has exactly one correct letter and the retired name's is not it." After this rename `r` **is** a legitimate domain initial, for Resource. The guard still holds, because it fires only where a Graph collection is on the line, but that sentence becomes false and a comment may only assert what its writer has checked. Rewrite it to the narrower true claim.

**`migrations/` and `migrations-sqlite/` are excluded block-scoped, not globally.** The Card block made exactly this call and recorded why: adding them to the shared `HISTORICAL_TREES` constant would silently narrow four other guard blocks that also read off `scannableFiles()`.

## What is not guarded, and is recorded rather than attempted

`Map` bare matches 1,243 word-boundary sites. ADR 0101 accepts that the new noun is not greppable and states it as a permanent loss rather than a defect. **Do not add an arm reading the replacement word** — that is the 287-exception guard ADR 0085 rejected, arriving from the other direction.

- [ ] A block per retired word, each with the eight arms above plus the collection-field shapes.
- [ ] A mirror block per word proving each arm fires on the shape it names, and stays silent on the foreign names — `MiniMap`, `flatMap`, `ReadonlyMap`, `WeakMap`, `TypeMaps`, Prisma's `@@map`.
- [ ] Every exemption is asserted to still contain the hit that earns it, so an exemption cannot outlive its reason.
- [ ] The guard file holds neither retired word literally, composing them from fragments as the existing blocks do, so the scan can read this file like every other tracked file.
- [ ] `pnpm verify` passes.

## Answer

Resolved in `test/unit/current-domain-vocabulary.test.ts` with one live-tree scan
and one mirror block for each retired noun. The shared pattern covers the eight
required identifier arms — opening and closing PascalCase, camelCase,
screaming case, kebab-case, snake_case, a lowercase suffix, and quoted storage
identifiers — plus declared and accessed collection fields. A separate
implementation-source arm rejects each retired bare type.

The scans compose both retired words from fragments, so the guard file contains
neither one literally and remains inside its own scan. They use `spanningHits`,
mask cited paths before scanning, and exclude `migrations/` and
`migrations-sqlite/` only within these ADR 0101 blocks. The exclusion is held
honest by proving each tree still contains a historical retired-schema hit.

The two mirror blocks prove every governed shape is reported and that the
patterns stay silent on `MiniMap`, `flatMap`, `Map`, `ReadonlyMap`, `WeakMap`,
`TypeMaps`, and Prisma's `@@map`. The existing Graph-initial explanation already
states the narrower current rule: `(r)` is valid for Resources, while the
retired Route initial remains invalid only when a Graph collection introduces
the binding.

Verification:

- focused vocabulary suite — 86 tests passed;
- `pnpm verify` — 229 files, 2,892 tests passed and 5 skipped.
