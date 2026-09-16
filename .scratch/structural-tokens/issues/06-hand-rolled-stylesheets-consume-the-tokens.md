# 06: Hand-rolled stylesheets consume the tokens, in two scales

**What to build:** The hand-rolled stylesheets state no bare structural literal. Around forty of them sit across the Thing's own stylesheet, the app shell, the Markdown Thing body, the Thing search combobox, the Dock and the Things popover.

**This ticket emits two scales, not one, and that is the decision it carries.** The Thing and the chrome are drawn in deliberately opposite geometry:

```
Thing:   border 4px      radius 0       shadow none at rest
                                        7px 7px 0 (hard, unblurred) dragging
                                        0 0 0 3px selected
Chrome:  border 1px      radius 10px    two-layer soft wash
         (buttons 4px, grip 3px)
```

That is not drift between two versions of one scale. The Thing is paper lying on the canvas and the chrome floats above it, and the geometry is what says so. Collapsing them would erase the distinction.

The repo has already made this call one level up for colour: the Thing's muted and error inks are separate tokens from the chrome's foreground and muted foreground, because the Thing's paper is warmer and does not inherit. Geometry follows the same reasoning. So the Thing gets its own named scale, and the chrome's scale from ticket 01 does not reach across.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] The named stylesheets state no bare structural literal
- [ ] The Thing's geometry is its own named scale, distinct from the chrome's
- [ ] The opposition between the two — border weight, radius, shadow character — survives the migration unchanged
- [ ] A chrome token change does not move the Thing, and a Thing token change does not move the chrome, both demonstrated
- [ ] The rendered result is unchanged except where ticket 01 recorded a reconciliation
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass and the output is reported
