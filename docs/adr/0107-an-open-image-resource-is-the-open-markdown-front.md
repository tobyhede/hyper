# An Open Image Resource is the Open Markdown Resource front

Status: accepted
Refines: 0106
Related: 0064, 0066, 0083

ADR 0106 said an Open Image Resource is its image inside a border that carries the Title, and left that border's form to a prototype. The prototype drew four borders against the Open Space Resource. None was taken. An Image Resource and a Markdown Resource differ only in their content, so an Open Image Resource **is the Open Markdown Resource front** — the same component, rail, content area, divider, Title footer, Close and Title editing — with the image where the Markdown body is. Closed, it is the Closed Markdown front with the image kind glyph, which ADR 0106 already said.

## What it is

- **The image is the content.** It is drawn inside the content area, contained and never scaled past its natural size, centred on the Resource's paper. Resize stays free.
- **The Open Size rule's "border" is that front's chrome.** The first Open writes an Open Size whose content area holds the recorded natural size at one pixel per canvas unit, scaled down to fit 1280×960, plus the chrome: the Resource's edge on four sides, the paper above the content, the divider and a Title footer of **one** line. The chrome is one constant in the domain, held equal to what the front draws by a test. A longer Title takes its room from the image, which stays contained; the Open Size does not grow to fit it.
- **The failed-image state is drawn in the content area**, naming the URL. The Title stays in the footer.
- **Presenting draws the same content**: the presented Resource shows its name and its image.

## Considered options

- **A border of its own**: a Title strip, an ink sill carrying the Title, a tab on the top edge, a label over the image. Rejected. Each is a second Open front for one kind, and the tab moves the Title between Closed and Open, which ADR 0083 rules out.
