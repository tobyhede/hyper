# 09: Prove the one-file experiment

**What to build:** An alternate token block that restyles the chrome without touching a single component, demonstrating that tickets 02–07 were complete.

This is the verification of the whole effort rather than a novelty. If a surface does not move when the alternate block is applied, that surface is still stating its own geometry and a batch missed it — which is a defect the check in ticket 08 should have caught, and a gap in the check as well as in the batch.

The natural subject is the question that started this work. The Thing is **already** drawn in the neobrutalist idiom — a 4px border, zero radius, and a `7px 7px 0` unblurred offset shadow while dragging — and the chrome is not: 1px borders, 10px radius, a soft two-layer wash. So the live question was never whether to restyle the product. It is whether the chrome should adopt the geometry the Thing already uses, and after this ticket that question is answered by editing one block and looking, instead of by a migration.

Answering it is **not** in scope here. This ticket delivers the ability to run the experiment and the evidence that the experiment is honest. Whether the chrome keeps its own geometry or takes the Thing's is a design decision, and taking it is separate work.

**Blocked by:** 08.

**Status:** resolved

- [x] An alternate token block visibly restyles the chrome with no component file modified
- [x] Every chrome surface moves under it; any surface that does not is reported
- [x] **Failed when run, fixed by ticket 13.** The Thing did move under a chrome-only block. See "The leak" below.
- [x] The alternate block is left in the tree as evidence, inert, not wired into the running app
- [x] The design question it makes answerable is written down as a decision still to be taken, not taken here
- [x] `pnpm verify` passes and the output is reported

**Run ahead of ticket 08**, which this ticket named as its blocker, because the user asked to see the experiment. Nothing here depends on 08. What 08 loses by coming second is stated under "What this tells ticket 08".

## The two blocks

`packages/app/src/tailwind-experiment-thing-geometry.css` gives the chrome the Thing's geometry: no radius, and a `6px 6px 0` hard shadow. Colours untouched, so the geometry question stands on its own.

`packages/app/src/tailwind-experiment-neobrutalism.css` carries neobrutalism.dev's own registry values, read from `https://neobrutalism.dev/r/styling/blue.json` on 2026-09-16.

Neither file is imported. To run one, append its body to the end of `tailwind.css`. **Append, do not import**: a later declaration of a token wins, and an `@import` must come first in a CSS file, which would put the new values before the ones they replace.

## How the tokens reach the product, which is not one way

Read out of the compiled stylesheet, not assumed:

```
.rounded-chrome-md{border-radius:6px}        <- value INLINED at build
.text-chrome-sm{font-size:.85rem}            <- value INLINED at build
.text-foreground{color:var(--foreground)}    <- var() kept
.border-border{border-color:var(--border)}   <- var() kept
```

`@theme inline` writes a structural value into the utility at build time. So the chrome's **geometry** cannot be restyled at runtime, and an experiment that injects a stylesheet into a running page would move only the hand-rolled surfaces, which read their tokens with `var()`. That would look exactly like "the batch missed every component", and it would be wrong. The experiment must be a source change and a rebuild. Colour is the other way round: it keeps the indirection and is runtime-themeable.

## The chrome has two radius vocabularies, not one

The first block moved the Dock and nothing else. Measured with `getComputedStyle`, baseline against the block:

| surface | class | token | baseline | chrome scale zeroed | both scales zeroed |
| --- | --- | --- | --- | --- | --- |
| Dock panel | hand-rolled | `--radius-chrome-xl` | 10px | 0 | 0 |
| Dock button | `rounded-chrome-*` | `--radius-chrome-md` | 6px | 0 | 0 |
| menu panel | `rounded-lg` | `--radius-lg` | 8px | **8px** | 0 |
| menu item | `rounded-md` | `--radius-md` | 8px | **8px** | 0 |

The components tickets 02–07 touched read `--radius-chrome-*`. The registry components they did not touch read Tailwind's own `--radius-*`: `dropdown-menu`, `context-menu`, `combobox`, `card`, `alert`, `alert-dialog`, `kbd`, `textarea`, `input-group`, `field`.

**This is not the miss the ticket predicted.** Those surfaces do not state their own geometry — they consume a second named scale. Every one of them moves once the block names both. Both files now do.

`--radius-md` needs naming twice, in `@theme` and in `:root`. `tailwind.css` declares `--radius-md: 0.5rem` unlayered, and an unlayered declaration beats the `@layer theme` one `@theme` emits — ticket 01's own finding, biting again.

## The leak: an opened Thing is drawn in chrome tokens

The third checkbox fails, and this is the most useful thing the experiment found.

`packages/app/src/styles.css` draws three Thing-side rules out of the chrome's vocabulary:

```
.rf-thing-node            border-radius: var(--radius-chrome-xl)
.thing                    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-chrome-xl)
.thing--full              background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-chrome-xl)
```

`.thing--full` is what draws an **opened or presented** Thing (`packages/app/src/thing.ts:24`). So a block that claims to touch only the chrome changes a Thing, and it changes it to chrome paper and a chrome border as well as a chrome corner. The closed Thing's face is correct — `canvas-thing.css` reads `--canvas-thing-radius` throughout.

ADR 0064 and ticket 06 both hold that the Thing is paper and the chrome floats above it. An opened Thing wearing `--card` and `--border` contradicts that, and it was invisible while both scales happened to look similar. Fixed by **ticket 13**, which measured the presented Thing before and after: it drew `#fbfbfa` paper with a 1px `#dedede` border and a 10px corner, and now draws the closed Thing's own `#f4efe4`, 4px `#0b0d11` and zero corner.

## What this tells ticket 08

Its scan must not match on the bracket shape alone. Two classes here are legitimate and permanent: `max-h-[var(--available-height)]` and `min-w-[var(--anchor-width)]` in `Select.tsx` are Base UI's own positioner variables.

More importantly, a literal is not the only way a surface escapes the scale. Every surface in the table above is written in named utilities and none would be reported by a scan for literals, yet half the chrome was outside the scale the effort defined. A check that counts literals proves less than it appears to.
