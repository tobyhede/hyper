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

The most valuable ADRs capture a **negative** — the thing a future review will otherwise re-suggest. ADR 0005 exists mainly to say *don't introduce an Arrangement type*; ADR 0004 to say *don't reintroduce a placement layer*. Both are things that look like improvements until you know why they were rejected.

Skip ADRs for ephemeral reasons ("not worth it right now"), self-evident choices, and anything the glossary already implies.

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

## Verification bar

Also stated in AGENTS.md; repeated here because it is the easiest step to skip.

- `pnpm verify` for every change.
- `pnpm e2e` as well for any UI or graph change.
- Report the real output. Never assert success without having run the command.
- A behaviour-preserving refactor should leave e2e green **and unchanged**. That is the guard that proves it was behaviour-preserving.
- Prove a bug fix against the defect, not only against a test written afterwards to pass. A test you wrote to match your fix will pass whether or not the fix addresses the real problem — reproduce the broken behaviour first, then show it gone.

## Skills

Vendored skills are tracked, so every clone and worktree has them. The files live under `.agents/skills/` — the repo-wide location Codex reads — and `.claude/skills/` holds a symlink per skill, which is where Claude Code reads. `skills-lock.json` records the upstream path and content hash of each, and is tracked with them; without it the vendored copies have no recorded revision and the installer can't tell what's drifted.

Tracking both paths is deliberate. An ordinary `git worktree add` populates only tracked files, so while these were ignored every worktree ran agents with no skills at all — and tracking just one of the two locations fixes just one of the two harnesses.

The set is deliberately small: only `shadcn` (from `shadcn/ui`) is vendored.

The [`mattpocock/skills`](https://github.com/mattpocock/skills) pack was vendored here previously and has been removed. Most of its names (`codebase-design`, `diagnosing-bugs`, `domain-modeling`, `grilling`, `prototype`, `research`, `resolving-merge-conflicts`, `tdd`, `wizard`, `writing-for-agents`, and more) collided with Claude Code's built-in skills of the same name, and a vendored skill of that name shadows the built-in rather than sitting beside it — the same problem `code-review` hit earlier. Don't reinstall it; if a specific skill from that pack is wanted again, vendor it individually under a name that doesn't collide with a built-in.
