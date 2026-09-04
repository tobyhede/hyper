# The notice Alert becomes a component

Status: ready-for-agent

Blocked by: `02-every-surface-receives-the-identity-not-the-sentence.md`. The
component should take a refusal, and until `02` lands half its call sites have
only a string to give it.

Surfaced by: investigating whether persistence error handling should be
extracted as the application-wide error pattern — see `spec.md`.

## Context

`docs/agents/ui.md` already states the rule for the blocking channel:
"Operational feedback is one deep module… compose a product-specific component
around them so production and Ladle mount the same surface." `StatusFailure` and
`StatusBusy` follow it, and the four surfaces that use them — `StartupFailure`,
`SpaceAppFailureView`, `PlacementFailure`, `PlacementPending` — are four
near-identical five-line components. That channel is consistent because a
component makes it so.

The notice channel never got the same treatment, and it shows. Eight sites
hand-assemble `Alert` / `AlertIcon` / `AlertTitle` / `AlertDescription`:

| site | icon |
| --- | --- |
| `App.tsx:1052` Link not copied | yes |
| `App.tsx:1059` Destination not found | yes |
| `SpaceSidebar.tsx:543` Layout unchanged | yes |
| `PersistenceControl.tsx:151` Changes not saved | yes |
| `CardsDrawer.tsx:187` Card not added | no |
| `SpaceSidebar.tsx:181` Card not deleted | no |
| `PersistenceControl.tsx:193` Unable to reload | no |
| `PersistenceControl.tsx:229` Reason | no |

`Alert` renders no icon of its own (`packages/ui/src/components/alert.tsx:22`),
so the icon is per-call-site memory and half the sites forgot. The titles are
ad hoc in the same way: "Card not added", "Card not deleted", "Layout
unchanged", "Unable to reload", "Reason", "Changes not saved", "Link not
copied", "Destination not found". "Layout unchanged" is wrong on its own terms —
`unchanged` is a distinct completion outcome from `refused` (ADR 0042), and
using its word for a refusal says the opposite of what happened.

## Decision — taken 2026-09-04

**The title is a prop, and the voice rule is: name the operation that did not
happen. The component also allows no title, for the case where the surrounding
surface already names the failure.**

Deriving the title from the refusal code was the other serious candidate and is
rejected on a fact rather than on flexibility: **the same code reaches different
surfaces**. `card-not-found` is "Card not deleted" in the sidebar and "Card not
added" in the drawer. The title names the operation; the code names the reason.
Those are two different facts and only the second is derivable, so a derived
title would be wrong wherever one code serves two operations —
`docs/agents/authoring-refusal-cascade.md` lists six codes that do.

What the rule says about the eight titles in the table above:

| title | verdict |
| --- | --- |
| Card not added | correct as it stands |
| Card not deleted | correct as it stands |
| Link not copied | correct as it stands |
| Destination not found | correct as it stands |
| Changes not saved | correct as it stands |
| Layout unchanged | **wrong** — names an outcome, and the wrong one: `unchanged` is a distinct completion outcome from `refused` (ADR 0042). It is Add Layout refusing, so "Layout not added". |
| Unable to reload | **restate** — system voice rather than operation voice: "Space not reloaded". |
| Reason | **drop** — a label inside an `AlertDialog` already titled "Changes couldn't be saved". This is the no-title case the component must support. |

The description stays `describeAuthoringRefusal`'s sentence in every row.

**This ticket no longer pairs with issue 04.** An earlier revision paired the two
as adjacent decisions on one channel, on the assumption that
`.scratch/interaction-draft-invalidation/issues/04-acknowledge-markdown-prose-discarded-by-replacement.md`
would answer with a status line. It did not — the acknowledgement went into the
conflict dialog instead — so the two are independent and land in either order.

## Direction

**This is production UI, so it starts with `$shadcn-first-ui`, before any code**
(ADR 0047, ADR 0050). Search `@project/ui` first — `Alert` and its parts are
already there and this is a composition over them, not a new primitive, so
nothing here should reach the deviation path.

**Model it on `StatusFailure`, not on a wrapper.** `StatusFailure` owns the
accessible framing and the decisions a caller should not re-take — the
destructive `Alert`, the announced role, the named focusable detail region — and
exposes only what genuinely varies. The notice component's equivalents are the
icon, the title framing and the optional action slot; `PersistenceNotice`'s
Retry (`PersistenceControl.tsx:155-164`) is the one action in the tree today and
is the shape to support.

**The `app` half takes a refusal; the `ui` half takes a sentence.** The decision
above settles that the title is a prop rather than derived, so the component
needs no access to the code in order to title itself — which is exactly what
lets the accessible framing live in `ui`, where `describeAuthoringRefusal` is
unreachable. The `app` wrapper owns the translation and is where a call site
that still holds a described `string` can pass one until `01` and `02` land.

**Where it lives is a real question, not a formality.** `@project/ui` may not
import `@project/app`, so a component that calls `describeAuthoringRefusal`
cannot live in `ui`. Either the framing goes in `ui` and takes its sentence
already-described from a thin `app` component that owns the translation — the
`StatusFailure`/`StartupFailure` split exactly — or the whole thing lives in
`app`. The first matches the precedent and keeps the accessible framing where
every other framing lives.

**ADR 0052 applies.** A new production component owes both a Ladle story and an
application proof, and `pnpm ui:catalog:check` will fail until it has one or is
recorded in `packages/app/stories/design-system-inventory.ts`.

## Acceptance

- [x] The title-voice decision is made and recorded here.
- [ ] One component owns the notice channel's framing, and all eight sites use
      it. No call site assembles `Alert`/`AlertIcon`/`AlertTitle`/
      `AlertDescription` by hand.
- [ ] The icon is the component's, not the caller's — the four sites that omit
      it today gain it without any call site asking.
- [ ] The three titles the rule condemns are changed: "Layout unchanged" names
      its operation, "Unable to reload" leaves system voice, and "Reason"
      becomes the no-title case.
- [ ] The component has a stable Ladle story and an application proof (ADR
      0052), and `pnpm ui:catalog:check` is green without an inventory
      exemption.
- [ ] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` pass.
