# 05: Open, Open and expand and Full View are Canvas commands

**What to build:** Enter becomes `canvas.openResource` (aim *focused Resource*, serves *any* occurrence), Shift+Enter becomes `canvas.openAndExpand` (aim *focused Resource*, serves the *own Map*, using the canvas's camera), and Space becomes `canvas.showFullView` (aim *focused Resource*, serves the *own Map*). The *focused Resource* aim keeps today's narrow guard, so these keys pressed on a node's own content, toolbar or editor stay that control's. The rail's Open and Expand and Read in Full View items read the same commands, and the rail builder's extra Open and expand argument goes away. The canvas's React key handler for these three keys is removed.

This ticket makes the one intended change in behaviour: Read in Full View on the rail follows the same availability as Space, so it is absent wherever the canvas cannot be selected on (for example while presenting).

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Command-level tests cover all three: an embedded occurrence (only Enter answers), a Resource kind that does not take Open, body editing.
- [ ] A test shows Read in Full View absent from the rail while the canvas cannot be selected on, and present otherwise. This is the only rail test whose expectation changes.
- [ ] A Space typed into an Open Resource's editor is still a character, not Full View.
- [ ] The existing Enter, Shift+Enter and Space key tests and the keyboard e2e spec pass unchanged.
