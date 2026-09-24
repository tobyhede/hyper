# 05 — The Edge toolbar and its wire Title

Status: resolved
Blocked by: 02, 03, 04

**What to build:** Replace `SelectedEdgeControls` with the Edge chrome `spec.md` describes: the `[Edit][Show/Hide Title][Delete]` icon toolbar revealed on hover or Selection, and the `wire` Title, click-to-edit, fitted to the Edge's drawn length at rest, hidden below the threshold, and whole while revealed (`issues/06`).

**Why:** See `spec.md`.

- [x] Reconnection is removed end to end: the pointer-reconnect draft, per-Edge `edgesReconnectable`, the three `onReconnect*` handlers and the `reconnecting` guard in `edge-authoring-react.tsx`, `movedEndpoint`, `reconnectOutcome`, the endpoint popover and its Escape workaround, the reconnection refusals and `presentEdgeEndpointRefusal`.
- [x] `RAISED_SURFACE` and `GROUPED_COMMAND` go with the old controls.
- [x] The adapter exposes the Edge's drawn length (or its attachment) rather than a consumer parsing the path; the prototype's `drawnLength` is a workaround.
- [x] The revealed Edge's chrome is raised over the Resources, since React Flow draws the Edge label layer beneath the nodes.
- [x] Show/Hide Title is an eye toggle (`ShowTitleIcon`/`HideTitleIcon` over Lucide `Eye`/`EyeOff`, added to `icons.tsx`), always present, disabled without a Title. A hidden Title draws nothing at rest and draws dimmed while revealed.
- [x] Only the Active Graph's Edges draw Titles.
- [x] Enter on a focused Edge moves focus into its toolbar; Escape returns to the Edge; Tab from the Edge goes to the next Edge.
- [x] Refusals from all three commands report in one alert region under the toolbar, as a Resource's `contextNotice`, cleared when the selection moves (decided: not the canvas announcement).
- [x] A stable story and its Ladle and application proofs (ADR 0052), replacing `Components/Selected Edge Controls` and `Review/Selected Edge On Canvas`.

## Answer

Built as `spec.md` describes. Commits `418d3c5a`, `4a20afe2`, `22d72ed1`, `3a89dfdf`.

- **Reconnection is gone end to end.** Space Authoring has no `reconnect` proposal, `reconnected-edge` completion or `reconnectOutcome`, and `EdgeEndpoint` is gone. Edge Authoring has no reconnect drafts or `reconnect`. `edge-authoring-react.tsx` has no `onReconnect*` handlers, `reconnecting` guard or `movedEndpoint`, and still passes `edgesReconnectable={false}`, because React Flow defaults it to true. `presentEdgeEndpointRefusal`, `presentEdgeDeletionRefusal`, the placement record and `resource-choice.ts` are deleted. So are `SelectedEdgeControls` (with `RAISED_SURFACE`, `GROUPED_COMMAND` and the popover's Escape workaround), `ResourceNode`'s source-seeking branch and its CSS arm, embedded Edges' `reconnectable: false`, and the `.oxlintrc.json` override that covered the reconnect handlers. All reconnect tests and specs are deleted. The property test's reconnect operation became a `titled-edge` one.
- **Projection** (`418d3c5a`): `GraphRenderEdge` and `RoutedEdgeData` carry `title`/`titleHidden`. `useRoutedEdgeGeometry` now also answers `span`, the straight distance between the drawn line's ends after lane and trim. Nothing parses the path.
- **`@project/ui`**:
  - `EdgeToolbar`: `[Edit][Show/Hide Title][Delete]` in one `Edge commands` group on `CanvasCommandToolbar`, named `Edge <Title>` or `Edge <From> → <To>`. The commands are `Edit Edge …`, `Hide Title …`/`Show Title …` and `Delete Edge …`. The eye is always present and `aria-disabled` without a Title.
  - `EdgeTitle` with `edge-title.css`: the wire box. The border is the Edge's own stroke, handed in from the Edge's style. It has three states: at rest (fitted, ellipsed, native tooltip), revealed (`Edit Title <name>`, whole, dimmed when hidden) and writing (the `InlineTitleEditor` `edge` field, active face, 3px underline).
  - `ShowTitleIcon` and `HideTitleIcon` over Lucide `Eye`/`EyeOff`.
  - `edgeTitleRoom` (`edge-title-room.ts`, ticket 06).
  - `InlineTitleEditor` gains `errorShownBy`. When it is set, the editor draws no reason of its own and its field is described by the external region, so a refused Title is said once, in the toolbar's alert region. The default behaviour and ticket 04's tests are unchanged, and a new test covers the prop.
- **`app`**:
  - `AuthorableEdge` draws chrome for Active Graph Edges only. It is revealed when the Edge is selectable and is hovered, selected or has its Title being written.
  - Hover comes from React Flow's `onEdgeMouseEnter`/`onEdgeMouseLeave` plus the chrome's own pointer events. `useEdgeAuthoring` keeps one `hovered` id, released 150ms after the pointer leaves.
  - `.edge-control-layer[data-revealed='true']` raises the layer to `z-index: 2000`.
  - Edge Authoring's draft is `pointer-connect | title`, and its refusal is `command` (with its Edge) `| gesture`. Each toolbar command selects its Edge first. A `command` refusal clears when the selection moves. A refused Title keeps its draft, so the field stays open.
  - Keyboard: an `onKeyDownCapture` Enter in the Edge's `domAttributes` focuses the toolbar's first command, and Escape anywhere in the chrome refocuses the Edge. After Enter or Escape ends a Title edit, focus returns to the Title, waiting for the projection to draw a newly written one. If there is no Title, focus goes to the Edge. A blur completion does not move focus.
- **Proofs**: `Space/Edge Toolbar` (`Default`, `Refused`) mounts the production application over `edgeToolbarSnapshot`. It replaces `Components/Selected Edge Controls` and `Review/Selected Edge On Canvas`. Seven parity claims each have a Ladle proof (`ladle-e2e/edge-toolbar.spec.ts`), and six have an application proof (`e2e/editing.spec.ts`). The HUD's Ladle tests moved to `graph-hud.spec.ts`. `edge-attachment.spec.ts` now holds the toolbar to a dragged Edge's geometry.

Deviations:
- The refusal region's claim declares an `applicationEvidence` exemption. No browser gesture reaches a toolbar refusal: the eye is disabled without a Title, a single-line field cannot hold a line break, and a stale Edge needs a second writer. The Ladle `Refused` story reaches it through the production `setTitleHidden` once the canvas has drawn.
- The Edge's `aria-label` is unchanged (`Edge from X to Y in G`). The Title is in the toolbar's name.
- Titles of the Active Graph still draw at rest while presenting. That is `08`'s open question, and it is not decided here.
- `ResourceSearchCombobox` (and `components/combobox.tsx`) now has no consumer. It is recorded in the design-system inventory rather than deleted, because retiring it is a foundation decision. `AGENTS.md`'s "Choosing a Resource has one component" note still says Edge endpoints use it. `07` owns that note, and I did not edit `AGENTS.md`/`CLAUDE.md`.

Verification: `pnpm verify` exited 0 on `22d72ed1`: 242 files, 3149 passed, 13 skipped. `3a89dfdf` touches one e2e spec only, and `tsc`, `eslint` and `prettier` pass on it. `pnpm e2e` on `3a89dfdf`: 223 passed. The first run, on `22d72ed1`, failed only `edge-attachment.spec.ts`'s old `edge-edit` test id, which `3a89dfdf` fixes. `pnpm e2e:ladle`: 114 passed.
