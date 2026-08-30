# Base UI and Lucide are the UI foundation

Status: accepted
Refines: 0047
Refined by: 0073

Hyper uses shadcn's Base UI variants as its component foundation and Lucide as its default icon vocabulary. The shadcn workspaces declare the `base-nova` style, a `neutral` base colour and CSS-variable theming. This is one repository-wide choice: do not mix Radix and Base UI wrappers, or choose an icon source component by component.

The migration preserves Hyper's current palette and spatial presentation. The shadcn configuration is the source for component structure, primitive behaviour and future generated files; it is not permission to restyle the product to match a registry preview. Existing custom classes and semantic tokens are replayed onto the Base UI variants where they express Hyper's design.

## What forced it

ADR 0047 chose shadcn components over hand-rolled behaviour but deliberately stopped short of choosing the repository's eventual primitive layer. Radix was the coherent answer while the installed wrappers were Radix; the proposed whole-project migration makes that temporary answer expire. Base UI is now chosen once for every migrated wrapper, so focus, dismissal, positioning and upgrade behaviour do not split across two primitive implementations.

The icon choice had the same missing decision. `packages/ui/src/icons.tsx` accumulated locally drawn SVGs, but no product requirement, visual-system rationale or dependency constraint selected a bespoke icon set. Treating that implementation history as a design decision would make every shadcn addition pay an icon-translation cost for a choice nobody made.

Lucide is the registry's normal vocabulary for the chosen shadcn foundation. Using it keeps generated components close to their upstream form, gives upcoming Card, Graph and Edge controls one broad and consistent set, and moves sizing, stroke geometry and SVG maintenance to a library maintained for that purpose. It also makes a shadcn diff describe Hyper's actual component rather than a component plus a routine icon rewrite.

## What this costs

**A dependency replaces small local SVGs.** The application accepts `lucide-react` as production UI surface. Tree-shaken imports keep the bundle cost scoped to the glyphs used, but it is still an upstream dependency and upgrade surface that the local drawings did not have.

**Equivalent existing icons move.** During the Base UI migration, a local glyph with a clear Lucide equivalent is replaced rather than preserved for visual inertia. Small changes in stroke or silhouette are accepted in exchange for one maintained vocabulary.

**A domain icon may still be ours.** Lucide is the default, not a ban on product meaning. When no Lucide glyph communicates a Hyper-specific concept accurately, `@project/ui` may own a custom icon. The exception must name the missing semantic distinction; a preference for a slightly different drawing is not enough.

## The negative to remember

Do not redraw a Lucide glyph locally to avoid the dependency, preserve an accidental silhouette, or make one component feel special. Do not introduce a second general-purpose icon library for a glyph Lucide lacks; first ask whether an existing Lucide metaphor is honest, then add the genuinely domain-specific icon locally if it is not. And do not let `components.json` claim Lucide while routinely translating generated components back to bespoke SVGs — the configuration is a decision, not registry metadata to work around.
