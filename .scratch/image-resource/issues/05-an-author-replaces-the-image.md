# 05 — An author replaces the image

**What to build:** The Image Resource's entity menu gains **Replace image**, a popover with a URL field and a button that chooses a file and stores it (ADR 0106). Either loads the image and completes one Edit changing the URL and the recorded natural size (absent if the image does not load) and nothing else — identity, Title, placement, Edges and a remembered Open Size are kept. Replacing with the current URL is `unchanged`. The failed-image state (ticket 03) offers the same Replace. A refused URL or stored-image refusal is shown in the popover and changes nothing. Starts with `$shadcn-first-ui`.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

- [ ] Entering a new `https:` URL replaces the image in one Edit; Undo restores the old URL.
- [ ] Choosing a file stores it and replaces the URL with the stored image's.
- [ ] A `data:` URL is refused in the popover with the application's words for the code.
- [ ] The same URL produces no Edit.
- [ ] The failed-image state's Replace opens the same popover.
- [ ] Ladle story and application proof (ADR 0052).
