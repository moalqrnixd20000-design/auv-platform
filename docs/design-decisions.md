# Decisions made while building Task 1

The brief asked for any decision outside its text to be documented. These are all of them.

| # | Decision | Why | Easy to change? |
|---|---|---|---|
| 1 | Built in a **new folder `auv-platform/`**; `virtual-prototype/` (earlier simulation) and the earlier Python exploration folder were not touched. | "Rebuild from a clean foundation" without destroying earlier work. The earlier simulation may later be reused for the demonstration section. | Yes |
| 2 | **Plain HTML/CSS/JS, classic scripts (no ES modules).** | No dependencies; deployable anywhere; `index.html` still works when double-clicked (modules are blocked on `file://`). | – |
| 3 | **Light "technical report" look** (cool paper ground, deep marine ink, hull-gold accent sampled from the team's render) instead of the earlier dark console. | Long-form reading for judges; the AUV render has a light background and sits naturally on a light page without blend modes that would alter its colours. | Yes (`css/tokens.css`) |
| 4 | **Status system** (Confirmed / Conceptual / Planned·Prototype / Placeholder) on every fact, plus a highlight "lens". | The brief's central requirement is distinguishing confirmed from conceptual/future content. | Yes |
| 5 | **No per-part hotspots on the AUV** (no "this is the camera / multibeam"). | The team has not said which component is which; labelling parts would invent specifications. The interaction is hover highlight, information panel, magnifier and full-size view. | Add later once the team supplies part names. |
| 6 | The AUV render (`auv-team-design.jpg`, the clean version supplied in this task) is **byte-for-byte unmodified**; no blend modes, filters or cropping. | "Do not modify the design." | – |
| 7 | **Fonts self-hosted** (Archivo, Source Serif 4, latin subset). | No third-party requests; works offline at a demo venue. | Yes |
| 8 | **No Content-Security-Policy meta tag.** | It risked breaking `file://` opening, the simplest way to view the site. Header-based CSP is documented in the README for hosts that support it. | Yes |
| 9 | **Red Sea** kept as marine context for the species component, marked Confirmed. | Carried over from the earlier brief; Task 1 does not mention it. **Please confirm it is still current.** | Yes |
| 10 | **Reference images** (wreck, two lionfish) are used only as labelled context (Figures 1, 5, 6), never as detection results. Credit: TBD. | Provenance and licence are unknown; they must be confirmed before public launch. | Yes |
| 11 | **"The problem" text is draft copy** written from general, non-numeric statements. | No statistics were provided, so none are given. The team should review the wording. | Yes |
| 12 | The **Interactive demonstration** section is a placeholder, not a mock simulation. | Task 1 excludes mission simulation; a fake-looking demo would blur simulated and real. | – |
| 13 | **Project photo** slot does not show the CAD render. | The brief says not to present fake hardware photography. | Yes |
| 14 | Poster requirements are kept in `docs/submission-checklist.md`, **not** shown on the public page. | They are instructions for the team, not content for visitors. | Yes |
| 15 | A `favicon.svg` was added: a depth band, not a vehicle drawing. | Avoids depicting a vehicle other than the team's. | Yes |
| 16 | `README` lists DNS values for GitHub Pages / Netlify / Cloudflare from the providers' documentation as known to me; **not verified live**, so the README tells the reader to re-check them. | No network verification was done for these. | – |
