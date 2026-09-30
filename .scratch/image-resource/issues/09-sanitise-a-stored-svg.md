# 09 — Sanitise a stored SVG

**What to build:** Defence in depth behind ADR 0107's response policy: when the host stores an SVG, it sanitises it with DOMPurify's SVG profile (`{ USE_PROFILES: { svg: true, svgFilters: true } }`) and stores the sanitised bytes, whose SHA-256 is the image's id. DOMPurify runs server-side only over the latest jsdom; its README says happy-dom "will likely lead to XSS". Needs an ADR refining ADR 0106 first, because the id stops being the digest of the bytes the author sent.

**Blocked by:** ADR 0107 accepted and SVG stored.

**Status:** needs-triage

**Why deferred:** With `default-src 'none'; style-src 'unsafe-inline'; sandbox` on every stored image, a script or fetch in a stored SVG already does nothing when drawn or opened, so this is a second layer rather than the protection. Take it up if the policy is found not to hold in a browser (Firefox and Safari are unverified, `svg-security-research.md`), or before stored images are served anywhere with users.

- [ ] Decide what the id is the digest of, and record it (refines ADR 0106).
- [ ] Sanitising is deterministic: the same SVG always stores the same bytes, so a fixture's image URL is still known from its tracked file.
- [ ] A hostile SVG (script, `on*` attribute, `foreignObject`, `javascript:` or external `href`) stores without them; an ordinary Inkscape SVG stores and draws as before.
- [ ] Browser-side, the author learns nothing new: sanitising is not a refusal.
