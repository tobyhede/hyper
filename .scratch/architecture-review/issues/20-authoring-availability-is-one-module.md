# What may be authored right now is one module

Status: done
Tags: Improvement
Blocked by: none

Surfaced by: the 9 September 2026 architecture review, candidate 1 (the top
recommendation), then settled by a grilling loop. The rejected alternatives are
recorded under "Decided" so none is re-opened. Related: issue 18, which takes its
precondition from this module rather than housing it (see "Sequencing").

## The defect

One question — may this authoring operation be started now — is spelled fourteen
times across four modules. Each spelling carries its own paragraph explaining
which term it adds or omits, and no two agree.

Seven facts are recombined: `presenting` (`App.tsx:367`), `creatingCard` (`:333`),
`editingCardBody` (`:133`), `editingCardTitle` (`:134`), `cardIsOpen` (`:516`),
`spaceChromeEdit !== null` (`:508`), and `editable` (`:499`).

The spellings derived from them, in `packages/app/src/App.tsx`:

| Site | Name | Terms |
| --- | --- | --- |
| `:415` | `cardsDrawerAvailable` | presenting, creating |
| `:499` | `editable` | `liveProjection !== null` |
| `:514` | `chromeEditingDisabled` | editable, presenting, creating, body, title |
| `:531` | `deleteCardAvailable` | the five, **+ cardIsOpen + chromeEdit** |
| `:617` | `entityEditsAvailable` | `!chromeEditingDisabled && chromeEdit === null` |
| `:872` | `graph.canPresent` | body, chromeEdit |
| `:887` | `addCard.disabled` | presenting, creating, body, chromeEdit |
| `:903` | `createLayout.disabled` | presenting, creating, body, **title**, chromeEdit |
| `:1088` | `titleEditingEnabled` (prop) | creating, chromeEdit |

and past the props seam, recombining the booleans `App` already computed:

- `components/SpaceCanvas.tsx:242` — `canConnectOnCanvas = editable && titleEditingEnabled`
- `canvas-card-authoring.ts:141` — `canAuthorOnCanvas = editable && enabled && !presenting`
- `components/SpaceCanvas.tsx:579` — `nodesDraggable={editable && !presenting}`
- `canvas-card-authoring.ts:280` — `titleEditingEnabled: cardBelongsToWorkingSpace && canAuthorOnCanvas && !bodyEditing`

Two of the facts round-trip. `editingCardBody` and `editingCardTitle` are owned by
`canvas-card-authoring.ts`, reported up through `onBodyEditingChange` /
`onTitleEditingChange` (`canvas-card-authoring.ts:143-160`, `App.tsx:1102-1103`),
and pushed back down as `titleEditingEnabled` — a prop whose own doc concedes the
name is wrong (`SpaceCanvas.tsx:134-144`: *"Named for the first control it took
away, and read by all of them. … The name is stale vocabulary rather than a second
concept"*).

The comment at `SpaceCanvas.tsx:588-592` records that the pair has already
drifted once: *"**Not `canAuthorOnCanvas`**, and the difference is the whole of
`canConnectOnCanvas`: this line read `editable && !presenting` for as long as it
was inert… An expression nothing reads is not a decision that was made."*

### It has already produced a defect in shipped evidence

`stories/support/SpaceSidebarFixture.tsx:225` writes the rule a fifteenth time:

```ts
const editsAvailable = chromeTitleEdit.disabled !== true && titleEdit === null;
```

under a fifteen-line comment (`:211-224`) recording that reading only the first
term *"drew a menu in the catalogue that the application does not have, which is
the one thing a story owing an application proof must not do (ADR 0052)"*. The
defect this ticket prevents has happened, in the one place whose job is to prove
it cannot.

### Why now

ADR 0082 moves the Space command surface. A rule that exists only as fourteen
expressions at one surface's call sites is precisely what does not survive that
move.

## What to build

`packages/app/src/authoring-availability.ts` — one framework-free function:

```
authoringAvailability(facts) -> AuthoringAvailability
```

taking the seven facts `App` already holds, and answering a record of twelve
operations:

```
chrome   cardsView · chromeTitleEdit · entityEdits · deleteCard · present · addCard · createLayout
canvas   authorOnCanvas · editCardBody · connectOnCanvas · dragNodes · selectNodes
```

`editCardBody` is the twelfth, and filing this at eleven was the miss: it is
`canvas-card-authoring.ts`'s own `editable && !presenting`, which is deliberately
**not** `authorOnCanvas` — a live content editor survives a modal pane opening
over the canvas (ADR 0064's four exits, none of which a pane spends). Leaving it
out would have made that the one canvas withdrawal still spelled at its call
site.

Each answer is a bare boolean. The reasons — why Delete Card adds `cardIsOpen`,
why Add Card deliberately omits `editingCardTitle` where Add Layout takes it, why
`connectOnCanvas` is not `authorOnCanvas` — move out of the fourteen call sites and
are stated once, in this module's implementation, beside the answer each governs.

`titleEditingEnabled` is **not** in the set. It is not an operation: it is the fact
"the canvas is uncovered by a modal pane", which the canvas only ever recombines.
It becomes an internal fact of this module, and the prop is deleted rather than
renamed.

### Commit 1 — the module and the chrome

- Add `authoring-availability.ts` and its node-environment table test.
- `App.tsx` computes it once and spends its answers at `:415`, `:514`, `:531`,
  `:617`, `:872`, `:887`, `:903`. The nine derived names go.
- `stories/support/SpaceSidebarFixture.tsx:225` reads the module instead of
  re-deriving `editsAvailable`; the fifteen-line comment at `:211-224` goes with
  the derivation it was warning about. **Touch `:225` only** — `:118-158` is
  candidate 10's subject.
- `CONTEXT.md`'s **Availability** entry lands as its own commit in this PR
  (already written, uncommitted at the time of filing).

### Commit 2 — the canvas

- `SpaceCanvas` takes the availability answers in place of its three boolean props
  (`presenting`, `editable`, `titleEditingEnabled`; declared `:128`, `:132`, `:146`,
  destructured `:202-204`).
- `SpaceCanvas.tsx:242`'s `canConnectOnCanvas` and `canvas-card-authoring.ts:141`'s
  `canAuthorOnCanvas` are deleted; both read the answer.
- `titleEditingEnabled` the prop is deleted. Nothing is renamed, so
  `docs/agents/workflow.md:78` has nothing to split out.

This commit must leave `pnpm e2e` **green and unchanged** — `workflow.md:88`, the
guard that proves the refactor was behaviour-preserving.

## Decided

Settled by the grilling loop of 9 September 2026. Recorded so none is re-opened.

1. **The canvas is in scope, not chrome-only.** A chrome-only module leaves the
   `editingCardBody`/`editingCardTitle` round trip intact and leaves the
   worst-named term (`titleEditingEnabled`) in place. The four canvas spellings
   recombine booleans `App` already computed, which is the definition of the
   defect.

2. **A pure function, not a hook.** `entity-actions.tsx` is already this shape and
   is the model the rest of the chrome should follow. A hook would put the rules
   behind `renderHook` and back inside the jsdom mounts this change exists to
   escape.

3. **`editable` keeps its current source.** It is `liveProjection !== null`
   (`App.tsx:413-416` at the landed commit) — the projection `App` pushed into the render adapter, read
   back out. `placement.kind === 'ready'` is the same fact without the round trip,
   but issue 18's replacement discard (`App.tsx:550`) currently relies on the
   arrival frame in which the published projection is empty. Changing the source
   is a behaviour change; this ticket is a collapse. The module's interface is
   identical either way, so issue 18 changes one expression inside it.

4. **The term is Availability, not Eligibility.** `EdgeEligibility`
   (`space-authoring.ts:69`) fits its subject because a *proposal* is the kind of
   thing that can be eligible; an operation is not. The word already at the call
   sites is *available* — `cardsDrawerAvailable`, `deleteCardAvailable`,
   `entityEditsAvailable`. The two split on what they read: eligibility reads the
   **Space**, availability reads **what is already in progress**.

5. **`edgeEligibility` does not move into this module.** It lives at the Space
   Authoring seam because it reads the Space; this module would have to take a
   Space to absorb it. One word each, two modules, different subjects.

6. **Answers are bare — no refusal code, no reason field.** No consumer can draw a
   reason: `EntityActionsMenu` has no disabled item at all (`:74-77` — *"A command
   the entity does not have is simply absent from the list … never present and
   disabled"*), and the Sidebar's disabled controls have no reason surface.
   `layout-resolution.ts:9` is the repo's own standing decision against this shape:
   *"There is no reason field. A `reason` union whose second arm has no thrower
   is…"*. `placement-pending` stays what it is — a refusal code for an attempt
   that was made.

7. **No per-Card arm.** `canvas-card-authoring.ts:280`'s per-node conjunction
   includes `cardBelongsToWorkingSpace`, which reads `editableCardIds` — a Space
   fact. Taking it would put a Space into a module that otherwise reads only what
   is in progress. `canvas-card-authoring` keeps the per-Card conjunction and takes
   one answer where it currently takes three booleans.

8. **A record, not a `may(operation)` lookup.** Fourteen lookups per render, and a
   table test would have to drive it key by key. A record is computed once,
   destructured where spent, snapshots as a table, and makes an unread answer
   visible to `noUnusedLocals`.

9. **`SpaceSidebar.tsx:638`'s `presentDisabled` stays where it is.** Only its first
   term (`graph.canPresent`) comes from the chrome; `activeGraph === undefined` and
   `activeGraph.edges.length === 0` are the domain rule that an empty Graph cannot
   be presented (`CONTEXT.md`, Graph). It is a fifteenth spelling only in
   appearance.

10. **One ticket, two commits — not two tickets.** Splitting chrome from canvas
    leaves the round trip standing between them.

## Tests

Before this change the rules were reachable only by mounting the whole
application. `packages/app/test/SpaceApp.test.tsx` was the one place they could be
observed, and the mount was doing the table's job.

- One table test in the node environment over `authoringAvailability` is the
  oracle: the facts in, the answers out, including the deliberate asymmetries
  (Add Card omits `editingCardTitle`, Add Layout takes it; Delete Card adds
  `cardIsOpen`; `connectOnCanvas` is not `authorOnCanvas`; `editCardBody` and
  `dragNodes` share an expression and are two operations).
- **No mount is deleted.** This ticket originally said "keep two of the six
  mounts, delete the other four". That premise was wrong and is corrected here
  rather than acted on: there were never six. `SpaceApp.test.tsx` holds exactly
  two availability mounts — `:778` *"withholds a menu's Edits until the canvas has
  a placement to edit"* and `:941` *"discards an open chrome title draft when a
  Back moves to another Layout"* — and they are precisely the two the ticket
  wanted kept, as the chrome's adoption proof. `:842` *"clears a Layout management
  refusal when the canvas selection changes"* is about refusal clearing, not
  withdrawal, and was miscounted. The remaining mounts cover hidden-Space keyboard
  isolation, remote-snapshot conflict handling, addressed-Graph navigation and the
  Cards drawer's reveal and close rules — each earning its mount on grounds the
  availability table says nothing about. Cutting tests to satisfy a count that was
  wrong when it was written would have destroyed behavioural coverage to close a
  checklist item.
- Canvas-side adoption is proved by `SpaceCanvas.test.tsx` and by
  `space-card-embedded-layout.test.tsx`, the characterization test written for the
  embedded-Layout term. That test is worth reading before trusting a similar one:
  its first draft drove a Card **content** edit and passed with the membership arm
  deleted, because a live content editor survives its canvas being withdrawn
  (ADR 0064). A **title** caret is dropped the moment its canvas loses
  `authorOnCanvas`, so the title edit is the gesture the membership arm is
  load-bearing for. It was verified against both breakages before it was committed.
- `SpaceSidebarFixture.test.tsx` keeps its coverage; the fixture now proves parity
  by construction rather than by re-derivation.

## Sequencing

Issue 18 (`18-the-chrome-title-edit-draft-is-one-module.md`) is **confirmed** at
HEAD, with its filed line numbers moved (`:337 → :508`, `:344 → :514`,
`:371 → :540`, `:375 → :550`, `:397 → :567`, `:434 → :617`), and
`architecture-review/19` landed exactly as it predicted. Its own open question —
whether the withdrawal matrix is that module's — answers **no**: the matrix has
nine consumers and crosses two seams the draft never touches.

Amend issue 18 **when this lands, not before** — its line numbers have already
moved once since filing. One line under its Comments heading now, recording that
the matrix went elsewhere and that it takes its precondition from
`authoringAvailability`.

## Verification bar

- `pnpm verify`
- `pnpm e2e` — a UI change, and commit 2 must leave it green **and unchanged**
- `pnpm e2e:ladle` — `SpaceSidebarFixture` is touched, and it is its own CI job
  that neither `verify` nor `e2e` runs

## Answer

Landed on `20-authoring-availability-is-one-module` in three commits: `0087a38f`
(the `CONTEXT.md` entry), `c599282a` (the module and its table test, with `App`
and the story fixture reading it) and `a00dc41a` (the canvas reading answers
rather than facts).

Built as filed, with three departures recorded here rather than left to be
rediscovered:

- **Twelve answers, not eleven.** `editCardBody` joined the canvas group, for the
  reason written above.
- **`editable` became `placementReady` on the `SpaceCanvas` seam.** The filed
  plan said nothing is renamed. One thing was, and it is not a vocabulary change
  riding along: the prop feeds only the aria description React Flow gives every
  node, whose withheld form is a sentence about placement, so it is named for the
  fact and deliberately kept out of the availability record. `presenting` also
  survives as a prop, read by the overview camera alone.
- **`canvas-card-authoring` takes the whole record, not one answer.** Decided #7
  said one. It reads two — `authorOnCanvas` for every control drawn on a Card and
  `editCardBody` for a live editor — and those are exactly the two that differ, so
  passing one would have reinstated a local recombination of the other.

Rebased onto the Space-Card sub-flow work (`15e3c656`), which added a fourth
departure:

- **Eight facts, not seven.** `spaceOnCanvas` — this Space's canvas is the one
  the session is authoring right now — is the fact `main` had just added at the
  canvas seam as `active && !creatingCard && spaceChromeEdit === null`. It joins
  `soleAuthoringSurface`, so it withdraws `authorOnCanvas` and `connectOnCanvas`
  and nothing in the chrome, which is exactly what that expression did. It reads
  true for a hidden open Space and, one level down, for an embedding the canvas
  above has withdrawn: `EmbeddedLayoutAuthoring` builds its own answers from the
  module rather than passing three booleans to the Card hook, so the nested
  canvas is not a fifteenth spelling either.

Then a fifth departure closed the one term that had stayed at a call site.

- **Nine facts and thirteen answers, and no term left outside.**
  `editingEmbeddingIds.size === 0` narrowed `authorOnCanvas` inside
  `SpaceCanvas`, because the Set is fed by embedded Layouts publishing from
  inside the React Flow subtree and nothing carrying it reached `App`. It does
  now: the canvas reports the aggregate into the **render adapter**, beside
  `resizeDraft` — the store that already holds this canvas's Interaction drafts,
  and the one that re-renders the Space's command surface and the canvas
  together, where a callback prop into the composition root would land an effect
  late. `App` reads it with the same `useRenderAdapter` selector shape it uses
  for the projection and passes it as `editingEmbeddedLayout`, the ninth fact.

  Two answers come out of that one term, because the Set had two consumers and
  only one of them was the fact. `authorOnCanvas` takes it — every control drawn
  on a containing Card and the whole Edge editing lifecycle go, and
  `connectOnCanvas` deliberately does not, which is the distinction presenting
  already draws. `authorInEmbeddedLayout` is the thirteenth answer and is that
  same rule *without* the term, because the term names the very edit it
  protects: a title caret is dropped the moment its canvas loses
  `authorOnCanvas`, so withdrawing every embedding for a live embedded edit
  would cancel that edit on the render it began. The Set stays in `SpaceCanvas`
  for the membership question alone — which embedding holds the caret is a
  question about a Card of that canvas, not about what is in progress.

  `canAuthorOnCanvas` and the narrowed one-key `AuthoringAvailability` record
  beneath it are deleted; eleven call sites read `availability.authorOnCanvas`.

  Held by a characterization test committed first
  (`space-card-embedded-layout.test.tsx`, *"withdraws the containing canvas for
  a live embedded edit and leaves that embedding its own"*), which drives a
  **title** edit rather than a content edit: a live content editor survives its
  canvas being withdrawn (ADR 0064), so Save and Cancel would stand either way
  and the membership half would go unpinned. Two embeddings of one target, so
  the aggregate and the membership halves cannot both be satisfied by
  withdrawing everything.

**Not done, and still open:** the Tests section's *"keep two of the six mounts,
delete the other four"*. `SpaceApp.test.tsx` is untouched, so the table test is
additive and the six whole-application mounts still carry the same oracle. That
is the jsdom cost this ticket exists to shed, and it wants its own change — the
pruning is a coverage decision rather than a mechanical follow-on, and the two
mounts worth keeping have to be chosen one per seam.
