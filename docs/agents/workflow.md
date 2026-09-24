# Workflow

How work moves from a question to committed code in this repo.

The skills that drive this are **tracked** (see _Skills_ below), so a fresh clone or worktree has them. The process is still written down here rather than only existing inside them: they are a vendored third-party set, and the loop is ours whether or not a given skill is installed or has drifted upstream.

## The loop

1. **Survey** — `/improve-codebase-architecture` reads `CONTEXT.md`, the ADRs and the code, and proposes candidate changes. Pick one.
2. **Grill** — `/grilling` walks the decision tree on that candidate: one question at a time, each carrying a recommendation, until shared understanding is explicitly confirmed. **No code until it is.**
3. **Record** — decisions that firm up language go into `CONTEXT.md`; decisions that lock a trade-off become an ADR. This is not a phase. It fires mid-conversation, the moment something settles.
4. **Implement** — code and tests together.
5. **Verify** — see the bar below.
6. **Capture** — resolve the ticket with an `## Answer`, and fix any doc that described the old state. AGENTS.md and README both carried the ELK port-id collision as a known bug; both needed editing when it was fixed.

Anything not being worked on right now is parked in the tracker (`docs/agents/issue-tracker.md`), never left in conversation. A session ends; the tracker doesn't.

## When to write an ADR

Only when the decision is all three:

- **Hard to reverse** — undoing it means reworking code or authored content.
- **Surprising** — someone who knows the domain would not guess it.
- **A real trade-off** — a credible alternative was rejected, for a reason.

Record the rejected alternative and the cost accepted, not just the decision.

The most valuable ADRs capture a **negative** — the proposal a future review will otherwise re-suggest. ADR 0005 exists mainly to say *don't introduce an Arrangement type*; ADR 0004 to say *don't reintroduce a placement layer*. Both are proposals that look like improvements until you know why they were rejected.

Skip ADRs for ephemeral reasons ("not worth it right now"), self-evident choices, and anything the glossary already implies.

UI treatment is normally ephemeral. ADRs may record durable state ownership,
module boundaries, persistence semantics or accessibility obligations, but not
visual treatment, layout, control placement, gestures, shortcuts, responsive
geometry, component choice, animation or canvas-composition technique. Those
belong in issues, prototypes, stories and behavior tests where UX iteration can
replace them directly.

When an accepted ADR describes UI that has since changed, determine whether the
durable boundary changed. If it did, write a refining or superseding ADR. If
only the treatment changed, update the live issue/story/tests and leave the ADR
as historical context; do not force the UI back into agreement.

Format: a title that states the decision as a sentence, a status block, then a few paragraphs. Numbered `docs/adr/NNNN-<slug>.md`.

## ADRs are append-only

An accepted ADR is **immutable**. It records why a decision looked right *at the time, with what was known then* — not what the design is now. That is why the log is worth keeping: the wrong turns are the most instructive part of it. The "overlaying routes turns to spaghetti" rule was believed and acted on for a while before measurement disproved it; a tidied document would show only the correction.

So: **never merge, rewrite or consolidate ADRs.** When a decision changes, write a new one and amend the old one's status line — that line is the only edit an accepted ADR ever receives.

```
Status: accepted | superseded | proposed
Supersedes: 0004          # this decision replaces that one
Superseded by: 0009       # added to the old ADR when it is replaced
Refines: 0002             # narrows or fixes a boundary without replacing
Refined by: 0005, 0006    # the reverse link, so a reader sees it from either end
```

Relationships are recorded from both ends. A reader landing on ADR 0002 must be able to tell it has been refined without having read 0005.

There is no periodic re-review. The review point is `proposed → accepted`; after that an ADR changes only by being superseded.

Consolidation belongs in `CONTEXT.md`, which is the derived current-state view. Two layers: the glossary says what is true now, the ADR log says how it got that way.

## When to update CONTEXT.md

Whenever a term is coined, sharpened or retired — in the same conversation, not later.

`CONTEXT.md` is a **glossary, not a design doc**. No file formats, storage, or rendering libraries. If a definition mentions JSON, ELK or React Flow, it belongs somewhere else.

Use `_Avoid_` actively — it carries as much weight as the definition, because it is what stops the next session reintroducing a term that was deliberately rejected.

## Renames

Code should speak the glossary's vocabulary. Where it doesn't yet, AGENTS.md records the divergence as a gotcha and the tracker carries a ticket to close it.

Never let a rename ride along with a structural change. Separate commits — otherwise the diff is unreadable and, when something breaks, you cannot tell which change did it. Retiring the authored Node and the pending `path` → `Route` rename were split for exactly this reason.

A repo-wide rename conflicts with everything, so it should run alone, and early. Every ticket completed before it adds new surface in the old vocabulary.

**Write it as a tracked codemod, not a `sed` one-liner.** Two live under `.scratch/thing-and-diagram/` — `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs` and `.scratch/thing-and-diagram/rename-card-to-thing.mjs` — and they are tracked so a branch that was in flight rebases onto the commit before one and replays it rather than hand-merging several hundred files. Read a header before writing the next one: each records the mask-then-rewrite-then-unmask design, the spellings it must not change and, separately, **the files it must not open at all**, which is the distinction both scripts learned the hard way — the first version of one renamed a real npm package out of the lockfile, invisible locally because `node_modules` already held the right name and fatal only on CI's clean install. Each also lists what it deliberately does **not** produce, because those are the edits a replaying branch has to take from the merge.

**Check the replay rather than trusting it.** Diff the result against the merge and expect a handful of comment-only differences: that is how change one's review found six sites where a masked spelling had frozen a verb sense or an unmasked one had swept it, and how the second replay found two `.scratch/` efforts cited without their directory prefix, which no citation mask could see. A `--dry` that reports no change says the mask table and the tree agree — not that a replay needs no reading.

**Merge with `-M20%`.** A rename that rewrites most of a file's lines falls under git's default 50% similarity and git stops reporting it as a rename at all: `layout-resolution.ts` → `map-resolution.ts` did, and a reviewer then reads a deletion and an unrelated addition instead of a move.

**And the rename is not finished until `test/unit/current-domain-vocabulary.test.ts` can prove it.** Every completed rename here has a block there reporting the retired word in the identifier shapes it was written in, because a manual sweep misses sites and the scan is what found them. Write the **kebab-case** arms: a hyphen is not a word character, so `\b` lands either side of the retired word and every PascalCase and camelCase arm reads straight past `resource-not-found`, `space-must-keep-map` and `.canvas-resource` — which is the shape a rename mostly carries. That instrument also decides whether a candidate name is affordable at all: ADR 0085 rejected *Object* because the same scan would need 287 exceptions, which is no guard.

## Verification bar

Also stated in AGENTS.md; repeated here because it is the easiest step to skip.

- `pnpm verify` for every change.
- `pnpm e2e` as well for any UI or graph change.
- Report the real output. Never assert success without having run the command.
- A behaviour-preserving refactor should leave e2e green **and unchanged**. That is the guard that proves it was behaviour-preserving.
- Prove a bug fix against the defect, not only against a test written afterwards to pass. A test you wrote to match your fix will pass whether or not the fix addresses the real problem — reproduce the broken behaviour first, then show it gone.

## What a comment may assert

A comment may only assert what its writer has checked. Ticket 14 shipped three that had not been, and every one was verifiable in the minute it would have taken to open the file named in it.

**A negative result belongs in a ticket, never in source.** "X was tried and reverted because it broke Y" forecloses the work, reads as settled because it is in the source, and is never re-run. `App.tsx`'s `entityActions` carried one — six embedded-Map tests said to fail under `useMemo` — copied from a handoff bullet into a ticket into the source, and it did not reproduce. Put the finding in `.scratch/<feature>/`, dated and attributed, where a reader can see it is a report.

**No measurement in source.** Commit the instrumentation or put the number in the ticket with the method that produced it. A count whose bench is gone cannot be refreshed or falsified.

**A claim about another module names the test that holds it.** That family of test already exists for exactly this: `test/unit/command-surface-sharing.test.ts`, `codemirror-encapsulation.test.ts`, `graph-package-surface.test.ts`, `current-domain-vocabulary.test.ts`. "`EmbeddedMapAuthoring` calls `useCanvasResourceAuthoring` without `resourceEntityActions`" is one line of test; written as prose instead, its second clause was false. A subagent's summary is a report, not a fact — read the file before it becomes a sentence in the source.

**A decision called load-bearing needs something that fails when it is reversed.** This ticket documented its reconciliation order that way; swapping the two calls broke none of the five cases, because they all read Navigation, which the repair fixes either way.

None of these is lintable. They hold in review, so a review of this repo should ask of any comment in the diff whether the code supports what it says.

## What a comment may carry

A comment states what the code does, why, and the invariant it keeps, in the present tense and about the code as it stands. It does not narrate lineage. An ADR or ticket citation stays only where the constraint it names cannot be seen in the code itself. This covers every comment in a tracked code file (`.ts`, `.tsx`, `.css`, `.prisma`), tests and stories included. Apply it one sentence at a time, in this order:

1. **Is the sentence lineage?** Ask: _would it still be true, and still worth saying, if the code had been written this way from the start?_ If not, it is lineage. Lineage covers what the code replaced, what was retired, deleted or renamed, what this code or another module "used to" do or "was once", what a surface that has gone did, which ticket or ADR introduced it, and an alternative that was tried or considered and then rejected. The usual signal words are _replaces/replaced, retired, no longer, used to, was once, previously, formerly, the old, went with, is gone, now_ (when it contrasts with a before). **The words alone decide nothing.** They are lineage when their subject is the source code or the design. They are behaviour when their subject is runtime state. "An outcome about a replaced Space is discarded" describes Space replacement, which happens while the program runs, so it stays. "`SpaceCanvas` used to pass only `minZoom`" describes an earlier version of the file, so it goes.
2. **Remove lineage, but keep the invariant it was protecting.** If the history was there to stop someone undoing something, rewrite it as a present-tense constraint that says what breaks: "Do not X: X causes Y." A rejected alternative may appear only as the thing the constraint forbids, never as the story of how it came to be rejected. If no invariant is left once the history is gone, delete the sentence.
3. **Keep a citation (`ADR NNNN`, `.scratch/…`, a ticket number) only if both of these hold:** the sentence states a constraint a reader could not recover from the code in front of them, and the cited document is where the reasoning for that constraint lives. Most often this is a decision forbidding a change that looks obvious: adding memory, deriving something that is stored, collapsing two things that are separate on purpose. Remove the citation when it only records which ADR or ticket produced the code, when the code already shows the rule it names, or when it points at a resolved ticket as provenance. A `.scratch/` citation stays only while that ticket is open **and** the comment states the limitation the ticket tracks. Once the ticket resolves, the citation goes, and so does the limitation if it has been fixed.
4. **The four rules above still apply** to whatever is left: no negative result, no measurement, a cross-module claim names its test, and anything called load-bearing has something that fails when it is reversed.

**Where lineage goes instead.** What changed and why belongs in the **commit message**, which is the default home and is always one `git log -L` or `git blame` away. A decision and the alternatives it rejected belong in an **ADR**: [When to write an ADR](#when-to-write-an-adr) already asks for the rejected alternative and the cost accepted. A negative result, a measurement, or an open follow-up belongs in a **ticket** under `.scratch/<feature>/`. None of these goes stale in the source, because none of them is in the source.

**What the rule does not touch.** Tool directives (`eslint-disable…`, `@ts-expect-error`, `prettier-ignore`) keep their syntax, and only their free-text reason is held to the rule. Two kinds of comment are **required** by a gate, so shortening one must leave what the gate reads. A `SAFETY:` comment before a type assertion is enforced by oxlint's `anti-slop/require-safety-comment-for-type-assertion`. The comment inside an intentionally empty block is what satisfies ESLint's `no-empty`. Finally, a few comments are text that a repository-scanning test asserts is still present, such as the retirement notice on `core`'s space-file schema. Those are listed in `.scratch/code-quality/issues/01-write-the-source-comment-rule.md`, and changing one means changing its test in the same commit.

### Lineage: before and after

`packages/app/src/components/CommandDock.tsx`, closing the module's doc comment:

```ts
// Before
 * It replaces `SpaceSidebar` and `OpenSpaceSidebars`, which ADR 0082 retired
 * along with the gutter they stood in
 * (`.scratch/command-dock/issues/07-promote-the-dock-and-retire-the-space-sidebar.md`).
 */

// After: the paragraph is deleted. It is pure lineage, and the ticket it cites
// is resolved. What the Dock *is* is already stated by the paragraphs above it.
 */
```

`packages/app/src/camera.ts`, on `PRESENTING_DURATION`:

```ts
// Before
/**
 * How long the move onto the presented resource takes.
 *
 * One duration, because there is one move (ADR 0044). It replaced a 400ms pan
 * plus a 300ms close-in and was set to sit between the two totals.
 */

// After: the replaced pan and close-in are history. "One move" is the
// constraint, and it can be seen in the single constant, so the citation goes too.
/** How long the move onto the presented resource takes: one duration, because there is one move. */
```

`packages/app/src/components/ChromeContinuation.tsx`, on `elementOf`. The before text is the paragraph that begins "It used to own a `sidebar-row` kind beside this one". It explains a lookup that no longer exists and a surface that has gone. The after text is nothing: once that story is removed, the sentence has no invariant left to keep.

### Lineage reduced to its invariant

`packages/graph/src/placement.ts`, on `roomAxis`:

```ts
// Before
 * **One axis, and `x` first**, because the half-plane rule ADR 0084 stated —
 * any Resource strictly past the subject's origin on an axis takes that axis's
 * growth — moved a Resource beside the subject by the whole height growth for
 * being one unit lower than it. …

// After: the story of the earlier rule goes. The trap it guarded stays, as a constraint.
 * **One axis, and `x` first.** A Resource clear on `x` is clear of the grown
 * rect after taking the width alone. Do not also move it on `y`: a Resource
 * beside the subject and one unit lower would take the whole height growth.
```

### A citation that stays, and one that goes

This one stays. In `displace` in `packages/graph/src/placement.ts`:

```ts
 * repaired — clamping it, or remembering which Resources a particular Open pushed,
 * is the per-Resource history ADR 0084 rejected for making two identical Maps
 * behave differently.
```

The constraint is that Open and Close are memoryless and must not record who was pushed. That is something the code cannot show, because absence of state is invisible, and the obvious "fix" for the stated asymmetry is exactly the thing forbidden. ADR 0084 is where the reasoning lives. Keep it. (The sentence would read better as the constraint first — "Do not remember which Resources an Open pushed: two identical Maps would then behave differently (ADR 0084)" — but the citation earns its place either way.)

This one goes. In `packages/graph/src/snapshot-edits.ts`, the module summary:

```ts
// Before
 * a Resource joins, grows, shrinks or leaves a Map — Add, Open, Close, Resize,
 * Remove from Map, Delete from Space (ADR 0084, ADR 0086).

// After: the list of Edits is the code's own exports, and the ADRs only record
// where those Edits were decided.
 * a Resource joins, grows, shrinks or leaves a Map — Add, Open, Close, Resize,
 * Remove from Map, Delete from Space.
```

## Skills

Vendored skills are tracked, so every clone and worktree has them. The files live under `.agents/skills/` — the repo-wide location Codex reads — and `.claude/skills/` holds a symlink per skill, which is where Claude Code reads. `skills-lock.json` records the upstream path and content hash of each, and is tracked with them; without it the vendored copies have no recorded revision and the installer can't tell what's drifted.

Tracking both paths is deliberate. An ordinary `git worktree add` populates only tracked files, so while these were ignored every worktree ran agents with no skills at all — and tracking just one of the two locations fixes just one of the two harnesses.

The set is deliberately small: `shadcn` (from `shadcn/ui`) and the repo-owned
`shadcn-first-ui` production workflow are vendored.

The [`mattpocock/skills`](https://github.com/mattpocock/skills) pack was vendored here previously and has been removed. Most of its names (`codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`, `tdd`, `wizard`, `writing-for-agents`, and more) collided with Claude Code's built-in skills of the same name, and a vendored skill of that name shadows the built-in rather than sitting beside it — the same problem `code-review` hit earlier. Don't reinstall it; if a specific skill from that pack is wanted again, vendor it individually under a name that doesn't collide with a built-in.
