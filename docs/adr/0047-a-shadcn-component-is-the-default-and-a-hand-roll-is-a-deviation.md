# A shadcn component is the default, and a hand-roll is a deviation

Status: accepted
Refined by: 0050, 0073
Related: 0036, 0037, 0039, 0046

Where shadcn ships a component for a surface this app needs, that component — and the headless primitive it composes — is what gets built on. Writing our own is a deviation, and it needs what any other deviation needs: an explicit product requirement, an interrogated reason, and that reason recorded where the next reader will find it. "Our case is special" is not a reason until it has been tested **against the primitive**, because the reasons that look strongest are the ones nobody checked.

This extends a rule that was already written and already breached. AGENTS.md has said, for some time, "Start from the chosen shadcn component's documented keyboard, focus, dismissal and accessibility behavior … do not hand-roll behavior the primitive already supplies." Every clause of that governs a component **already chosen**. It says nothing about the step before — whether to reach for one at all — and that is the step where the whole of it can be skipped without any sentence being contradicted.

## What forced it

`packages/app/src/components/CardPane.tsx` is a modal dialog. It carries `role="dialog"`, `aria-modal="true"`, a focus trap (`containTab`), a pointer containment (`containFocus`), an initial-focus effect, and a long comment on why focus restoration is `App`'s and not its own — including a `StrictMode` idempotency workaround that exists only because the restore is hand-rolled in the first place. That is 175 lines reimplementing `@radix-ui/react-dialog`, whose documentation describes what it ships in two sentences: `modal` defaults true, "Focus is automatically trapped within modal", "Esc closes the component automatically." The package is not a dependency, and no ADR or ticket records it being considered.

The component states its reason: "A modal dialog, because it covers the graph and the graph stays focusable: React Flow measures its nodes and keeps them in the tab order, so `inert` is not available and the containment is this component's own." The premise is true and the conclusion does not follow. Radix does not use `inert` either — `FocusScope` traps by pulling focus back, which works whatever is tabbable behind it. The reason was written about the platform and never tested against the library it was declining.

That is the shape this ADR exists to catch, and it is not a lapse of care: the file is more thoroughly reasoned than most of the repo. A hand-roll arrives with a local justification that is locally sound, and the primitive it displaces is never in the room.

## The cost this was already paying

Three things followed from the hand-roll, none of them visible as consequences of it at the time.

**A contract was written against a surface with no defaults.** The keyboard specification's "a field draft consumes the first Escape without closing its containing surface" is an in-place-rename idiom — spreadsheets, canvas renames — and no Radix primitive, no shadcn component and no platform behaviour implements it for a text input inside a dialog. Written against a hand-rolled pane it reads as a design choice. Written against `Dialog.Content`, whose Escape closes, it reads as what it is: a deviation, needing the bar this ADR names. Issue `16` is what surfaced it, after the same rule had been built into two more fields.

**Accessibility was re-derived rather than inherited.** Focus containment, initial focus, the accessible name and the modal semantics are each correct here, and each was arrived at by argument. A primitive would have supplied them as defaults, and the argument in the file would have been about the two or three places we genuinely differ.

**The workarounds are ours to keep.** The `StrictMode` double-invoke problem, the mousedown-on-padding focus escape, and the query-on-every-Tab rule are maintained here forever, in a file that has no upstream.

## Which primitive layer

Stay on Radix while this repo runs Radix. `@radix-ui/react-select` and `@radix-ui/react-dropdown-menu` are installed; a dialog from a different family beside them means two focus-management implementations, two dismissal models and two upgrade cadences in one pane. shadcn appears to have moved its default primitive layer to Base UI while continuing to offer Radix — that was read off the component docs and is **not confirmed here**; confirm it before acting on it. Either way the choice of layer is one whole-repo decision, taken once and recorded, and never a per-component preference.

## What this costs

**Dependency surface, and a pin to go with it.** React Flow is already pinned at 12.11.2 because behaviour we depend on was verified against that release. A primitive that owns focus and dismissal earns the same treatment, and the same obligation to revalidate in a real browser rather than accept an automated bump.

**Less control over the DOM than a hand-roll gives.** Radix's modal layer sets `pointer-events: none` outside the content and locks scroll; the canvas underneath is React Flow, which has opinions about pointers. That is the first thing the swap has to prove, and if it cannot be reconciled, *that* is a recorded reason of the kind this ADR asks for.

**A default may contradict something already written.** It did here, and the resolution is not automatic: the default wins unless the deviation clears the bar. What is no longer available is writing the contract as though the default did not exist.

## The negative to remember

Do not hand-roll a dialog, popover, tooltip, tabs, combobox or menu again, however well the local reasoning reads — the local reasoning always reads well, and `CardPane` is the proof. Do not take a primitive's *behaviour* as a specification while writing your own *component*; that half-measure is what the existing AGENTS.md rule permitted and it costs the defaults, the accessibility and the maintenance while keeping only the description. And do not accept "the platform can't do X here" as a reason to decline a library — check whether the library needed X at all, because `inert` was never how Radix trapped focus.
