# 10 — The sites that still name a kind outside the modules

Status: ready-for-human

**Why:** ADR 0128 says a kind is declared in its module and named nowhere else. Tickets 08 and 09 routed the dispatches and made the module the parser of its content, but adding a kind still edits files outside `kinds/`, and the reviews of the stack found that tickets 08 and 09 overstated how much was done. This ticket records what is unbuilt, so nothing claims it is.

**Decided (Toby, 2026-10-12):** keep the remaining sites as counted, deliberate sites rather than route them now (option A of the review), on four conditions, all met by this ticket and its change:

1. `spec.md` and ticket 08 say the "no kind named outside a module" acceptance is not met.
2. The counts only shrink: `test/unit/kind-ids-in-modules.test.ts`'s `ONE_KIND_FEATURES` and the import ban's exemptions fail when a site goes, so the table follows it down, and a new site needs this ticket or its successor.
3. The architecture candidates below are written down here, so the remaining work has a home.
4. The core's own kind-naming (`ContentAction` and `ContentVia` in `packages/core/src/resource-content.ts`) is recorded here as unbuilt.

The enforcement is an import ban: outside `kinds/`, no file may import a name a `kinds/<kind>` module exports, except the files `KIND_FEATURE_FILES` in `eslint.config.js` lists with the feature each serves; `test/unit/kind-module-imports.test.ts` derives the banned names from each module's exports and fails on a listed file that no longer needs its exemption. Literal ids stay the kind-ids scan's job, and string literals such as `ContentAction`'s and the display states' are seen by neither. Every site, with its category and exemption, is in [`../kind-sites.md`](../kind-sites.md).

**Decided (Toby, 2026-10-13, after the audit in `/mnt/project-files/reviews/resource-issues-audit-2026-10-13.md`):** build candidates B, C, D and F, each its own PR stacked on the last; drop G and H, which were speculative and close no gap above. D takes the decoration-context gap, since it gives each kind its own slice of the context. `ContentVia` is not decided. The audit also found three sites no guard sees, which B and C take:

- the refusal code `shape-requires-ur-resource` and its message name Ur, although the rule reads `takesResourceShape` (B);
- intake's self-reference message says "Space Resource … targets its own Space" (B);
- `ContentAction`'s and the display states' string literals are seen by neither guard (C).

## The unbuilt gaps

- **Content commands** (candidate C): `ContentAction` is a closed union of one command per kind (`edit-markdown`, `replace-image`, `author-space-view`), and the display states that run them (`resource-display.ts`'s `editing` and `replacing`, `CanvasResource`'s and `ResourceNode`'s `is<Kind>Operations` branches, the Replace label and icon) choose by kind.
- **Content reached through a Reference**: `ContentVia` names `ReferenceKindId`. It is a feature of the Reference kind alone today, but a second kind that may reach another's content would have to edit the core.
- **Creation** (candidate E): routed by [issue 11](11-each-kind-declares-its-create.md). Each kind's app half declares its Command Dock Create, and the Dock draws an opaque list.
- **The Space selection** (candidate F): routed by F (2026-10-13). `sql-space-repository.ts` and `space-resource-planning.ts` read a Space Resource's view through the core registry's `spaceSelection`, and the deletion plan changes it through `selectSpaceView`, so neither compares it by kind.
- **Decoration contexts**: routed by D (2026-10-13). Each kind's context type sits in its own app module, and the app registry derives the context they read together from its table of decorations, so it names no kind's context or field; a field two kinds read with different types fails to compile there.

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
  **Built (2026-10-13):** `packages/graph/src/declared-references.ts` answers every rule over declared references: a Resource reference's problems (`resourceReferenceProblems`), the Space reference graph built once (`declaredSpaceReferences`), and from it missing references, cycles, unrooted Spaces and the Spaces a removed lifetime reference releases. Intake, `SnapshotEdit`, the aggregate and the Space Resource lifecycle ask it. One rule now has one code at every door, and no code names a kind: `reference-target-missing` (was `unresolved-reference-target` at intake and `reference-target-not-found` on an Edit), `reference-target-not-targetable` (was `reference-targets-reference` and `reference-target-must-own-content`, the latter declared at intake and never raised), `reference-targets-self` (now on an Edit too), `space-reference-missing`, `space-reference-cycle` (was `space-resource-target-missing` and `space-resource-reference-cycle`) and `shape-not-taken` (was `shape-requires-ur-resource`). `planDelete` takes a Resource whose kind owns its referenced Spaces and cascades from each lifetime reference, so its `spaceKind.id` line left the count. `declared-references.property.test.ts` holds the cycle, rooting and release rules to oracles over generated graphs.
- **C — each kind declares its content command.** Replaces `ContentAction` and the display-state branches with a command each kind's module declares and its view half runs. A cheaper first step is the creation half alone (see E), roughly 150 to 250 lines removing about 10 of the counted sites.
- **D — one kind view module.** The view half's names, glyph and content views in one place per kind.
  **Built (2026-10-13):** the view half already held this: each `packages/ui/src/kinds/<kind>` module declares one `KindView` (names, glyph, bare operations, canvas and presented content), and `ui`'s registry lists them. What D adds is the app half's canvas decoration: each kind's module declares a `KindCanvasDecoration` (`canvas-resource-decoration.ts`), its `slice` of the decoration context and its `decorate`, and the app registry lists one per kind and runs them through one loop (`decorateKinds`). `KindDecorationContext` is derived from that table, so the registry no longer names each kind's context or field. A slice names every field of its kind's context, an optional one too. A kind whose slice is field for field what its nodes were decorated from keeps them, which `canvas-resource-decoration.test.ts` holds over `decorateKinds` and `kindDecorationMemo` and `canvas-resource-authoring.test.tsx`'s decoration identity tests hold through the hook. `react-flow-adapter`'s `KindOperationsOf`, which only renamed `ui`'s `KindOperationsByKind[K]`, is gone.
- **E — each kind declares its creation input.** Built as issue 11, with no creation mode: each kind's app half owns its Create.
- **F — the Space selection inside the Space module.** Selection reads and comparisons behind the Space kind's module.
  **Built (2026-10-13):** a kind whose content shows a view of another Space declares `selection` (`of`, `select`, `frame`; `SpaceSelection` in `kind-module.ts`), and the Space kind is the one that does. The registry answers `spaceSelection`, `selectSpaceView` and `frameSpaceView`, and `SpaceView` and `SpaceFraming` are kind-neutral types in `kind-module.ts`. The SQL fast path, the Map and Graph deletion plan and the canvas's selection and framing completions read and change the view through them, so their kind comparisons are gone, and the Space rail, its context commands and the framing helper take a `SpaceView` and leave the import ban's exemptions. `select` drops a framing when the Map changes, the rule the deletion plan and the canvas each kept on their own. `ui`'s `spaceViewOf` reads a display state and stays with candidate C.
- **G — registry pass-throughs** (speculative): functions in the registries that only forward to a module.
- **H — stable content identity** (speculative).

**Acceptance:** each gap above is routed or deliberately kept with its reason, and the counts reach what remains.
