# 01: Replay the ADR 0085 vocabulary rename across the branch's own history

**What to build:** `design-iteration-cards` still sits on the base it sits on today, but every commit in it speaks Thing and Diagram rather than Card and Layout. The Command Dock surface work and the Things list are unchanged in behaviour and unchanged in structure — only spelled differently. Nothing has touched `origin/main` yet.

The branch is two commits over a base that predates ADR 0085's two-part sweep. A dry-run merge against current `origin/main` reports thirty conflicted paths, and normalising main's side of them back through the rename mapping shows that roughly ninety-five percent of that volume is a one-for-one spelling swap: the genuine upstream change under the contested files is about a hundred and seventy lines. This ticket removes the mechanical ninety-five percent before anything tries to merge it, so that the ticket which does merge is reading real disagreements instead of hunting them.

`origin/main` ships the two instruments for exactly this case, tracked under `.scratch/thing-and-diagram/` and named in their own headers as the thing a branch in flight replays rather than hand-merging. Read the Layout script's header first; the Card script's header states only what differs about the harder word. Each replay is followed by a repository-wide Prettier write, which is not optional — the new nouns are shorter, lines re-wrap, and `format:check` is red without it.

**The decision this ticket encodes, and the failure it avoids:** the rename applies to the branch's **merge base as well as its two commits**, not to the tips alone. Rewriting only the tips leaves each commit's patch context written in the retired vocabulary, so every hunk fails against a main that has already moved — the conflict set does not shrink, it merely changes shape. Rewriting the range from the merge base outward makes the two branch patches Thing-vocabulary diffs against Thing-vocabulary context, which is what collapses thirty conflicted paths to six files of real residual.

Four things the scripts deliberately do not produce, because none of them is a spelling. They are not defects in the replay and they are not this ticket's to invent: the domain-initial callback bindings over Thing collections, `AGENTS.md`'s own ADR 0085 entry, the prose explaining the content-alias that the sweep deleted, and the sweep's guard block in the vocabulary test. All four arrive with the rebase in ticket 02.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [ ] Every commit in the branch's range, its base included, is rewritten with both rename scripts applied and Prettier run after each.
- [ ] The branch's new modules, stylesheets, stories, unit tests and Playwright specs carry the renamed noun in their filenames as well as their contents, and each still sits beside the module it belongs to.
- [ ] The shadcn registry carve-out is untouched: the vendored module keeps its own exports, and the three stylesheet references to the registry's background token on this branch are unchanged. The scripts' protected list already covers them — confirm rather than assume.
- [ ] Migration snapshots are not swept. They are history, and a swept snapshot passes against an already-migrated local database while failing against a fresh one, which nothing in the normal bar can observe.
- [ ] `pnpm verify` is green on the rewritten branch, at its existing base.
- [ ] `pnpm e2e` and `pnpm e2e:ladle` are green on the rewritten branch, at its existing base. Both apply: the branch carries seven end-to-end specs, five catalogue specs and components that own stories.
- [ ] The behavioural diff against the pre-replay branch is empty — the rewritten branch differs from the original only in spelling. Say how this was established.

---

## What the replay found

**The branch is three commits over the base, not two.** `1f6675d7`, `3423d8ab` and `8d5e6a84` — the third closes the review findings on the Things list. Ticket 02's "two commits intact" reads the same way for three.

**There is a fifth thing the scripts do not produce, and it is not a spelling either.** Renaming a directory or a Title moves a row in an assertion written in sorted order, which no substitution rule can see:

- `test/unit/read-single-space.test.ts` sorts discovered Things globally by relative path. `cards/` sorted before `root.md`; `things/` sorts after it.
- `packages/app/test/snapshot.test.ts` round-trips its fixture array exactly, and intake sorts by Title. `Card` sorted before `Next`; `Thing` sorts after it.

Both are already settled on `origin/main` in exactly this shape, comment included — main's rename commit hand-fixed them. `rename/fixup-sort-order.mjs` replays that settlement so the branch is green at its own base rather than waiting for the rebase to hand it over. It refuses to run unless each block matches exactly once. **Ticket 02 will see both files as already-resolved at rebase**, and `read-single-space.test.ts` carries a *second*, unrelated upstream hunk from main (`19884ad2`, the strict space-file schema) which is a genuine residual and is 02's to absorb.

**How "differs only in spelling" was established.** Every rewritten tree is `prettier(fixup(card(layout(original tree))))` applied to the original commit's tree — `rename/replay.sh` does a `git read-tree --reset -u` of each original commit, runs the transform, and commits. No hunk is hand-applied and no patch is replayed, so there is no place for a behavioural edit to enter. Re-running the transform against the pre-replay tip reproduced the rewritten tip's tree hash byte-for-byte (`c86860ce`), which is what rules out a hand edit having crept in.

**The three carve-outs, confirmed rather than assumed.** `migrations/` differs by zero lines between the original base and the rewritten one. `packages/ui/src/components/card.tsx` is unchanged. The registry's seven exports survive in `packages/ui/src/index.ts`, with the `CardContent as CardSection` alias deleted as ADR 0085 requires, and the three `var(--card)` references this branch owns — one in `command-surface.css`, two in `things-popover.css` — are untouched.
