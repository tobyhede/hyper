# 02 — Relabel the Space menu

**What to build:** Give the current Space's Command Dock menu the long copy label and keep Exit as its trailing destructive group. This is reorganisation: relabel only. No command is added or removed. Rename, Copy link to Space and Exit Space keep their current effects, destinations, availability and reporting.

**Blocked by:** None — can start immediately

**Status:** done

- [x] The Space menu shows these groups in order, with one separator between groups: Rename, Copy link to Space; Exit Space.
- [x] Rename starts the current Space's existing name-editing interaction. Menu dismissal does not steal the caret, and the existing save, cancel, validation and refusal behaviour remains effective.
- [x] Copy link to Space copies the current Space's own durable address — the same destination Copy link copies today — with the existing clipboard success and failure reporting.
- [x] Exit Space remains the trailing group. It stays disabled on Meta, when there is no session, and while an exit is already in flight, and it keeps the existing Exit dialogs and refusal recovery.
- [x] Use the shared UI menu primitives, following shadcn-first-ui. The menu remains operable by pointer and keyboard.
- [x] Application and Ladle behaviour evidence verifies the exact menu contents and order, rename focus and completion, the copied Space destination, and Exit.
