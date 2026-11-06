# Puzzle Cats website

This repository contains the editable source and the generated GitHub Pages website for https://www.puzzlecats.com. Pages serves `master` from the repository root. `CNAME` preserves the live domain.

## Build and verify

Use Node.js 22+ and Python 3.11+:

```sh
cd site-source
npm ci
python3 scripts/prepare_pages_release.py
python3 scripts/prepare_pages_release.py --stage
```

Commit source and generated output together. Review the root output diff before pushing. The build never fetches or replaces sellers: root `app-ads.txt` is canonical and is validated and copied byte for byte. Edit that root file directly when authorized seller updates arrive. No second source/output repository or private repository access is required.

For browser checks run `npm run preview` and, in a second terminal, `npm run animation` (default URL http://127.0.0.1:8794; set PREVIEW_URL if needed). Install Playwright Chromium with `npx playwright install chromium`; alternatively set CHROME_PATH to a local Chrome executable. Browser reports are local, ignored files in site-source/evidence; create `site-source/evidence/native` before running them.

## Publication scope and rights

Only the current site source, selected build/QA tools, and assets already served by this public site are included. Historical captures, private audit evidence, obsolete Spline runtimes/scenes, and unrelated studio sources are excluded. The studio-family module is the static chrome already deployed on this site, now maintained here.

Three.js is MIT licensed; the build publishes its notice as assets/THREE-LICENSE.txt. Schibsted Grotesk is SIL OFL licensed with its existing notice. The Rifton font and company/game imagery were already public and are preserved byte for byte; no new license or redistribution grant is asserted. Company content and assets remain subject to their existing rights. Public analytics measurement IDs and seller identifiers are intentionally public site configuration, not credentials.
