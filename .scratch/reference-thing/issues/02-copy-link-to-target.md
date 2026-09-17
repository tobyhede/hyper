# 02 — Copy link to Target

Status: done
Blocked by: none

**What to build:** A Thing-menu command on a Reference Thing that copies the
Target's canonical Thing URL.

**Why:** The grill settled Copy link to Target as the one “link” action. The
Target is often not on this Diagram, so the URL is the Target's Thing address,
not Thing-in-this-Diagram. Jump stays deferred.

May ship before or after issue 01. If it ships first, the menu still sits on an
Alias. If it ships after, the row is on a Reference Thing. Either way it is not
part of the rename commit.

- [x] One row: **Copy link to Target**.
- [x] Clipboard receives the Target's Thing product URL (ADR 0069).
- [x] No second “in this Diagram” row.
- [x] Unavailable Target uses the existing refusal path, not a new jump.
- [x] `pnpm verify`. `pnpm e2e` for the menu row.

## Out of scope

- Jump to Target.
- Highlight-on-select.
- Renaming Alias (issue 01).
