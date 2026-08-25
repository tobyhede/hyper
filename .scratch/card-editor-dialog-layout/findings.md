# Card editor dialog layout — findings

Status: needs-human

The opened Markdown Card's dialog is too small to write in, and the question
raised was whether shadcn supplies a resizable dialog. It does not. What
follows is what the registry actually offers, what the platform offers instead,
and five candidate layouts drawn so the choice can be made by looking rather
than by argument.

## What shadcn has, and what it is for

Searched with `pnpm dlx shadcn@4.18.0 search @shadcn -q resizable -c packages/ui`,
which returns exactly two items: `@shadcn/resizable` and its example.

`@shadcn/resizable` is a thin wrapper over `react-resizable-panels` and exports
`ResizablePanelGroup`, `ResizablePanel` and `ResizableHandle`. It **splits a
container into panes along one axis**. It never sizes the container, so it is
not an answer to "make the dialog resizable" — it is an answer to "let the
author reallocate room *inside* the dialog", which is a different question and
one the Markdown editor may not have, since the pane holds a title and a source
surface and nothing else worth splitting.

`@shadcn/dialog` is Base UI's `Dialog` with shadcn's classes, and Base UI's
`Dialog.Popup` has no resize of its own. So neither half of the shipped stack
resizes a dialog.

## What does

The platform: `resize: both` on an element whose `overflow` is not `visible`.
The panel already sets `overflow: hidden` for its clipping, so the mechanism is
one declaration, no dependency, no pointer handling of our own, and no
`shadcn-first-ui` deviation to record — there is no hand-rolled interactive
behaviour, because the drag belongs to the browser.

Two things have to be true for it to feel right, and both are in
`packages/app/stories/review/card-editor-layouts.css`:

- **The panel must be anchored, not centred.** `.card-pane` centres its panel
  with flexbox. A centred box grows in both directions at once, so the corner
  moves at half the pointer's speed and slides away from the cursor. The
  prototypes place the panel absolutely at `left: max(1.5rem, calc(50% - <half
  the default width>))` — where centring would have put it — and then leave it
  there, so the box grows right and down from a fixed origin and the corner
  tracks 1:1. Confirmed by drag in Chrome.
- **The UA gripper has to go.** It is three grey diagonal lines belonging to no
  palette. `::-webkit-resizer { background: transparent }` paints it out and a
  `pointer-events: none` span redraws it in ink; the resize region is the
  browser's and is unaffected by what is drawn over it.

## Why CodeMirror does not currently follow, and what actually fixes it

Nothing is wrong with the editor. `MarkdownSourceEditor` already sets
`height: 100%` on its root and CodeMirror's theme sets `&{height: 100%}`, and
every step between the panel and it — `.card-editor`, `.card-editor__fields`,
`.card-editor__body`, `.card-editor__markdown` — already carries `flex: 1` and
`min-height: 0`.

What is missing is a **definite height at the top of that chain**.
`.card-pane__panel--card-editor` sets `max-height: min(420px, calc(100vh - 4rem))`
on an `aspect-ratio: auto` panel, so the panel is content-sized and the chain
has nothing to divide. Give the panel a real height — by drag, by preset, or by
viewport proportion — and the editor follows with no JavaScript, no
`ResizeObserver` and no measurement. All five prototypes demonstrate this and
none of them contains a line of sizing code.

The corollary: the 420px cap is the whole bug. Whichever layout wins, the fix
is a definite height, not editor work.

## The five candidates

`pnpm ladle`, then Review -> Card editor layouts. They vary two things
independently — how the box gets its size, and where the chrome goes.

| | Sizing | Chrome | Reads |
|---|---|---|---|
| **A — Drag corner** | `resize: both`, 720x540 default, min 420x300 | today's: title over body, footer | the smallest change that answers the complaint |
| **B — Fill frame** | none; `min(1040px, 100% - 4rem)` x `min(760px, 100% - 4rem)` | today's | asks whether size was ever the author's decision |
| **C — Rail actions** | `resize: both`, 680x500 default | Cancel, Done and close all on the Graph band; no footer | buys ~56px of writing height, one band for every control |
| **D — Size presets** | Compact / Comfortable / Full on the rail | today's, plus the preset group | keyboard-reachable and nameable in a test; a drag corner is neither |
| **E — Full-bleed sheet** | `inset: 2rem` | bare underlined title, thin footer rule | stops being a card and becomes the document |

Each resizable candidate reports its live panel box above the sheet, so the
default size can be chosen from what a real drag settles on rather than guessed.

## Open questions for the review

1. **Drag or presets — or both?** A drag corner is pointer-only, invisible until
   found, and lands on whatever pixel the author released at, which no test can
   name and no session remembers. Three presets are reachable, nameable and
   reproducible, and give the author the nearest of three rather than the one
   they wanted. D and A are not exclusive; a preset group *and* a drag corner is
   a fourth answer nobody has asked for yet.
2. **Does a chosen size persist, and at what scope?** Per Card, per Space, per
   browser? None of the prototypes remembers anything. If the answer is "it
   persists", that is authored state and the question stops being a CSS one.
3. **E versus ADR 0051.** The ADR says the opened Card is that Card expanded,
   and the 16:9 silhouette is part of how it says so. At full-bleed the
   silhouette stops carrying the resemblance and only the paper, ink and rail
   do. If that still reads as the same object the ADR holds without the frame;
   if it does not, that is the finding and E is out on those grounds rather than
   on taste.
4. **C's footer.** Moving Cancel and Done onto the rail puts a destructive
   action and a commit action on a 34px band beside a close button. It reads
   well at 680px; it is worth checking at the 420px minimum before adopting.

## What was built, and what it is not

`packages/app/stories/review/card-editor-layouts.{tsx,css,stories.tsx}` —
review-only, under `stories/review` because `shadcn-first-ui`'s prototype
boundary puts an unresolved visual experiment there. `MarkdownSourceEditor`
(behind the same lazy split production uses), `CardRail`, `Button`, `Input`,
`Field` and the Base UI Dialog parts are the real ones from `@project/ui`, and
the palette is the shipped `--card-editor-*` set. The composition is the only
prototype part, every class is `proto-`-prefixed, and nothing in it is imported
by the application. Whichever candidate wins is reimplemented through `OpenCard`
and `card-editor.css` by the production workflow, with the Ladle and application
behaviour tests ADR 0052 requires.

Nothing in `packages/app/src`, `packages/ui/src` or `packages/*/package.json`
changed, so no dependency was added and no production surface moved.
