# 04 — Guard the retired Card vocabulary

Status: ready-for-agent
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
