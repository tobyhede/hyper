# 03 — Edit portal state in the pipeline

**What to build:** Edit portal state (`editingPortals`, portal draft) and the pure Read/Edit enabled gate plus portal-ancestor checks move out of `SpaceCanvas` into the embedded Open Space Thing pipeline (hook or a sibling module the hook owns). Framing completions and seamless enter/return behaviour from the edit-portal work stay intact. Native pointer/wheel listeners stay on the canvas — they attach to canvas DOM — and write drafts through the pipeline setter. Host-context gate inputs stay assembled at the mount site because they need this canvas.

**Blocked by:** 02 — useEmbeddedOpenSpaceThings hook

**Status:** resolved

- [x] `editingPortals` and portal draft state live in the pipeline module, not `SpaceCanvas`.
- [x] Enabled gate (`embeddedAuthoringEnabled`) and portal-ancestor derivation (`embeddingIsPortalEditing` / `editingPortalAncestor`) are pure functions in the pipeline. Host-canvas inputs (`availability`, `editingEmbeddingIds`, host body/title editing) and `portalNodesById` stay assembled in `SpaceCanvas` — they need host canvas context, not App coupling inside the hook — and are passed into those functions at the `EmbeddedDiagramAuthoring` mount site. Product behaviour is unchanged.
- [x] `SpaceCanvas` no longer owns edit-portal *state*; it consumes pipeline outputs (`editingPortals`, `portalDraft`, `setPortalDraft`). Native pointer/wheel gesture listeners remain a canvas `useEffect` because they must attach to the canvas DOM; they snapshot pipeline outputs and write drafts through the pipeline setter. Framing completions stay intact.
- [x] `pnpm verify` passes; edit-portal and embedded-diagram proofs (including Ladle where applicable) stay green.
