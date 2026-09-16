# 03 — Make Ladle demonstrate the production Space Thing portal

**What to build:** Replace the throwaway Ladle-only portal mechanics with a stable story that composes the same production Read/Edit/Enter state model and controls as the application. The story remains an isolated, quick design and regression surface, while the application is the authoritative behavior. Readers can compare Read, Edit and Enter without the story maintaining a parallel implementation.

**Blocked by:** 01 — Give an Open Space Thing a production Read/Edit boundary; 02 — Persist Space Thing framing through seamless Enter and Return.

**Status:** resolved

- [x] The stable story renders production Space Thing portal controls and state transitions rather than its own mode implementation.
- [x] Read, Edit and Enter variants start from explicit isolated fixtures and expose the same accessible names as the application.
- [x] Ladle browser tests cover outer dragging, inner editing, framing, Enter and Return using the shared production behavior.
- [x] Application and Ladle parity claims identify the exact shared behaviors and both proof suites pass.
- [x] The throwaway prototype code and prototype-only diagnostic controls are removed once the stable story covers the production behavior.
