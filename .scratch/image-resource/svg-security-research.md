# SVG upload security: is ADR 0107's sandboxed same-origin serving the best documented approach?

Researched 2026-10-01 against primary sources, plus one local Chromium 149 experiment (method at the end). Question: ADR 0107 proposes serving stored images, now including unsanitised SVG, from `/images/<id>` on the app's own origin with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`, and the app draws them only through `<img>`.

## Answer

**Mostly, but not quite.** The ADR's mechanism is sound and its reasoning is correct: an SVG drawn through `<img>` runs no script and loads nothing, and `CSP: sandbox` gives a directly opened SVG an opaque origin and no script. That matches Google's documented guidance for serving active content when Spectre and renderer compromise are outside the threat model. Two gaps keep it short of the best documented approach:

1. **`sandbox` alone is not the header set anyone who serves untrusted SVG actually uses.** A sandboxed SVG opened directly still fetches: in Chromium 149 it still issued its CSS `@import` and `<image href>` requests. They went out cross-site and without SameSite cookies, but they did go out. GitHub serves every raw file, SVG included, with `default-src 'none'; style-src 'unsafe-inline'; sandbox`, which stopped every request in the same experiment. Google's list of isolation headers includes both `sandbox` and `default-src 'none'`, plus `Cross-Origin-Resource-Policy`.
2. **The strongest documented architecture is a separate origin, and the ADR does not say it chose against one.** Google, GitHub and Wikimedia all serve user files from a separate registrable domain. Google treats `CSP: sandbox` on the same origin as sufficient *only* when Spectre and renderer compromise are outside the threat model, and a dev-only prototype can reasonably put them there. The ADR should say so rather than leave it implicit.

Recommended changes to the decision, ranked:

1. **Change the header set** on every `GET /images/:id` 200 response, for all five formats (the "one rule" argument still holds, and GitHub sends the same CSP for PNG):
   - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` (GitHub's exact value; add `img-src data:; font-src data:` if a directly opened SVG should show its inline `data:` images and fonts the way `<img>` does)
   - `X-Content-Type-Options: nosniff` (already sent)
   - `Cross-Origin-Resource-Policy: same-origin` (Google lists `same-site`; since the app's own `<img>` is same-origin, either works. Choose knowingly, because it stops third-party pages embedding `/images/<id>`, and ADR 0106 says a URL "can be pasted anywhere")
   - optionally `X-Frame-Options: DENY` or `frame-ancestors 'none'` (GitHub sends XFO `deny`)
2. **State the threat model.** Same-origin serving is protected by the CSP sandbox and nothing else. It is not process isolation (web.dev), and a separate usercontent origin is the documented stronger option, deferred because there is no production. If the host ever gains authentication or a real deployment, that choice comes back.
3. **Keep storing the bytes unsanitised, but reword the justification.** No primary source requires sanitising when the file is served with these headers and drawn through `<img>`. However, the ADR's sentence "the sandboxed response already contains what sanitising would remove" is only true once `default-src 'none'` is added, because `sandbox` alone still lets the file fetch.
4. **Keep serving inline (no `Content-Disposition: attachment`).** That is a legitimate choice. Note that Google lists `attachment` among the isolation headers, but only for *inactive* content, and it classes SVG as *active*. Also, `attachment` does not stop `<img>` from drawing the file, so choosing it later would not break the app.

## Findings

### What the specs and MDN say (sources say)

- CSP3 defines `sandbox` as a policy the UA "will apply to a resource, just as though it had been included in an iframe with a sandbox property", and says it "will be ignored entirely when delivered in a Content-Security-Policy-Report-Only header, or within a meta element." [CSP3 §6.3.2](https://w3c.github.io/webappsec-csp/#directive-sandbox)
- In HTML, the directive populates a Document's "CSP-derived sandboxing flags". The sandboxed origin flag "forces content into an opaque origin", and the sandboxed scripts flag "blocks script execution". [HTML, sandboxing](https://html.spec.whatwg.org/multipage/browsers.html#csp-derived-sandboxing-flags). The algorithms name no Document type, so nothing in the spec exempts an SVG document. That point is inference from absence, and the experiment below confirms it in Chromium.
- MDN documents that an empty `sandbox` applies all restrictions, and lists the directive as Baseline widely available since November 2016. [MDN CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox). BCD data: Chrome 25, Firefox 50, Safari 7, Edge 14. [BCD](https://github.com/mdn/browser-compat-data/blob/main/http/headers/Content-Security-Policy.json)
- SVG referenced by an HTML `img`, or by any CSS `<image>` value, is in the "animated image document" or "static image document" referencing mode. Those use the secure processing modes, where "no script in the document must be run" and external fetches are "treated as if a network error occurred". A top-level or embedded document instead gets "dynamic interactive mode", with no restrictions. [SVG Integration (FPWD, 2014)](https://www.w3.org/TR/svg-integration/). The spec is still only a 2014 First Public Working Draft.
- MDN: an SVG used as an image has JavaScript disabled and cannot load external resources. These restrictions do not apply when the SVG is viewed directly or embedded through `<iframe>`, `<object>` or `<embed>`. [MDN, SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
- HTML: a `Content-Disposition: attachment` response causes a *navigation* to abort and download. [HTML, navigating](https://html.spec.whatwg.org/multipage/browsing-the-web.html). It is a navigation behaviour. The experiment confirms that `<img>` ignores it.

### Chromium 149 experiment (observed)

A local Node server served one SVG containing `<style>@import</style>`, `<image href>` and a CDATA `<script>` that calls `fetch` with credentials and probes `parent.document`. The page had first set `SameSite=Lax` and `SameSite=Strict` cookies.

| Served with | Opened directly | In `<iframe>`/`<object>` on the app origin | In `<img>` |
|---|---|---|---|
| no CSP | script ran, same origin, cookies sent; subresources fetched with cookies | script ran **and read `parent.document`** | nothing ran or fetched |
| `sandbox` | no script; `@import` and `<image>` still fetched, `Sec-Fetch-Site: cross-site`, no cookies | same as direct | nothing |
| `default-src 'none'; style-src 'unsafe-inline'; sandbox` | no script, **no requests** | same | nothing |

- With `sandbox` plus `Content-Disposition: attachment`: `<img>` still drew the file (naturalWidth 100), and direct navigation downloaded it.
- So the ADR's two claims hold in Chromium: `<img>` is inert, and `sandbox` blocks script and gives an opaque origin. The same header also covers a third-party `<iframe>`/`<object>` embedding, because the policy travels with the response. The one gap is that `sandbox` alone still lets the file make network requests.

### Industry practice (observed response headers and source code)

- **GitHub** serves `raw.githubusercontent.com` files (`.svg` as `image/svg+xml`, and `.png` too) with `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `x-content-type-options: nosniff`, `x-frame-options: deny` and `cross-origin-resource-policy: cross-origin`, from a separate registrable domain. `user-images.githubusercontent.com` sends `default-src 'none'; script-src 'none'; img-src 'self'; media-src 'self'; sandbox;`. (`curl -I` on 2026-10-01.) Camo, GitHub's image proxy, sends `default-src 'none'; img-src data:; style-src 'unsafe-inline'`, plus `nosniff` and XFO `deny`. [camo server.coffee](https://github.com/atmos/camo/blob/master/server.coffee). GitHub docs say proxied images are served from `<subdomain>.githubusercontent.com`. [GitHub Docs, anonymized URLs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-anonymized-urls)
- **Google** (web.dev, David Dworken, updated 2023-06-08):
  - Inactive content ("not HTML or JavaScript, for example images and downloads") "can now be safely done without an isolated sandbox domain" if the response carries `X-Content-Type-Options: nosniff`, `Content-Disposition: attachment; filename="download"`, `Content-Security-Policy: sandbox`, `Content-Security-Policy: default-src 'none'` and `Cross-Origin-Resource-Policy: same-site`, with an "isolated subdomain" as further hardening.
  - It names "HTML or SVG images" as *active* content. For that it says "If SpectreJS and renderer compromise attacks are outside of your threat model, then using CSP sandbox is likely a sufficient solution", and otherwise recommends a per-content sandbox domain behind a shim.
  - [web.dev, Securely hosting user data](https://web.dev/articles/securely-hosting-user-data)
  - The newer SafeContentFrame post moves to a `usercontent.goog` sandbox domain. [Bug Hunters blog](https://bughunters.google.com/blog/beyond-sandbox-domains-rendering-untrusted-web-content-with-safecontentframe) (the page renders client-side, so its body could not be read; the summary comes from search-result snippets).
- **Wikimedia** combines three layers:
  - It serves originals from the separate domain `upload.wikimedia.org` with `nosniff` and a strict CSP that is *report-only* (`default-src 'none'; script-src 'none'; style-src 'unsafe-inline' data:; …`), not enforced. (`curl -I`.)
  - It displays SVG as rasterised PNG thumbnails (`…/thumb/…svg/120px-…svg.png` → `image/png`).
  - At upload, MediaWiki **rejects** (it does not rewrite) SVGs containing `script`, `handler`, `stylesheet`, `iframe`, event-handler attributes, `javascript:` or remote `href`s, `data:` hrefs of unsafe types, animate/set tricks, and hostile CSS. [UploadVerification.php @ a56b4753](https://github.com/wikimedia/mediawiki/blob/a56b475307bdee8e597a24c0cb87464ad4ae9632/includes/Upload/UploadVerification.php) (`detectScriptInSvg`, `checkSvgScriptCallback`)
- **WordPress** core does not admit SVG: `wp_get_mime_types()` has no `svg` entry. [functions.php (trunk)](https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-includes/functions.php)

### OWASP (sources say)

- The File Upload Cheat Sheet says to "Store the files on a different server. If that's not possible, store them outside of the webroot", and to use CDR "if applicable type (PDF, DOCX, etc...)". It names client-side active content (XSS, CSRF) as a risk, and says the Content-Type "cannot be trusted". It says nothing about SVG, `Content-Disposition`, `nosniff`, CSP or a separate *origin*; its "different host" is about segregating storage and server duties. [File Upload Cheat Sheet source](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/File_Upload_Cheat_Sheet.md). This repo already follows its "don't trust the declared type" rule, since `admitImage` decides from the bytes.
- The XSS Prevention and HTTP Headers cheat sheets contain no SVG-specific upload guidance (grep of their sources). SVG appears in the XSS Filter Evasion Cheat Sheet only as attack vectors. [XSS Filter Evasion](https://cheatsheetseries.owasp.org/cheatsheets/XSS_Filter_Evasion_Cheat_Sheet.html)

### Sanitisers (sources say)

- DOMPurify supports `USE_PROFILES: { svg: true, svgFilters: true }` and runs server-side only with an up-to-date jsdom ("happy-dom … will likely lead to XSS"). It warns that modifying output after sanitising can "void the effects of sanitization". [DOMPurify README](https://github.com/cure53/DOMPurify)
- The HTML Sanitizer API is "Limited availability" (not Baseline). It targets HTML fragments and documents (`setHTML`, `Document.parseHTML`), and nothing documented covers a standalone SVG file. [MDN, HTML Sanitizer API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API)

### Inference (mine, not a source's)

- The CSRF-shaped risk the ADR worries about is closed:
  - `sandbox` blocks script and forms (no `allow-forms`).
  - The opaque origin makes any fetch cross-site, so Lax and Strict cookies are withheld (observed).
  - `/api/spaces` mutations are JSON `PUT`/`POST`, which markup-only GETs cannot forge.
  - A `SameSite=None` cookie *would* ride a sandbox-only subresource GET. The app has no cookies, and `default-src 'none'` removes the case anyway.
- A sandboxed, directly opened SVG can still draw a convincing page and hold clickable links, which is a phishing surface on the app's own URL. `sandbox` does not prevent that, and only a separate origin changes whose URL is in the address bar. For a dev-only prototype this is negligible.
- The id argument against sanitising is a real trade-off but not a forced one. Sanitising at admission and hashing the *sanitised* bytes would keep content addressing; the cost is that a tracked fixture's URL would depend on the sanitiser's output and version. With the header set above, no source requires sanitising.

## Could not verify

- Whether Firefox and Safari apply a response-header `CSP: sandbox` (opaque origin, no script) to a directly navigated `image/svg+xml` document. BCD reports the directive's support but not per document type, and only Chromium was available locally.
- The full text of Google's Bug Hunters posts ("Securely hosting user data…" original, SafeContentFrame, "XSS in sandbox domains"), which render client-side. The web.dev copy was used instead.
- WordPress core's stated reasoning for excluding SVG (Trac #24251 answered 403). Only the code fact is cited.
- The Sanitizer API's per-browser compatibility table (MDN's table did not render in the fetch).
- Whether `SameSite=None` cookies accompany a sandboxed document's subresource requests (inferred, not tested).

## Method

- Response headers were collected with `curl -sI` on 2026-10-01 from `raw.githubusercontent.com`, `user-images.githubusercontent.com` and `upload.wikimedia.org`.
- The experiment script was `node exp.mjs` with Playwright 1.61.1's Chromium 149.0.7827.55 against a throwaway `node:http` server on an ephemeral port. It was kept in the session scratchpad, not committed. Each row was reproduced by loading the SVG directly, in `<img>`, in `<iframe>` and in `<object>` under each header set, and recording `/beacon` hits with their `Cookie` and `Sec-Fetch-Site` headers.
