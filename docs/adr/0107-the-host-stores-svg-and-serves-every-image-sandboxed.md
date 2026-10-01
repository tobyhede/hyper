# The host stores SVG, and serves every stored image sandboxed

Status: proposed
Refines: 0106

ADR 0106 left SVG for its own decision, and storing refused it with a code of its own, `image-svg-unsupported`. An Image Resource could already show an SVG from an external URL, because an external URL shows whatever the browser can draw, so the refusal only stopped an author who had the file and no URL for it. The host now stores SVG as a fifth format, `image/svg+xml`, identified from the bytes by the SVG detection storing already does, under the same 10 MiB cap and content-addressed id as the other four. `image-svg-unsupported`, its Problem Details type and its copy are deleted rather than kept, and an SVG declared by the browser is sent like any other image type.

The risk an SVG brings is that it is a document, not only a picture. An Image Resource draws its picture through `<img>`, where an SVG runs no script and fetches nothing, so drawing one is inert. Opening `/images/<id>` directly, or another page framing it, is not: the browser renders the SVG as a document on the application's own origin, and any script in it can call `/api/spaces` as the author. So **every stored image is served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`**, the policy GitHub serves its raw user files with. `sandbox` gives the document an opaque origin and no script; `default-src 'none'` stops it fetching anything, which `sandbox` alone does not — a sandboxed SVG still loads a CSS `@import` or an `<image href>`; `style-src 'unsafe-inline'` lets its own styles draw. A picture drawn through `<img>` still draws under it, so it changes nothing about how a Resource draws its picture. The header is sent for all five formats rather than for SVG alone, because it costs a raster image nothing and one rule leaves no format branch to get wrong. `X-Content-Type-Options: nosniff` stays, holding the browser to the admitted media type.

**This rests on the policy alone.** The stored image shares the application's origin, so the policy is the only thing between a hostile SVG and the application, and a policy is not process isolation. The documented stronger arrangement is a separate origin for stored content, as GitHub (`githubusercontent.com`), Google (`googleusercontent.com`) and Wikimedia (`upload.wikimedia.org`) serve theirs from. It is not taken while the prototype has no production and no users; it is the first thing to revisit when it does.

**The bytes are stored as sent.** The id is the SHA-256 of the bytes the author sent, which is what lets a fixture know its image URLs from its tracked files and lets the same file always get the same URL. With the policy above, a script or a fetch in a stored SVG does nothing when it is drawn or opened, so no source consulted requires sanitising as well. Sanitising with DOMPurify when storing, as defence in depth, is a possible follow-up (`.scratch/image-resource/issues/09-sanitise-a-stored-svg.md`); it would store the sanitised bytes and make the id their digest.

**The natural size is what the browser measures, as for every format.** An SVG with a `width` and `height` records them. For an SVG with only a `viewBox`, or neither, whatever size the browser reports is recorded, and where it reports none the Resource records none and Opens at the default Open Size, as an image that did not load does. The host does not parse an SVG to find a size, because measurement stays the browser's one job (ADR 0106) and a `viewBox` gives an aspect ratio, not a size.

## Considered options

- **Keep refusing SVG.** Rejected. The picture is already reachable through an external URL, so the refusal protects nothing the policy does not, and the author's only way round it is to host the file somewhere else.
- **`Content-Security-Policy: sandbox` alone.** Rejected: a sandboxed SVG still fetches what it references.
- **Validate SVG when storing it, and refuse anything suspicious.** Rejected. No maintained validator does this: DOMPurify sanitises rather than refuses, and warns against using what it removed for a security decision; MediaWiki's validator is PHP, and refuses script-free SVGs Inkscape writes. A validator here would be a hand-written denylist, which is what the policy makes unnecessary.
- **Serve a separate origin for stored images.** The stronger arrangement, deferred while there is no production (above).
- **Rasterise SVG when storing it.** Rejected. It loses what makes an SVG worth having, and puts a renderer in the host.
- **Serve every image as an attachment (`Content-Disposition: attachment`).** Not chosen. It stops a directly opened image rendering at all, where the policy lets the author still look at it safely, and `<img>` ignores it.

Sources and the Chromium checks behind the policy are in `.scratch/image-resource/svg-security-research.md`.
