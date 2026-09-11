# 09 — Rename a Space as a real Edit

Status: resolved
Tags: release/v1
Blocked by: nothing. `07` is what made the gap visible on a surface.

**What to decide and build:** Whether a Space can be renamed from inside it, and
if so what Edit does it.

`07` found this and could not take it. `space-authoring.ts`'s completion union
has `renamed-layout` and `renamed-graph` and **nothing for a Space**;
`spaceEntityActions`' `space` arm offers Copy link and no Rename, which is why
the retired Sidebar drew `space-title` as an `h1`. The Command Dock draws the
Space name as a **label** rather than as a disabled button for that reason and
says so where it is drawn: `DockSpace.onRename` is `null`, and the comment beside
it states that a name with no Edit behind it is not a command to grey out — a
greyed-out name advertises a command nobody can ever run.

The prototype offered an inline Space rename because a prototype over a stored
snapshot could write `document.title` directly. That is exactly what this ticket
must not copy.

**Why it is a domain change rather than a surface one.** The Space's title is the
stored document's, and a Space Card names the Space it points at (ADR 0074). So
the questions are:

- Does renaming a Space rewrite `document.title` on that Space's own session, and
  what happens to every Space Card in every other Space that draws the name?
- Is the Space Card's drawn name a projection of the target's title (in which case
  the rename propagates and the Card's own Title is something else), or the Card's
  own value (in which case they can disagree and the product has to say which is
  authoritative)?
- What refuses it? A blank title refuses the way a Layout's does; is there
  anything else — the meta Space, a Space with rejected work?

## Acceptance

- [ ] The decision above is recorded, in `CONTEXT.md` or an ADR, whichever the
      Space-Card-title question turns out to need.
- [ ] If it is built: a `renamed-space` completion, its refusal codes, and its
      round trip through the stored document.
- [ ] `DockSpace.onRename` stops being `null` at its one call site in `App.tsx`,
      and `IdentityName` draws the Space name as a button — the component already
      takes both arms, so no surface change is owed beyond passing the callback.
- [ ] A parity claim, with both a Ladle and an application proof, exactly as the
      Layout and Graph renames have.

## Comments

**Raised by `07`'s "Found while building it".** It was written there as "it wants
its own ticket" and lived only in that ticket's prose, which is what a status scan
misses (`docs/agents/issue-tracker.md`). This is that ticket.

**Raised by `07`'s "Found while building it".** It was written there as "it wants its own ticket" and lived only in that ticket's prose, which is what a status scan misses (`docs/agents/issue-tracker.md`). This is that ticket.

**Triaged from `needs-triage` to `ready-for-agent`.** The three questions the ticket held open are answered above: the Space Thing question by ADR 0083 and by the creation path that already lets the two titles disagree; the propagation question by the session subscription in `open-spaces.ts`; the refusal question by the trim the other two renames already use. What was left undecided was not a domain question at all — it was where an Edit with no Diagram fits in a derivation shaped around Diagrams.

**One stale read is worth checking while you are here, and is not part of this ticket's acceptance.** `spaceTitleById` (`App.tsx:1125`) comes from `useSpaceThingTargets`, which reads once for each set of referenced Spaces, and it supplies the search text for a Space Thing in the Things drawer (`ThingsDrawer.tsx:122`). If that hook does not read again when a target session changes, a renamed Space stays findable only under its old name. This affects search text alone. Nothing drawn is wrong.

**Reviewed at `high`, and two findings were real.**

The first was a defect this ticket introduced. The Edit answered `nextActiveGraphId` by re-resolving the Diagram's stored `activeGraph`, so renaming a Space silently activated a different Graph whenever the reader had picked one — which is routine, because activating a Graph is not an Edit (ADR 0028). It now carries Navigation's own Active Graph forward, as the general path does and for the same reason, and `leaves the Active Graph where Navigation put it` holds it there. That test was confirmed to fail against the shape the review caught.

The second was the visible half of the disabled arm. A `Toolbar` item stays focusable when disabled, so the DOM carries `aria-disabled="true"` and no native `disabled` attribute — every `disabled:` utility missed, `cursor-pointer` stood, and the ghost hover fill still landed, leaving a withdrawn name pixel-identical to an available one and reactive under the pointer. `command-dock.css` now quiets it, on the same reasoning that produced `canvas-thing.css`'s rail-action rule, and the component comment says where the visible half lives.

**One finding was left, deliberately.** `packages/ui/src/Button.tsx`'s `label` variant lost its last consumer with the label arm, and the review argued the repo's own rule about deleting unreachable branches should take it. A CVA variant on a shared primitive is not a branch in control flow, and `CLAUDE.md` says in terms that `@project/ui` tolerates a primitive with no consumer — `Select` and `Textarea` each spent a while with none and both came back. Removing it is a `@project/ui` decision about that primitive's surface, not this ticket's, so it is recorded here rather than taken silently.

**Decided and built.** An author renames a Space from inside it. `renamed-space` is one Edit on that Space's own session, and it writes `document.title` and nothing else. The words above are pre-ADR 0085 and stand as written: what this ticket calls `renamed-layout` is `renamed-diagram`, and what it calls a Space Card is a Space Thing.

*Does the rename rewrite the stored title, and what happens to the Cards that draw the name?* Nothing happens to them, and nothing had to be decided to make that true. ADR 0083 keeps a target's name off the Thing front, so no canvas in another Space draws what this Edit writes. The stronger fact is that the two titles could already disagree before this ticket: `session-registry.ts:658-673` writes one `input.title` into both the new Space's `document.title` and the new Space Thing's `title`, they agree at creation by construction, and either has been separately renameable ever since. So `renamed-space` does not create a divergent state — it makes an existing one reachable from the other side.

*Is the drawn name a projection or the Card's own value?* Its own. One sentence in `CONTEXT.md`'s Space entry records it; no ADR is owed.

*What refuses it?* `space-title-required` after a trim through `trimmedNonBlankTitle`, the same function the Diagram and Graph renames use — the Space title is a plain `z.string().min(1)`, so a blank one passes the schema and the Edit has to refuse it. `unchanged` for the stored title. Nothing else: the Meta Space is protected only against deletion and nothing rewrites its title at start-up, and a Space with rejected work needs no exception either, the command riding `availability.chromeTitleEdit` with the other two names in the bar.

**Where the Edit sits, and the two shapes rejected.** Above the `placement-pending` gate, beside `created-diagram` and `deleted-diagram`, because that region already is the region for Edits on the Space document rather than inside a Diagram: all three write keys of `document`, read the working snapshot direct and answer their own placement. Below the gate, parallel to `renamed-diagram`, is the smaller change and gives the Edit a `placement-pending` refusal plus an answer on whether it is a `DiagramRequiredOperation` — two sentences that are wrong about an Edit holding no Diagram. Making `placement` and `nextDiagramId` optional on `CompletedEdit` names the class honestly and weakens, for one member, a type whose promise is that nothing is left to decide. No migration: the title sits inside the `document` JSON column.

**What the surface owed, and this ticket's own claim that was wrong.** `DockSpace.onRename` stops being `null` at its one call site in `App.tsx`. The other `null` in that file belongs to `spaceEntityActions` and is the entity menu's rename row; it stays `null`, because the Dock renames by a click on the name and a menu row would be a second path to one command. Two story fixtures passing `onRename: null` were left alone for the same reason — both call `spaceEntityActions`, so wiring them would have drawn a Rename row production does not have. Nothing hand-builds a `DockChrome`: `CommandDockFixture` mounts the production `Application`, so the Dock stories took the callback from that one call site.

The claim that no surface change was owed beyond the callback was wrong. `IdentityName` drew a label when `onRename` was `null`, and the whole argument for that was the Space having no Edit at all; the only remaining `null` is a rename withdrawn for now, which that same comment says must be a disabled control. It is one `ToolbarButton` in both states now. A `Toolbar` item stays focusable when disabled, so the DOM carries `aria-disabled="true"` and no native `disabled` attribute — every `disabled:` utility missed, `cursor-pointer` stood and the ghost hover fill still landed — and the visible half of "unavailable" is therefore a rule in `command-dock.css`, mixing toward the bar's own `--card` rather than `transparent` because the Dock surface is translucent and ink mixed with transparent composites against whatever canvas sits behind it.

**Evidence.** `command-dock-edits-identity-names` gained the Space and `command-dock-identity-presentation` stopped calling it a label, each with both its Ladle and its application proof. Three jsdom readings of "the rename is withdrawn" moved from `tagName` to `aria-disabled`, the withheld name no longer being a `<span>`, and the `chromeTitleEdit` withdrawal is now read on all three names rather than the Diagram alone.

**Three defects were found after the build, and all three are fixed.** Review caught the Edit answering `nextActiveGraphId` by re-resolving the Diagram's stored `activeGraph`, so a rename silently activated a different Graph whenever the reader had picked one — routine, because activating a Graph is not an Edit (ADR 0028). It carries Navigation's own forward now, and `leaves the Active Graph where Navigation put it` was confirmed to fail against the shape the review caught. Review also caught the missing stylesheet rule above. CI then caught a third, in the evidence rather than the product: an accessible name matches as a substring, so `Space: Rendering` began resolving to both the menu trigger and the new `Rename Space: Rendering` button, and `link-actions.spec.ts` needed `exact`. Both typography proofs had a related flaw of their own — they read the three names one after another while all three share a 200ms colour transition, so the comparison sampled different points of one animation; they now sample the three together.

**One finding was left, deliberately.** `packages/ui/src/Button.tsx`'s `label` variant lost its last consumer with the label arm, and the review argued the repo's rule about deleting unreachable branches should take it. A CVA variant on a shared primitive is not a branch in control flow, and `CLAUDE.md` says `@project/ui` tolerates a primitive with no consumer — `Select` and `Textarea` each spent a while with none. Removing it is a decision about that primitive's surface, not this ticket's.

**Acceptance, all met.** The decision recorded in `CONTEXT.md`; the `renamed-space` completion with its refusals and its round trip; `DockSpace.onRename` wired at its one call site with the name drawn as a button; the label arm converted to a disabled control with its reason rewritten; a test showing the placement derivation loses nothing; and the parity claims, two of them rather than one.
