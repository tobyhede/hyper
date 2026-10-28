# Canvas commands

Status: ready-for-agent

Refines ADR 0138 (proposed) and replaces the design half of `.scratch/configurable-shortcuts/issues/01-command-ids-and-one-dispatcher.md`. Settled with Toby on 2026-10-28 in an architecture review of the keyboard-shortcuts stack (PRs #427–#430), candidate 1. Builds after that stack merges.

## Problem Statement

A person working on the canvas meets the same command in two places, a key and a Resource's rail, and the two do not agree. Remove from Map pressed as Delete reports a refusal on the canvas, while the same item on the rail reports through the Space's command outcomes. Read in Full View is refused by the Space key while an edit is in progress or while presenting, yet the rail still offers it. Present from Here on the rail says why it cannot run; the `P` key gives no sign at all, and no one can find out why without the rail.

Behind that, each canvas key decides for itself which Resource it acts on, which guard keeps it out of controls and chrome, and when it may run, and the rail decides the same things again. ADR 0138's one dispatcher, as ticket 01 words it, would apply `keyBelongsElsewhere` to every key, which would let Delete fire from places where it is refused today, because Delete, Enter, Shift+Enter and Space use a narrower guard aimed at a Resource on the canvas.

## Solution

Every key the canvas answers, and every rail item that has a key, is one **Canvas command**: a named command with a stable ADR 0138 id that declares what it is aimed at, which drawn Maps it serves, whether it is available for a target (and, when it is not, why), and how it runs. The keyboard dispatcher, the Resource rail and the `?` sheet are adapters over the same Canvas commands, so a key and its rail item cannot disagree about when the command runs or how it reports.

The presenting keys become commands too, in their own module, with the same interface, no target and the presenting context.

The one intended change in behaviour: Read in Full View on the rail now follows the Space key's availability, so it disappears where the key is already refused.

## User Stories

1. As an author, I want Delete and the rail's Remove from Map to report a refusal the same way, so that I learn the same thing whichever I used.
2. As an author, I want Read in Full View on the rail to be offered only where the Space key would work, so that the rail never offers a command that cannot run.
3. As an author, I want Present from Here on the rail to stay greyed out with its reason while presenting is withheld, so that I see that the command exists and why it cannot run here.
4. As an author, I want Present from Here to be greyed out with "This Resource is not on the Active Graph." when the Resource is off the Active Graph, so that I know to change the Active Graph first.
5. As an author, I want `P` to do nothing, and leave the key to the browser, whenever the rail would show Present from Here as unavailable, so that the key and the item follow one rule.
6. As an author, I want Delete to act only when the press lands inside the canvas and not on a control, a toolbar or the chrome, so that an irreversible removal never runs from a stray key.
7. As an author, I want Delete on a focused Resource to remove that Resource, and otherwise to remove the selected Resource or delete the selected Edge, so that Delete keeps doing what it does today.
8. As an author, I want Enter on a focused Resource to Open it on whichever drawn Map it belongs to, including a Map drawn inside a Space Resource, so that Open works on every Map I can author.
9. As an author, I want Shift+Enter (Open and expand) to act only on the canvas's own Map, so that the camera it moves is the one framing that Resource.
10. As an author, I want Space (Read in Full View) to act only on the canvas's own Map, so that Full View always reads a Resource of the Map I am looking at.
11. As an author, I want Enter, Shift+Enter and Space on a focused Resource's own content or toolbar to stay that control's, so that typing a space in an Open Resource's editor never opens Full View.
12. As an author, I want `C` to add a Resource to the Map holding the selection, or to the canvas's own Map when nothing is selected, so that new Resources appear where I am working.
13. As an author, I want F2 to rename the selected Resource on whichever drawn Map holds it, so that renaming works on embedded Maps too.
14. As an author, I want no canvas key to act while Full View is shown, so that nothing is authored on a Map I cannot see.
15. As an author, I want no canvas key to act in a Space that is open but not on screen, so that a key never changes a hidden Space.
16. As an author, I want a key that is unavailable to stay silent and not take the press, so that the browser or another control can still use it.
17. As an author, I want `?` to list every canvas key with the same description the rail shows, so that the sheet, the tooltips and the rail all name a command the same way.
18. As a presenter, I want the presenting keys (Right, PageDown, Left, PageUp, Home, Up, Down, Escape, S, N) to behave exactly as they do today, so that nothing in a talk changes.
19. As a presenter, I want PageDown and PageUp to scroll a long Resource before they move through the talk, so that a clicker still pages through the content first.
20. As a reader using a keyboard, I want Shift+arrow to nudge and Escape to unselect as React Flow does today, and to see them in the `?` sheet, so that those keys are documented although no command performs them yet.
21. As a developer, I want to ask a Canvas command whether it is available for a target without dispatching a keydown, so that availability is tested directly.
22. As a developer, I want to run a Canvas command for a target without dispatching a keydown, so that its effect and its reported outcome are tested directly.
23. As a developer, I want a rail item and its key to read the same Canvas command, so that a change to when the command runs changes both.
24. As a developer adding a canvas key, I want to declare its aim and its served Maps rather than write a listener and a guard, so that the new key cannot skip the Full View, hidden Space or text-entry rules.
25. As a developer adding a rail item for an existing key, I want to take the Canvas command rather than restate its availability, so that the rail cannot drift from the key.
26. As a developer building ADR 0138's remapping later, I want every key answered through a command id, so that a remapped or disabled key is honoured everywhere at once.

## Implementation Decisions

- **Canvas command is a domain term.** Add it to `CONTEXT.md`: a named action on the canvas, performed by a key, a rail item or both, identified by its ADR 0138 command id (such as `canvas.presentFromHere`). It is distinct from the Command Dock and from command outcomes, which it reports through.
- **A new Canvas commands module in the app package** declares every canvas key as a Canvas command. Each command declares:
  - its **id**, which is the ADR 0138 command id and appears in exactly one binding;
  - its **aim**, one of three:
    - *focused Resource*: the press must land on a drawn node and not inside that node's own controls, content or toolbar (today's narrow canvas guard). Used by Enter, Shift+Enter and Space.
    - *selection*: the selected Resource or Edge, answered from anywhere except a surface that owns its keys (`keyBelongsElsewhere`). Used by F2, P and Delete.
    - *canvas*: the Map itself, under the same guard as *selection*. Used by C.
    - Delete additionally declares that the press must land inside the canvas and not on a control. This is a flag on the command, not a fourth aim. With it, Delete targets the focused node first and then the selection.
  - the **Maps it serves**: *own Map* (the canvas's own Map only: P, Shift+Enter, Space) or *any* (any drawn occurrence, including a Map drawn inside a Space Resource: Enter, F2, C, Delete).
  - **availability for a target**, with three answers: *available*; *unavailable, with a reason*, which the rail shows greyed out with that sentence; and *absent*, which the rail does not offer at all. Each rail item keeps the shape it has today.
  - **run for a target.** Every run goes through the Space's command outcomes, so a refusal is reported the same way from a key and from the rail. The canvas-local refusal state Delete uses today is removed.
- **A target is an occurrence and a Resource** (or the selected Edge, for Delete; or the Map, for C). The dispatcher resolves the target from the aim. The rail passes the target directly, because a rail item belongs to one Resource on one occurrence.
- **The canvas builds the Canvas commands**, because it owns everything they read: its occurrences, its camera (Open and expand), Full View and the selection. It hands them to the rail builder, and they replace the rail's Remove from Map, Read in Full View, Present from Here and Open and expand fields one for one, along with the extra Open and expand argument the rail builder takes today. The Space-level rail items that have no key (Create Reference, Delete from Space, Enter a Space Resource) stay where they are.
- **One dispatcher per Space** (ADR 0138) is the keyboard adapter. It reads each press once, picks the guard from the command's aim, resolves the target, asks for availability, and calls `preventDefault` and runs only when the answer is *available*. An unavailable key stays silent and does not take the press. The canvas's per-key window listeners are removed, along with their own Full View checks.
- **Contexts.** The dispatcher answers canvas commands only while the Space is the one on screen, is not presenting, and has no Full View shown. Presenting commands are answered only while presenting. `?` is answered everywhere and stays a capture-phase listener, because Full View stops every key pressed in it.
- **Presenting commands are a sibling module** with the same interface, no target and the presenting context. They replace the presenting keys hook's own listener. PageDown and PageUp keep their rule that the content they land in scrolls first, expressed as availability.
- **Keys React Flow performs** (Shift+arrow nudge, Escape unselect) stay as bindings with no command id until configurable-shortcuts ticket 06 takes them over. The `?` sheet still lists them.
- **ADR 0138 is amended, not superseded**, because it is still proposed. It gains the Canvas command, the three aims, the three availability answers and the single run path. Configurable-shortcuts ticket 01 is rewritten to build this spec, keeping its done-when (one window `keydown` listener, existing key tests unchanged, each id in exactly one binding).

## Testing Decisions

- A good test reaches a Canvas command through its interface: availability and run for a target, against a composed Space (`composeApp`), and asserts what a person would observe, meaning the Space after the run, the reported outcome, and the rail item's shape. It does not assert which listener ran, what order the guards were applied in, or any internal state.
- **Canvas commands module:** a table of commands × states (authoring withdrawn, body editing, Full View shown, off the Active Graph, embedded occurrence, hidden Space), asserting the availability answer and its reason. Prior art: `resource-rail-actions.test.tsx` for availability by state, and `app-derivations.test.ts` for tests that compose and then read.
- **Key and rail agree:** one test per shared command shows the rail item and the key giving the same answer in the same state, for example both refusing Present from Here while an edit is in progress, and both reporting Remove from Map's refusal through command outcomes.
- **Dispatcher:** a test lists every window `keydown` listener the app adds and finds only the dispatcher's (and the `?` sheet's capture listener). Each command id appears in exactly one binding. Delete is not answered from the Command Dock or from a node's toolbar.
- **Unchanged as proof of no regression:** `SpaceCanvas.test.tsx`'s key tests, `SpaceApp.test.tsx`'s "the P shortcut across open Spaces", `presenting-keys.test.tsx`, `key-bindings.test.tsx`, and `packages/app/e2e/keyboard-shortcuts.spec.ts` and `presenting.spec.ts` pass without edits, apart from the Full View rail item test, which changes to the intended behaviour.
- **The one intended change:** Read in Full View is absent from the rail while `selectNodes` is false.

## Out of Scope

- Remapping, overrides in the browser, turning single-character shortcuts off, and rebinding from the sheet (configurable-shortcuts tickets 02–05).
- Taking over the keys React Flow performs (ticket 06).
- Showing an unavailable key's reason when the key is pressed. Keys stay silent; that would be a behaviour change for its own ticket.
- Full View as its own module, and walking the Active Graph by direction as its own module (candidates 2 and 3 of the same review). They are not started here, though Full View being shown is read as a dispatcher context.
- The editor's own Save and Cancel in `@project/ui`.

## Further Notes

- The architecture review is `reviews/architecture-review-keyboard-stack.html` in the project files.
- Settled answers, Q1–Q14: fold into ticket 01; every canvas key is a command; three aims plus Delete's inside-canvas flag; keys stay silent when unavailable; one run path through command outcomes; target carries its occurrence, and each command declares *own Map* or *any*; the term is "Canvas command"; three availability answers; the Full View rail change is accepted; presenting keys are commands in a sibling module; React Flow keys stay bindings; tests go through availability and run; the canvas builds the commands and hands them to the rail; ADR 0138 is amended.
