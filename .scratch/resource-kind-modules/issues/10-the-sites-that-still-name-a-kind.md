# 10 — The sites that still name a kind outside the modules

Status: ready-for-human

**Why:** ADR 0128 says a kind is declared in its module and named nowhere else. Tickets 08 and 09 routed the dispatches and made the module the parser of its content, but adding a kind still edits files outside `kinds/`, and the reviews of the stack found that tickets 08 and 09 overstated how much was done. This ticket records what is unbuilt, so nothing claims it is.

**Decided (Toby, 2026-10-12):** keep the remaining sites as counted, deliberate sites rather than route them now (option A of the review), on four conditions, all met by this ticket and its change:

1. `spec.md` and ticket 08 say the "no kind named outside a module" acceptance is not met.
2. The counts only shrink: `test/unit/kind-ids-in-modules.test.ts`'s `ONE_KIND_FEATURES` and the import ban's exemptions fail when a site goes, so the table follows it down, and a new site needs this ticket or its successor.
3. The architecture candidates below are written down here, so the remaining work has a home.
4. The core's own kind-naming (`ContentAction` and `ContentVia` in `packages/core/src/resource-content.ts`) is recorded here as unbuilt.

The enforcement is an import ban: outside `kinds/`, no file may import a name a `kinds/<kind>` module exports, except the files `KIND_FEATURE_FILES` in `eslint.config.js` lists with the feature each serves; `test/unit/kind-module-imports.test.ts` derives the banned names from each module's exports and fails on a listed file that no longer needs its exemption. Literal ids stay the kind-ids scan's job, and string literals such as `ContentAction`'s and the display states' are seen by neither. Every site, with its category and exemption, is in [`../kind-sites.md`](../kind-sites.md).

## The unbuilt gaps

- **Content commands** (candidate C): `ContentAction` is a closed union of one command per kind (`edit-markdown`, `replace-image`, `author-space-view`), and the display states that run them (`resource-display.ts`'s `editing` and `replacing`, `CanvasResource`'s and `ResourceNode`'s `is<Kind>Operations` branches, the Replace label and icon) choose by kind.
- **Content reached through a Reference**: `ContentVia` names `ReferenceKindId`. It is a feature of the Reference kind alone today, but a second kind that may reach another's content would have to edit the core.
- **Creation** (candidate E): the Dock's Create list (`RESOURCE_KINDS`, `DockCreation`) and `InputFreeResourceKind` in `space-authoring.ts` list kinds; the file picker is chosen by `imageKind.id`. The Dock's availability falls through to Add Resource's for every kind but the Space Resource's, so a new Dock kind that needs a gate of its own is not caught at compile time.
- **The Space selection** (candidate F): `sql-space-repository.ts` and `space-resource-planning.ts` compare a Space Resource's `spaceId`, `map` and `graph` by kind. Ticket 06 left this unbuilt; the kind scan and the import ban now give it as the reason.
- **Decoration contexts**: the app registry intersects every kind's decoration context. Each kind's context type now sits in its own app module, but the registry still lists them.

## Latent faults in the declared-reference rules

The code reviews of #362 and #363 found six places where the generic rules still assume the one kind that declares each reference today. Each bites only when a second kind declares references or sets the flags; they are fixed together in the follow-up to this stack, each with a test: a red one where a registered kind could reach the fault, a guard where only a second kind could.

- Space deletion recovery checked only lifetime references (`space-resource-planning.ts`), while intake refuses any declared Space reference whose target is missing.
- Live Space targets were filtered by `spaceKind.id` (`space-resource-targets.ts`), while subscriptions come from the declared references.
- Intake's generic reference errors said "Reference Resource" and "targets reference" (`validate.ts`, `snapshot-edits.ts`).
- Nothing held a kind's `contentTarget` to be one of its declared `resourceReferences`.
- `NOT_THE_KIND` counted quoted `'space'` per file, so swapping a non-kind `'space'` for a kind-naming one passed.
- `ONE_KIND_FEATURES` counted module-id reaches per file the same way, so swapping one counted reach for a new dispatch passed (the review of #365). Both lists now pin each line.
- The Reference frame's border rule, moved into its kind's stylesheet, won the cascade over equal-specificity rules it used to lose to.

The review of #363 added three: the core's `SpaceResourceTarget` shared a name with an unrelated app type (now `SpaceSelectionTarget`), `SpaceAggregateError` restated the Space kind's selection problems instead of using them, and the Space kind's selection check and Space references had no core tests. The author-facing `resource-has-references` sentence in `packages/app/src/authoring-refusal.ts` still says "Reference Resources"; it is left, because only the Reference kind declares Resource references today.

## Candidates (from the 2026-10-11 architecture review of the stack)

Each is grilled with Toby before it is built; candidate A became ticket 09.

- **B — one declared-references module.** The Resource and Space references a kind declares are read in `validate.ts`, `snapshot-edits.ts`, `space-aggregate.ts` and `space-resource-planning.ts`; one module would own reading them.
- **C — each kind declares its content command.** Replaces `ContentAction` and the display-state branches with a command each kind's module declares and its view half runs. A cheaper first step is the creation half alone (see E), roughly 150 to 250 lines removing about 10 of the counted sites.
- **D — one kind view module.** The view half's names, glyph and content views in one place per kind.
- **E — each kind declares its creation input.** Whether the Dock offers it, in what order, and whether it needs input such as a file.
- **F — the Space selection inside the Space module.** Selection reads and comparisons behind the Space kind's module.
- **G — registry pass-throughs** (speculative): functions in the registries that only forward to a module.
- **H — stable content identity** (speculative).

**Acceptance:** each gap above is routed or deliberately kept with its reason, and the counts reach what remains.
