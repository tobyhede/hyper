# A Card rail is a toolbar

Status: accepted
Refines: 0047, 0048, 0050, 0064
Related: 0051, 0053, 0065, 0066

A Card's rail actions are one `role="toolbar"` with roving tabindex. The rail is
a single tab stop; the arrow keys move between the commands inside it. This is
Base UI's `Toolbar`, wrapped in `@project/ui` as `Toolbar` and `ToolbarButton`
because the shadcn registry carries no toolbar (ADR 0047, ADR 0050).

The rail composes that pair as `CardRailActions` and `CardRailAction`, and those
two are where everything below is written down once. The cluster owns the
keydown stop; one action owns the shared control treatment
(`card__rail-action`), the canvas suppression (`nodrag nopan` and the click and
pointer-down stops) and `holdFocus` for a control pressed while a caret is in
the Card's content. `variant` and `size` are not offered on an action, because
one rail means one control treatment. A Card is then left stating which commands
it has and what each one runs.

## Why the rail and not the app

A canvas draws many Cards at once and each Card's rail carries several commands.
Under a plain group of buttons, reaching the Cards means passing through every
command of every Card before them: a Space with a dozen Cards costs dozens of
tab stops before anything else on the surface. Roving tabindex makes that two
levels instead of one — Tab traverses Cards, the arrows traverse one Card's
commands — which is the shape the canvas already has.

The cost is that Tab no longer reaches every control directly, and an author who
expects it to will not find the rail's later commands. That is the standard
toolbar bargain, and the count is what makes it worth taking here.

This decision is about the Card rail. It does not make every command cluster in
Hyper a toolbar. `SelectedEdgeControls` draws two commands, once, for the one
selected Edge; the count argument does not reach it and it stays a group. A
cluster earns a toolbar by repeating across a surface or by carrying enough
commands that a tab stop apiece is a real cost, not by being a row of buttons.

## Whose command is this

A rail carries two kinds of command, and the difference is not cosmetic.
**Shared** commands belong to every Card whatever it is; **kind** commands
belong to one kind of Card and mean nothing on another. Open and Close are
shared, because ADR 0064 makes open and closed a Card-level state: a Space Card
is as closable as a Markdown one. Edit, Save and Cancel are the Markdown
front's. Choosing a Space View, choosing a Graph and entering a Space would be a
Space Card's. An Alias Card's Open is the Alias kind's — it opens that Card's
metadata editor rather than the Card, and ADR 0064 says an Alias does not
expand.

The two sets are drawn identically. One rail means one control treatment, and a
command does not announce whose it is by looking different. So the distinction
lives in the markup: two `role="group"`s inside the one toolbar, each named,
which assistive technology announces once on the way past rather than on every
item. `CardRailKindActions` and `CardRailSharedActions` are those two, and a
group that holds nothing draws nothing, so a rail never carries an empty named
group for commands this Card does not have.

**Kind commands lead and shared commands trail.** A rail is read from the
particular to the general, and Close standing in the same place whatever kind of
Card it is drawn on is the point of calling it shared at all.

Grouping does not divide the keyboard. The roving tabindex belongs to the
toolbar root, so an arrow crosses a group boundary exactly as it crosses any
other gap between two commands, and the rail is still one tab stop.

This is worth naming now rather than when it bites. Today the shared set is one
command and the rule reads like ceremony around it. The moment a second
all-Cards command arrives, the alternative is a convention about where in the
JSX to type it, which is not a rule anything can hold.

## Unavailable is not unreachable

ADR 0064 requires the Close control to keep its rail slot while a content edit
runs, drawn and unavailable, so the row does not reshuffle under an author who
is writing. That was implemented with the native `disabled` property, which
removes the control from the keyboard entirely — the promise held for the eye
and not for the keyboard, and no test caught it because the visual assertion was
the only one.

A toolbar item stays focusable while disabled: Base UI's `focusableWhenDisabled`
defaults to `true`, so the control keeps its place in the arrow order, announces
itself unavailable through `aria-disabled`, and still refuses to run. That is
what ADR 0064 asked for, and the toolbar supplies it rather than Hyper
hand-rolling it.

Two consequences follow and are load-bearing. Rail controls are styled through
`[aria-disabled='true']`, never `:disabled`, and `Button`'s own `disabled:`
utilities no longer apply to them. And an assertion that a rail control is
unavailable reads the attribute; `toBeDisabled` is now wrong for a rail control
in the unit suite, though Playwright's own matcher reads both.

## The keydown stop moves to the root

Every rail control used to stop keydown propagation itself, because React Flow
subscribes its keys around the canvas the Card is drawn on and a key pressed on
a rail control must not also reach it. A control cannot keep doing that: the
roving handler sits on the toolbar root, and an event stopped at the control
never arrives, so the arrows would move nothing.

The stop therefore belongs to the toolbar root, after the composite has had the
event. Base UI merges the two handlers on that element, so both run and the
event still does not leave the Card.

## What stays as it was

The rail's geometry, its Active-Graph band and when it is revealed are unchanged
and remain split between `CardRail` and the Card that mounts it. `CardRail` does
not own the toolbar: it is a band with a kind at one edge and a slot at the
other, and the Alias metadata editor mounts that same band with a single Close
control inside a modal, where a one-item toolbar would be overhead and the
modal's own Tab order is what an author wants.

The Card's Title is not in the toolbar. It is a heading with its own activation
under ADR 0065, and it keeps its own tab stop; folding it into the command
cluster would make renaming a Card an arrow-key move away from closing it.

`Escape` and commit remain decided by the surface under ADR 0048. A toolbar
changes which key moves focus between commands, not which key ends an edit.
