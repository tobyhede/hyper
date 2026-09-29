# 04: Editing and replacing are display states only a Resource's own content enters

**What to build:** A body edit and an image replacement become display states — editing carries the Markdown and its editor, replacing carries the image and its replacer — produced only by two pure helpers the decoration step applies. Each helper leaves the display unchanged unless it is Open with the Resource's own content of the matching kind, so a Reference Resource cannot be given an editor or Replace by construction rather than by a runtime branch. `autoFocus` is required, defaulting to false.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Editing a Markdown Resource's body and replacing an Image Resource's image behave as before, proved by the existing application and Ladle proofs.
- [ ] A property test of the helpers: each returns the same display unchanged or an editing/replacing display that returns to it at rest, and the second only for Open own content of the matching kind.
- [ ] A read-only Resource given an editing display draws rendered Markdown with no editor.
- [ ] The Resource toolbar stays visible while editing or replacing, reading the display.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.
