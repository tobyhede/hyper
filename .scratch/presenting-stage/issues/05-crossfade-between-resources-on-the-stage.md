# 05: Crossfade between Resources on the Stage

**What to build:** Moving to the next Resource while presenting crossfades the Stage's content rather than swapping it instantly.

**Blocked by:** 02 — Present on the Stage.

**Status:** needs-triage — deferred on 2026-10-07: ticket 02 ships an instant swap, and this waits until someone wants the fade.

- [ ] The crossfade reuses the presence hook and the duration and easing tokens the expanded-card crossfade built; there is one fade mechanism in the product.
- [ ] No View Transitions API and no animation library.
- [ ] Reduced motion swaps instantly.
