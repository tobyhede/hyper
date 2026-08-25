# 01 — Build the Expanded Markdown Card component in isolation

**What to build:** Turn the approved Expanded Markdown Card treatment into production `@project/ui` components, developed through focused Ladle stories that supply component state without recreating the application or React Flow.

**Blocked by:** None — ADR 0064 and `.scratch/expanded-cards/spec.md` settle the component seam.

**Status:** ready-for-agent

## Why this comes first

The review prototype proved the core treatment but also rebuilt expansion, movement, resizing, projection and caret state inside a story. That is useful for disposable design exploration and the wrong boundary for lasting catalogue evidence. The component needs a stable interface and complete state model before React Flow and application authoring are allowed to complicate it.

Ladle is the development surface for this ticket. A story may supply a state and operations; it must not implement the state machine that owns them in the application.

## Component contract

- [ ] ADR 0066 owns the interaction this ticket builds — a closed Card offers Edit and Open, Edit on a closed Card opens it and then begins the edit, Save and Cancel replace Edit while one runs, and Close stays visible but disabled. Read it before the checklist below.
- [ ] Start with `$shadcn-first-ui`; search `@project/ui` first and record any required deviation before adding interactive behavior or a new style block.
- [ ] `CanvasCard` remains one deep component. Its Markdown front accepts source and authored open state and owns construction of the kind-owned body; callers do not fill an opaque content slot or introduce a second open variant.
- [ ] The compact and Expanded Card use the same rail, paper, Title component, Title typography and horizontal inset. Expansion changes the Title's vertical position because content is revealed beneath it; it does not introduce an expanded-only font size, margin or line height.
- [ ] Do not ship the review prototype's Animate.css or measured-FLIP experiments as the component contract. Motion is optional in this ticket; if included, it must animate the real layout displacement without changing typography or requiring magic distances, and reduced motion must be honored.
- [ ] `MarkdownCardBody` owns rendered, editable and actively editing states. At rest it uses the same `RenderedMarkdown` parser and sanitizer as presentation mode.
- [ ] The complete rendered Markdown surface is one semantic click target. Hover and keyboard focus reveal the established boxed pencil treatment; the affordance is not a second command area and the rail remains unchanged.
- [ ] Activating that surface swaps rendered Markdown for the existing lazy `MarkdownSourceEditor`. CodeMirror remains encapsulated behind `@project/ui`; callers set only the wrapper's published custom properties and no external stylesheet names `.cm-*`.
- [ ] Rendered and source content occupy one stable content column. Read mode reserves the gutter column; edit mode reveals the gutter rule and line numbers inside that column without moving the content.
- [ ] `Mod-Enter` commits and `Escape` cancels. **A blur does not end the edit** — those two keys and the two rail controls that pair with them are the whole of how one ends, because a body is a document and a stray click must not decide what happens to it. ADR 0066 settles this, and it is the one place this surface departs from the Card Front's own title rule. The shortcut hint appears only while CodeMirror has focus and is non-interactive; each key sits beside its own word and the two pairs are set apart, so the line reads as two things rather than one run of glyphs. Those same two exits are also published to the surrounding `CanvasCard`, whose rail draws them as ordinary rail actions in place of its Edit control while the edit runs, with Close disabled for the duration.
- [ ] The CodeMirror focus treatment is quiet enough for the Card: the caret, source treatment and gutter may communicate focus without a second bright frame around the whole body.
- [ ] Title editing and Markdown editing retain distinct accessible names and focus behavior. Pointer containment must not accidentally turn the whole Card into a caret surface or disable Card dragging outside the live editor.

## Focused Ladle stories

Add focused, real-component stories for the meaningful component states. They belong under the normal component review/development taxonomy, not in a story that reproduces Space Authoring:

- [ ] Compact Markdown Card.
- [ ] Expanded Card with rendered Markdown.
- [ ] Expanded rendered Markdown with its hover/focus edit affordance disclosed.
- [ ] Expanded Card actively editing Markdown with CodeMirror focused.
- [ ] Expanded Card actively editing with CodeMirror unfocused, proving the shortcut hint follows actual focus while the rail's two ends stay up.
- [ ] A long/multiline Markdown example proving the stable content column, gutter geometry and overflow behavior.
- [ ] A Title-editing example proving the expanded treatment did not create a second Title style.

Stories may use local React state to switch a component between the states its public props already express. They must not import React Flow, build a `Space`, run a Layout strategy, calculate displacement, or reproduce completed-Edit behavior.

These may remain review/development stories until issue 02 supplies ADR 0052's application proof. Issue 02 promotes the final states into the stable parity inventory rather than inventing different stories after integration.

## Tests and verification

- [ ] Unit tests prove rendered Markdown semantics, accessible edit activation, focus placement, commit, cancel, that a blur ends nothing, shortcut-hint focus behavior, and that the rail draws the two ends the body publishes and withdraws them when the caret goes back.
- [ ] Component tests prove compact and Expanded states share the same Title classes and computed component contract; no test should bless an expanded-only font-size override.
- [ ] `test/unit/codemirror-encapsulation.test.ts` continues to prove the lazy boundary and the prohibition on external `.cm-*` selectors.
- [ ] Focused Ladle Playwright tests exercise the real stories, including pointer and keyboard activation and content-column stability.
- [ ] Run `pnpm verify` and `pnpm e2e:ladle`; report the real output.

## Not in scope

React Flow node sizing or animation, Layout authoring, displacement, resize completion, persistence, application camera behavior, or replacing the covering Card pane. Those are application integration and belong to issue 02 or to the earlier domain slices in `.scratch/expanded-cards/spec.md`.
