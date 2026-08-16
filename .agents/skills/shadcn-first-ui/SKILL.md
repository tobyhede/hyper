---
name: shadcn-first-ui
description: Implement or change production React UI in Hyper. MUST be used for components, controls, forms, dialogs, menus, popovers, comboboxes, toolbars, cards, panes, and application surfaces. Search @project/ui first, then shadcn; hand-rolled interactive primitives require an explicit deviation. Do not use for throwaway UI prototypes.
---

# shadcn-first-ui

Production UI in Hyper is design-system-first.

## Required workflow

Before writing JSX for a new UI concept:

1. Run `pnpm ui:catalog`.
2. Inspect the existing `@project/ui` component or composition that most closely matches the requirement.
3. Inspect its Ladle stories and tests.
4. When Hyper lacks the capability, search the configured shadcn registry through the shadcn MCP server. If the optional server is unavailable, use `pnpm dlx shadcn@4.18.0` and the upstream `$shadcn` workflow for read-only search and documentation. Never substitute `@latest` or an unversioned package invocation.
5. Prefer composition of existing components over adding another component.
6. Use the shadcn component when it supplies the primitive or composition.
7. Preserve its documented keyboard, focus, dismissal, and accessibility behavior unless an accepted Hyper requirement explicitly contradicts it.
8. When shadcn lacks the capability but Base UI supplies the primitive, build the smallest shadcn-style wrapper in `@project/ui`.
9. For a specialist widget with an established canonical library, such as an editor or graph, wrap the library behind a Hyper-owned `@project/ui` component.
10. Hand-roll interactive behavior only as the final option and record the deviation before implementation.

The local catalogue is authoritative for Hyper's checked-out surface. The registry is authoritative for evolving upstream shadcn capabilities.

## Ownership

`packages/ui` owns generic presentation and interaction components.

`packages/app` composes `@project/ui` with product and domain state.

`packages/react-flow-adapter` owns React Flow integration and geometry, not a parallel UI component system.

Application and adapter code import the public `@project/ui` surface. Add or compose missing capabilities there rather than importing Base UI, cmdk, Lucide, shadcn implementation modules, or `packages/ui/src` directly.

## Custom composites

A Hyper-specific visual or semantic composite is encouraged when it adds reusable Hyper meaning. `CanvasCard` composed from shared Card primitives is such a component. A second locally implemented Dialog for a styling difference is not.

Treat styling differences as variants, theme, or composition concerns before considering replacement behavior.

## Deviation rule

Record every custom interactive deviation with:

- Existing Hyper component considered:
- shadcn/Base UI component considered:
- Product requirement that cannot be expressed:
- Why composition or a variant is insufficient:
- Custom behavior being introduced:
- Tests proving the deviation:

Use an ADR for a durable interaction or architectural deviation. Keep a narrow component-local exception beside the component. "Our case is special" is not an explanation.

## Stories

A production story imports the exported production component used by the application.

Stories may supply fixture data, providers and context, layout constraints, and interaction setup. They may not supply a visual facsimile, story-only product behavior, alternate focus or keyboard handling, alternate state translation, or fake geometry in place of accepted production geometry.

Put unresolved visual experiments under `stories/review`.

## Prototype boundary

Use `$prototype` only while a visual or product question is unresolved. A chosen prototype is a decision source, not production code. Reimplement an accepted design through this production workflow.

## Verification

Test semantics through accessible roles and user behavior. Use component tests for local behavior, Ladle and Playwright for component interaction and accessibility, and application Playwright tests for behavior crossing framework or surface boundaries such as React Flow, Dialog focus, Escape, and Tab.

Run the relevant tests and `pnpm verify` before completion. Run `pnpm e2e:ladle` for catalogue changes. Run `pnpm e2e` for UI, graph, canvas, or rendering changes. Record the actual command outcomes in the pull request description.
