# 05 — A themed zoom control on the canvas

**What to build:** The canvas's zoom and fit controls look like the rest of the application. Today the canvas mounts React Flow's own control cluster, which is the library's default presentation dropped into a dark application, and it is the one piece of canvas chrome that never went through the shadcn-first route because it arrived with the library rather than being built.

**Blocked by:** 01. The registry the replacement comes from has to be declared before the search step can find it.

**Status:** implemented and verified

- [x] The decision is taken the ADR 0047 way and recorded: search this repo's own package first, then the registry now reachable under the declared namespace, and hand-roll only as the last option. The registry ships a zoom control; if it is taken, say so, and if it is refused, the reason is written before anything is hand-rolled.
- [x] Whatever the canvas ends up mounting is themed with the application's tokens and readable against the dark canvas, and the interactive control it composes comes from this repo's package rather than being reimplemented — the registry component's own dependency on a slider resolves through the shadcn manifests to the Base UI primitive, per ADR 0050, and a slider primitive that does not exist here yet is generated the same way every other one was.
- [x] Zooming in, zooming out and fitting the view all still work, and the control does not shadow the canvas's own keyboard commands — issue 02's list gains any binding it introduces.
- [x] ADR 0052's two proofs are paid: a Ladle story and an application proof, or an entry in the design-system inventory with its reason. A new component in the scanned source trees fails the catalogue check until one of those exists.
- [x] The control does not fight the Sidebar for stacking. The Sidebar's desktop container is fixed and above the canvas, and the canvas chrome that came before this had to learn that.
- [x] `pnpm verify`, `pnpm e2e` and `pnpm e2e:ladle` are green and reported.

## Not in scope

A minimap change. The heads-up display in the adapter is a separate surface with its own reasons, and it is deliberately beyond what the registry ships.

## Decision and evidence

`@project/ui` had the shared Button but no Slider or canvas zoom component. The
pinned shadcn CLI resolved `@reactflow/zoom-slider`, whose manifest depends on
the shadcn Button and Slider. Hyper takes that registry component and adapts it
to the package boundary: `ZoomSlider` lives in `react-flow-adapter`, imports the
public `@project/ui` Button, Slider and icon facades, and uses only semantic
tokens. The missing Slider is the official `base-nova` Base UI registry source,
adapted to the repo's aliases and background token.

The registry's optional orientation and percentage-reset control were omitted:
this canvas has one horizontal bottom-left surface, and the product requirement
names Zoom out, Zoom in, the continuous Slider and Fit view—not a second reset
camera command. The registry's React Flow hooks, Panel placement, animated
camera operations and Slider interaction model are retained. The Panel adds no
z-index, so React Flow's own canvas layer remains below the fixed Sidebar.
`.nokey` remains on the root for the live Space-key pan subscription established
in issue 04. No authored keyboard binding was introduced, so the issue 02
inventory does not change.

TDD red: the first focused test failed because `ZoomSlider` did not exist.
Green: the focused SpaceCanvas run passed. The stable
`Components/Zoom Control / Canvas` story renders the production component over
a real React Flow viewport; its Ladle proof was red until the real stage CSS was
included, then passed. The matching new-space application proof passed, and
`pnpm ui:catalog:check` resolves both new production modules through the story
without an inventory exception.

Code review confirmed two defects. First, the slider's `role` was absent from
the shared canvas-command guard, so focused slider keys could create a Card or
delete the selected Edge. Regression tests reproduced both paths before
`[role="slider"]` joined the guard. Second, the application and story parity
proofs exercised only the buttons and Fit view, not the continuous Slider. Both
now press ArrowRight on the real Base UI slider and observe the real React Flow
viewport zoom before continuing through the button and fit operations. The
Base UI wrapper accepts scalar and range values generically and supplies each
thumb's index explicitly, so the controlled scalar zoom exposes one reliable
slider thumb. Both reviewers verified the fixes and reported no remaining
findings.

Final verification: `pnpm verify` passed; `pnpm e2e` passed 140 tests; and
`pnpm e2e:ladle` passed 53 tests.
