# AUV — project platform

The public web presentation for the **AUV (Autonomous Underwater Vehicle)** project.
It is a static website: plain HTML, CSS and JavaScript, no framework, no build step.

**Stage:** concept and prototype. The site reports no measured results, and no vehicle,
sensor or AI model is connected to it. Every fact, capability and specification on the
page carries a status tag (Confirmed, Conceptual, Planned / Prototype, Placeholder), and
nothing that the team has not provided is filled in — unknown values read *TBD*.

> This folder is separate from `../virtual-prototype/` (the earlier simulation prototype)
> and from the earlier Python exploration folder next to it. Neither was changed.

---

## 1. Run it locally

**Option A — open the file.** Double-click `index.html`. Everything uses relative paths
and plain (non-module) scripts, so it does not need a server.

**Option B — a local server** (what the automated checks used):

```bash
cd auv-platform
python -m http.server 8744
```

Then open <http://localhost:8744>.

## 2. What is on the page

| # | Section | Notes |
|---|---|---|
| 1 | Hero | Project name, one-line concept, the team's AUV design as provided |
| – | How to read this site | Status legend; selecting a status highlights matching items ("status lens") |
| 2 | Project overview | Facts at a glance, each with a status tag |
| 3 | The problem | Draft framing; Figure 1 (reference image, credit TBD) |
| 4 | Proposed AUV solution | Sense, analyse, support the decision, inspect |
| 5 | AUV design | **Interactive** inspection sheet (Figure 2) + specification skeleton (all TBD) |
| 6 | Operating environment | Depth-scope diagram (Figure 3): 1–5 m only |
| 7 | Sensor and data layer | Camera, multibeam echosounder, water column data; specification matrix (all TBD) |
| 8 | System workflow | **Interactive** 7-step stepper (Figure 4); steps 4–6 marked Planned / Prototype |
| 9 | Software and AI concept | Planned components, wording rule, Figures 5–6 (reference images) |
| 10 | Interactive demonstration | Placeholder — no simulation is running |
| 11 | Results and evidence | Deliberately empty: nothing measured yet |
| 12 | Future development | Intentions, no dates |
| 13 | Team and project | Placeholders for members, institution, contact |
| 14 | Project materials | The four Tuwaiq items: project photo, A0 poster, demo video, Google Drive |
| 15 | Footer | Scope and disclaimer |

**Interactive parts:** section index with scroll-spy (dropdown on narrow screens); status
lens; AUV inspection sheet (hover highlight, information panel, magnifier at 2×/3×/4×,
full-size viewer — the image itself is never modified); workflow stepper (mouse and
keyboard: arrows, Home, End).

## 3. Project structure

```
auv-platform/
├── index.html            the whole page (all sections)
├── 404.html              "page not found" page (self-contained)
├── favicon.svg           simple depth-band mark (not a drawing of the vehicle)
├── robots.txt            allows crawlers; sitemap line to add once a domain exists
├── .nojekyll             stops GitHub Pages from running Jekyll on the files
├── css/
│   ├── tokens.css        fonts + all colours, sizes and spacing (change the look here)
│   ├── base.css          reset, typography, header, section index, hero, footer
│   └── components.css    status tags, fact lists, figures, inspection sheet, stepper, slots…
├── js/
│   ├── main.js           section index + scroll-spy, status lens
│   ├── workflow.js       workflow stepper (accessible tab set)
│   └── auv-viewer.js     hover highlight, magnifier, full-size viewer
├── assets/
│   ├── fonts/            Archivo + Source Serif 4 (variable, latin subset, self-hosted)
│   └── images/           team AUV design + 3 reference images, CREDITS.md
└── docs/
    ├── content-status.md      every claim on the site and its status
    ├── design-decisions.md    decisions made while building Task 1
    └── submission-checklist.md  the four required materials + poster requirements
```

Fonts are self-hosted so the site makes no requests to third parties.

## 4. Filling in the placeholders

All placeholders are plain HTML in `index.html`; search for the text shown.

| To add… | Find… | Do this |
|---|---|---|
| Project photo | `Project Photo — To Be Uploaded` (`.material--photo`) | Replace the `.slot` block with an `<img>`; keep alt text and a caption. Do not use the CAD render as a "photo". |
| A0 poster | `A0 Scientific Poster` (`.material--poster`) | Add a preview image (and link to the PDF) inside the material block. |
| Demo video | `Demonstration Video — Coming Soon` | Add a link or embed. Embedding third-party players adds third-party requests. |
| Google Drive link | `Additional Materials — Google Drive link coming soon` | Add a real link. Its sharing setting must be **Anyone with the link can view**. Never add a made-up URL. |
| Team members etc. | `#team` section | Replace `To be added` rows. |
| A specification | Any `Specifications TBD` tag | Only when the team has confirmed the value; then change its status to Confirmed. |
| Image credits | `Credit TBD` tags, `assets/images/CREDITS.md` | Fill in credit and licence; remove the tag when done. |

Status tags are `<span class="tag" data-status="confirmed|conceptual|planned|placeholder">`,
and each item that should respond to the status lens carries a matching `data-item="…"`.

## 5. Deploy

The site is ready to publish as-is: upload the contents of this folder (not the folder
itself) to any static host. Nothing has been deployed or registered on your behalf, and
no account was changed.

### GitHub Pages (free)
1. Put this folder's contents in a GitHub repository (the repository root should contain `index.html`).
2. Repository → **Settings → Pages** → *Build and deployment*: Source **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repository>/` after a minute or two.
   (On a project URL like this, the link on `404.html` points to `/`; it is correct once a custom domain is connected.)

### Netlify (free tier)
1. **Add new site → Import an existing project** (connect the repository), or drag the folder onto the Netlify dashboard.
2. Build command: leave empty. Publish directory: `.` (the root).

### Cloudflare Pages (free tier)
1. **Workers & Pages → Create → Pages → Connect to Git.**
2. Framework preset: *None*. Build command: empty. Build output directory: `/`.

## 6. Connect a custom domain

A domain has to be bought from a registrar (or supplied by your institution); that is a
paid, account-level step and is **not** done for you. Once you own one:

1. Add the domain in your host's dashboard (GitHub: *Settings → Pages → Custom domain*; Netlify: *Domain management*; Cloudflare: *Pages project → Custom domains*).
2. At the registrar / DNS provider, create the records below.
3. Wait for DNS to propagate (minutes to a few hours), then switch on **Enforce HTTPS** (GitHub) — Netlify and Cloudflare issue the certificate automatically.

| Host | Apex domain (`example.com`) | `www` |
|---|---|---|
| **GitHub Pages** | four `A` records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (optional `AAAA` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`) | `CNAME` → `<user>.github.io` |
| **Netlify** | `A` → `75.2.60.5` (or use Netlify DNS and let it manage records) | `CNAME` → `<site-name>.netlify.app` |
| **Cloudflare Pages** | If the domain's DNS is on Cloudflare, adding it in the Pages dashboard creates the record for you (a proxied `CNAME` → `<project>.pages.dev`). Otherwise use `www` and redirect the apex. | `CNAME` → `<project>.pages.dev` |

GitHub also expects a file named `CNAME` in the repository root containing only the domain
(for example `auv.example.com`); it creates that file for you when you enter the domain in Settings.

> These provider values change rarely but do change. Confirm them in the provider's
> current documentation before editing DNS.

**After the domain works**, add these to `index.html` `<head>` (they need the real domain, which is why they are not there yet):
`<link rel="canonical" href="https://YOUR-DOMAIN/">`, `og:title`, `og:description`, `og:url`, and an `og:image` with an **absolute** URL. Optionally add `sitemap.xml` and a `Sitemap:` line in `robots.txt`.

## 7. Checks before going public

- [ ] Image credits and usage rights confirmed for Figures 1, 5 and 6 (`assets/images/CREDITS.md`).
- [ ] The Problem section wording reviewed by the team (it is draft copy).
- [ ] "Marine context: Red Sea" confirmed as current (carried over from the earlier brief).
- [ ] Team, institution and contact filled in, or that section removed.
- [ ] Project photo, poster, video and Drive link added, or left honestly as placeholders.
- [ ] No text implies real results, real sensors or an operating depth other than 1–5 m.

Optional hardening on hosts that allow custom headers (Netlify `_headers`, Cloudflare `_headers`):
`X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
The site loads only its own files, so a strict `Content-Security-Policy` (`default-src 'self'`) is possible later.

## 8. Data-integrity rules this site follows

- Never state a result, accuracy, detection rate, depth other than 1–5 m, hardware model, frequency, range or protocol the team has not provided — write `Specifications TBD` instead.
- The team's AUV image is shown exactly as provided; only the frame around it is styled.
- Anything simulated must be labelled *Simulation*; anything not yet built is *Conceptual* or *Planned / Prototype*.
- No links or media are invented: unfinished items say *Coming soon* / *To be uploaded*.

See `docs/content-status.md` for every claim and its status.
