# USV B01 — Unmanned Surface Vehicle

USV B01 is an unmanned surface vehicle concept for detecting naval mines and other underwater
hazards, with explainable decision support and inspection prioritization. Working at the water
surface, it covers an area with a cross-hatch grid survey and scans the water column and the seabed
below it with multibeam sonar (conceptual survey depth band 0–60 m, 60 m maximum).

This repository is the project website: project information, the team's B01 design render, an
interactive software simulation of the survey mission, and a Results section that keeps the
software outcome apart from the proposed field capabilities. All demo values are simulated. The
repository and the site address still carry the project's earlier name (`auv-platform`).

**Live website:** https://moalqrnixd20000-design.github.io/auv-platform/

It is a static site (plain HTML, CSS and JavaScript). There is no build step and no backend.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8744
```

## Publishing (GitHub Pages)

The site is published by GitHub Actions (`.github/workflows/`) on every push to `main`
(*Settings → Pages → Build and deployment → Source: GitHub Actions*).

All paths are relative, so the site works from the project address
(`https://<user>.github.io/auv-platform/`) as well as from a custom domain.

## Interactive demo — survey logic

The demo is a **software simulation**, not a record of the vehicle's performance. Every number
below is a simulation parameter or is calculated from one.

**Two-pass crosshatch coverage (coverage path planning).**

1. **Pass A — Primary Survey Pass.** A complete horizontal boustrophedon (lawn-mower) sweep of the
   rectangular survey area: survey legs run east / west, alternating direction, joined by end turns.
2. **Transition leg** from the end of Pass A to the start of Pass B.
3. **Pass B — Orthogonal Crosshatch Pass.** A second complete boustrophedon sweep of the *same* area,
   rotated 90°: survey legs run north / south (perpendicular transects).
4. **Cross-pass verification** summary, then mission complete.

**Parameterised geometry** (`js/survey-model.js`, no line count is hard-coded):

- `lines = ceil(extent / requestedLineSpacing)`, `actualSpacing = extent / lines`;
  each line sits in the middle of its strip: `actualSpacing / 2 + i × actualSpacing`.
- The demo's survey area (400 m × 240 m, requested spacing 40 m): Pass A has 6 horizontal lines at
  y = 20 … 220 m, Pass B has 10 vertical lines at x = 20 … 380 m.
- Pass B can be run four ways (start west or east, start south or north). The variant whose first
  waypoint is closest to the end of Pass A is chosen; the order of the candidates is fixed, so a tie is
  always resolved the same way. An explicit transition leg joins the two passes — the vessel never jumps.
- End turns are drawn as half circles just outside the area and the transition as a smooth curve.
  They are **visualisation only** and say nothing about the vehicle's turning ability. Every segment
  is a polyline; route distances are the lengths of the generated polylines, so
  *total = Pass A + transition + Pass B* exactly. For reference, the same lines with straight
  connectors give 2,600 m + 2,760 m = 5,360 m (Red Sea, without the transition).

**Coverage.** The survey area is 400 × 240 = 96,000 m² whatever the number of passes. Unique coverage
is counted on a 5 m plan-view grid: a cell counts once when its centre falls inside the simulated
swath (50 m — a simulation parameter) of a survey leg that has been run. Overlap between
neighbouring swaths and between the two passes is never counted twice, so coverage cannot exceed
100 %. Turns and the transition add no coverage. With a 50 m swath and 40 m spacing, Pass A alone
already covers the area in this simulation; Pass B adds a **second observation from a perpendicular
heading** (redundancy), not new area. The demo shows unique coverage, Pass A progress, Pass B
progress and the area seen on both headings separately.

**Targets and observations.** Targets have fixed plan-view coordinates (x east, y north, metres from
the south-west corner) and a separate depth; depth is never a map axis. A target is observed on a
pass when it lies within half a swath of a survey leg of that pass; the observation is taken on the
first such leg, when the vessel is abeam. Each target is therefore observed once on Pass A (full
detection → analysis → classification → risk → decision → alert and marking) and once on Pass B,
with headings about 90° apart. The second observation updates the same target record and the same
map marker. It does **not** increase certainty: the lionfish stays Non-Hazardous, the shipwreck stays a
Potential Hazard requiring inspection, the potential mine stays a High Potential Hazard that requires
verification and is never reported as confirmed, and the unknown object remains
*Unknown — Requires Verification*.

**Clock.** One deterministic mission clock drives everything. Pause freezes the clock, the vessel, the
events and the animations; Reset clears the route progress, coverage, markers, observations, log,
alerts and timeline. Demo time is compressed and does not represent vehicle speed.

**Tests.** Open `tests/survey-model.html` in a browser (or `http://localhost:8744/tests/survey-model.html`)
to run the checks of the survey model: line counts, serpentine order and orientation, route
continuity, route length, Pass B entry selection, target observation scheduling and coverage limits.

**Limitations.** No real sensor, vehicle dynamics, currents, navigation error or detection
probability is modelled. The decision engine is a rule-based, explainable simulation, not a trained
model. Reference images are not a live feed from B01.

## Contents

- `index.html` — the page
- `css/`, `js/` — styles and scripts (`js/survey-model.js` is the survey model, `js/demo.js` the interactive demo)
- `tests/` — browser test page for the survey model
- `assets/` — the B01 design render, reference photographs and fonts (the earlier AUV image is kept but no longer displayed)
- `docs/` — notes for the team
