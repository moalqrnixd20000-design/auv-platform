# AUV — Autonomous Underwater Vehicle

An autonomous underwater vehicle concept for underwater object detection, hazard assessment,
explainable decision support and inspection prioritization (conceptual operating range 1–30 m).
This repository is the project website: project information, the team's AUV design, an
interactive software simulation of a grid survey mission, a demonstration video section, and
supporting materials. All demo values are simulated.

**Live website:** https://moalqrnixd20000-design.github.io/auv-platform/

It is a static site (plain HTML, CSS and JavaScript). There is no build step and no backend.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8744
```

## Publishing (GitHub Pages)

The site is published from the `main` branch, `/ (root)` folder:

*Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`.*

All paths are relative, so the site works from the project address
(`https://<user>.github.io/auv-platform/`) as well as from a custom domain.

## Contents

- `index.html` — the page
- `css/`, `js/` — styles and scripts (`js/demo.js` is the interactive demo)
- `assets/` — the AUV design image, reference photographs and fonts
- `docs/` — notes for the team
