# Presentation Notes

Status: ready-for-agent

Settled in a grilling session on 2026-10-16. The research behind it, with prior art from PowerPoint, Keynote, reveal.js, Slidev and Google Slides, is in the project's `research/speaker-notes.md`.

## Problem Statement

A presenter has nowhere to keep what they mean to say. Presenting draws the Active Resource on the Stage and nothing else (ADR 0123), so anything the presenter wants in front of them either goes on the Stage, where the audience reads it, or stays off-screen in another application that knows nothing about where the presentation is. A Graph that forks makes it worse: the presenter has to remember what each branch leads to, because the chrome names the moves but shows none of them.

## Solution

Notes are ordinary Resources, connected to the Resources they annotate by an ordinary Graph on the same Map, and found by that Graph's title. Nothing in the Space's model changes: no field on the Resource, no new kind, no link between Graphs. A talk Graph titled "Intro" finds a Graph titled "Intro Presentation Notes", "Intro Notes" or "Intro Presentation Script", or a bare "Presentation Notes" or "Notes" on the same Map, matched leniently on case and separators.

While presenting, the presenter opens the **Notes window**: a second browser window, usually on the laptop screen while the Stage is on the projector. It follows the presentation, showing the notes for the Active Resource, each move available from it with a preview of where it leads, and how long the presentation has been running. The presenter can drive the presentation from either window. For rehearsing with one screen, a toggle shows the notes under the Stage, off at the start of every presentation.

## User Stories

1. As an author, I want to write notes as ordinary Markdown Resources, so that I write and edit them with the editor I already use.
2. As an author, I want to connect a Resource to its notes by drawing an Edge, so that attaching notes is a gesture I already know.
3. As an author, I want the Graph holding my notes to be an ordinary Graph, so that I can colour it, give it a head shape, draw it on the Map and present it like any other.
4. As an author, I want to name the notes Graph after the talk, such as "Intro Presentation Notes", so that two talks on one Map keep separate notes.
5. As an author, I want a bare "Presentation Notes" or "Notes" Graph to serve every talk on its Map that has no notes Graph of its own, so that a Map holding one talk needs no talk title typed twice.
6. As an author, I want "Notes", "Presentation Notes" and "Presentation" followed by any words to be accepted, so that "Intro Presentation Script" works without a rule to learn.
7. As an author, I want the match to ignore case, spacing and separators such as dashes, underscores, colons, slashes, bars and brackets, so that "intro-talk — presentation_notes" and "Intro Talk (Presentation Notes)" both work.
8. As an author, I want a Title written over several Title Lines to match as though its lines were one, so that how I break a long title does not change what it finds.
9. As an author, I want a notes Graph that names the talk to win over a bare one, so that a talk-specific Graph is never shadowed by a general one.
10. As an author, I want "Presentation Notes" to win over "Notes", and "Notes" over "Presentation" followed by other words, so that the most explicit title wins when several could apply.
11. As an author, I want the Graph that comes first on the Map to win a remaining tie, so that the choice is predictable and changes only when I reorder Graphs.
12. As an author, I want a Graph never to be its own notes, so that presenting a Graph titled "Notes" does not show the Resource being presented as its own note.
13. As an author, I want a note to be any kind of Resource, so that a diagram, an image or a reference can be a note as well as text.
14. As an author, I want several notes on one Resource to appear in the order they sit on the Map, top to bottom and then left to right, so that I control their order by arranging them.
15. As an author, I want the notes Graph to be a convention rather than a setting, so that a Space carries its notes in its files without anything new in its format.
16. As a presenter, I want to open the Notes window with a button in the presenting chrome, so that I can find it without remembering a key.
17. As a presenter, I want to open the Notes window with the S key while presenting, so that I can open it without reaching for the mouse.
18. As a presenter, I want the Notes window to show the notes for the Resource on the Stage, so that what I mean to say is in front of me and not in front of the audience.
19. As a presenter, I want each note drawn the way the Stage would draw its kind, so that a note reads the same in both windows.
20. As a presenter, I want the Notes window to show every move available from the Active Resource, with a preview of the Resource each leads to, so that at a fork I can see where each branch goes before choosing it.
21. As a presenter, I want the move the Stage has selected to be marked in the Notes window, so that I know which branch Next will follow.
22. As a presenter, I want to move forward, move back and choose a branch from the Notes window, so that I can drive the talk from the screen I am looking at.
23. As a presenter, I want the Notes window to use the same keys as the Stage, so that my hands do the same thing whichever window has focus.
24. As a presenter, I want every move I make in either window to show in both at once, so that the windows never disagree about where the talk is.
25. As a presenter, I want an elapsed timer in the Notes window that starts when presenting starts, so that I can pace the talk.
26. As a presenter, I want to reset the timer, so that a false start or a rehearsal run does not count.
27. As a presenter, I want the timer to appear only in the Notes window, so that the audience never sees it.
28. As a presenter, I want the Notes window to say when the talk has no notes Graph, so that I can tell a missing notes Graph from a Resource that has no notes.
29. As a presenter, I want the Notes window to say when the Active Resource has no notes, so that an empty panel is never mistaken for a broken one.
30. As a presenter, I want the Notes window to name the notes Graph it is showing and any Graphs whose titles also matched but were passed over, so that a surprising choice is visible and easy to fix.
31. As a presenter, I want the Notes window to have its own address, so that I can reload it, or open it in a window I made myself, and it picks the presentation up again.
32. As a presenter, I want the Notes window to stay open with a message saying nothing is being presented when presenting ends, so that I can leave it in place between run-throughs.
33. As a presenter, I want the Notes window to pick the presentation up again on its own when I present again, so that I never reopen or rearrange it.
34. As a presenter, I want the Notes window to follow the presentation rather than start one, so that there is one way to begin presenting and it is the Dock.
35. As a presenter, I want opening the Notes window never to end the presentation or its fullscreen, so that preparing my screens does not interrupt the talk.
36. As a presenter rehearsing on one screen, I want the N key or a chrome button to show the notes under the Stage, so that I can rehearse without a second display.
37. As a presenter, I want the notes under the Stage to be off at the start of every presentation and never remembered, so that a projector mirroring my screen never shows them by accident.
38. As an audience member, I want nothing about notes to reach the Stage, so that I see only the talk.
39. As an author, I want a talk with no notes Graph to present exactly as it does today, so that notes are optional and cost nothing when unused.
40. As an author, I want to change a note while not presenting and see the change the next time I present, so that notes are authored like everything else and the Stage stays free of authoring.

## Implementation Decisions

- **Glossary.** Two new terms: the **Presentation Notes Graph**, the Graph on a talk's Map whose title marks it as that talk's notes, and the **Notes window**, the second window that follows a presentation. "Presenter view" stays on the Stage's _Avoid_ list; neither term names the Stage. A note is not a term: it is a Resource reached by an Edge of the Presentation Notes Graph.
- **ADR.** One ADR records that Presentation Notes are a Graph found by its title, a convention chosen over a model change, and names what was rejected: a `notes` field on the Resource envelope, notes embedded in the Markdown body, an explicit link from a talk Graph to its notes Graph, and a single notes Graph per Map. It refines ADR 0123 and leaves its negatives intact: the Notes window offers no authoring, and nothing reaches the Stage.
- **Finding the notes is one pure function in `graph`.** Given a resolved Map, the Active Graph and the Active Resource, it answers the Presentation Notes Graph chosen (or none), the Graphs that also matched and were passed over, and the note Resources in Map-position order. It reads only the Map's Graphs, their titles, their Edges and the placement. `graph`'s index is curated, so the export is added to the surface list deliberately.
- **Title matching.** Both titles are NFKC-normalised and case-folded; every Title Line break and every run of whitespace, `-`, `_`, `:`, `·`, `|`, `/`, `—`, `–` or bracket is one separator; the result is a word sequence. A candidate's words must be the talk title's words followed by a marker, or a marker alone. The markers, in precedence order: `presentation notes` (also `presentationnotes`), `notes`, `presentation` followed by at least one more word. "Presentations" is not the marker. Precedence: a candidate naming the talk beats a bare one; then marker order; then the Map's Graph order. The Active Graph is never a candidate.
- **Order of notes.** By the note Resource's placement on the Map, top edge then left edge, ascending. A notes Edge whose target is not on the Map cannot exist (every Edge connects Resources on its Map), so there is no missing-placement case.
- **The Stage window owns Navigation.** Traversal history has one owner. The Notes window holds no Navigation; it renders snapshots and sends commands.
- **Presentation link.** A new `app` module joins the presenting window and any Notes windows for one Space. The presenting side publishes a snapshot whenever Navigation changes and applies the commands it receives through Navigation's existing operations (`advance`, `retreat`, `selectBranch`), so a command from the Notes window is exactly a key press on the Stage. The snapshot carries the Space, Map and Active Graph identities, the Active Resource, the moves with the selected one, whether retreat is possible, and when presenting started. It is versioned, and carries identities rather than content: the Notes window resolves content from its own copy of the Space, which the HTTP store keeps current.
- **Transport is injected.** The browser channel (`BroadcastChannel`, named per Space) is reached through one adapter module, as `browser-fullscreen.ts` is for the Fullscreen API, and is injected from `main.tsx` down the composition with no default. Tests inject an in-memory pair. A later remote-device transport would implement the same port.
- **Attach and detach.** A Notes window opening announces itself; the presenting window answers with the current snapshot. Leaving presenting publishes a "not presenting" snapshot; presenting again publishes afresh, which is how the Notes window reattaches. A presenting window that closes without leaving presenting is noticed by the Notes window when no snapshot answers its announcement, and it shows "not presenting".
- **Address.** The Notes window has a product URL of its own, under the Space's (`/spaces/:spaceId/notes`, spelled with the compact Space Id like every product URL). It addresses a Space, not a position: the position comes from the presenting window. It enters the destination table in the navigation guide and the routing tests.
- **Opening it.** A button in the presenting chrome and the S key, both bound only while presenting, call `window.open` within the activation. Nothing in the Dock. Opening the Notes window must not end presenting: if Chromium exits fullscreen when a window opens from a fullscreen document, the fullscreen pairing in `presenting-fullscreen.ts` must not read that exit as the presenter leaving. It does not, as far as checked: in Playwright's Chromium (build 1194), headless and headed under Xvfb, a `window.open` popup from a key press while the document is fullscreen leaves `document.fullscreenElement` set and fires no `fullscreenchange`. The Notes window's e2e spec holds this against the real presenting pairing, since a desktop Chrome release could still differ.
- **Timer.** Elapsed time since the snapshot's start time, read through an injected clock (ADR 0109's rule for nondeterminism). Reset is local to the Notes window. No pause.
- **Rehearsal notes under the Stage.** The N key and a chrome button toggle a notes strip beneath the presenting chrome, built from the same resolved notes. Its state lives in the presenting surface and starts off on every `present` and `openPresentation`; it is never stored in the Space or the browser.
- **UI.** The Notes window, the notes strip and the moves-with-previews list are production UI and start from the `shadcn-first-ui` skill. Notes and previews are drawn through `PresentedResource`, so each kind draws as it does on the Stage.

## Testing Decisions

- A good test drives behaviour a presenter or author would recognise and asserts what they would see; none asserts a message shape, a channel name or a call order.
- **The title rule and note order** are tested at the pure `graph` function through a table of Map fixtures: each accepted spelling, each rejected near-miss ("Presentations", "Notebook"), every precedence step, the self-match exclusion, Title Lines, and note order by placement. Prior art: `packages/graph/test` tests over Space fixtures, and the property tests there.
- **The presentation link** is tested in the node environment with two compositions joined by the injected in-memory transport: a move in either side shows in both; a Notes window opened mid-presentation receives the current position; leaving presenting and presenting again reattaches; a command arriving while not presenting changes nothing. Prior art: `packages/app/test/navigation.test.ts` and `browser-location.test.ts`, which drive Navigation against recording adapters.
- **The timer** is tested with an injected clock.
- **End to end**, a Playwright spec opens the presenting page and a Notes window page in one browser context, so the real `BroadcastChannel` joins them: notes for each Resource, branch previews at a fork, driving from the Notes window, reload reattaching, "not presenting" after leaving, and nothing of the notes on the Stage. The rehearsal toggle is covered in the same spec. Prior art: `packages/app/e2e/presenting.spec.ts` and `presenting-fullscreen.spec.ts`.
- **Fullscreen** behaviour when the Notes window opens is proved in `presenting-fullscreen.spec.ts` against Chromium.
- **Stories**: the Notes window's states (notes, no notes, no notes Graph, not presenting, passed-over Graphs) get Ladle stories with behaviour specs under `ladle-e2e`, per ADR 0052.

## Out of Scope

- Choosing the notes Graph in the UI. The title convention stays as its default when that comes.
- Notes on another device, such as a phone. The link's transport port is shaped for it; no server channel is built.
- Editing notes from the Notes window or the Stage. Notes are authored on the canvas.
- A next-Resource preview on the Stage, a clock, a pause on the timer, or Traversal history shown in the Notes window.
- Putting the Stage on a chosen screen with the Window Management API.
- Notes that cross Spaces; presenting stays within one Space (ADR 0111).

## Further Notes

- Renaming a talk Graph orphans a notes Graph that names it until that is renamed too. The Notes window's "no notes Graph" message is what makes this visible; it is accepted as the price of a convention.
- A Graph such as "Presentation Outline" matches as notes by the "Presentation" marker. The Notes window names the Graph it chose, which is the remedy.
- Tickets are to be cut from this spec under `issues/`: the pure match (built with ADR 0129), then the link, then the Notes window, then the rehearsal toggle.
