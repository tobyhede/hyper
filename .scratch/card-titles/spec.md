# Card Titles are Title Lines

A Card's Title may be written on more than one line. The first line is the Card's
name and is the only thing any surface outside the canvas shows; the lines after
it draw on the Card front beneath the name, at descending typographic weight.
A single-line Title — the ordinary case — renders exactly as it does today.

ADR 0083 is the decision. `CONTEXT.md` carries the vocabulary: **Title Line**,
and the Title's first line as the Card's **name**.

## Why

An author naming a Card often wants to say slightly more than a name without
opening it, and today the only two options are a long title that wraps into an
unreadable block, or a body nobody sees until the Card is Open. Load-bearing
line breaks buy the middle ground with no new field, no markdown and no
configuration: press Shift+Enter, get a subtitle.

## What this is not

It is not a Description, a summary, or a second content slot. `CONTEXT.md` has
said twice that a Card has none, and this feature does not quietly add one —
the extra lines are the Title's, they name and qualify the Card, and content
still lives in the body an Open Card reads (ADR 0064).

## Shape

- **Storage** — one `string` on the Card document, unchanged. Newlines the
  author typed are load-bearing; newlines the box chose when wrapping are not.
- **Normalization** — CRLF folded, per-line trailing whitespace trimmed, leading
  and trailing blank lines dropped, at least one non-empty line required.
  Interior blank lines kept.
- **Roles** — line 1 `title`, line 2 `subtitle`, line 3 and every line after it
  `caption`. No fourth role, no cap, no refusal for a long Title.
- **Reading** — `titleLines` and `titleName` in `@project/core` are the one home
  for the rule. No `split('\n')` at a call site.
- **Drawing** — the Card front only, Open and Closed alike. Clamped to the room
  available; never grows the Card, whose Closed Size is authored (ADR 0014).
- **Editing** — `Enter` completes, `Escape` cancels, `Shift+Enter` adds a line.
  The field grows with its content at one uniform size.
- **Scope** — Cards only. Space, Layout and Graph titles stay single-line.

## Tickets

`01` lands first and is independent of the rest: it removes two elements from
the Card front that were never decided. `02` is the domain and everything else
depends on it. `03`–`05` may proceed in parallel once `02` is in. `06` and `07`
are the evidence.

| # | Ticket |
| - | ------ |
| 01 | Take the undecided reference lines off the Card front |
| 02 | Title Lines in the domain |
| 03 | Write a Title on more than one line |
| 04 | Draw the Title ladder on the Card front |
| 05 | Every surface outside the canvas shows the name |
| 06 | One story shows a Card front whole |
| 07 | A multiline Title survives the round trip |
