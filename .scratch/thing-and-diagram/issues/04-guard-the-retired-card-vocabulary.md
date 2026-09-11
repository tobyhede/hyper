# 04 — Guard the retired Card vocabulary

Status: resolved
Blocked by: 02

**What to build:** The Thing block in
`test/unit/current-domain-vocabulary.test.ts`, reporting the retired noun in
every shape it was written in; the `(c)` → `(t)` callback-binding convention it
enforces; and the removal of AGENTS.md's ADR 0085 entry, which the ADR says goes
when change two lands.

**Why:** ADR 0085 chose Thing over Object on exactly one ground — that the rename
can be enforced by a scan, because the compound shapes are unambiguous and match
zero existing sites. That argument is only cashed when the block exists. Without
it this is a rename that half-lands and then drifts back, which is the failure
the ADR names.

- [ ] A block modelled on the Diagram block at the foot of the file, reporting
      the PascalCase opening and closing compounds, the camelCase opening
      compound, the screaming-case constant (including the underscore shape with
      no leading `\b`), the collection key in a document or object literal, and
      the collection read back off a value.
- [ ] A bare-name arm scoped to implementation source, as the Route and Diagram
      blocks both have.
- [ ] The registry carve-out, **narrowed to the export block rather than the
      whole file**: `packages/ui/src/components/card.tsx` is a file exemption, but
      `packages/ui/src/index.ts` is a barrel exporting 25+ domain names and must
      not be exempted wholesale — mask the `from './components/card'` block.
      `packages/ui/src/CanvasThing.tsx` and `ThingRail.tsx` import registry names
      too, and the Tailwind token files carry `bg-card` / `text-card-foreground`
      / `--card-*`.
- [ ] `cardinality` is protected explicitly. It opens on a word boundary, so no
      `\bcard` rule saves it, and it is the exact shape `LayoutStrategy` needed.
- [ ] Every exemption is masked rather than skipped, and every one is held to
      still earning itself through `expectEachExemptionEarned`, in this file's
      existing idiom.
- [ ] The retired word is never spelled literally — `['C','ard'].join('')` — so
      the file stays scannable by its own scan.
- [ ] An `it` block asserting the scan still reaches three known paths, so a file
      list that stopped resolving cannot report nothing forever.
- [ ] The convention line above all the blocks reads `(t)` for thing, and the
      initial-binding arm reads the Thing collection.
- [ ] AGENTS.md's ADR 0085 entry is gone and the surrounding entries no longer
      describe a divergence that has closed. `CONTEXT.md` stops being ahead of
      the code.

## The decision this issue owns

**Does `migrations/` become a historical tree, or a file exemption?**

Recommendation: **a historical exclusion scoped to this block**, not a member of
the shared `HISTORICAL_TREES`.

The argument for exclusion is ADR 0085's own — migration snapshots are history
and are not rewritten — and it is the same argument `docs/adr/` and `.scratch/`
already rest on. The argument for scoping it to the block rather than sharing it
is that `HISTORICAL_TREES` feeds `scannableFiles()`, which every other block
starts from; adding `migrations/` there silently narrows the Route, loose-name,
surface and Diagram blocks as a side effect, and none of those has been asked
whether it wants that.

The argument against a file exemption is arithmetic: 40 generated files, each
needing an entry and each held to still earning it, regenerated whenever a
migration is added. An exemption list that has to be maintained by a generator is
not an exemption list.

**`src/prisma/` stays in scope.** It is authored, not generated — `contract.json`
and `contract.d.ts` are emitted from `contract.prisma`, and if they still name
the retired model the guard should say so.

## Hazards

- The Diagram block's `s?` on the closing-compound arm exists because a lowercase
  plural ends the word without a boundary landing after it, and every compound
  ending in the plural was invisible until it was there. The Thing block inherits
  the same problem and the same fix.
- The collection-key arm needs its `(?<!-)`: a hyphen makes it a different word.
- `card.tsx`'s `data-slot="card"` and the `--card-spacing` custom property are
  spelled exactly as the domain word was, in someone else's catalogue. There is
  no shape to read, which is why this is a file exemption and not a shape one —
  the same sentence the Lucide facade's exemption already carries.
- The guard is 1,266 lines with five blocks and shared helpers at 22-245. Read
  the Diagram block (1002-1266) whole before writing this one; it is the
  template, and every one of its regex arms carries the recorded reason it exists.

## Answer

Resolved. The Thing block is at the foot of
`test/unit/current-domain-vocabulary.test.ts`, modelled on the Diagram block
above it, with eight `it` blocks and 46 assertions passing.

### The decision this issue owned

**`migrations/` is a historical exclusion scoped to this block**, as
recommended, and it earns itself: the block asserts that the tree is still
tracked *and* that some snapshot in it still matches the retired pattern, so the
day the last one stops recording a Card model the exclusion fails rather than
quietly covering nothing. `src/prisma/` stays in scope, and the arm below is what
makes that worth something.

### Three things the reconnaissance got wrong, and one it did not have

**The English words need no exemption at all.** `cardinality` (67 hits),
`discard` (148) and `wildcard` (4) are invisible to every arm, and not by luck —
each arm requires a capital after the retired word, a word boundary before it, or
a key's colon after it, and none of the three offers any. The inventory expected
`cardinality` to need the treatment `LayoutStrategy` got. What actually needed
protecting was the *codemod*, which substitutes plain substrings. No exemption
was added, because `expectEachExemptionEarned` would have failed one that matched
nothing.

**The registry's Tailwind tokens need nothing either**, and this is the
collection-key arm's `(?<!-)` earning itself a second time: `bg-card`,
`text-card-foreground`, `--card` and `--color-card` all carry a hyphen
immediately before the retired word. A lookbehind written to keep prose about
re-running a strategy out of the Diagram scan keeps a whole vendored palette out
of this one. Two registry spellings *did* need forgiving and neither was
predicted: Tailwind's `group-data-[size=sm]/card:` variant, where a slash is a
word boundary a hyphen is not, and `data-slot="card"`.

**The `packages/ui/src/index.ts` worry dissolves in the masking idiom.** The ADR
asked for the mask to be narrowed to the `from './components/card'` block rather
than the whole file, because the barrel exports 25+ domain names. Masking
*spellings* rather than skipping *files* already achieves that: only the six
registry compounds are replaced before the scan reads the file, so a domain
compound anywhere in the barrel is still reported. The block asserts exactly that
with a three-line fixture.

**A quoted-string arm the inventory did not name.** `@@map("cards")` and a
migration's `table: 'cards'` match none of the compound shapes — the word is
whole, lowercase, and followed by a quote rather than a colon — so the database
rename could have landed with every table name still retired and this scan
silent. `["']cards?["']` closes it, and `src/prisma/` staying in scope is what
points it at the one file that matters.

### The callback-binding arm

Added, over the Thing collection, in the shape ADR 0041's Route arm established.
It is not theoretical: 25 sites carried `(c)` over a Thing collection through
this rename and no text sweep could see one of them, because substituting the
collection's own name leaves the callback's parameter untouched. Two live
bindings sit outside its reach on purpose — `elk-strategy.test.ts` binds over
elkjs's `children`, and a foreign collection has no domain initial to take.

### AGENTS.md

The ADR 0085 entry is gone, as the ADR and the entry's own closing sentence both
required. Its three quotations of the retired name were the last hits in the
tree, so removing it and passing the scan were the same act.

The one thing in it worth keeping outlives it in `docs/agents/workflow.md`'s
Renames section, which now says to write a repo-wide rename as a tracked codemod,
points at both of ADR 0085's, and says a rename is not finished until this guard
can prove it — including the reason that instrument decides which names are
affordable at all.

### Verification

`pnpm verify:static` green. `pnpm test` is **one test red and it is 03's**:
`prisma-foundation.test.ts > reaches the emitted contract from the existing
migration head`.

`pnpm e2e` and `pnpm e2e:ladle` judged **inapplicable**: this issue changes one
unit test and two agent-facing documents. Nothing it touches is rendered.
