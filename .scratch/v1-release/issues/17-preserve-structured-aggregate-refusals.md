# 17 — Preserve structured aggregate refusals

Status: ready-for-agent
Tags: release/v1
Blocked by: none — its refusal transport is independent of renderer vocabulary

**What to build:** Preserve every aggregate refusal's stable identity and
location through coordinated session state and the application feedback surface
instead of flattening several errors into one joined string.

- [ ] Persistence state carries structured aggregate refusals without losing
      Space, Card, Layout, Graph or field location.
- [ ] Retry, conflict and permanent rejection remain distinct states; aggregate
      refusal is the `refused` persistence state and recovers through an authored
      correction, never Retry of the unchanged aggregate.
- [ ] `PersistenceControl` explains each actionable refusal without exposing
      storage or transport vocabulary and without colour as the only signal.
- [ ] Coordinated participants observe the same completed refusal and remain in
      valid recoverable state.
- [ ] Unit, application, stable story, Ladle E2E and Chromium evidence cover one
      refusal, several simultaneous refusals and location-specific feedback.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.
