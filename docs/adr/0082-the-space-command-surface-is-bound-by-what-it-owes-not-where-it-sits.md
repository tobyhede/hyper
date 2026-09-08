# The Space command surface is bound by what it owes, not by where it sits

Status: accepted
Supersedes: 0053
Related: 0026, 0028, 0031, 0045, 0047, 0050, 0052, 0064, 0068, 0073, 0079

The Space command surface is defined by the obligations listed below and by nothing about its shape. Where it sits, what it is built from, how it is moved, how its commands are grouped and which glyph stands for each of them are **treatment**: they change on the evidence of a story and a behaviour test, and they do not come back here. What is bound is what the surface owes an author, and one spatial constraint that is not a matter of taste.

ADR 0053 decided two things in one document because at the time one forced the other. Only one of them was durable. This ADR keeps that one unchanged, retires the other, and says why the coupling that joined them is spent.

## The clause that survives

**The canvas takes one exclusive choice, and there is no second control for it and no empty value.** The domain has always held one; ADR 0031 exposed exactly that, ADR 0053 drew it as one pressed item across labelled groups, and ADR 0079 narrowed the set to authored Layouts and made obsolete canvas identities invalid input. That is carried here verbatim and is the most valuable thing either document contains.

**Activating a Graph is not that choice**, and the two do not merge however alike they look as lists of coloured names (ADR 0026, ADR 0045). **Selecting is navigation and not an Edit** (ADR 0028). **Status is not a command**, so persistence state is never a row in a command list.

None of that mentions a Sidebar, and none of it ever needed to.

## The clause that should not have been bound

ADR 0053's first sentence put the commands in "a persistent left **Sidebar**", and its title said so too. That is control placement, which is treatment under this repo's own rule — an ADR records durable state ownership, module boundaries, persistence semantics and accessibility obligations, not where a control sits.

It was recorded as a decision anyway, and honestly, because in 2026-08 it was not separable from the clause above. The argument ran: the header row had six controls and no give, every concept added since had cost horizontal space the row did not have, the two occupants already tried had failed for structural reasons, and shadcn shipped exactly one application-chrome component with a worked-out responsive story. So the choice could not be drawn honestly in a row, and the surface therefore had to become a column.

The coupling was real. It is now spent, and what spends it is that **the defect was never about being horizontal.** `.shell__header` overflowed at roughly 1050px because it was a fixed row of *value triggers* inside the header's flex flow with no `min-width` on either child and a `nowrap` title — three properties, none of which is entailed by running left to right. A surface that is not in the header's flow is not competing for the header's width. A surface whose clusters are disclosures rather than fixed-width value triggers gains a disclosure, not a column of pixels, when a concept is added. And a surface that is free to stand on a vertical edge has the cheap growth direction available on demand rather than permanently.

ADR 0053 anticipated this argument and refused it in advance: *"A future review looking at a 16rem gutter beside a spatial canvas will re-suggest a compact top bar; it is answered by the responsive defect above, not by taste."* That refusal is overturned here, and this section is the answer it asked for. The re-suggestion is not taste; the defect it was answered with was a property of one implementation of a row, and it has been separated from the direction.

## What the surface owes

These are the obligations. A surface that meets them may take any shape.

**It takes no layout space from the canvas.** The canvas is spatial and it is the product; the command surface is furniture over it. ADR 0053 priced its gutter honestly — sixteen rem, "the real price and it is paid on every screen" — and accepted it because the primitive that made the responsive story free was a Sidebar. That trade is refused here. This is the one spatial fact this ADR binds, and it is binding because it is not treatment: it decides whether adding chrome costs canvas, which is a question the author pays for on every screen and cannot opt out of.

**One surface, not two.** Whatever it is at any moment, there is one of it per Space on the canvas. The failure this rules out is not a second copy; it is a second *place commands live*, which is how an author learns there is nowhere reliable to look.

**Everything it offers is reachable and operable from the keyboard alone.** Not a subset, and not "everything except the drag". Any command available to a pointer is available without one, which includes placing a Card into a Layout: a drag may be *a* way to do that and is never the only one. Every control's accessible name contains its visible label (WCAG 2.5.3), so speech input reaches what a reader can see.

**It reports the Space's persistence state without being asked, and it names which open Space is unwell.** The states are `PersistenceIndicator`'s and the words are `openSpaceStatusLabel`'s; the surface reports them and does not invent a sixth state or a second vocabulary. A standing failure announces itself rather than waiting to be opened — a report you have to go and find is not a report. `failed` is retryable and `rejected` is final, and a surface that draws them alike has not read the difference.

**It names the Space being worked in, and reaches the Spaces open beside it.** Which Space you are in is the one thing an author cannot infer from the canvas once Spaces nest (ADR 0001, ADR 0068). Whether the open set is drawn by this surface or by another one beside it is treatment, and this ADR does not decide it — what is bound is that the set is reachable and that an unwell member of it is distinguishable from a well one.

## What this ADR deliberately does not bind

Named, because the list is the point. **Nothing here is an ADR question**: which edge or region the surface occupies; whether it can be moved and by what gesture; how many resting positions it has and how a release resolves to one; the tolerance of any snap; orientation and how clusters reflow between them; which commands are grouped with which; whether a group is a `Toolbar`, a `Menubar` or neither; every icon, glyph and mark; every colour and token; how nesting is drawn in a list; animation and its reduced-motion guard; and what the surface is called in the product.

Those are settled in issues, prototypes, stories and behaviour tests, where iteration is cheap and evidence is concrete. ADR 0052 already makes a stable story production-parity evidence owing two tests, and that — not this document — is what holds the shape honest. Changing a component or an icon does not come back here.

## What it costs

**An overlay covers canvas that a gutter only displaced.** A Sidebar took width permanently and hid nothing; a surface over the canvas is in front of Cards, and a popover from it is in front of more. That is the real price of the trade and it is paid where the author is looking. It is accepted because the coverage is small, transient and movable, where sixteen rem was none of those.

**The responsive story is now ours.** ADR 0053 got offcanvas collapse, a mobile Sheet, a remembered open state and `cmd/ctrl+B` from the primitive for free, and ADR 0047 makes that freeness the reason to prefer a component. A surface that is not the Sidebar owns all of that itself, and every part of it is work that was previously not work. Accepted, and the mitigation is that none of it is bound here — it can be met by any component that meets it.

**Less is written down.** Deliberately. A future reviewer will find no ADR saying where the commands go and may read that as an omission. It is not: the shape is held by stories and tests, which is where a shape can be *shown* rather than asserted, and this section is the record that the silence was chosen.

## The negative

**Do not reintroduce a second control for the canvas choice, in any presentation.** Carried unchanged from ADR 0053 because it is unchanged. The tempting version is not the old pair; it is a Layouts-only picker added later "because there are a lot of them now". The moment a second control exists, one of them needs a value meaning "not me", and `None` is back.

**Do not fold Graph activation into the canvas choice**, and do not put persistence status into a menu or a command list. Both are ADR 0053's and both survive it.

**Do not give the surface layout space because it needs room.** That is the Sidebar returning, and it returns as a reasonable-sounding request for one more list. The obligation above is the answer: room is found by disclosure, by orientation, or by a filter inside a group — never by taking width the canvas was using.

**Do not restore the fixed header row of value triggers.** The section above separates the defect from the direction; it does not forgive the shape that carried it. A row of fixed-width Selects with no give is the thing that failed, and it will fail the same way again.

**Do not persist the surface's position.** It is held for as long as the surface is mounted and no longer. Nobody opening a shared Layout is owed the author's furniture, and the moment a position is remembered someone must decide whether it is a per-viewer preference — which needs a browser-local store this repo does not have and has been careful not to acquire — or authored content, which is a `spaceFileSchema` change and a reversal cost paid in stored documents. Neither has earned itself. If one later does, that is a refining ADR written with the reason in hand.

**Do not read "the shape is not bound" as licence to skip the evidence.** ADR 0052 is unaffected: a stable story still owes an application proof and a behaviour test, and `pnpm ui:catalog:check` still fails a new hand-rolled block that is neither built from `@project/ui` nor recorded with its reason. Freeing the shape from this document moves the burden onto those; it does not lift it.
