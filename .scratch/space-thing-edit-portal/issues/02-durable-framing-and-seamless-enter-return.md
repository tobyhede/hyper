# 02 — Persist Space Thing framing through seamless Enter and Return

**What to build:** A Space Thing durably owns the Diagram, Graph and camera framing of its portal. Done and Close retain the current portal state with no discard path. Enter means operating inside the target Space: the selected Diagram expands to a browser-sized canvas whose camera is independent of the source Thing's geometry, while authored target coordinates remain unchanged. Return restores the containing Space and its Space Thing portal at the retained context and frame. A deleted selected Diagram or Graph uses the coordinated fallback already established for Space Things.

**Blocked by:** 01 — Give an Open Space Thing a production Read/Edit boundary.

**Status:** resolved

- [x] Pan and zoom author framing on the containing Space Thing, independently for two Space Things selecting the same target context.
- [x] Done, Close, reopen and browser reload restore the Space Thing's current Diagram, Graph and framing without offering discard.
- [x] Enter expands the target to browser dimensions without deriving its camera from the source Thing rectangle or rewriting target Thing positions.
- [x] Return restores the source Space and Space Thing portal with the retained selection and framing.
- [x] Diagram fallback clears obsolete framing and fits its replacement; Graph fallback preserves framing when the Diagram survives.
- [x] Application browser tests cover framing persistence, reload, Enter/Return and deletion while a portal context is selected.

