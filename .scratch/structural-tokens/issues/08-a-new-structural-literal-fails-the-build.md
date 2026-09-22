# 08: A new structural literal fails the build

**What to build:** The contract step. Once no surface states its own geometry, adding one back fails a check rather than passing review unnoticed. Without this the tree drifts back to where it started, one reasonable-looking arbitrary value at a time, and the next person to try a token change finds it half works.

The check belongs in the family of source-scanning unit tests the repo already keeps for claims a rendering test cannot state — the ones holding command-surface ownership, the CodeMirror encapsulation split, the graph package surface and the retired domain vocabulary. It reads both source trees and reports a structural arbitrary value or bare literal outside a recorded carve-out.

A carve-out is a value that genuinely should not be on a scale, carrying its reason, as tickets 01, 05 and 06 each provide for. The list is small and it is the exception, not a parking space: it is a ceiling in the same sense as the narrowing-assertion suppressions, and it does not grow to accommodate new work.

**The check also holds two lists together.** Ticket 02 found that `tailwind-merge` does not recognise a custom utility name. An unregistered `*-chrome-*` utility therefore does not evict the built-in class it replaces, and two conflicting declarations ship. The build stays green and no test fails, so only a reader finds it.

That makes the registration list beside `cn()` a second list that must agree with the **class-generating** chrome utilities in the theme file — `rounded-chrome-*`, `text-chrome-*`, `border-chrome-accent` — not every `*-chrome-*` custom property. `--shadow-chrome-elevated` is a direct `:root` property `command-surface.css` reads; it is not a Tailwind utility, so it has no `extendTailwindMerge` entry and must not fail this arm. Tickets 03 to 07 each add to both utility lists. A reminder in those tickets is not enough, because the repository's own rule is that a claim needs something that fails when a person reverses it. So this check reads those two lists and fails when a class-generating token has no registration, or a registration has no token.

**Land ticket 11 before this one.** A colour token wrapped as `text-[var(--foreground)]` matches the same `text-[…]` shape this scan reports, and there are fourteen of them. Ticket 11 removes them, which is cheaper than a carve-out that outlives its reason.

The scan must distinguish a structural **value** from a Tailwind **selector**: roughly a hundred and fifty `data-[…]`, `has-[…]` and `group-data-[…]` constructs in the tree are state selectors, not geometry, and reporting them would make the check useless on its first run.

**Blocked by:** 03, 04, 05, 06, 07.

**Status:** resolved

- [x] A newly introduced structural arbitrary value or bare literal fails the check
- [x] State selectors are not reported
- [x] Carve-outs are enumerated, each carrying its reason, and the check fails if a carve-out no longer matches anything
- [x] A class-generating `*-chrome-*` utility with no `extendTailwindMerge` registration fails the check, and so does a registration with no utility; a direct CSS property such as `--shadow-chrome-elevated` is not in that list
- [x] The check runs as part of the normal verification chain, so nothing else has to remember to run it
- [x] `pnpm verify` passes and the output is reported

## Resolution

The check lives in five files in the family named above, over one shared reader, `test/support/structural-scan.ts`: one test file per arm — `test/unit/structural-arbitrary-classes.test.ts`, `structural-css-literals.test.ts`, `black-shadow.test.ts` and `chrome-utility-registration.test.ts` — and `structural-scan.test.ts` for the reader itself. It was written as one file, `structural-scale.test.ts`, and split by arm afterwards. `pnpm test:coverage` (`vitest run --coverage`) picks them up the same way it picks up every file under `test/unit/**/*.test.ts`, so no separate wiring was needed for the second checkbox.

**Four arms**, not two, because a scan that only reads for a bracket shape turns out to miss two real cases:

1. A structural Tailwind arbitrary value — `rounded-[…]`, `border-[…]` and `text-[…]` (length-like content only for those two, a `length:` type hint included, since both also carry colour), `shadow-[…]`/`drop-shadow-[…]` — in `.ts`/`.tsx` source under `packages/*/src`.
2. A bare structural literal — `border-radius`, `border` and its side/logical variants, `box-shadow`, `font-weight` — written directly in a hand-rolled `.css` file under `packages/*/src`, instead of read off a `var(...)`.
3. Ticket 10's own criterion, held as a standing check: no shadow anywhere states its colour as black, **including inside a token's own definition** — a use site reading `var(--shadow-chrome-new)` is fully tokenized and passes arm 2 even when `--shadow-chrome-new` is itself defined with a black colour, so this arm reads every declaration whose property name carries "shadow" (not just literal `box-shadow`) for a black-ish value.
4. The two-list arm: every class-generating `*-chrome-*` utility the theme's `@theme inline` block and its `@utility` directives emit is registered in `extendTailwindMerge` beside `cn()`, and vice versa.

**Arm 2 reads hand-rolled `.css` files only, by decision.** A structural value written as a TSX style object — an inline `style={{…}}`, or CSS-in-JS such as `MarkdownSourceEditor.tsx`'s CodeMirror `EditorView.theme` and `HighlightStyle`, which ADR 0063/0067 make the one place CodeMirror's appearance is set — is out of its scope; arms 1 and 3 read class strings in `.ts`/`.tsx` and arm 3 reads CSS declarations, so no arm reads a style object's properties: `HighlightStyle`'s `fontWeight: '700'` passes today.

**Comments are stripped by a real parse, not a scanner or a regex**, and this had to be discovered rather than assumed. The bare `ts.createScanner` was tried first and rejected: without a parser re-entering a template literal after `${…}`, it reads everything up to the *next* unrelated backtick as one template token — on `Button.tsx` this swallowed a `// …` comment sitting between two unrelated template literals and reported it as live text. Switching to `ts.createSourceFile` plus a leaf-walk fixed that, but a leading-comments-only read still missed one more shape: a JSX comment (`{/* … */}`) has no newline between `{` and `/*`, so the TypeScript API classifies it as the **trailing** comment of `{` rather than the leading comment of `}` — `tooltip.tsx`'s own arrow-corner comment is written exactly this way. The final implementation checks both a leaf's leading comments at its full start and its trailing comments at its end. CSS comments are a plain `/* … */` strip, since CSS has no `//` form.

**Carve-outs, by arm:**

Arm 1 (TSX classes), two entries:
- `input-group.tsx`'s `rounded-[calc(var(--radius-md)…)]` (×3) — the nested-corner relationship to `--radius-md` ticket 01 excluded from the scale.
- `PaletteColorPicker.tsx`'s `drop-shadow-[0_0_1px_rgba(0,0,0,0.85)]` — a 1px black contrast outline on the selected-swatch check glyph, not an elevation (ticket 10).

Arm 2 (CSS literals), six entries: zero/none (absence, not magnitude — tickets 01, 06), the universal 1px hairline default (tickets 01, 02, 06), `border-radius: 50%` (full-circle idiom, ticket 06), `border-radius: 999px` (full-pill idiom, ticket 06), `resources-popover.css`'s toggle hairline shadow (ticket 10), and `command-dock.css`'s conflict ring (ticket 12) — each of the last two matched by its exact value in its one file, so a look-alike shadow beside it is still reported.

Each carve-out is asserted, in a dedicated test, to still excuse a real site in the tree it names — for a CSS carve-out, a declaration arm 2 would report without it, so `display: none` or `border: none` earns nothing — the same "earns itself" shape `current-domain-vocabulary.test.ts` already holds its exemptions to.

**Token definition sites are exempted by declaration shape, not by an allowlisted path.** Arm 2 only ever matches a real structural CSS *property* (`border-radius`, `border`/its variants, `box-shadow`, `font-weight`); a `--custom-property: value;` declaration never matches that property set, wherever it is written. `packages/app/src/tailwind.css` and the two inert `tailwind-experiment-*.css` blocks state every one of their structural values this way — nothing in any of the three writes a real structural property, only the name half of a `--` declaration — so all three are scanned like every other file rather than carved out by path, and a real-tree test (`token definition sites are exempted by declaration shape`) proves it stays that way.

**The first real run found one genuine gap**, not recorded by any earlier ticket: `packages/ui/src/canvas-resource.css`'s `.canvas-resource__content` rule stated `border-bottom: 2px solid var(--canvas-resource-ink);` — a bare `2px`, mechanically fixable by the exact pattern ticket 06 already used for every other Resource-local singleton in the same file. Fixed by naming `--canvas-resource-content-divider-width: 2px;` beside the block's other local singletons and reading it through `var(...)` at the one site that used it. No carve-out was invented for it.

`pnpm verify` output is reported in the accompanying report.

**What earns a spelling an arm.** Review rounds widened the scan one spelling at a time — Tailwind's parenthesised shorthand, black written as `hsl`/`hwb`/`lab`/`color()`, literals hidden in a `var()` fallback, further shadow families — and most of those spellings have no live site behind them. The rule from here on: a spelling earns an arm only when (1) it occurs in the tree, (2) a tool this repo uses emits it by default — Tailwind's own theme, a shadcn registry copy — or (3) it is the obvious idiomatic way to write that value here. A spelling that meets none of the three is refuted in review rather than added.

**What the scan cannot see, by construction.** Each of these was checked against the shared reader (`test/support/structural-scan.ts`) and the arm files, not assumed:

- A token reached through a custom property whose name does not carry "shadow": `--elev: 0 1px 0 black;` spent as `box-shadow: var(--elev);` passes arm 2 (the use site is a whole `var()`) and arm 3 (it reads only properties named `*shadow*`).
- Relative colour syntax — `rgb(from var(--foreground) 0 0 0)` — and `currentcolor`: neither matches arm 3's black spellings, whatever they resolve to.
- A class name assembled at runtime from fragments (`'rounded-' + '[6px]'`, a template literal interpolating the prefix): arm 1 matches only a whole `prefix-[…]` or `prefix-(…)` written out in the source.
- `@apply` in a `.css` file: arm 1 reads `.ts`/`.tsx` only, and arm 2 reads `property: value;` declarations, which `@apply rounded-[6px];` is not (with a variant, `@apply hover:rounded-[6px];` parses as a `hover` declaration, which is not a structural property). No tracked file under `packages/*/src` uses `@apply` today.
- A Tailwind arbitrary property — `[box-shadow:0_1px_0_black]`, `[border-radius:6px]` — which no `STRUCTURAL_CLASS` prefix matches. None is in the tree today.
- A TSX style object, inline or CodeMirror's theme, as already stated above.
- `font-size` in hand-rolled CSS: arm 2 does not read it, although type size is on the chrome's scale and arm 1 reads a length-like `text-[…]`. Adding it reports 17 declarations under `packages/*/src` (the arm-2 real-tree test, run with `font-size` added to its property set), and none of which is a chrome surface already at a `--text-chrome-*` step's value — the one exact match, `markdown-resource-body.css`'s 10px shortcut hint, is drawn on the Resource, whose scale ticket 06 keeps separate — so it waits on a decision rather than a mechanical fix.

More patterns would not close these. The complete check is to resolve computed styles in a browser — an e2e pass reading `getComputedStyle` for radius, border width, type size and shadow colour against the token set — rather than a longer list of spellings.
