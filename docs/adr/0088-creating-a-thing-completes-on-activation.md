# Creating a Thing completes on activation, and its Target comes from context

Status: accepted
Refines: 0070
Related: 0016, 0065, 0074, 0076, 0079, 0080, 0082, 0083, 0085

Every Thing creation completes its Edit on activation. One press places a Thing at a position the gesture already knows, selects it, and puts the caret in its inline Title editor. Nothing is chosen first, so there is no creation pane, no Target picker and no Cancel.

What a kind needs beyond a Title it takes from the context the gesture was made in rather than from a field the author fills. An Alias is created **from** its Target, so the gesture lives on a Thing and the Target is the Thing it was invoked on. A Space Thing creates its own Space, so there is nothing to choose. Referencing an *existing* Space stays a separate gesture with its own surface — the Things Popover's add-Space row — because it is a different act: one makes a Space, the other points at one that already exists.

## Why: the pane existed to collect what the gesture already knew

Three kinds, and only one of them completed on activation. `markdown` created a Thing and named it in place; `alias` and `space` opened `NewSpaceThing` or `NewAlias` to collect a Target and a Title first. The recorded reason was that "a Target and a target Space are still owed", and for `alias` that was true of the Dock and false of the product — an author creating an Alias is almost always looking at the Thing they want to alias. Moving the gesture onto that Thing supplies the Target for free. The picker was answering a question the author had already answered by pressing.

For `space` the pane collected a Title and a choice between a new Space and an existing one. The choice was drawn as a sentinel row rather than a mode switch precisely because "both choices produce the same Thing and differ only in whether the Space it names already exists" — and the existing-Space half already had a second, better route in the Things Popover, which lists real Spaces with search rather than a `Select`. What remained was a Title, and a Title is what the inline editor is for.

So the panes were not collecting anything the product could not supply. They were a second interaction model, with their own reducer, their own refusal presentation, their own focus-return continuation and their own dismissal rules, standing between an author and a creation the other kind did in one press.

## Why an Alias defaults to its Target's Title

ADR 0083 keeps a Target's name off the Thing front, so nothing on an Alias says what it points at but the dotted border. Copying the Target's Title at creation gives the author that information at the moment they need it, and copying it *once* keeps the two independent afterwards — the same rule the Space and Space Thing pair already follows. Titles need not be unique, so two Things drawing the same name is not a collision to resolve.

## Why a Space Thing places optimistically

Creating a Markdown Thing is one synchronous local Edit. Creating a Space Thing mints a whole Space and commits two snapshots through the per-Space coordination ADR 0076 established, so it is asynchronous and it can refuse. Making the two gestures feel alike therefore means placing and focusing before the commit settles, and removing the Thing if the lifecycle refuses.

We reject awaiting the commit. A creation whose caret arrives a round trip later is not the gesture this decision is for, and the silence in between is indistinguishable from a press that did nothing. We reject leaving a refused creation standing: a Space Thing whose target Space was never committed is a dangling reference, which intake already names `space-thing-diagram-missing`. The cost is that an author can be typing into a Thing that is about to vanish, so the refusal has to name what died rather than only that something failed.

## Why the new Space is `Space N`, minted locally

The pane's one property worth keeping is that a single title seeded both entities, so the Space and the Space Thing agreed at creation. The only source of existing Space *names* is an asynchronous repository read, and nothing can wait on it here, so a globally unique name would have to be minted inside the lifecycle and would disagree with the Thing's from the outset. `Space N` numbered over the containing Space's own Thing titles is synchronous, uses the `<Prefix> N` arithmetic the other three defaults already use, and is handed to both — so they agree by construction. Collisions across Spaces are accepted; titles are not identifiers (ADR 0016 gives that job to the Id).

## What it costs

**An Alias can no longer be created pointing at an arbitrary Thing.** To alias a Thing you must reach it. That is the trade this decision makes, and the Things Popover is what makes it survivable — it lists and searches every Thing, so reaching one is not a canvas hunt. If aliasing a Thing you cannot see turns out to matter, the answer is a gesture on the row in that list, not a picker returning to the Dock.

**`Create Alias` is disabled rather than absent on an Alias.** ADR 0070 forbids an Alias of an Alias, and a row that can never apply would ordinarily simply not be one of that kind's commands. It is drawn and unavailable anyway, because an Alias is otherwise a regular Thing and the greyed row is where the product can say that aliasing terminates.

**A pane could hold a refusal and a canvas cannot.** The panes reported their own failures against the fields that caused them. A creation that completes on activation has to report through the surface that owns the command, which is why the Space Thing refusal goes to the Dock's refusal channel beside `created-diagram`'s.

## The negative

**Do not reintroduce a creation pane for a Thing kind.** A kind needing a value at creation is not the case for a form; it is the case for taking the value from the context the gesture was made in, or for siting the gesture where that context exists. A fourth kind that genuinely cannot is a decision refining this one, with the reason in hand.

**Do not answer "the Target is not on screen" with a picker.** That is the same pane returning under a different name. The Things Popover is the product's one list of Things, and a creation gesture belongs on its rows before it belongs in a combobox.

**Do not make the Space Thing's placement await its commit.** The optimistic placement is the decision, not an implementation detail to tidy. A later reader finding a Thing drawn before its Space exists is looking at the point.
