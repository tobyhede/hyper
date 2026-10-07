# 04: Present in fullscreen

**What to build:** Present takes the browser fullscreen when it can, and fullscreen and presenting end together.

**Blocked by:** 02 — Present on the Stage.

**Status:** ready-for-agent

- [ ] Present requests fullscreen on the whole document within the activation that starts presenting, so dialogs that portal to the end of the page stay visible over the Stage.
- [ ] A refused request is tolerated silently, and the Stage fills the window regardless. A presentation opened from a link, which has no activation, does not request fullscreen.
- [ ] While presenting that entered fullscreen, leaving fullscreen, including by the browser's own Escape, leaves presenting.
- [ ] Leaving presenting any other way exits fullscreen if presenting entered it.
- [ ] A presentation that never entered fullscreen is not ended by an unrelated fullscreen change.
- [ ] e2e covers entering, leaving by each route and a refused request, against Chromium's fullscreen behaviour.
- [ ] `pnpm typecheck`, `pnpm typecheck:packages`, targeted lint and the affected unit and e2e specs pass locally; the draft PR's `CI passed` gate is observed green before resolution.
