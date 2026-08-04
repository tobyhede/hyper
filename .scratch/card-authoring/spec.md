# Card authoring

Status: ready-for-agent

Decision: ADR 0035 — Space Authoring owns the complete Edit lifecycle.

## Problem Statement

Hyper can place Cards and draw Edges, but an author cannot write the Cards they
create. Option/Alt empty-drop produces a blank `Card N` whose title, description
and Markdown cannot be changed in the application. Existing Markdown and Alias
Cards can be opened for reading, but their authored fields remain read-only.
The graph therefore demonstrates structural authoring without supporting the
ordinary loop of naming a thought, writing it, correcting it and seeing the
result survive a reload.

The missing editing surface also exposes an architectural risk. Markdown and
Alias are currently handled through a sound discriminated union, but
kind-specific knowledge appears at schema, reference, file-codec, projection
and rendering call sites. ADR 0001 already reserves a Space Card as a third
kind. Adding it must produce explicit compiler obligations at the layers where
its meaning genuinely differs, without introducing a generic property bag, a
base class, or one cross-layer registry that couples React, domain validation
and file encoding.

## Solution

Make a Card's title directly editable where the title lives: on the Card drawn
in the graph. A double click on the drawn title and `F2` on a selected Card
begin an inline title draft (ADR 0036). `Enter` or leaving the field completes
the attempt; `Escape` cancels it. The draft remains local until completion, and
the graph's ordinary drag, selection and Edge-authoring interactions do not fire
through the title editor.

Opening remains the one in-place interaction for a Card's content, and that
surface is editable on arrival (ADR 0037): there is no reading state in front of
it and no action that crosses from reading into editing. A Markdown Card opens
on its title, its description and its Markdown source. The title is authored
there and on the graph, which is safe because only one is ever on screen — graph
title editing is withdrawn while a Card is open — and both write the same Card.
An Alias owns a title and a pointer rather than content, so it has nothing to
open onto; its title is renamed on the graph like any Card's.

**Editing an Alias's target content through the Alias is out of scope for this
effort.** It is specified by issue `03` and is unbuilt, so an Alias offers no
opening affordance at all, and reading a target's content through an Alias went
with the reading surface (ADR 0037). Presenting remains read-only.

Each editing surface owns its temporary draft and installs the authoritative
completed value before notifying Space Authoring. Space Authoring reads that
state, derives one complete next Space from `SpaceSession.working`, converts an
Algorithmic View to a Layout when necessary, validates through normal Space
intake, and installs and submits exactly one Edit. Merely opening a Card,
entering its editor, typing an invalid value, cancelling, or completing a value
identical to the current Card produces no Edit.

Card kinds remain a closed, discriminated domain union. Kind-specific fields
belong only to their kind. Graph operations hide reference and content
resolution, the card-file codec hides physical frontmatter/body rules, and an
exhaustive application registry selects an editor for each resolved content
kind. Alias is delegation rather than an editor kind. Adding a future content
kind deliberately requires domain, graph and UI decisions, but does not require
unrelated callers to reproduce kind switches.

## User Stories

1. As an author, I want to edit a Card title directly on the graph, so that naming a thought does not require leaving its spatial context.
2. As an author, I want the drawn title to show that it is editable and to rename on a double click, so that inline editing is discoverable where the title is (ADR 0036). The hovered Card's control opens the Card; it is not the title's affordance.
3. As a keyboard author, I want `F2` on a selected Card to edit its title, so that title authoring does not require a pointer.
4. As an author, I want inline editing to begin with the complete current title selected appropriately, so that I can revise or replace it without reconstructing it.
5. As an author, I want `Enter` to complete a valid title change, so that keyboard editing has an explicit completion gesture.
6. As an author, I want leaving a valid title field to complete the change, so that clicking back into the graph does not discard finished work.
7. As an author, I want `Escape` to cancel inline title editing, so that experimentation does not create an Edit.
8. As an author, I want an empty or otherwise invalid title to remain uncommitted with a clear field error, so that the Space never receives invalid data.
9. As an author, I want completing an unchanged title to do nothing, so that opening and closing an editor has no persistence consequence.
10. As an author, I want clicking or typing inside the title editor not to open, drag or connect the Card, so that authoring gestures do not collide.
11. As an author, I want a Card click outside the title editor to select the Card rather than open it, so that renaming and opening never compete for the same pixels (ADR 0036).
12. As an author, I want a renamed Card to update immediately anywhere its title is drawn or listed, so that the current Space remains coherent.
13. As an author, I want an Alias title edit to change only the Alias's own title, so that the target remains the single source of shared content rather than shared identity.
14. As an author, I want title changes to persist automatically and survive reload, so that Card authoring is durable without a Save action.
15. As an author, I want opening a Card to create no Edit by itself, so that inspecting content does not convert a View or create persistence work.
16. As an author, I want an opened Card to be editable on arrival, so that authoring its content costs no mode change and needs no global edit mode (ADR 0037).
17. As an author, I want the opened editor to show the Card's description and kind-specific fields, so that its non-title content has one coherent home.
18. As an author, I want the opened Card's title editable beside its content while graph title editing is withdrawn, so that two surfaces never author one title at once.
19. As an author, I want to edit a Markdown Card as Markdown source, so that its stored content remains ordinary Markdown rather than rich-text output.
20. As an author, I want an empty Markdown body to remain valid, so that a newly created Card can be named before it is written.
21. As an author, I want to add, change or remove a Markdown Card description, so that the graph can carry a concise caption without turning it into content.
22. As an author, I want description validation to enforce the existing single-line length limit before completion, so that the graph's fixed Card shape remains valid.
23. As an author, I want opening an Alias to edit the Card that owns the content it shows, so that every occurrence retains one source of truth. *(Deferred to `03`.)*
24. As an author, I want the opened editor to identify the target Card whose content I am changing, so that delegation is visible before I author an Edit. *(Deferred to `03`.)*
25. As an author, I want editing Markdown through an Alias to update the target and every Alias that shows it, so that no content is copied or allowed to drift. *(Deferred to `03`.)*
26. As an author, I want editing through an Alias to leave the Alias's own title, description and target unchanged, so that editing content is not confused with retargeting or renaming the Alias. *(Deferred to `03`.)*
27. As an author, I want an Alias to offer no kind or target field in the opened editor, so that Alias structure is not presented as content metadata. *(Deferred to `03`.)*
28. As an author, I want cancelling an opened-Card draft to close it with the Card unchanged, so that abandoned work creates no Edit.
29. As an author, I want invalid opened-Card fields to remain local with useful errors, so that persistence never receives a malformed snapshot.
30. As an author, I want one completed Card change to submit exactly one complete Space snapshot, so that description and content cannot persist separately.
31. As an author editing an Algorithmic View, I want the first completed Card change to create and select a Layout from the positions already on screen, so that no Card moves when authoring begins.
32. As an author editing a Layout, I want the completed Card change to update that Layout in place, so that its authored identity and route choices are preserved.
33. As an author, I want persistence progress, failure, retry and conflict behavior to remain visible after a Card Edit, so that Card authoring follows the same durability contract as placement and Edge authoring.
34. As an author, I want a remote conflict acceptance to replace the local Space and close any stale Card draft, so that an editor cannot later apply data derived from the replaced Space.
35. As a presenter, I want every Card authoring affordance disabled while presenting, so that presentation gestures cannot mutate the Space.
36. As a viewer, I want an Alias to open onto the content its target would open, so that an occurrence is not a dead end. *(Deferred to `03`. Until then an Alias offers nothing to open: the reading surface it relied on is gone with ADR 0037, and it owns no content of its own to author.)*
37. As a developer adding a Card kind, I want TypeScript to identify every required domain, graph and editor decision, so that a partially supported kind cannot compile silently.
38. As a developer adding a Card kind, I want the kind to carry only its meaningful fields, so that absence is represented by the union rather than sentinel or optional values.
39. As a developer adding a Card kind, I want content consumers to resolve content through the graph module, so that Alias and future delegated-content rules do not spread through renderers.
40. As a developer adding a Card kind, I want card-file parsing and serialization to remain one inverse interface, so that physical frontmatter/body rules do not leak into application editing.
41. As a developer adding a content kind, I want React editors selected by an exhaustive resolved-content registry, so that UI extensibility does not pull React into the domain packages or mistake Alias delegation for a content editor.
42. As a developer, I want Card authoring tested through the Space Authoring interface and real browser journey rather than private store state, so that implementation refactors do not rewrite the behavioral specification.

## Implementation Decisions

- ADR 0035 governs the lifecycle. Space Authoring is the only application module that mutates `SpaceSession`; Card editors do not submit snapshots or alter navigation directly.
- Opening, entering an editor and changing draft fields are not Edits. A valid changed value becomes one Edit only when the local editor completes it.
- Inline title editing is available through a double click on the drawn title and `F2` on a selected Card (ADR 0036). `Enter` and valid blur complete; `Escape` cancels. The editor stops pointer and keyboard propagation that would otherwise open, drag, select or connect the Card.
- A Card's title is authored on the graph and on the opened surface (ADR 0037). Only one is ever on screen — graph title editing is withdrawn while a Card is open — and both write the same Card through Space Authoring.
- An opened Card is editable on arrival, with no reading state in front of it and no action crossing into editing (ADR 0037). There is no global edit mode, and presenting exposes no Card editor.
- The opened editor owns the resolved content Card's title, description and kind-specific fields. Markdown owns `body`. An Alias owns no content, so it has no opened editor and no opening affordance; delegating to its target is `03`'s work.
- Drafts are local and may temporarily be incomplete. Completion constructs a complete kind-specific Card value and validates it before Space Authoring observes a completed authoring fact.
- Completing an identical Card is a no-op. A rejected or cancelled draft does not convert an Algorithmic View, mint an id, publish state or submit persistence.
- Editing an Alias title changes the Alias Card itself, and the graph is where it is edited. Opening an Alias to resolve its target and change that target Card's non-title fields — leaving the Alias's description and target untouched — is deferred to `03`.
- Kind conversion and Alias retargeting are not generic Card-field edits. They require separate authoring interactions and are not implemented by this effort.
- A Card Edit in an Algorithmic View follows ADR 0025: Space Authoring copies every currently displayed Card position into the next neutral Layout before applying the Card change, making conversion visually inert. A Card Edit in a selected Layout updates that Layout.
- `SpaceSession.working` remains the authoritative Space snapshot. Space Authoring derives the complete replacement from the current session, current placement, current renderer and the Card editor's authoritative completed value; the notification does not carry a proposed Space or effect plan.
- The complete next snapshot passes normal Space intake before any side effect. Installation and publication follow ADR 0035's ordering and reentrancy rules, and persistence receives one whole snapshot.
- A conflict replacement invalidates and closes Card drafts because they were based on a Space that is no longer authoritative.
- Card remains a closed discriminated union derived from runtime schemas. This work does not add runtime plugins, inheritance, a generic property bag or a cross-package kind-definition object.
- The domain layer owns each kind's exact data shape. The graph layer owns cross-Card references and content resolution. The existing card-file codec owns frontmatter/body translation. The application owns exhaustive kind-to-editor selection. React remains outside `core` and `graph`.
- Content readers consume a render-neutral resolved-content result rather than branching on Alias themselves. An Alias remains present as an authored Card while its content resolves lazily and exactly one hop.
- The application editor registry is exhaustive over resolved content kinds rather than authored Card kinds. Alias delegates before registry selection; a future Space content kind therefore creates a compile-time editor obligation, but nested Space authoring is not implemented by this effort.
- New kind support is expected to touch the domain union, graph semantics/file codec and application renderer/editor where behavior genuinely differs. Eliminating those deliberate decisions is not an extensibility goal; keeping them local and compiler-enforced is.
- PostgreSQL, memory and HTTP adapters remain unchanged. They already persist complete validated snapshots and do not interpret Card kinds.

## Testing Decisions

- Tests assert observable Card, Space and user behavior rather than React component state, Zustand event order or private helper calls.
- The primary application test seam is the Space Authoring interface established by ADR 0035. Tests complete Card values through the same authoring operation used by UI adapters and observe the working Space, renderer/navigation changes, publication and session submission.
- Space Authoring tests cover title, description and Markdown Edits completed directly; identical, cancelled, invalid and stale-context no-ops; Algorithmic View conversion; selected-Layout preservation; one-submit semantics; reentrant completion; and conflict replacement closing stale drafts. Edits completed through an Alias arrive with `03`; until then Authoring refusing to change an Alias's non-title fields is what is tested.
- Normal Space intake tests cover every completed kind shape and reference invariant. Alias self-target, missing target and alias-targets-alias cases remain explicit failures.
- Card-file codec example and property tests continue proving that parsing and serialization are inverses for every supported kind, including a bodyless Alias and an empty Markdown body.
- UI tests drive the inline title editor through its pointer and keyboard interface, proving the title's double click, `F2`, `Enter`, blur, `Escape`, validation and event isolation.
- Opened-Card UI tests drive title and description validation, Markdown source changes, cancellation and the absence of kind and target fields. Alias-to-target delegation arrives with `03`; what is proven here is that an Alias offers nothing to open.
- The exhaustive editor registry is enforced by strict TypeScript and the existing root and per-package typechecks. Runtime tests exercise registry selection through the opened Card interface rather than inspecting the registry.
- Playwright crosses the existing HTTP boundary and proves that an inline title change and opened Markdown change survive reload, that an Alias is renamed on the graph and offers no opening affordance, and that the first Card Edit from an Algorithmic View converts without moving Cards. Proving an Alias edit reaches its target and every occurrence arrives with `03`.
- Playwright also proves Card authoring is unavailable while presenting and that inline editing emits no React Flow warning or accidental open, drag or Edge gesture.
- Persistence adapters receive no duplicate kind-specific suite. Existing backend contracts cover complete snapshots; the application and browser tests prove Card authoring reaches that contract.
- `pnpm verify` and `pnpm e2e` are required before the effort is resolved.

## Out of Scope

- Detached Card creation.
- Deleting Cards, Edges, Routes or Layouts.
- Undo and redo.
- Creating, naming, recolouring or reordering Routes.
- Encoding Space, active Route or opened Card state in the URL.
- Adding the Space Card or any other new Card kind.
- Runtime-loaded Card-kind plugins or third-party editor registration.
- Rich-text or WYSIWYG Markdown editing, collaborative cursors, comments or revision history.
- Editing an Alias's target or description.
- Editing the content an Alias points at, through the Alias, and reading that content through it. Specified by issue `03`, delivered by neither this effort nor ADR 0037.
- Converting a Card from one kind to another.
- Changing Card ids.
- Editing imported source files or adding a browser Save action; durability remains database-backed and exporting remains CLI-only.
- Changing persistence repository, HTTP resource or wire semantics.

## Further Notes

This is the first product slice toward a genuinely usable graph authoring tool.
Detached creation, structural deletion, undo/redo and Route management remain
separate follow-on efforts because each introduces its own interaction and
domain decisions. Card authoring comes first because the existing creation
gesture already produces a blank Card that cannot otherwise be made useful.

The accepted Space Card vocabulary and ADR 0001 are design pressure on the
kind seam, not permission to implement nesting here. The success criterion is
that adding the third kind later is explicit and local: the compiler points at
the necessary domain, graph and UI decisions, while ordinary callers continue
to use deep Card and Space Authoring interfaces.
