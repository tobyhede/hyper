# Surface inventory — pass one findings

`historical`

> This is the archival record of the first inventory pass, not active design
> guidance. Later ADRs, `CONTEXT.md`, and the production implementation supersede
> its conclusions. In particular, the accepted vocabulary includes the `space`
> Card kind and Graph authoring uses the fixed six-colour palette.

Pass one of the design handoff's surface inventory: app shell, toolbar, workspace chooser, canvas. Built as Ladle stories under `packages/app/stories/`, served by `pnpm ladle` at http://localhost:61000.

The handoff asks for spacing and hierarchy to be reviewed before pass two is built, so pass two — opened-card pane, new-alias pane, presenting controls, states matrix — is deliberately not started.

## What the tool choice changed

The handoff proposed "a single route in `packages/app`". Ladle replaces it. The states matrix pass two asks for is what stories are; the `control` addon supplies the live graph-colour tweak the design prototype had; the `theme` addon is where the undecided dark candidates can be compared rather than one being hardcoded; and nothing is left behind in the shipped app.

Nothing else about the brief changed: fixture data only, no live mutations, and the real shadcn/Base UI components rather than redrawn copies.

## Decisions taken while building

Recorded because a reviewer should be able to reverse them.

**Card size is 260x146, not the prototype's 230x129.** The handoff says "pick one size and derive the rest". 260x146 is `card.ts`, which ELK lays out against and which `.card-pane__panel` mirrors; both sizes are 16:9. Taking the prototype's would mean moving the layout seam to match a drawing.

**The card design is a proposal in `stories/`, not a port.** `CardNode.tsx` and `styles.css` are untouched. Porting has to answer to React Flow's declared-handle measurement, the `nodrag`/`nopan` discipline and the title editor's focus contract, none of which a static specimen exercises — and there is uncommitted Base UI work in this worktree already.

**The app's chrome is left dark.** The handoff's token table covers the card and the canvas and stops. Painting the shell light would be inventing an answer; the `Shell` story shows the boundary instead.

## Findings

### 1. The chrome and the canvas are different worlds — unresolved

The `Shell` story is the whole of this. The header is `--panel` `#181b22` on `--bg` `#0f1115`; the canvas below it is `#efe9dc` paper with `#0b0d11` ink. Every toolbar control, both panes and the workspace chooser are in the dark palette, and the design says nothing about any of them.

This is the largest open question in the handoff and it is not listed as one. Either the chrome goes light with the canvas, or Hyper is a dark app with a light document surface — which is coherent (it is what a drawing tool does) but has to be chosen deliberately, because it decides the whole shadcn theme layer in `tailwind.css`.

Nothing else in pass two can be settled before this is.

### 2. Historical: the `space` Card kind was not implemented in this pass

At the time of this pass, `cardSchema` was a discriminated union of `markdown`
and `alias`. That observation is not the current domain conclusion:
`CONTEXT.md` names `space` as an active Card kind. Consult the current ADR and
implementation status before changing its representation.

Drawn in `Card · kinds` as a specimen, from a local type, and kept out of the `Card[]` the real components receive. Adding it is a domain change with an ADR behind it. Its glyph is a stand-in too: `@project/ui` ships no layers glyph, and Lucide's `Layers` is the obvious answer once the kind is real.

### 3. The handles disagreement is inside the bundle, not between bundle and repo

`README.md` lists hover-only versus upstream's hover-and-selection as unresolved and calls the divergence deliberate. `github.md`'s last-sync note says round 8's selected states were already updated to show handles, matching upstream. One of those is stale.

`Card · handles` draws both. Upstream (`styles.css`, ADR 0033) is hover-and-selection.

### 4. Multi-graph membership — nothing invented

`Canvas · multi-graph membership` shows Strategies (on both Graphs) beside Traversal (on one). They are indistinguishable, in every state. The handoff says not to invent a treatment silently, so none is drawn. The legend beside them is what the app has, and it answers "which Graphs exist", not "which Graphs is this Card on".

### 5. Historical: the draft palette had five colours

The handoff supplies amber `#ffc53d → #c1861a` and teal `#35d6c3 → #14887b`. Blue, violet and coral are derived in `fixture.ts` to hold roughly the same lightness step and **nobody has looked at them**. Shown together in `Canvas · graph colours`.

The active Graph palette is now fixed at **six** colours. The five-colour token
table and the guessed-colour concern recorded here were inputs to that decision,
not competing guidance.

### 6. The rail button is not a Button variant

Square, no radius, 2px border, hover inverting to ink with the icon taking the graph colour from context. `@project/ui`'s `Button` is `rounded-[6px]` with a one-pixel border and three colour variants, none of them this, and no other control in the app takes a hover colour from the Active Graph.

Recommendation: a separate `RailButton`. A variant overriding radius, border width and both hover colours is a different component wearing the same name. The manifest raises this as an open question and it belongs to whoever owns `@project/ui`.

The rail's third action also has no glyph — `@project/ui` has no ellipsis. Inlined in `CardFace.tsx` rather than added to the shared package before the proposal is accepted.

### 7. The workspace chooser is the least designed surface

Every row prints a raw UUID as its only disambiguator. The rows are bare `<button>`s, not the shadcn `Card` the manifest earmarks for list items. There is no empty state — handed nothing, the component renders a heading and a void. `Opening (busy)` sets `aria-busy` and disables the rows and shows no progress at all.

### 8. Two small spec ambiguities

**The handle offset's gloss contradicts its arithmetic.** `12px + border width` at a 4px border gives −16px, which puts the handle's centre exactly on the card's **outer edge** — 12px outside, 12px inside, as the handoff also says. The trailing "visually centred on the border line" would need −14px. Measured in the browser: centre sits 0px from the outer edge. The arithmetic is implemented; the gloss is off by half a border.

**Alias hover face is undefined.** `--card-face-active` is "hover / selected / editing face" and `--card-face-alias` is "alias face", with nothing saying which wins. Implemented as alias-wins, so an alias's face never changes state. Consistent, but chosen here rather than specified.

## Ready to review

```
pnpm ladle          # http://localhost:61000
```

Order: `Shell → Shell` first (finding 1), then `Canvas → Card · states`, `Card · kinds`, `Card · handles`, `Canvas · multi-graph membership`.
