# 02 — Ur Resource on the canvas and when presenting

Status: resolved
Blocked by: 01

**What to build:** an Ur Resource draws like any Resource Closed. Open, Close, Resize, Open Size and displacement are the ordinary ones; an Open Ur Resource shows only its Title, with no content area body. It offers no Edit (its rail and entity menu carry Open/Close and every other Resource action, Create Reference included). Presenting stops on it and draws its Title as a title slide. A Reference Resource to an Ur Resource draws the same empty content read-only. A kind glyph for `ur` joins `icons.tsx`.

**Acceptance:** `resource-display`, `CanvasResource`, `PresentedResource`, `ResourceNode`, `canvas-resource-authoring` and `canvas-resource-decoration` handle the `ur` arm; unit tests cover Open with no Edit, presenting, and a Reference to an Ur Resource; Ladle story and application proof per ADR 0052 if a new story is added.
