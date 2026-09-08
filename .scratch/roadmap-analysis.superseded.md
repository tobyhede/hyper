Changes to align the V1 issues

Already done

- The tool scripts/roadmap.ts now reads all lines of a Blocked by: paragraph.
- The critical subgraph now shows 10 tickets. It showed 8 tickets before.
- The generated Space in .scratch/v1-release/roadmap-space/ is new. It has 17 cards.
- Two tests in test/unit/roadmap.test.ts keep the parser correct.
- Nothing is committed.

1. Correct the build status in the documents

- In v1-release/10, correct five rows of the status matrix. These items are complete:
alias-cards/06, v1-release/02, layout-only-v1/01, architecture-review/12,
architecture-review/13.
- In v1-release/10, add the date of the audit. map.md points to this matrix as the
primary source.
- In v1-release/12, delete Wave 0 and Wave 1. All four items in these waves are
complete.
- In v1-release/12, keep layout-only-v1/03 and architecture-review/14 as the only
early work.
- In v1-release/12, change the words "critical path" to "critical subgraph". Commit
3ce95090 changed the model in the tool.
- In v1-release/15, delete architecture-review/12, architecture-review/13 and
alias-cards/06 from step 1.
- In v1-release/11, delete architecture-review/12 and architecture-review/13 from the
prerequisites.
- In v1-release/20, delete the sentence "the code is unchanged". Tickets
layout-only-v1/01 and 02 changed the code.

2. Delete the settled blockers

- In v1-release/01, delete architecture-review/12.
- In v1-release/06, delete layout-only-v1/01 and alias-cards/06.
- In v1-release/07, delete 02, 18 and 20.
- In v1-release/08, delete architecture-review/12.
- In v1-release/16, delete alias-cards/06.
- In v1-release/19, delete 02, 18, 20 and architecture-review/13.

3. Remove the double ownership

- In v1-release/04, delete the four open criteria. Ticket layout-only-v1/01 does this
work.
- In entity-url-addressability/07 and layout-only-v1/04, divide the criteria for the
stored Layout and Graph selection. Only one ticket must own each criterion.
- Add the tag release/v1 to space-cards/11, or move its content into
entity-url-addressability/08. Both tickets own the Enter operation. The roll-up does
not show space-cards/11.
- In space-cards/12, write the status. Ticket v1-release/12 says that
architecture-review/14 replaces it.
- In create-a-layout-from-the-selected-computed-view/01 and 02, write the status.
Ticket v1-release/20 replaces them.

4. Correct the references

- In v1-release/10, delete the reference to ADR 0077 for the import operation. The ADR
with this number is a draft and is not in force. Point to the criteria of
v1-release/08.
- In layout-only-v1/03, add scripts/roadmap.ts:752 to the list of sites. This line
writes the field defaultRenderer into the generated Space.

5. Correct the sequence

- In v1-release/12 and v1-release/15, do not call v1-release/01, v1-release/08 and
entity-url-addressability/07 parallel work. Ticket v1-release/08 is three links
after entity-url-addressability/07.
- In v1-release/12, move entity-url-addressability/07 to Wave 0. Only
layout-only-v1/03 blocks it.
- In v1-release/12 and v1-release/15, do not put space-cards/01 and space-cards/10
together. The sequence is sc/01, lo/04, v1/08, sc/10.
- In v1-release/12 and v1-release/15, point to the output of pnpm roadmap. Do not
write the graph again in the text. Three copies of the graph do not agree now.

6. Align the Definition of Done

- In definition-of-done.md, select the checkboxes for these complete items: Add
Layout, the refusal to delete the last Layout, the initialization of a layoutless
Space, and the two Alias read-only lines.
- In definition-of-done.md, select the checkbox for the right Cards drawer.
- Give an owner to this line: "Save failure and revision conflict are visible and
recoverable." Ticket v1-release/07 gives proof only.
- Give an owner to this line: "Copy-link commands expose canonical and contextual
meanings." No ticket owns it.
- Give one owner to the narrow-screen line. Tickets v1-release/03, 05 and 06 all name
it.

7. Make the open decisions

- Decide interaction-draft-invalidation/04. Its status is ready-for-human and it
blocks v1-release/06 and v1-release/07.
- If this decision is not necessary for V1, delete the ticket from the two blocker
lists.
- Decide if space-cards/10 must stay on the critical path. No line of the Definition
of Done needs a tracked fixture. This change makes the chain to the checkpoint six
tickets, not eight.

8. Do these checks

- Read v1-release/14 in full. The audit did not read it.
- Compare architecture-review/14 with the component packages/ui/src/OpenSpaces.tsx.
The audit did not do this comparison.