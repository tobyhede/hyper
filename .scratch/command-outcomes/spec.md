# Command outcomes have one home, and App only draws them

What the author is told after a chrome command — which notice, whether a Map change clears it, and where the caret goes after a creation — moves out of `App.tsx` into one per-Space module, `createCommandOutcomes` (`packages/app/src/command-outcomes.ts`). App keeps drawing `ShellNotice`s; it stops holding refusal slots and wrapping async commands in try/catch. Most channels keep their describer here. Map Edit reports are the deliberate exception: tickets 06–09 put the complete title and message beside the Map authoring decision, and command outcomes owns their lifetime and dismissal without interpreting the refusal.

Grilled out of the 2026-09-22 architecture review (candidate 1, "Deepen a per-Space command outcome module out of App"). No ADR: `CONTEXT.md`'s **Completion outcome** already says application composition owns the wording and where it is shown; this names the module that owns it. `CONTEXT.md` is unchanged — "command outcomes" is an application construct, not a domain term.

## Why

### Every command handler repeats one pattern by hand

`App.tsx` (1997 lines, the most-changed file in the repo) runs an Edit or lifecycle operation and then, per handler: narrows `refused | queued | unchanged | completed`, picks a `describe*` from `authoring-refusal.ts`, writes one of the loose `useState` slots (`createMapRefusal`, `mapManagementRefusal`, `mapDeleteMessage`, `graphDeleteMessage`, `graphRefusal` at :224-242, `spaceResourceRefusal` :473, `referenceRefusal` :485, `spaceCommandBreak` :240), sometimes requests a continuation, and for async commands wraps it all in try/catch → `reportBreak` → a sentence. `createSpaceResource` (:507-554), `createReferenceFrom` (:972-1016), the Dock's Map create (:1589-1610), Delete Map (:893-911), Graph commands (:1640-1660), Enter (:1018-1035), Exit (:1422-1451) and the Dock's Open (:1540-1554) each write their own copy.

### The copies already cross channels

- **Remove from Map borrows Delete's notice.** Its refusal is published through `resourceDeletion.reportRefusal` (:1095), so it is drawn under "Resource not deleted" (:1757) for a Resource that was never being deleted.
- **Map create and Map manage share one slot with a switching title.** `mapRefusal = createMapRefusal ?? mapManagementRefusal` (:1389), titled "Map not created" or "Map unchanged" by which was written last (:1767), and dismissed together.
- **The Map-change reset is a hand-kept list.** `refusedUnder` (:754-763) clears six channels by name as a render-time transition. Adding a channel means remembering to add it there too.

### Nothing tests the routing

No test file contains "Map not deleted", "Reference Resource not created", "Space command failed", "Graph unchanged", "Map unchanged" or "Resource not deleted". Routing is reachable only by mounting `Application`, and the refusal *wording* tests (`authoring-refusal.test.ts`) never see where a sentence is shown.

### One module already has the right shape

`createResourceDeletion` (`resource-deletion.ts`, composed at `compose-app.ts:197`) owns its refusal behind `createObservableState`, and App only draws it. This spec generalises that, and takes the refusal channel back out of it so there is one table rather than one table plus an exception.

## Design

### The module

- **Where:** `packages/app/src/command-outcomes.ts`, `createCommandOutcomes`. Composed in `composeApp` after `continuation`, held on the `OpenSpace` entry with the rest of the composition, published through `createObservableState` and read by App through one `useSyncExternalStore`.
- **Dependencies at composition** (ADR 0016's rule — injected once, never per call): `continuation`, `navigation` (for the reset), and `reportObserverError`, from which it builds its own non-throwing `reportBreak`.
- **Interface:** `run(channel, operation, options?)`, `dismiss(channel)` and `dispose()`, plus `getState`/`subscribe`.
  - `operation` is a thunk returning the result (sync or async) the channel declares. Channel and operation are typed together, so a channel cannot be handed the wrong result union.
  - On `refused` it publishes the channel's describer applied to the refusal. On `completed` it clears the channel, and if `options.continueAt` is given, requests that continuation from the completed result (e.g. the minted `resourceId`). On `unchanged`/`queued` it clears the channel and does nothing else.
  - On a throw it reports through `reportBreak` and publishes the channel's **break** sentence. A throw is never dressed as a refusal (`CONTEXT.md`, Completion outcome).
  - `options.subject` carries the one runtime value a channel's sentences may name — the title of the Space or entity the press was about. A channel declares its describers as functions of `(refusal | failure, subject)`, so `space-command`'s three sentences ("… could not be entered/exited/opened.") are one channel with three operations rather than three channels or an invented second option. A channel whose sentences name nothing ignores it, and the type makes `subject` required exactly for the channels whose describers read it.
  - It returns the result to the caller, so a caller that must act on completion still can. Tickets 06–09 move Map creation, rename and deletion behind `MapAuthoringCommands`; that module owns Map coordination and recovery while command outcomes continues to own report lifetime.
- **Staleness is the module's, not the caller's** — the rule `resource-deletion.ts` already carries (`interactionEpoch`, and a `disposed` guard on the `.then`), generalised to the table. Each `run` takes, at the press: a per-channel run epoch, the `selectedMapId` for a Map-scoped channel, and the composition's `replacementEpoch`. A settlement publishes only if all three still hold, and is otherwise dropped in silence — it is not a refusal the author asked for (`CONTEXT.md`, Replacement epoch). So an operation begun on Map A cannot draw its notice under Map B, and two runs on one channel cannot land out of order. A dropped settlement still reaches `reportBreak` if it threw: the defect happened whether or not anyone is left to be told.
- **`dispose()`** unsubscribes from Navigation, drops every in-flight run and calls `observable.clearSubscribers()`. It joins the ordered block in `open-spaces.ts:783-788`, before `continuation.dispose()`, since this module publishes into the continuation.
- **Not in the interface:** argument preparation. Minting titles (`titles.ts`), `resolveMap`, `centreAnchor`, the Reference Resource offset (`Placement.growth`, ADR 0093) stay with the command that needs them.

### The channel table

One entry per shell notice, declared once in the module: whether **a Map change clears it**, plus a fixed **title**, **describer** and **break describer** where that channel owns the words. Map channels instead accept the complete structured report from `MapAuthoringCommands`; the channel still owns staleness, lifetime and dismissal. Reset membership keeps today's behaviour exactly.

| Channel | Title | Clears on Map change |
|---|---|---|
| `map-create` | Map not created | yes |
| `map-manage` | Map unchanged | yes |
| `map-delete` | Map not deleted | yes |
| `graph-edit` | Graph unchanged | yes |
| `graph-delete` | Graph not deleted | yes |
| `resource-delete` | Resource not deleted | yes |
| `resource-remove` | Resource not removed | yes |
| `space-resource-create` | Space not created | no |
| `reference-create` | Reference Resource not created | no |
| `space-command` | Space command failed | no |

`map-create`/`map-manage` split the shared slot; their complete reports arrive from `MapAuthoringCommands` rather than a channel describer. `resource-remove` is new, for Remove from Map. The reset is the module subscribing to Navigation's `selectedMapId` and clearing every channel marked "yes" — `refusedUnder` goes once ticket 09 contracts the old Map paths.

### `resourceDeletion` keeps its interaction, not its notice

It keeps arm → confirm → deleting (`pending`, `deleting`) and runs the delete through `run('resource-delete', …)`. `refusal`, `reportRefusal` and `dismissRefusal` leave its interface. Its `interactionEpoch` stays: arming or cancelling invalidates an in-flight confirm, which is about the *interaction*, and the module's run epoch is about the channel. Both must hold for a settlement to publish.

**One deliberate behaviour change.** Today `execute`'s catch (`resource-deletion.ts:105-109`) turns a thrown deletion into `failureMessage(failure)` in the refusal slot and tells the reporter nothing. Under the module the same throw publishes `resource-delete`'s break describer — `failureMessage`, so the author reads the same sentence — *and* reaches `reportBreak`. That is the point of the rule: a thrown deletion is a defect, and `CONTEXT.md` (Completion outcome) says a defect is reported rather than dressed as one of the three outcomes. The sentence the author sees does not change; what changes is that the defect is no longer swallowed.

### Out of scope

- **Inline refusals** returned to the surface that asked: Space and Graph chrome rename (:829) and add-existing-Resource (:1244) return a sentence to their editor or picker. That is already local. Map rename is the exception (ticket 06): `MapAuthoringCommands` returns its complete report, which `map-manage` holds, and the editor still holds the refused draft open on the report's sentence.
- **Pending flags** (`creatingSpaceResource` and the like) stay with whoever draws the busy state.
- **"Link not copied"** — a clipboard failure, not a Completion outcome.
- **The destination-not-found report** — undismissable by design and owned by `browser-location.ts` (ADR 0081).
- **`exitReport`** (`SpaceExitReport`, drawn by the Dock through `dock-model.ts`'s `EXIT_REPORT`) — a Dock report about the exit's persistence state, not a shell notice. Exit's *throw* moves (`space-command`); its report does not.
- **Graph coordination and its navigation follow-up.** Tickets 06–09 absorb the Map arms of the coordinated helpers into `MapAuthoringCommands`; Graph coordination remains separate.

### Sequencing

Independent of `.scratch/snapshot-edits`: those tickets change Space Authoring internals and refusal codes, which reach this module through the existing `describe*` functions unchanged.

## Tests

- `packages/app/test/command-outcomes.test.ts`, in the node environment, through the interface with fake operations and a real `createNavigation`: each channel's title and sentence; a Map change clears exactly the "yes" channels; `continueAt` requests the continuation with the minted id and not on refusal; a throw reaches the reporter and publishes the break sentence, never a refusal; `dismiss` clears only its channel; `subject` reaches the describers that name it.
- The three staleness races, each with a deferred operation resolved by hand: a Map-scoped run that settles after `selectMap` publishes nothing; two runs on one channel settling out of order leave the newer outcome standing; a run that settles after a `replacementEpoch` move publishes nothing. A dropped settlement that threw still reaches the reporter.
- Disposal: after `dispose()`, a Navigation move and a settling run both publish nothing.
- One `Application` test proves the notices render from the module's state and dismiss through it.
- App tests that assert only routing move down to the node file. `ShellNotice` is unchanged, so no story and no `e2e:ladle` change.

## Tickets

1. `01-the-module-and-resource-deletion.md` — the module, the table, the reset; `resource-delete` and `resource-remove`.
2. `02-authoring-refusal-channels.md` — `graph-edit`, `reference-create`.
3. `03-space-resource-creation.md` — `space-resource-create` with its continuation and break.
4. `04-open-spaces-breaks.md` — Enter, Exit, Open through `space-command`.
5. `05-coordinated-delete-messages.md` — `graph-delete`.
6. `06-map-rename-through-one-authoring-command-interface.md` — establish `MapAuthoringCommands` and both adapters through synchronous rename.
7. `07-map-creation-through-both-context-adapters.md` — asynchronous creation, identity recovery and surface-owned continuation.
8. `08-map-deletion-through-both-context-adapters.md` — coordinated deletion, persistence gates and surviving Navigation.
9. `09-contract-the-old-map-command-interface.md` — remove the expanded old form, duplicated paths and `refusedUnder`.
