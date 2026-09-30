# 01: One delete confirmation for every kind of subject

**What to build:** Delete from Space's confirmation becomes a general delete confirmation that any delete command can open by naming its subject (kind and short Title or name), a one-line description of what is permanently deleted, and the deletion to run on Delete. It keeps what the Resource confirmation has today: it stands at the App root, withholds both exits while a deletion runs, reports refusals through the existing channels, and returns focus to its opener while that is still in the document, otherwise to the fallback the arming surface names. Delete from Space behaves exactly as it does now.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Delete from Space opens through the general confirmation, with the same title (`Delete {short Title} From Space?`), description, `Cancel` / `Delete` answers and focus behaviour.
- [x] The confirmation carries no Resource-specific knowledge beyond what a Resource subject supplies; a new kind of subject needs no change to it.
- [x] Existing Delete from Space tests (component, application, e2e) pass unchanged.
