# 05 — Every surface outside the canvas shows the name

Status: resolved
Blocked by: 02

**What to build:** Move every surface that lists or refers to a Card onto
`titleName`, and make `CardSearchCombobox` filter on the whole Title while
displaying the name.

**Why:** The Card front is the only place a Title is more than a name. Every
other surface renders a Title into a row, a trigger or an accessible name, and a
newline reaching one of those is a bug that shows up as a broken-looking label
rather than as an error.

- [x] `GraphHud`, presenting chrome, the Space Card selectors, `CardsDrawer`,
      the Delete question and the Cards listed as Edge endpoints all show
      `titleName`. The Space Sidebar's Card rows were the sixth surface when
      this ticket was written; ADR 0082 retired them, and the claim they held
      moved onto the Card's own Delete question.
- [x] Every `aria-label` built from a Card Title uses `titleName` — including
      `CanvasCard`'s own labels on the Card, its actions menu, its Open/Close
      control and its Title edit control. The full ladder stays available as the
      heading's visible text; a screen reader hearing three lines as one
      control's name is worse than hearing the name and reading the rest.
- [x] `CardSearchCombobox` filters on the whole Title and displays `titleName`.
      That needs the primitive's filter separated from `itemToStringLabel`,
      which currently does both jobs with one string. An author who remembers a
      word from a Card's subtitle finds the Card.
- [x] `nextCardTitle` in `packages/app/src/titles.ts` scans first lines, so a
      Card named `Card 3` followed by other lines still occupies 3.
- [x] Nothing outside `packages/ui/src/CanvasCard.tsx` and the render adapter
      reads a Title's later lines. A test holds that: no `split('\n')` and no
      `titleLines` call outside the Card front and `@project/core`.

## Answer

`7463b622`. **One checkbox is left open deliberately — see below.**

The Card's Delete question, presenting chrome (`Move.title`), the Cards drawer's row labels and ordering, Edge accessible names, the copy-address menus, the `card-has-aliases` refusal and `CardContent`'s presented heading all read `titleName`. `nextCardTitle` scans first lines, so a Card named `Card 3` followed by other lines still occupies 3, and a *later* line spelling `Card 9` claims no number. `CardSearchCombobox` filters the whole Title and displays the name, through a `filter` prop built from Base UI's own `useComboboxFilter` — proven to bite: deleting the prop turns the "finds the Card by a word from a line below the name" test red.

`GraphHud` and the Space Card selectors were checked and carry no Card Title at all — they list Graphs and Layouts, single-line by ADR 0083. Both are commented in place so the next reader does not re-check them.

`test/unit/title-lines-containment.test.ts` scans every `packages/*/src` tree for a newline split or a `titleLines` call, permits only `core/src/title.ts`, `ui/src/CanvasCard.tsx` and the render adapter, self-tests both regexes, and asserts its one file exemption still earns itself. It does not scan `scripts/`, `stories/`, `e2e/` or `ladle-e2e/` — deliberate and documented at the top of the file.

### The Cards drawer: no fix required

The first checkbox names `CardsDrawer`. Its **row label and ordering** read `titleName`. Its rows also **draw a real `CanvasCard`**, which draws the ladder, because it is a Card front and ADR 0083 says the front draws the ladder wherever it is mounted.

That deviation was raised and **decided: no fix**. The Cards drawer is being removed by `.scratch/*/07-promote-the-dock`, so a surface that is going away does not earn either a rewording of this checkbox or a change to how it draws. The box is ticked on that basis, not because the drawer draws the name.

### The heading's accessible name — decided and fixed

Review found `aria-label={name}` on the heading. A label replaces an element's accessible name, so that label was what stopped a screen reader reaching the lines below the name — contradicting the comment three lines above it, which said a reader could read the heading to get them.

**Removing the label alone does not work**, and the first attempt proved it. ADR 0065 put the Title's activation control *inside* the heading, and that control carries `aria-label={`Edit Title ${name}`}`. An accessible name comes from an element's own label first and its content second, so an unlabelled heading took its one child's name and read `Edit Title <name>`. 111 E2E lookups failed on it. jsdom resolved the Title Lines instead and stayed green, so the unit suite agreed with the intent and only a browser disagreed.

**The fix is to invert the nesting.** The control now wraps the heading:

```
- button "Edit Title Draft entry":
  - heading "Draft entry" [level=2]
```

The control keeps the short action name ADR 0065 asks for. The heading is named by the Title Lines it draws, so a reader reaches every one of them. Both were measured in Chromium across all four arrangements before anything was written; the heading survives inside the button un-ignored, with all its text nodes.

`TitleHeading` is a `span` and not a `div` or an `h2`, because a `button`'s content model is phrasing content and neither of those is phrasing content. `role="heading"` with `aria-level` is the ARIA spelling of what a native `h2` would say, taken because the native element cannot legally go where this one has to. `.canvas-card__title` keeps `data-editable`, the clamp, the type and the hover treatment; only the heading moved.

`ladle-e2e/card.spec.ts` owns the proof, deliberately: it asserts both accessible names and that the heading sits inside a `button`. **A unit test cannot hold this** — jsdom and Chromium compute the name differently, and only one of them is the truth.

### Still unproved

The accessibility tree is right. How a real screen reader **reads** a heading nested inside a button is a separate question, and some screen readers treat a button as one stop in browse mode. NVDA, JAWS and VoiceOver were not tested. If that reading turns out to be wrong, the remaining option is to move the control out of the heading entirely, which changes ADR 0065's shape and needs hand-made positioning.

### Verification

`pnpm verify` exit 0 (203 files, 2464 passed | 2 skipped), `pnpm e2e` exit 0 (160 passed), `pnpm e2e:ladle` exit 0 (81 passed) — all on the integrated branch, not on this ticket alone.

### Rebased onto the Command Dock

This branch was written against the Space Sidebar and rebased onto `main` after
ADR 0082 retired it. The Sidebar's Card row, its actions menu and its standing
`Delete Card <title>` button are gone; the one Card-naming surface that replaced
them is `DeleteCardConfirmation`, which now reads `titleName` and is held to it
by `card-rail-actions.test.tsx`. `InlineTitleEditor`'s `'sidebar'` variant went
with the Sidebar, so the multiline capability is a prop set by `CanvasCard` and
declined by the Dock's `header` — the same claim over two variants rather than
three. The verification recorded above ran before that rebase; CI is the
verification of record for the rebased branch.
