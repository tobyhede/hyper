# Escape and commit are decided by the surface, not by the field

Status: accepted
Refines: 0037, 0046
Related: 0036, 0039, 0042, 0047

Two surfaces author a Card, and each gets one rule for when a field commits and one for what Escape means. Neither rule belongs to the field.

**Card Front — in place on the canvas.** The field commits on blur. Escape reverts it to the stored value and dismisses the editor. This is what `CardTitleEditor` already does and it does not change.

**Card Editor — the pane.** Every field pends: the occurrence Title, the Target, the Description and the Markdown source. **Done** commits all of them and closes. **Escape is an alias of Cancel** — it discards every pending field and closes, exactly as the button beside Done does.

## Each rule is forced by the other

A surface needs exactly one way out that does not commit, and which mechanism supplies it depends on what the commit trigger is.

In place, blur *is* the commit, so the non-committing exit cannot be a click elsewhere — it has to be a key, and Escape is that key. Reverting the field is not a courtesy there; it is the only way to leave without authoring.

In the pane, Done is the commit, so every other exit already fails to commit. Escape needs no meaning of its own and takes the one already on screen with a label on it. That is also why the pane can afford to destroy a draft on Escape and the Card Front cannot: the pane's author picked a gesture whose twin is a button that says `Cancel`.

## What this replaces

**The keyboard contract's two-stage Escape.** "A field draft consumes the first Escape without closing its containing surface; a second Escape may then close that surface." It had exactly three instances inside a pane — `CardPicker` clearing its search, `OccurrenceTitleEditor` restoring the stored title, `NewAlias`'s Title restoring the empty string — and all three go.

It was never a primitive's behaviour, which is what settles it under ADR 0047. `CardPicker`'s own comment records that "cmdk leaves Escape to the containing surface" and then derives the search-clear from the contract sentence rather than from the library. No Radix component, no shadcn component and no platform behaviour reverts a text input's value on Escape; `Dialog.Content` closes. Reverting-on-Escape is an in-place-rename idiom — spreadsheets, canvas renames — and it belongs on the surface that has that shape, which is the Card Front.

**The single-step retarget.** `prototypes/alias-creation-and-retargeting.md` made choosing a Target the completion: "Choosing a Target commits, so there is no unconfirmed Target to hold across a confirmation step." The Target now pends like every other field on its pane. It is still one atomic Edit; it is taken later.

## What forced it

Issue `17`. Retargeting an open Alias destroyed an uncommitted body, and the mechanism was exact: `onSelect` committed an `edited-card` Edit, the Space changed, the pane's `content.id` became the new Target, and the content editor — keyed on `${opened.id}:${content.id}` so that no draft is ever shown under another Card's identity — remounted and reseeded.

Three answers were weighed and all three guard the consequence rather than remove it: confirm before retargeting, refuse while the content editor is dirty, or hold a draft per content Card so retargeting away and back restores it. Each buys back the draft at a price — a confirmation over a modal, a Target the author cannot choose, or invisible state with an undefined lifetime. None of them asks why a field on a form with a Done button committed the moment it was touched.

The key is right and stays. The commit was early.

## What this costs

**The content editor stops owning its form and its actions.** `MarkdownCardEditor` holds the `<form>`, the `Done` submit and the validation today, with the occurrence fields rendered above and outside it. One Done over four fields means the pane owns the form, and the `CONTENT_EDITORS` registry's compile-time obligation changes shape: a new content kind supplies a field group that reports values and validity, not an editor that completes itself.

**One Done fires two completions, on two Cards.** `edited-card` on the Alias, carrying the title and the Target through the one `editAlias` helper, and `edited-card` on the content Card. Both already exist; this needs no sixteenth completion and no reopening of the authoring interface.

**Cancel discards more than it used to** — four pending fields rather than the content editor's three — and there is no undo anywhere in this app. That is accepted knowingly. The loss is reachable only through a gesture the author named, on a surface where the committing gesture sits beside it, and the alternatives each cost more than the loss they prevent.

**`NewAlias` is an exception and says why.** It has Cancel and deliberately no Create button, because selecting a Target *is* the completion there — nothing exists yet and there is no content editor to hold a draft. The line is: a pane with a Done pends everything to it; a pane without one completes on its terminal gesture.

## The negative to remember

Do not reintroduce a field-level Escape inside a pane, however plainly a dirty field seems to deserve one. That gesture exists on the pane, it is called Cancel, and a second unlabelled copy of it is what this decision removed.

Do not commit a pane field on selection or on blur because the Edit is "atomic". Atomicity is a property of the Edit, not a claim about when the author should be asked, and conflating the two is what made a Target picker destroy a paragraph.

Do not answer a draft destroyed by a remount by guarding the remount, and do not relax the content editor's key — two tests hold it, and a draft surviving into the next Card's editor is committed to that Card on Done, which is the worse loss.
