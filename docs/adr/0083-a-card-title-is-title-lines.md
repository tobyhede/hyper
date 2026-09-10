# A Card Title is Title Lines

Status: accepted
Related: 0009, 0014, 0020, 0047, 0050, 0052, 0057, 0064, 0065, 0070

A Card's **Title** is one or more **Title Lines**. It is stored as it always was — one `string` on the Card document — and the newlines inside it are load-bearing: the **first line is the Card's name**, and the lines after it draw beneath the name on the Card front at descending typographic weight. A Title with no newline in it is exactly the Title Hyper has always had, drawn exactly as it has always been drawn.

This is a Title feature. It is not a Description, a summary, or a second content slot, and the sentence in `CONTEXT.md` that forbids those survives this ADR unchanged in substance. The additional lines **name and qualify the Card**; content lives in the body an Open Card reads (ADR 0064).

## Why the structure lives in the string

The obvious alternative was to give the domain the structure: either `title`, `subtitle` and `caption` as three fields, or a `lines` array with a non-empty first element. Both were rejected.

A structured title stops being a title. Every consumer that today writes `card.title` — the Sidebar, `CardSearchCombobox`, `GraphHud`, presenting chrome, every `aria-label`, `nextCardTitle`'s minting scan — would have to learn a shape, and the ones that only ever want the name would each decide for themselves which field that is. Three fields also invite a fourth, and the pressure to make each one separately authorable, separately refusable and separately addressable is exactly the pressure that produces the Description this repo has twice decided a Card does not have.

The cost of the decision taken instead is real and is the reason this ADR exists: a `z.string()` in the schema is now carrying structure, and nothing in the type says so. That is paid for once, by making the reading of a Title a named domain operation rather than a `split('\n')` at each call site. `@project/core` owns `titleLines(title)` — which answers each line **with its role**, so the ladder below is domain knowledge and not a renderer's positional convention — and `titleName(title)`, which answers the first line and is what nearly every consumer actually wants.

## The ladder, and its ceiling

Line one is `title`, line two is `subtitle`, line three is `caption`, and **every line after the third is also `caption`**. There is no fourth role and no refusal for a fourth line.

Capping the *count* was considered and rejected: refusing a fourth line means the editor argues with an author mid-keystroke about a limit they cannot see. Letting the scale bottom out and repeat is the HTML analogy running correctly — there is no `h7`, and `p` repeats — and it is the behaviour an author who types a fourth line will predict.

## The first line is the name

Every surface that **lists or refers to** a Card shows `titleName` and nothing else: the Sidebar, `CardSearchCombobox`'s selected value, `GraphHud`, presenting chrome, the Space Card selectors, and every accessible name. Only the Card front draws the ladder, and it draws it whether the Card is Open or Closed — a Title that changes shape when a Card opens teaches an author that Opening edits it.

`CardSearchCombobox` is the one place the two come apart on purpose: it **filters on the whole Title and displays the name**. An author's recall does not respect which line they typed a word on, and a Card that is visibly named `Auth` and cannot be found by a word from its own subtitle reads as broken search.

## An authored break is not a wrapped break

This is the sentence a future reader is most likely to get wrong, so it is written down. "Linebreaks are load-bearing" is true of the breaks the **author typed** and false of the breaks the **box chose**.

A long single-line Title wraps, as it does today, to as many visual lines as it needs, all at the `title` role. Each Title Line is therefore its own block element carrying its role, and it wraps freely *within* that role: a subtitle that takes two visual lines is one subtitle, not a subtitle and a caption. Clamping counts visual lines per role.

## Placement is authored, so a Title never resizes a Card

A Title that grows past the room available is clamped, never accommodated. The Closed Size is authored (ADR 0014, ADR 0066) and a Title silently rewriting it would make the one thing this product says is authored into something computed from prose.

## Consequences

`title` stays `z.string()` but gains normalization at the schema boundary: CRLF folded to LF, per-line trailing whitespace trimmed, leading and trailing blank lines dropped, and **at least one non-empty line required** — which is what `min(1)` now means. Interior blank lines are kept verbatim; an author who left a gap meant it. A draft that normalizes to nothing is a domain refusal with a stable code, worded by application composition (ADR 0057).

Renaming a Title to the same Title plus a trailing newline is therefore **unchanged** rather than an Edit, and `nextCardTitle` scans first lines, so a Card named `Card 3` followed by other lines still occupies `3`.

Multiline Titles belong to **Cards only**. Space, Layout and Graph titles keep a single-line field: they are labels in lists with no front to draw a ladder on, and giving all four the capability because they share a field type would be the model following the implementation.

Editing gains a line break at the cost of nothing else: `Enter` still completes, `Escape` still cancels, and `Shift+Enter` inserts a line. The field grows with its content and stays at one uniform size while typing — per-line preview would mean hand-rolling a text editing surface, which ADR 0047 and ADR 0050 make a last resort and which this does not need.

Stored Titles are unaffected: every existing Title is a single line and normalizes to itself, so there is no migration. A multiline Title serializes through the existing `yaml` writer as a block scalar.
