# 03 — An Open Image Resource draws its image

**What to build:** Begin with a prototype of the Open front against the Open Space Resource: the Resource is the image plus its border, and the Title is part of the border rather than a band above the content (ADR 0106). The prototype settles the border's form and its dimensions; bring it to a human before building on it. Then: the image fills the area inside the border, contained; Resize stays free. `SnapshotEdit.open` stays synchronous — for the `image` kind with no remembered Open Size it reads the recorded natural size and writes an Open Size whose inner area is that size at one pixel per canvas unit, scaled down proportionally to fit 1280×960, plus the border, never smaller than the Closed size on either axis; displacement follows ADR 0084 from that size. With no recorded natural size it opens at the default Open Size. An image that does not load leaves the Space valid, and the Open Resource shows its Title and a failed-image state naming the URL. The Title is the image's text alternative. Presenting draws the same content. Starts with `$shadcn-first-ui`.

**Blocked by:** 01

**Status:** ready-for-human

- [ ] The border prototype is agreed before the rest is built.
- [ ] With a recorded 400×300, the first Open's image area is 400×300 and the Open Size is that plus the border; 4000×3000 gives an image area of 1280×960; 16×16 gives the Closed size.
- [ ] With no recorded natural size, the first Open uses the default Open Size.
- [ ] Opening is one synchronous Edit; nothing waits on a network load.
- [ ] Reopening after Close returns to the remembered Open Size, not a new measurement.
- [ ] An unreachable URL draws the failed-image state with the URL; its Open Size follows the recorded natural size, if any, not whether the image loads now.
- [ ] The `img` carries the Resource's name as its alternative text.
- [ ] Ladle story and application proof for the Open front and the failed-image state (ADR 0052).
