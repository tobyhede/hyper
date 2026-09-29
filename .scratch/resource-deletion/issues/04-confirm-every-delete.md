# 04 — Every Delete asks first, through one confirmation

Status: ready-for-agent

**What to build:** Delete Map, Delete Graph and Delete Edge ask before they run, through the same confirmation Delete from Space uses: a title `Delete {short name} …?`, a one-line description of what is permanently deleted, and `Cancel` / `Delete`. The Resource confirmation becomes one kind of a shared delete confirmation rather than the only one.

**Why:** Delete from Space is currently the only deletion that asks. V1 has no undo, and deleting a Map deletes every Graph it owns and their Edges, deleting a Graph deletes its Edges — no smaller than deleting a Resource. Four deletions asking two different ways (or not at all) is the inconsistency the dialog review called out.

## Build

- [ ] Generalise `DeleteResourceConfirmation` / `resourceDeletion` into a delete confirmation that any command arms with: the subject's kind and short name, its description, the command to run on Delete, and the focus fallback (the rule from PR #325: closing returns focus to the opener while it is still in the document, otherwise to the arming surface's fallback). Keep the App-root placement, the busy state and the refusal channels.
- [ ] **Delete Map** (Dock Map menu, `map-authoring-commands.ts`): asks `Delete {Map} From Space?`; description says the Map and its Graphs and their Edges are permanently deleted and its Resources stay in the Space. Still withheld for the last Map.
- [ ] **Delete Graph** (Dock Graph menu, `graph-authoring-commands.ts`): asks `Delete {Graph} From {Map}?`; its Edges are permanently deleted.
- [ ] **Delete Edge** (Edge toolbar `Delete Edge <name>` and the Delete key on a canvas Edge selection in `SpaceCanvas.tsx`): asks once for the whole selection — `Delete {Edge}?` for one, `Delete {n} Edges?` for several.
- [ ] Remove from Map is **not** a deletion and keeps running without a question.
- [ ] Every dialog's wording says delete, not remove, and names Edges as Edges and Graphs as Graphs.
- [ ] The UI goes through `$shadcn-first-ui`; update ADR-backed prose in `docs/agents/ui.md` and the confirmation's header comment ("the one command on the canvas that asks first").

## Tests

- [ ] Per kind, component: the question's title, description, and that Cancel/Escape run nothing and return focus to the opener.
- [ ] Per kind, application: confirming runs the existing deletion and its refusal still reports.
- [ ] e2e: each existing Delete Map / Delete Graph / Delete Edge journey now passes through the confirmation (grep `packages/app/e2e` and `test/e2e` for the commands — the journeys will fail until they confirm).

## Comments

- Requested in review of PR #325: "We should add the same dialog check to ALL Delete operations."
- Open for triage: whether the Delete key on an Edge selection should ask every time. It is the fastest deletion gesture on the canvas; the request is "ALL", so this ticket includes it, but it is the one most likely to feel heavy.
- Could split into one ticket per kind after the shared confirmation lands; kept as one so the generalisation is designed against all three callers at once.
