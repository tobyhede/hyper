# Stable Ladle stories are production-parity evidence

Status: accepted

A stable Ladle story is evidence about the UI Hyper ships, not an independent
demonstration of a similar design. It renders the unchanged exported production
component through the smallest coherent production boundary that owns the
behavior the story claims. A story harness may provide fixture data, public
inputs, providers, context and layout constraints, but it must not replace the
production state translation, lifecycle, focus behavior, interaction logic or
framework geometry that makes the claim true.

Every meaningful claim made by a stable story requires two explicitly linked
behavioral proofs: one against the rendered Ladle story and one against the real
application composition. Compilation, screenshots, class or element-count
assertions, and application-only tests do not establish this parity. Issue 08
of the design-system baseline owns the mechanical inventory, traceability and
runtime enforcement of these paired proofs.

## What this excludes

Stable stories under `stories/components` and `stories/surfaces` must not use
visual facsimiles, story-only component modes, substitute lifecycle behavior or
fake framework geometry. A state that production cannot reach and verify is an
unresolved proposal and belongs under `stories/review`, or should not be kept
as a story.

We reject an application catalogue route. It would make inspection depend on
the application's repository-backed runtime and would add a product route for
development tooling. Ladle provides an isolated static catalogue without
changing the application surface.

We also reject looser stories that reproduce only the appearance of a
production component. They are easier to arrange, especially around React Flow
geometry and application-owned state, but they prove the substitute rather
than the component and integration Hyper ships.

## What this costs

Hyper maintains a second runtime and more elaborate story harnesses. Meaningful
behavior is verified twice, once in Ladle and once in the application, and the
two proofs require explicit traceability. Some useful-looking states cannot be
stable catalogue entries until production exposes a coherent boundary through
which they can be rendered and tested. We accept those costs so the stable
catalogue remains trustworthy production evidence.

## The negative to remember

Do not make a stable story possible by adding a story-only production prop,
copying a component, translating its state in the harness, or replacing its
lifecycle, focus, interaction or geometry boundary. Either render and verify
the production behavior through its real owner, or keep the work in review
until that boundary exists.
