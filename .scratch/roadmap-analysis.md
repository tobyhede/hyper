# Historical roadmap audit notes

Status: historical

This is an earlier audit snapshot, not the current implementation schedule.
Its counts, build-status claims and suggested edits have since changed. Use
`pnpm roadmap`, the issue files and [the release handoff](v1-release/issues/15-complete-the-v1-release-handoff.md)
for current work. The notes below are retained as history and are not commands
to reapply.

---

Changes to align the V1 issues

Every item below was verified against the tree by a separate agent. Items the
first draft carried that proved false or already done are listed in section 9
with the evidence that retired them.

Already done

- The tool scripts/roadmap.ts now reads all lines of a Blocked by: paragraph.
  FIELD_PATTERN plus a continuation loop, scripts/roadmap.ts:108 and :188-197.
- The critical subgraph now shows 10 tickets. It showed 8 before. The two
  additions are entity-url-addressability/08 and v1-release/06.
- The generated Space in .scratch/v1-release/roadmap-space/ is new. It has 17
  cards: 10 critical and 7 parallel. The directory is gitignored.
- Two tests in test/unit/roadmap.test.ts keep the parser correct. 31 pass.
- Nothing is committed.

1. Correct the build status in the documents

- In v1-release/10, correct three rows of the status matrix. These items are
  complete: alias-cards/06 (:34), v1-release/02 (:36), layout-only-v1/01 (:38).
- In v1-release/10, correct the prose for architecture-review/12 and
  architecture-review/13. They own no matrix row. They appear at :31, :44,
  :52-56, :57-60 and in the decisions list at :87-89. Both are resolved.
- Say that architecture-review/13 resolved as a negative diagnostic. It found no
  semantic drift, so no refactor landed and its criteria are deliberately
  unticked. Its artifact is test/integration/aggregate-commit-differential.test.ts.
  Do not describe it as built work.
- In v1-release/10, correct line 71. It says Add Layout is to be made empty and
  that neither that nor the Computed View removal is built. The Add Layout half
  is built.
- In v1-release/10, add the date of the audit. map.md:51-53 indexes it under
  "Decisions so far" and delegates the detail to it.
- In v1-release/12, do not delete Wave 0 and Wave 1. Strike the completed items
  from each and keep the rest. Wave 0 holds v1-release/20, layout-only-v1/01,
  /02 and /03; only layout-only-v1/03 is open. Wave 1 holds architecture-review
  12, 13 and 14 with alias-cards/06, v1-release/02, /17 and /18 in its parallel
  lane; architecture-review/14 and v1-release/17 are open.
- The remaining early work is three tickets, not two: layout-only-v1/03,
  architecture-review/14 and v1-release/17.
- In v1-release/12, change the words "critical path" to "critical subgraph".
  Commit 3ce95090 renamed ReleasePlan.criticalPath, deleted the longest-path
  machinery and added includeTiedCriticalPredecessors. The phrase also lives in
  the ticket's filename, in map.md:59 and in v1-release/13. Renaming the file
  breaks the map.md:58 link, so that is a decision, not an edit.
- In v1-release/15, delete architecture-review/12, architecture-review/13,
  alias-cards/06, v1-release/02 and v1-release/18 from step 1. Keep
  architecture-review/14 and layout-only-v1/03. This document already says
  layout-only-v1/01 and /02 are built, so it is ahead of v1-release/10 and /12.
- In v1-release/11:87-90, rewrite the prerequisite. It is one sentence naming
  architecture issues 12, 13 and 14, and 14 is still open. Name 14 alone and
  shrink the three-seam clause that follows it.
- In v1-release/20, leave the sentence "The code is unchanged". It sits under
  "What this deliberately did not do" and describes ticket 20's own landing
  commit af76bc0f, dated 2026-09-01. layout-only-v1/01 and /02 landed their code
  on 2026-09-02 in 00b2fea5 and a4a99c9b. The sentence was accurate when written
  and the paragraph around it still is: Computed Views, defaultRenderer and the
  Create Layout conversion are all still in the tree.

2. Delete the settled blockers

Every pair below is listed today and every named blocker is settled. Verified
against ticket status and against the tool's own unmet-blocker computation.

- In v1-release/01, delete architecture-review/12. The list becomes none.
- In v1-release/06, delete layout-only-v1/01, alias-cards/06 and v1-release/02.
- In v1-release/07, delete 02, 18, 20 and alias-cards/06.
- In v1-release/08, delete architecture-review/12.
- In v1-release/16, delete alias-cards/06.
- In v1-release/19, delete 02, 18, 20, architecture-review/13 and alias-cards/06.
- In entity-url-addressability/07, delete v1-release/20.
- In layout-only-v1/03, delete layout-only-v1/02. The list becomes none, which is
  what makes it the pickable head of Wave 0.
- In layout-only-v1/04, delete layout-only-v1/02.

Two hazards in the execution:

- v1-release/07:12-14 and v1-release/19:11-13 both say v1-release/20 is the one
  durable Layout-only prerequisite the ticket names. Deleting the reference from
  the Blocked by line without rewriting that paragraph leaves each ticket naming
  a prerequisite it no longer names. v1-release/16:10-11 has the same shape: the
  alias-cards/06 entry carries a trailing description.
- v1-release/01 and layout-only-v1/03 end with an empty field. An empty capture
  parses, but the convention in v1-release/02, /05, /18 and /20 is the explicit
  "Blocked by: none". Write none.

3. Remove the double ownership

- In v1-release/04, strike the four open criteria. All four map one to one onto
  layout-only-v1/01, three as supersets and one near-verbatim. This is tidy-up,
  not a live defect: the ticket already records the transfer in prose at :15-17
  and its status of superseded already excludes it from the roll-up.
- In entity-url-addressability/07, delete the stored-selection criterion at
  :28-29. layout-only-v1/04 owns it at :12-13 and :21-22, and both tickets say so
  themselves at entity-url-addressability/07:14-15 and layout-only-v1/04:28-29.
- Divide the Opening criterion three ways, not two. layout-only-v1/04:18-20,
  entity-url-addressability/07:31 and entity-url-addressability/08:15-16 all
  carry it. Fixing only the first two leaves the third holding a copy.
- Leave entity-url-addressability/07:23-27 and layout-only-v1/04:14-15 alone.
  They look alike and are not: the first is a newly created target that begins
  complete, the second a pre-existing layoutless target that waits for
  initialization.

4. Correct the references

- In layout-only-v1/03, name the two sites that fall outside every category the
  criterion lists. The criterion at :17-20 names schemas, snapshots, HTTP,
  repositories, authoring, navigation, fixtures, seeds, stories and tests; there
  is no file list to append to. scripts/roadmap.ts:766 writes defaultRenderer
  into the generated Space and scripts/ is in no category. src/export/export-space.ts:107
  and :109 write it from the CLI exporter and neither export nor CLI is in one.
  v1-release/08:61 claims the aggregate format but not the exporter code.

5. Correct the sequence

- In v1-release/12 and v1-release/15, do not call v1-release/01, v1-release/08
  and entity-url-addressability/07 parallel work. v1-release/08 is three links
  after entity-url-addressability/07 by the only path there is:
  eua/07 to space-cards/01 to layout-only-v1/04 to v1-release/08. Depths are
  layout-only-v1/03 0, eua/07 1, space-cards/01 2, layout-only-v1/04 3,
  v1-release/08 4. v1-release/15:61-65 states it flatly; v1-release/12:31 hedges
  in the same row that V1/08 closes in Wave 3, so 12 is half right and 15 is not.
- In v1-release/12, move entity-url-addressability/07 to Wave 1, not Wave 0. Its
  one open blocker is layout-only-v1/03, and layout-only-v1/03 is Wave 0. The
  document already applies that rule at :29 to keep layout-only-v1/04 out of
  Wave 0.
- In v1-release/12 and v1-release/15, do not put space-cards/01 and
  space-cards/10 together. The sequence is sc/01, lo/04, v1/08, sc/10, at depths
  2, 3, 4 and 5. v1-release/15:66-68 is wrong twice: it pairs the two ends of the
  chain and demotes layout-only-v1/04, the gate between them, to a trailing
  clause. v1-release/12:32 gets the order right in its must-complete column and
  contradicts it in its parallel column.
- In v1-release/12 and v1-release/15, point to the output of pnpm roadmap and
  delete the prose graph. There are exactly three copies: v1-release/12:27-39,
  v1-release/15:44-98 and the tool. They disagree with the tool and, more
  importantly, with each other. 12 puts layout-only-v1/03 in Wave 0 and 15 folds
  it into step 1. 15's steps 2 and 3 are circular: step 2 builds v1-release/08,
  which is blocked by layout-only-v1/04, which step 3 builds. Both still
  schedule architecture-review/12, /13, alias-cards/06 and v1-release/02, all
  settled. Deleting 15's steps 1 to 3 is the load-bearing part of this change.

6. Align the Definition of Done

v1-release/14:21 forbids closing a checkbox without a direct evidence link, a
named owner and an explanation of what the evidence proves. Each tick below
carries its evidence and owner.

- :79-80 Add Layout. space-authoring.ts:849 and e2e/editing.spec.ts:629. Owner
  layout-only-v1/01.
- :83-84 The last Layout cannot be deleted. space-authoring.ts:884 and
  space-authoring-operations.test.ts:783. Owner layout-only-v1/01.
- :18-23 A layoutless Space initializes on first working load.
  packages/persistence/src/working-space.ts and seven cases in
  working-space.test.ts. Owner layout-only-v1/02. Record with the tick that the
  persisted key is still defaultRenderer, not defaultLayout, until
  layout-only-v1/03. The behaviour holds; the name in the line is ahead of the
  code.
- :56 An Alias Opens on its Target read-only. e2e/overview.spec.ts:406. Owner
  alias-cards/06.
- :57 Editing an Alias changes its own Title and Layout state.
  space-authoring.ts:980 and space-authoring.test.ts:519. Owner alias-cards/06.
- :40-42 The right Cards drawer. CardsDrawer.tsx:124, editing.spec.ts:1371 and
  :1513. Owner v1-release/02.

Four more lines are complete and unticked, all owned by tickets already done:

- :78 Layouts can be created, renamed, selected and deleted.
  e2e/editing.spec.ts:629-670 does all four through reload. Owner layout-only-v1/01.
- :85-86 Each Layout independently owns its membership and state. Owner
  layout-only-v1/01.
- :87 Deleting a Layout does not delete its Cards. space-authoring.ts:878 and
  space-authoring-operations.test.ts:774. Owner layout-only-v1/01.
- :55 Creation chooses one immutable Markdown Target. e2e/editing.spec.ts:2889.
  Owner alias-cards/06.

- Correct the pointer on the line "Save failure and revision conflict are visible
  and recoverable." It is owned in halves, not unowned: v1-release/17:13-16 owns
  the distinct refusal states, architecture-review/14:37 owns cross-Space
  switching and closing, and v1-release/07 owns proof of the one-Space behaviour,
  which is built at PersistenceControl.tsx:132 and App.tsx:1057. The defect is
  that v1-release/10:41 still routes the first half through space-cards/12, which
  is superseded.
- Give one owner to the narrow-screen line at :129. v1-release/06:14 already is
  that owner: it restates the line verbatim and is blocked by 02, 03 and 05, so
  the roll-up is encoded. Reword v1-release/03:19 and v1-release/05:16 to their
  own surfaces rather than the whole V1 workflow.
- Do not read :152-154 as evidence for :82-83. The scope decision is ticked
  because ADR 0079 is decided; the behaviour line stays unticked because
  layout-only-v1/03 is unbuilt.

7. Make the open decisions

- Decide interaction-draft-invalidation/04. It is ready-for-human and blocks
  v1-release/06 and /07. It has no blockers of its own, so it sits on no critical
  path and deleting it shortens nothing. ADR 0042 requires the discard, so the
  only open question is whether the loss is acknowledged: a status line after the
  fact, or a confirmation before Accept remote. Retention is ruled out by the
  ticket. It is needed for V1 because definition-of-done.md:176 defers the
  neighbouring concern only "provided no authored draft is lost". Recommend the
  status line, scoped to the Markdown body draft and reported from App
  composition where Navigation resets, per the ticket's own direction at :63-70.
  Blocking v1-release/06 is weak; blocking v1-release/07 is right.
- Decide whether to reopen space-cards/10, and prefer not to. This exact question
  was open decision 5 in v1-release/10:104-106 and v1-release/11 answered it yes
  at :70, :77-79 and :93 before reaching resolved; v1-release/19 encodes that
  answer. The arithmetic in the first draft holds: dropping it shortens the chain
  to the checkpoint from 8 to 6 and to v1-release/07 from 9 to 7, because it also
  drops entity-url-addressability/08 off the longest path. But it costs edits to
  eua/08:9, v1-release/19:5 and v1-release/07:5 plus amendments to two resolved
  tickets, and it leaves the checkpoint claim "Multi-Space behavior is
  repeatable" with no owner.
- Decide the ancestor-chain question before touching space-cards/11.
  space-cards/11:11 requires the loader to carry the complete chain of containing
  Space ids and says not to make ancestry optional. entity-url-addressability/08:19-21
  says navigation performs no second cycle check and carries no ancestor chain.
  They contradict each other, so tagging space-cards/11 release/v1 or moving its
  content into eua/08 is a decision, not a chore. space-cards/11 is currently
  orphaned: it carries no Tags line and nothing in the repository references it.
- Decide whether to rename 12-decide-the-v1-critical-path.md. The vocabulary
  change reaches the filename, and renaming breaks the map.md:58 link.

8. Checks now done

- v1-release/14 is read. It is resolved, both its blockers are resolved, and
  v1-release/07 implements it. Three of its requirements constrain the work
  above: :21 forbids closing a checkbox without evidence, owner and explanation;
  :78-81 requires each gate command to pass on its first recorded attempt, so a
  passing retry is feedback under ticket 13 and not a green gate; and :74-75
  requires the PostgreSQL proof to include the destructive export, reset and
  import path, which is stronger than definition-of-done.md:141. :24-26 also
  requires a retired Computed View claim to be corrected in the Definition of
  Done rather than proved, waived or deferred.
- architecture-review/14 is compared against the code, and the first draft named
  the wrong file. packages/ui/src/OpenSpaces.tsx is a presentation-only tabs
  component that disclaims ownership of selection at :30 and cannot hold session
  state under the package boundaries. The comparison targets are
  packages/app/src/open-space.ts, packages/app/src/space.ts and
  packages/persistence/src/session-registry.ts. Against those, all six
  implementation criteria and all six criteria absorbed from space-cards/12 are
  unmet: open-space.ts:25 still carries the registry default the ticket calls
  out, createStoredSpaceOpener still mints a second registry at :47, the registry
  interface at session-registry.ts:56-61 is still open/session/entry/spaceCards
  with no enter, switch or close, and no per-Space retained selection exists
  anywhere. Its PR 134 foundation is the one part that is built.
- OpenSpaces.tsx is a separate, real gap and belongs to a different ticket. The
  component and its OpenSpaceSidebars wrapper are built and story-covered but
  have no application path: nothing reachable from App.tsx mounts them. That is
  entity-url-addressability/08's work.

9. Items retired from the first draft

- "In v1-release/10, delete the reference to ADR 0077. The ADR is a draft."
  ADR 0077 is Status: accepted and indexed at docs/adr/README.md:70. No ADR under
  docs/adr/ is a draft. The citation at v1-release/10:93-100 is one clause
  forbidding a merge reading of the destructive recovery step, not a
  specification pointer for import. Repointing it at v1-release/08 would swap a
  live ADR for a ticket that cites the same rule.
- "In space-cards/12, write the status." It has one: superseded by
  architecture-review/14, which the parser maps to dropped at
  scripts/roadmap.ts:137. The related claim does hold, and needs nothing done:
  v1-release/12:50-51 says architecture-review/14 absorbs it, and ar/14:82-93
  carries all five of its criteria plus a sixth.
- "In create-a-layout-from-the-selected-computed-view/01 and 02, write the
  status." Both have one, both parse to dropped, and v1-release/20 does not
  replace them. It records their retirement at :59-64 and names the replacements
  the tickets already name: ADR 0079 with layout-only-v1/01 and /03.
- "Give an owner to the copy-link line." It is owned and already ticked at
  entity-url-addressability/05:13 and /04:14. definition-of-done.md:115 needs the
  link, not an owner.
- "In v1-release/20, delete the sentence 'the code is unchanged'." See section 1.
  Editing a resolved ticket's record to reflect work that landed after it would
  falsify the record.
- "Delete Wave 0 and Wave 1. All four items in these waves are complete." The two
  waves hold six must-complete and four parallel items. Three are open. The
  instruction as written would delete live work.
- "Keep layout-only-v1/03 and architecture-review/14 as the only early work."
  v1-release/17 is also open and sits in Wave 1's parallel lane. It was confused
  with v1-release/18, which is resolved.
