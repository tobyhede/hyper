# Design-system baseline

## Notes

The effort establishes `@project/ui` as Hyper's shared shadcn/Base UI surface
and migrates production surfaces onto it without replacing Ladle.

## Decisions so far

- [Establish the shadcn design-system baseline](issues/01-establish-shadcn-design-system-baseline.md) — `packages/ui/components.json` owns generated component placement, `@project/ui` owns the public surface, application tokens have one owner, and Ladle renders the real exported primitives.

## Fog

The remaining numbered tickets record the production-surface migrations and
catalogue guardrails built on that baseline.
