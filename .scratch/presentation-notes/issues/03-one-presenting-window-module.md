# 03: One presenting-window module

**What to build:** One module owns a presentation in the presenting window: its identity and start time, whether the rehearsal notes are shown, opening the Notes window, the fullscreen pairing and the presentation link. It offers one state and one set of commands. The application and both Stage story fixtures draw the presenting keys and the Stage's props from it instead of each wiring these parts up, so the next presenting key or toggle changes one module. The rule settled in ticket 01, when a presentation starts, lives here once instead of being worked out separately by the link, the rehearsal notes and the timer.

**Blocked by:** 01 (Settle when a presentation starts), 02 (The Active Graph is never empty while presenting).

**Status:** resolved — delivered in PR #388.

**Spec:** `.scratch/presentation-notes/spec.md`. **Review:** candidate 1 of the 2026-10-17 architecture review of Presentation Notes on main.

This module is the one place a presentation's identity and start time are minted, from the `newId` and `now` it is given at composition (ADR 0109). The presentation link stops minting them: it posts the identity and start time the module hands it, and keeps its lock and message ordering.

- [x] One module answers the presenting window's state and commands, and the application mounts the Stage from it.
- [x] Only this module calls `newId` and `now` for a presentation; the link takes both from it.
- [x] Both Stage story fixtures use the same module, so no fixture copies the presenting wiring (ADR 0052).
- [x] The rehearsal notes, the timer and the link take a presentation's start from that module's identity, and the behaviour ticket 01's tests prove still holds; a test that built the link with its own `newId` may change how it is set up, not what it asserts.
- [x] Rehearsal state stays out of the Space and the browser (ADR 0129).
- [x] The module is tested through its own interface in node, against a real Navigation.
- [x] Existing application E2E and Ladle E2E assertions pass unmodified.
