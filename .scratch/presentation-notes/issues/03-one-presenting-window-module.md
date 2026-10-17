# 03: One presenting-window module

**What to build:** One module owns a presentation in the presenting window: its identity and start time, whether the rehearsal notes are shown, opening the Notes window, the fullscreen pairing and the presentation link. It offers one state and one set of commands. The application and both Stage story fixtures draw the presenting keys and the Stage's props from it instead of each wiring these parts up, so the next presenting key or toggle changes one module. The rule settled in ticket 01, that a presentation starts when presenting begins and Back stays inside it, lives here once instead of being worked out separately by the link, the rehearsal notes and the timer.

**Blocked by:** 01 (Settle when a presentation starts), 02 (The Active Graph is never empty while presenting).

**Status:** ready-for-agent

**Spec:** `.scratch/presentation-notes/spec.md`. **Review:** candidate 1 of the 2026-10-17 architecture review of Presentation Notes on main.

- [ ] One module answers the presenting window's state and commands, and the application mounts the Stage from it.
- [ ] Both Stage story fixtures use the same module, so no fixture copies the presenting wiring (ADR 0052).
- [ ] The rehearsal notes, the timer and the link take a presentation's start from that module's identity, and ticket 01's tests pass unchanged.
- [ ] Ids and time stay injected (ADR 0109), and rehearsal state stays out of the Space and the browser (ADR 0129).
- [ ] The module is tested through its own interface in node, against a real Navigation.
- [ ] Existing application E2E and Ladle E2E assertions pass unmodified.
