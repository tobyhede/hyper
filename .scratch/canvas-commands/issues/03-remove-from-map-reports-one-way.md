# 03: Remove from Map reports one way

**What to build:** Delete and Backspace become the Canvas command `canvas.removeSelection` (aim *selection*, with the inside-canvas flag, serves *any* occurrence). It acts on the focused node first, otherwise on the selected Resource, otherwise it deletes the selected Edge. The press must land inside the canvas and not on a control, a toolbar or the chrome. The rail's Remove from Map reads the same command. Both run through the Space's command outcomes, so a refusal reads the same from the key and from the rail. The canvas-local refusal state Delete uses today is removed, along with Delete's own window listener.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] A test shows Delete and the rail item reporting the same refusal through command outcomes.
- [ ] Delete pressed from the Command Dock, from a node's toolbar or from an Open Resource's editor does nothing.
- [ ] Delete on a Map drawn inside a Space Resource removes from that Map.
- [ ] The existing Delete and Edge-deletion key tests pass. Any test that read the canvas-local refusal reads command outcomes instead, with the same sentence.
