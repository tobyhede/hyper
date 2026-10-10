# 07: Move the `ui` and persistence detail into their guides

**What to build:** AGENTS.md's `ui` package entry and its ADR 0095 SQL-repository entry each shrink to a responsibility plus the rules that still guard something, such as "do not restore `AddResourceControl`" and "do not add a second picker for choosing a Resource". The remaining detail moves to the UI guide and the editing-and-persistence guide. Deletion history is dropped.

**Blocked by:** 01.

**Status:** resolved

- [x] Each rule from the two entries is in exactly one place.
- [x] Phrases like "is gone", "went", "spent a while with none" and "this file used to record" are gone from the entries and from the guides they move into.
- [x] The citation and vocabulary unit tests pass.

## Answer

AGENTS.md's `ui` entry is now its responsibility, `core`-only dependency, and the two guarding rules with their reasons: do not restore `AddResourceControl`, do not add a second picker for choosing a Resource. Its ADR 0095 "Decided" entry is a pointer naming the open ticket (`.scratch/database-persistence/issues/35`).

Where the `ui` detail went, all in `docs/agents/ui.md`:

- Choosing a Resource (`ResourcesPopover`'s two purposes, `connectChoices`, the New Resource row, the second-picker rule) → new bullet "Choosing a Resource is the Resources list".
- `CreatePeers`, its four glyphs, the image file picker, no Reference glyph, `AddResourceControl`, the one-row Resources cluster and its two `parity-claims.ts` claims → new bullet "Creation is one press per kind".
- Sidebar, Sheet, Drawer, Tabs, `insetEnd`, the Open Spaces menu, `open-space-status.ts`, `skeleton.tsx` → new bullet "The chrome has no Sidebar, Sheet, Drawer or Tabs", stated as the present constraint (ADR 0082). The `shadcn-first-ui` skill now points at `ui.md` alone for why.
- `Textarea` and `multiline` → new bullet on `InlineTitleEditor`.
- `MarkdownSourceEditor`, `markdown-source-editor-lazy.ts`, `PANE_OWNED_KEYS`, `.cm-*`, `codemirror-encapsulation.test.ts` → new bullet.
- The neutral Resource rail and the Active Graph's colour → the Command Dock bullet, after `command-surface-sharing.test.ts`.
- `ChoiceMenu`, `Select` and `Dialog` with no consumer, `ResourceSearchCombobox` → already in `ui.md`; rewritten in present tense.

Where the ADR 0095 detail went: `docs/agents/editing-and-persistence.md`, new section "The SQL repository (ADR 0095)" — the one repository and its two stores, ADR 0096, `decideCommit` as the one validator, the fast path's Meta read, the shared repository contract, the raw single parse, failure classification and `classifyStoredFailure`, `verifyMarker: false` as a present constraint. The revision codec was already there.

Lineage removed from both guides: in `ui.md` the `ResourcePane` story (kept as the example the "tested against the primitive" rule needs), the Base UI migration narrative and the stale `PopoverAnchor` (no such export exists), the continuation's six mechanisms, `sidebar-row` and former `ContinuationControl` members, "this file used to record", "spent a while", "is gone", "no longer", "still", the dead-rule discovery story; in `editing-and-persistence.md` "is gone", "used to", "formerly", "now", "gained", "no longer exists", and the `int8` workaround history. `grep -E 'is gone|are gone|went |used to|no longer|spent a while|this file used'` over both guides finds only runtime senses ("the aggregate no longer serialises to", "a build that is gone").

Checks: the five doc/skill unit tests (129 passed). AGENTS.md 51,296 → 40,930 bytes.
