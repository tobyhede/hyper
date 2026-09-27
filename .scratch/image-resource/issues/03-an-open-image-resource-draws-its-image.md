# 03 — An Open Image Resource draws its image

**What to build:** An Open Image Resource is the Open Markdown Resource front with the image in place of the Markdown body (ADR 0107, refining ADR 0106): the same component, rail, divider, Title footer, Close and Title editing. The image fills the content area, contained and never scaled past its natural size; Resize stays free. `SnapshotEdit.open` stays synchronous — for the `image` kind with no remembered Open Size it reads the recorded natural size and writes an Open Size whose content area is that size at one pixel per canvas unit, scaled down proportionally to fit 1280×960, plus the Markdown front's chrome (its edge, the paper above the content, the divider and a one-line Title footer — one domain constant held equal to the stylesheet by a test), never smaller than the Closed size on either axis; displacement follows ADR 0084 from that size. A longer Title takes its room from the image. With no recorded natural size it opens at the default Open Size. An image that does not load leaves the Space valid, and the Open Resource shows its Title and a failed-image state naming the URL. The Title is the image's text alternative. Presenting draws the same content. Starts with `$shadcn-first-ui`.

**Blocked by:** 01

**Status:** resolved

- [x] The Open front is the Open Markdown Resource front with the image as its content (ADR 0107); the chrome the first Open adds is one constant, and a test fails if it and the stylesheet disagree.
- [x] With a recorded 400×300, the first Open's image area is 400×300 and the Open Size is that plus the chrome; 4000×3000 gives an image area of 1280×960; 16×16 gives the Closed size.
- [x] With no recorded natural size, the first Open uses the default Open Size.
- [x] Opening is one synchronous Edit; nothing waits on a network load.
- [x] Reopening after Close returns to the remembered Open Size, not a new measurement.
- [x] An unreachable URL draws the failed-image state with the URL; its Open Size follows the recorded natural size, if any, not whether the image loads now.
- [x] The `img` carries the Resource's name as its alternative text.
- [x] Ladle story and application proof for the Open front and the failed-image state (ADR 0052).

## Comments

**2026-09-27, resolved (PR #316).** The prototype of four borders was rejected in favour of the human's decision, recorded as ADR 0107: an Open Image Resource is the Open Markdown Resource front with the image as its content. The chrome is `OPEN_RESOURCE_CHROME` in `packages/core/src/resource-geometry.ts`, held to the stylesheet by `packages/ui/test/open-resource-chrome.test.ts`. The image is `object-fit: scale-down`, so a small picture is never enlarged. Presenting is proved by unit and projection tests, not in a browser. Replace in the failed-image state is ticket 05.
