# 05 — The Edge toolbar and its wire Title

Status: ready-for-agent
Blocked by: 02, 03, 04

**What to build:** Replace `SelectedEdgeControls` with the Edge chrome `spec.md` describes: the `[Edit][Delete]` icon toolbar revealed on hover or Selection, and the `wire` Title, click-to-edit, fitted to the Edge's drawn length.

**Why:** See `spec.md`.

- [ ] Reconnection is removed end to end: the pointer-reconnect draft, per-Edge `edgesReconnectable`, the three `onReconnect*` handlers and the `reconnecting` guard in `edge-authoring-react.tsx`, `movedEndpoint`, `reconnectOutcome`, the endpoint popover and its Escape workaround, the reconnection refusals and `presentEdgeEndpointRefusal`.
- [ ] `RAISED_SURFACE` and `GROUPED_COMMAND` go with the old controls.
- [ ] The adapter exposes the Edge's drawn length (or its attachment) rather than a consumer parsing the path; the prototype's `drawnLength` is a workaround.
- [ ] The revealed Edge's chrome is raised over the Resources, since React Flow draws the Edge label layer beneath the nodes.
- [ ] Delete's refusal has a home now that the old surface is gone — decide between the toolbar and the canvas refusal announcement.
- [ ] A stable story and its Ladle and application proofs (ADR 0052), replacing `Components/Selected Edge Controls` and `Review/Selected Edge On Canvas`.
