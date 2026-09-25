# AUV — project website

The public website for the **AUV (Autonomous Underwater Vehicle)** project: project
information, the team's AUV design, an interactive software demo, a demonstration video
section, and supporting materials.

It is a static site — plain HTML, CSS and JavaScript, no framework and no build step.

---

## 1. Run it

**Option A — open the file.** Double-click `index.html`. Everything uses relative paths
and plain (non-module) scripts, so no server is needed.

**Option B — a local server:**

```bash
cd auv-platform
python -m http.server 8744
```

Open <http://localhost:8744>.

## 2. What is on the site

| Section | Content |
|---|---|
| Home | Name, one-line description, the team's AUV design, key facts |
| About AUV | What the AUV is, the problem, what the system does, operating environment (1–5 m) |
| How It Works | The 9-step flow from the underwater environment to the operator; sensing and communication; object recognition and decision support; selected Red Sea fish |
| AUV Design | The team's design image with a hover magnifier and full-size viewer |
| Interactive Demo | A scripted mission: scanning, detection, classification, decision support, target marking, inspection |
| Video | The demonstration video |
| Project Materials | A0 poster, project photo, additional materials (Google Drive) |

The single disclaimer about the software prototype is in the footer.

## 3. Structure

```
auv-platform/
├── index.html            the whole page
├── 404.html              "page not found" page
├── favicon.svg
├── robots.txt
├── .nojekyll             stops GitHub Pages from running Jekyll
├── css/
│   ├── tokens.css        fonts, colours, spacing (change the look here)
│   ├── base.css          reset, typography, navigation, hero, sections, footer
│   ├── components.css    cards, flow, AUV inspection sheet, video and material panels
│   └── demo.css          the interactive demo
├── js/
│   ├── main.js           navigation menu and current-section highlight
│   ├── auv-viewer.js     AUV image: hover highlight, magnifier, full-size viewer
│   └── demo.js           the demo (mission script, clock, drawing)
├── assets/
│   ├── fonts/            Archivo and Source Serif 4 (self-hosted)
│   └── images/           the AUV design and reference photographs
└── docs/                 team notes (not part of the site)
```

## 4. Adding your own content

Everything is plain HTML in `index.html`.

| To add | Where | How |
|---|---|---|
| Demonstration video | `#video`, the `.video-frame` block | Replace it with a link or an embedded player. |
| A0 poster | `#materials`, first card | Replace the dashed panel with a preview image linking to the PDF. |
| Project photo | `#materials`, second card | Replace the dashed panel with an `<img>` (with alt text). |
| Google Drive link | `#materials`, third card | Add the link. Its sharing setting must be "Anyone with the link can view". |
| Team, institution, contact | New section or the footer | Add when ready. |

**Demo content** lives at the top of `js/demo.js` (species, the man-made-object case, the
mission script and timings). To change what the demo shows, edit those values. The demo
uses no data or model from outside the page.

## 5. Deploy

Publish the contents of this folder (not the folder itself) on any static host. Nothing
has been deployed or registered for you.

**GitHub Pages** — put the files in a repository root, then *Settings → Pages → Build and
deployment → Deploy from a branch → `main` / `(root)`*.

**Netlify** — *Add new site → Import an existing project* (or drag the folder in). Build
command: empty. Publish directory: `.`.

**Cloudflare Pages** — *Workers & Pages → Create → Pages → Connect to Git*. Framework
preset: none. Build output directory: `/`.

## 6. Connect a custom domain

Buying a domain is a paid, account-level step that is not done for you. Once you own one:

1. Add the domain in the host's dashboard (GitHub: *Settings → Pages → Custom domain*;
   Netlify: *Domain management*; Cloudflare: *Pages project → Custom domains*).
2. Create the DNS records below at your registrar or DNS provider.
3. Wait for DNS to propagate (minutes to a few hours). Turn on *Enforce HTTPS* (GitHub);
   Netlify and Cloudflare issue the certificate automatically.

| Host | Apex domain (`example.com`) | `www` |
|---|---|---|
| GitHub Pages | four `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (optional `AAAA`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`) | `CNAME` to `<user>.github.io` |
| Netlify | `A` record `75.2.60.5` (or use Netlify DNS) | `CNAME` to `<site-name>.netlify.app` |
| Cloudflare Pages | Automatic when the domain's DNS is on Cloudflare; otherwise redirect the apex to `www` | `CNAME` to `<project>.pages.dev` |

GitHub also expects a file named `CNAME` in the repository root containing only the domain;
it creates the file when you enter the domain in *Settings*. These provider values change
rarely, but check the provider's current documentation before editing DNS.

After the domain works, add `canonical`, `og:title`, `og:description`, `og:url` and an
`og:image` (absolute URL) to the `<head>` of `index.html`, and optionally a `sitemap.xml`
with a `Sitemap:` line in `robots.txt`.

## 7. Before going public

- Add credits or usage rights for the reference photographs (`assets/images/CREDITS.md`).
- Add the video, poster, photo and Drive link when they exist.
- Optional hardening where the host supports headers: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`. The site loads only its own files, so a
  strict `Content-Security-Policy` (`default-src 'self'`) is possible.
