/* AUV project site — survey model (software simulation, no DOM).

   Coverage path planning for the demo mission: a two-direction crosshatch.

     Pass A  primary survey pass: a horizontal boustrophedon (lawn-mower)
             sweep over the whole rectangle, legs running east / west.
     T       transition leg from the end of Pass A to the start of Pass B.
     Pass B  orthogonal crosshatch pass: a second, complete boustrophedon
             sweep over the same rectangle, legs running north / south.

   Everything is generated from the scenario (width, height) and the survey
   configuration (requested line spacing, simulated swath); no line count or
   distance is hard-coded. All values are simulation parameters, not
   validated vehicle or sensor specifications.

   Plan view only: x = metres east of the south-west corner, y = metres
   north of it. Depth is a separate target attribute, never a map axis.

   Path representation: every segment is a polyline. Survey legs are exact
   straight lines; end turns (half circles just outside the area) and the
   transition (a cubic Bézier) are drawn for visualisation only and are
   approximated by sampled points. Every length is the length of that
   polyline, so the route total is the sum of what is drawn. The turn shape
   says nothing about the vehicle's real turning ability.

   Exposed as window.AUVSurvey (classic script, works from file://). */
(function (root) {
  "use strict";

  var TURN_STEPS = 24;        // points per half-circle end turn
  var TRANSITION_STEPS = 32;  // points on the transition curve
  var EPS = 1e-9;

  /* ---------- small geometry helpers ---------- */

  function dist(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1]; return Math.sqrt(dx * dx + dy * dy); }

  /* compass heading of a direction vector: 0 = north, 90 = east */
  function headingOf(dx, dy) { return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; }

  function polylineLength(points) {
    var sum = 0;
    for (var i = 1; i < points.length; i++) sum += dist(points[i - 1], points[i]);
    return sum;
  }

  /* smallest angle between two survey headings, modulo 180 (aspect difference) */
  function aspectDifference(h1, h2) {
    var d = Math.abs(h1 - h2) % 180;
    return Math.min(d, 180 - d);
  }

  /* ---------- survey lines ---------- */

  /* Lines across an extent: as few as needed so the spacing does not exceed
     the requested spacing; each line sits in the middle of an equal strip. */
  function lineSet(extent, requestedSpacing) {
    var count = Math.max(1, Math.ceil(extent / requestedSpacing - EPS));
    var spacing = extent / count;
    var positions = [];
    for (var i = 0; i < count; i++) positions.push(spacing / 2 + i * spacing);
    return { count: count, spacing: spacing, positions: positions };
  }

  /* One boustrophedon pass.
     axis "x": legs run along x (east / west), lines are y positions.
     axis "y": legs run along y (north / south), lines are x positions.
     lines must already be in flying order; firstForward = first leg runs
     from lo to hi along the leg axis. Legs alternate direction. */
  function serpentine(pass, axis, lines, lo, hi, firstForward) {
    function xy(along, cross) { return axis === "x" ? [along, cross] : [cross, along]; }
    var segs = [];
    for (var i = 0; i < lines.length; i++) {
      var forward = (i % 2 === 0) === firstForward;
      var a0 = forward ? lo : hi, a1 = forward ? hi : lo, c = lines[i];
      segs.push({
        pass: pass, type: "survey", axis: axis, lineId: pass + (i + 1), lineIndex: i, cross: c,
        points: [xy(a0, c), xy(a1, c)]
      });
      if (i < lines.length - 1) {
        /* half-circle end turn just outside the area, from line i to line i+1 */
        var c2 = lines[i + 1], r = Math.abs(c2 - c) / 2, out = a1 === hi ? 1 : -1, pts = [];
        for (var k = 0; k <= TURN_STEPS; k++) {
          var th = (Math.PI * k) / TURN_STEPS;
          pts.push(xy(a1 + out * r * Math.sin(th), c + ((c2 - c) * (1 - Math.cos(th))) / 2));
        }
        segs.push({ pass: pass, type: "turn", axis: axis, points: pts });
      }
    }
    return segs;
  }

  function lastDirection(seg) {
    var p = seg.points, a = p[p.length - 2], b = p[p.length - 1], l = dist(a, b) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  }

  /* The four ways to fly Pass B (start west or east, start south or north).
     Fixed order, so a tie is always resolved the same way. */
  function passBVariants(area, B) {
    var asc = B.positions.slice(), desc = B.positions.slice().reverse();
    return [
      { key: "west-south", lines: asc, firstForward: true },
      { key: "west-north", lines: asc, firstForward: false },
      { key: "east-south", lines: desc, firstForward: true },
      { key: "east-north", lines: desc, firstForward: false }
    ].map(function (v) {
      v.entry = [v.lines[0], v.firstForward ? 0 : area.height];
      return v;
    });
  }

  /* Transition: a cubic Bézier that leaves Pass A along its last heading and
     joins Pass B along its first heading (visualisation of a smooth join). */
  function transitionSegment(from, dirFrom, to, dirTo, handle) {
    var p1 = [from[0] + dirFrom[0] * handle, from[1] + dirFrom[1] * handle];
    var p2 = [to[0] - dirTo[0] * handle, to[1] - dirTo[1] * handle];
    var pts = [];
    for (var k = 0; k <= TRANSITION_STEPS; k++) {
      var t = k / TRANSITION_STEPS, u = 1 - t;
      var b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      pts.push([
        b0 * from[0] + b1 * p1[0] + b2 * p2[0] + b3 * to[0],
        b0 * from[1] + b1 * p1[1] + b2 * p2[1] + b3 * to[1]
      ]);
    }
    return { pass: "T", type: "transition", points: pts };
  }

  /* ---------- the route ---------- */

  function buildRoute(area, cfg) {
    var A = lineSet(area.height, cfg.lineSpacing);   // horizontal lines (y positions)
    var B = lineSet(area.width, cfg.lineSpacing);    // vertical lines (x positions)

    /* Pass A starts at the south-west corner, first leg eastbound. */
    var segs = serpentine("A", "x", A.positions, 0, area.width, true);
    var lastA = segs[segs.length - 1];
    var endA = lastA.points[1];

    /* Pass B: the variant whose first waypoint is closest to the end of Pass A. */
    var variants = passBVariants(area, B);
    variants.forEach(function (v) { v.gap = dist(endA, v.entry); });
    var chosen = variants.reduce(function (best, v) { return v.gap < best.gap - EPS ? v : best; });
    var segsB = serpentine("B", "y", chosen.lines, 0, area.height, chosen.firstForward);

    segs.push(transitionSegment(endA, lastDirection(lastA), chosen.entry, lastDirection(segsB[0]),
      Math.max(A.spacing, B.spacing) / 2));
    segs = segs.concat(segsB);

    /* cumulative distances along the route */
    var d = 0;
    segs.forEach(function (s, i) {
      s.id = i;
      s.cum = [0];
      for (var k = 1; k < s.points.length; k++) s.cum.push(s.cum[k - 1] + dist(s.points[k - 1], s.points[k]));
      s.length = s.cum[s.cum.length - 1];
      s.d0 = d;
      s.d1 = d + s.length;
      s.x0 = s.points[0][0]; s.y0 = s.points[0][1];
      s.x1 = s.points[s.points.length - 1][0]; s.y1 = s.points[s.points.length - 1][1];
      if (s.type === "survey") s.heading = headingOf(s.x1 - s.x0, s.y1 - s.y0);
      d = s.d1;
    });

    function sum(pass, type) {
      return segs.reduce(function (acc, s) { return acc + (s.pass === pass && (!type || s.type === type) ? s.length : 0); }, 0);
    }
    var lengths = {
      A: sum("A"), legsA: sum("A", "survey"), turnsA: sum("A", "turn"),
      T: sum("T"),
      B: sum("B"), legsB: sum("B", "survey"), turnsB: sum("B", "turn"),
      total: d
    };
    /* the same pattern with straight connectors between lines, for reference */
    lengths.straightA = A.count * area.width + (A.count - 1) * A.spacing;
    lengths.straightB = B.count * area.height + (B.count - 1) * B.spacing;

    var passStart = { A: 0, T: lengths.A, B: lengths.A + lengths.T };

    return {
      area: area, cfg: cfg, A: A, B: B,
      passB: { variant: chosen.key, entry: chosen.entry, gap: chosen.gap, candidates: variants.map(function (v) { return { key: v.key, gap: v.gap }; }) },
      endA: endA, segments: segs, lengths: lengths, passStart: passStart
    };
  }

  function segmentAt(route, d) {
    var s = route.segments;
    if (d <= 0) return s[0];
    for (var i = 0; i < s.length; i++) if (d <= s[i].d1) return s[i];
    return s[s.length - 1];
  }

  /* position and heading of the AUV at a distance along the route */
  function positionAt(route, d) {
    d = Math.max(0, Math.min(route.lengths.total, d));
    var s = segmentAt(route, d), local = d - s.d0, k = 1;
    while (k < s.cum.length - 1 && s.cum[k] < local) k++;
    var a = s.points[k - 1], b = s.points[k];
    var span = s.cum[k] - s.cum[k - 1], f = span > 0 ? (local - s.cum[k - 1]) / span : 0;
    f = Math.max(0, Math.min(1, f));
    return {
      x: a[0] + (b[0] - a[0]) * f,
      y: a[1] + (b[1] - a[1]) * f,
      heading: headingOf(b[0] - a[0], b[1] - a[1]),
      segment: s,
      pass: s.pass
    };
  }

  /* points of the route between two distances (for drawing the track) */
  function pointsBetween(route, from, to) {
    var out = [];
    route.segments.forEach(function (s) {
      if (s.d1 < from || s.d0 > to) return;
      for (var k = 0; k < s.points.length; k++) {
        var dk = s.d0 + s.cum[k];
        if (dk >= from && dk <= to) out.push(s.points[k]);
      }
    });
    var a = positionAt(route, from), b = positionAt(route, to);
    out.unshift([a.x, a.y]);
    out.push([b.x, b.y]);
    return out;
  }

  /* progress of one pass, 0..1 */
  function passProgress(route, pass, d) {
    var len = route.lengths[pass];
    if (!len) return 0;
    return Math.max(0, Math.min(1, (d - route.passStart[pass]) / len));
  }

  /* ---------- target observations ---------- */

  /* Transparent simulation rule: a target is observed on a pass when it lies
     inside the simulated swath of a straight survey leg of that pass
     (perpendicular offset ≤ swath / 2). The observation is taken on the first
     such leg in flying order, at the moment the AUV is abeam of the target.
     No detection probability is modelled. */
  function observationsFor(route, target) {
    var half = route.cfg.swath / 2, out = [];
    ["A", "B"].forEach(function (pass) {
      for (var i = 0; i < route.segments.length; i++) {
        var s = route.segments[i];
        if (s.pass !== pass || s.type !== "survey") continue;
        var horizontal = s.axis === "x";
        var offset = horizontal ? target.y - s.y0 : target.x - s.x0;
        var along = horizontal ? (target.x - s.x0) * (s.x1 > s.x0 ? 1 : -1) : (target.y - s.y0) * (s.y1 > s.y0 ? 1 : -1);
        if (Math.abs(offset) > half + EPS || along < -EPS || along > s.length + EPS) continue;
        var auv = horizontal ? [target.x, s.y0] : [s.x0, target.y];
        out.push({
          pass: pass,
          lineId: s.lineId,
          segmentId: s.id,
          d: s.d0 + along,
          auv: auv,
          auvHeadingDeg: s.heading,
          bearingToTargetDeg: headingOf(target.x - auv[0], target.y - auv[1]),
          distanceToTargetM: Math.abs(offset)
        });
        break;
      }
    });
    return out;
  }

  /* ---------- unique coverage ---------- */

  /* Plan-view occupancy grid. A cell counts as covered once its centre is
     inside the swath of a straight survey leg that the AUV has flown; a cell
     is never counted twice, so overlap between neighbouring swaths and
     between the two passes is not double-counted and coverage cannot exceed
     100 %. Turns and the transition add no coverage. Flags: 1 = Pass A,
     2 = Pass B. Cells at the edge may be smaller than cellSize. */
  function CoverageGrid(area, cellSize) {
    this.area = area;
    this.cell = cellSize;
    this.nx = Math.ceil(area.width / cellSize - EPS);
    this.ny = Math.ceil(area.height / cellSize - EPS);
    this.flags = new Uint8Array(this.nx * this.ny);
    this.total = area.width * area.height;
    this.reset();
  }
  CoverageGrid.prototype.reset = function () {
    this.flags.fill(0);
    this.uniqueArea = 0;
    this.bothArea = 0;
    this.passArea = { A: 0, B: 0 };
  };
  CoverageGrid.prototype.cellBox = function (i, j) {
    var c = this.cell;
    var w = Math.min(c, this.area.width - i * c), h = Math.min(c, this.area.height - j * c);
    return { cx: i * c + w / 2, cy: j * c + h / 2, a: w * h };
  };
  /* mark the part of a straight survey leg between local distances l0 and l1 */
  CoverageGrid.prototype.markLeg = function (seg, l0, l1, swath) {
    if (seg.type !== "survey" || l1 <= l0) return;
    var flag = seg.pass === "A" ? 1 : 2, half = swath / 2, horizontal = seg.axis === "x";
    var dirSign = horizontal ? (seg.x1 > seg.x0 ? 1 : -1) : (seg.y1 > seg.y0 ? 1 : -1);
    var start = horizontal ? seg.x0 : seg.y0;
    var lo = Math.min(start + dirSign * l0, start + dirSign * l1), hi = Math.max(start + dirSign * l0, start + dirSign * l1);
    var cross = horizontal ? seg.y0 : seg.x0;
    for (var j = 0; j < this.ny; j++) {
      for (var i = 0; i < this.nx; i++) {
        var b = this.cellBox(i, j);
        var a = horizontal ? b.cx : b.cy, cr = horizontal ? b.cy : b.cx;
        if (a < lo - EPS || a > hi + EPS || Math.abs(cr - cross) > half + EPS) continue;
        var n = j * this.nx + i, old = this.flags[n];
        if (old & flag) continue;
        this.flags[n] = old | flag;
        this.passArea[seg.pass] += b.a;
        if (!old) this.uniqueArea += b.a;
        if ((old | flag) === 3) this.bothArea += b.a;
      }
    }
  };
  /* mark everything flown between route distances d0 and d1 */
  CoverageGrid.prototype.markRoute = function (route, d0, d1) {
    var self = this;
    route.segments.forEach(function (s) {
      if (s.type !== "survey" || s.d1 <= d0 || s.d0 >= d1) return;
      self.markLeg(s, Math.max(0, d0 - s.d0), Math.min(s.length, d1 - s.d0), route.cfg.swath);
    });
  };
  CoverageGrid.prototype.stats = function () {
    return {
      uniqueArea: this.uniqueArea,
      uniquePct: Math.min(100, (this.uniqueArea / this.total) * 100),
      remainingArea: Math.max(0, this.total - this.uniqueArea),
      bothArea: this.bothArea,
      bothPct: Math.min(100, (this.bothArea / this.total) * 100)
    };
  };

  root.AUVSurvey = {
    lineSet: lineSet,
    buildRoute: buildRoute,
    positionAt: positionAt,
    pointsBetween: pointsBetween,
    passProgress: passProgress,
    observationsFor: observationsFor,
    aspectDifference: aspectDifference,
    polylineLength: polylineLength,
    CoverageGrid: CoverageGrid
  };
})(typeof window !== "undefined" ? window : this);
