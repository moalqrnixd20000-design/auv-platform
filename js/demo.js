/* AUV project site — interactive demo (software simulation).

   A fixed, scripted grid survey that shows how the proposed AUV could detect
   underwater objects, classify them, assess their potential risk, explain the
   decision and recommend an action:

     Scanning > Detection > Analysis > Classification > Risk assessment >
     Decision > Alert & marking > Verification > Mission summary

   Everything is driven by ONE mission clock. Pause stops the clock (and the
   animations), Reset throws the whole state away, and nothing is scheduled
   outside the clock — so no late event can appear after a Reset. The run is
   deterministic: same scenario, same result, every time.

   Survey numbers (area, line spacing, swath) are simulation parameters;
   distance, area covered and coverage are calculated from them. Demo time is
   compressed for presentation and says nothing about vehicle speed.

   Sections of this file:
     1. Survey model – scenarios, grid geometry, coverage maths
     2. Targets      – evidence, decision rules, target content
     3. Views        – map, observation view, alert, analysis, coverage, log
     4. Mission      – event timeline, clock, Start / Pause / Reset, scenario, full screen */
(function () {
  "use strict";

  var demo = document.getElementById("demo");
  if (!demo) return;

  var $ = function (id) { return document.getElementById(id); };
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ================= 1. Survey model ================= */

  /* origin = [latitude, longitude] of the south-west corner of the survey box.
     Illustrative positions only. */
  var SCENARIOS = {
    redsea: {
      name: "Red Sea coastal segment",
      origin: [21.62, 39.08],
      width: 400,
      height: 240,
      note: "Illustrative survey segment off the Red Sea coast. All positions are simulated."
    },
    hormuz: {
      name: "Strait of Hormuz — Simulated Survey Scenario",
      origin: [26.56, 56.35],
      width: 600,
      height: 240,
      note: "Illustrative / Simulation: a small survey segment inspired by the Strait of Hormuz. The AUV has not surveyed the strait and is not claimed to cover it."
    }
  };

  var LINE_SPACING = 40;   // m between survey lines — simulation parameter
  var SWATH = 50;          // m, estimated sensor swath — simulation parameter
  var LEAD = 8;            // m ahead of abeam at which a target is picked up — demo value
  var M_PER_DEG = 111320;  // metres per degree of latitude (approximation)

  var scenarioKey = "redsea";
  var sc, survey, geo, plan;

  /* Alternating parallel lines (lawn-mower pattern), west-east then east-west,
     joined by short turns. Lines sit in the middle of equal strips, so
     lines × line spacing = survey height. */
  function buildSurvey(s) {
    var lines = Math.round(s.height / LINE_SPACING);
    var legs = [], d = 0;
    for (var i = 0; i < lines; i++) {
      var y = LINE_SPACING / 2 + i * LINE_SPACING;
      var east = i % 2 === 0;
      var x0 = east ? 0 : s.width, x1 = east ? s.width : 0;
      legs.push({ line: i + 1, along: true, x0: x0, y0: y, x1: x1, y1: y, d0: d, len: s.width });
      d += s.width;
      if (i < lines - 1) {
        legs.push({ line: i + 1, along: false, x0: x1, y0: y, x1: x1, y1: y + LINE_SPACING, d0: d, len: LINE_SPACING });
        d += LINE_SPACING;
      }
    }
    return {
      lines: lines,
      legs: legs,
      total: d,                                  // planned track distance, m
      area: s.width * s.height,                  // survey area, m²
      strip: Math.min(SWATH, LINE_SPACING)       // new width added per line (overlap counted once)
    };
  }

  function positionAt(d) {
    var legs = survey.legs;
    for (var i = 0; i < legs.length; i++) {
      var g = legs[i];
      if (d <= g.d0 + g.len || i === legs.length - 1) {
        var f = Math.max(0, Math.min(1, (d - g.d0) / g.len));
        return {
          x: g.x0 + (g.x1 - g.x0) * f,
          y: g.y0 + (g.y1 - g.y0) * f,
          leg: i,
          heading: g.along ? (g.x1 > g.x0 ? 90 : 270) : 0
        };
      }
    }
    return null;
  }

  /* Area covered = distance travelled along survey lines × min(swath, spacing).
     Turns add no new area. At the end of the survey this equals the survey area. */
  function coverageAt(d) {
    var along = 0;
    survey.legs.forEach(function (g) { if (g.along) along += Math.max(0, Math.min(g.len, d - g.d0)); });
    var covered = along * survey.strip;
    return { distance: d, covered: covered, remaining: survey.area - covered, pct: (covered / survey.area) * 100 };
  }

  function lineLeg(n) { return survey.legs.filter(function (g) { return g.along && g.line === n; })[0]; }

  function toLatLon(x, y) {
    var lat = sc.origin[0] + y / M_PER_DEG;
    var lon = sc.origin[1] + x / (M_PER_DEG * Math.cos((sc.origin[0] * Math.PI) / 180));
    return [lat, lon];
  }

  function relative(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    return {
      distance: Math.round(Math.sqrt(dx * dx + dy * dy)),
      bearing: Math.round(((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360)
    };
  }

  function fmtLat(v) { return v.toFixed(5) + "° N"; }
  function fmtLon(v) { return v.toFixed(5) + "° E"; }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function pad3(n) { return String(n).padStart(3, "0"); }
  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  /* ================= 2. Targets and decision rules ================= */

  var EVIDENCE = [
    ["bio", "Biological morphology"],
    ["motion", "Movement consistent with marine life"],
    ["rigid", "Rigid / geometric structure"],
    ["nonbio", "Non-biological appearance"],
    ["size", "Size category"],
    ["background", "Return differs from surrounding background"]
  ];

  /* The decision engine: explainable rules, checked in order. The first rule
     that matches the evidence gives the classification and the risk. The last
     rule is the honest fallback: without enough evidence the answer is Unknown. */
  var RULES = [
    {
      test: function (e) { return e.bio === "Detected"; },
      text: "Biological morphology detected → Marine Life.",
      classification: "Marine Life", group: "life",
      risk: "Non-Hazardous", level: "safe", riskType: "Biological / Marine Life",
      certainty: "High — all defining features detected"
    },
    {
      test: function (e) { return e.rigid === "Detected" && e.nonbio === "Detected" && e.size === "Large"; },
      text: "Rigid, non-biological and large → man-made structure.",
      classification: "Man-Made Structure", group: "structure",
      risk: "Potential Hazard", level: "hazard", riskType: "Navigation / Obstruction Risk",
      certainty: "High — all defining features detected"
    },
    {
      test: function (e) { return e.rigid === "Detected" && e.nonbio === "Detected" && e.size === "Compact"; },
      text: "Rigid, non-biological and compact → potential hazardous object. The identity cannot be confirmed.",
      classification: "Potential Hazardous Object", group: "mine",
      risk: "High Potential Hazard", level: "high", riskType: "Potential Explosive Hazard",
      certainty: "Moderate — identity not confirmed"
    },
    {
      test: function () { return true; },
      text: "No rule is met with enough evidence → Unknown. The system does not force a class.",
      classification: "Unknown", group: "unknown",
      risk: "Unknown", level: "unknown", riskType: "Unknown Risk",
      certainty: "Low — insufficient evidence"
    }
  ];

  var ALERTS = {
    safe: "STATUS — No Immediate Hazard Detected",
    hazard: "ALERT — Potential Hazard Detected",
    high: "ALERT — Potential High-Risk Object",
    unknown: "NOTICE — Unknown Object Requires Verification"
  };

  /* line = survey line on which the target is first detected; fx = position
     along the line (fraction of the survey width); dy = metres north (+) or
     south (−) of that line. Targets for re-checking sit between two lines, so
     the next line passes them again from the other side.
     box = [left, top, width, height] of the detection frame, in % of the view. */
  var TARGETS = [
    {
      key: "fish", name: "Lionfish", objectType: "Fish", line: 1, fx: 0.40, dy: 16, depth: 9,
      source: "Water-Column Acoustic Data", scene: "fish", box: [31, 5, 60, 80],
      evidence: { bio: "Detected", motion: "Detected", rigid: "Not detected", nonbio: "Not detected", size: "Small", background: "Detected" },
      decision: "Continue Survey / Log Observation", logDecision: "Log Observation",
      explanation: "Biological morphology and expected marine-life characteristics detected.",
      action: "Continue the survey and log the observation.", status: "Logged"
    },
    {
      key: "wreck", name: "Shipwreck", objectType: "Large structure on the seafloor", line: 2, fx: 0.62, dy: -16, depth: 26,
      source: "Multibeam Echosounder", scene: "wreck", box: [18, 18, 60, 48],
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Detected", nonbio: "Detected", size: "Large", background: "Detected" },
      decision: "Requires Inspection",
      explanation: "Large rigid structure with non-biological geometric characteristics detected on or near the seafloor.",
      action: "Mark the position and schedule an inspection.", status: "Marked for inspection"
    },
    {
      key: "mine", name: "Potential Mine", objectType: "Compact object on the seafloor", line: 4, fx: 0.58, dy: 20, depth: 21,
      source: "Multibeam Echosounder", scene: "mine", box: [89, 53, 10.5, 11.5], repass: 5,
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Detected", nonbio: "Detected", size: "Compact", background: "Detected" },
      decision: "Requires Verification",
      explanation: "Detected characteristics are consistent with a potential hazardous man-made object, but the simulation cannot confirm the object's identity.",
      action: "Do not treat as confirmed. Request further inspection / verification.", status: "Awaiting verification",
      verify: {
        compare: "Both passes show a compact, rigid, non-biological return.",
        consensus: "Consistent across 2 passes",
        update: "Still Requires Verification. The identity is not confirmed; additional evidence is required.",
        status: "Verification required"
      }
    },
    {
      key: "unknown", name: "Unknown Object", objectType: "Unresolved object", line: 5, fx: 0.80, dy: 20, depth: 28,
      source: "Multibeam Echosounder", scene: "unknown", box: [13, 33, 72, 24], repass: 6,
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Inconclusive", nonbio: "Inconclusive", size: "Medium", background: "Detected" },
      decision: "Requires Verification",
      explanation: "Detected object contains insufficient evidence for reliable classification.",
      action: "Additional inspection / multi-pass verification.", status: "Awaiting verification",
      verify: {
        compare: "The second pass does not resolve the shape.",
        consensus: "Inconclusive",
        update: "Remains Unknown — Requires Verification.",
        status: "Remains unknown — verification required"
      }
    }
  ];

  var SCENE_CREDITS = {
    idle: "Reference imagery appears here when a target is detected. It is not a live feed from the AUV.",
    fish: "Reference image: lionfish on a reef. Photograph supplied by the team.",
    wreck: "Reference image: synthetic aperture sonar image of an unknown shipwreck off of Nantucket. Image courtesy of ThayerMahan, Inc., Kraken Robotics, and the NOAA Office of Ocean Exploration and Research.",
    mine: "Reference image: wreck site on the seabed. Photograph supplied by the team. The marked object is a simulated target, not a photographed mine.",
    unknown: "Reference image: coral-covered metal structure. Photograph supplied by the team. The marked object is a simulated target."
  };

  function evaluate(evidence) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].test(evidence)) return RULES[i];
    return RULES[RULES.length - 1];
  }

  /* Where each target sits in the current scenario, and where the AUV is
     when it picks the target up (and passes it again, for re-checks). */
  function placeTargets() {
    var out = {};
    TARGETS.forEach(function (tg) {
      var leg = lineLeg(tg.line);
      var dir = leg.x1 > leg.x0 ? 1 : -1;
      var pos = { x: tg.fx * sc.width, y: leg.y0 + tg.dy };
      var xd = pos.x - dir * LEAD;
      var g = {
        x: pos.x, y: pos.y, latlon: toLatLon(pos.x, pos.y),
        detectD: leg.d0 + Math.abs(xd - leg.x0),
        detect: relative({ x: xd, y: leg.y0 }, pos)
      };
      if (tg.repass) {
        var leg2 = lineLeg(tg.repass);
        var dir2 = leg2.x1 > leg2.x0 ? 1 : -1;
        var xr = pos.x - dir2 * LEAD;
        g.repassD = leg2.d0 + Math.abs(xr - leg2.x0);
        g.repass = relative({ x: xr, y: leg2.y0 }, pos);
      }
      out[tg.key] = g;
    });
    return out;
  }

  /* ================= 3. Views ================= */

  var el = {
    status: $("demo-status"),
    statusLabel: $("demo-status-label"),
    start: $("demo-start"),
    pause: $("demo-pause"),
    reset: $("demo-reset"),
    full: $("demo-full"),
    scenario: $("demo-scenario"),
    scenarioNote: $("demo-scenario-note"),
    stages: Array.prototype.slice.call($("demo-stages").children),
    alert: $("demo-alert"),
    alertTitle: $("demo-alert-title"),
    alertBody: $("demo-alert-body"),
    map: $("demo-map"),
    bounds: $("demo-bounds"),
    cover: $("demo-cover"),
    plan: $("demo-plan"),
    track: $("demo-track"),
    current: $("demo-current"),
    ticks: $("demo-ticks"),
    markers: $("demo-markers"),
    auv: $("demo-auv"),
    scenes: Array.prototype.slice.call(document.querySelectorAll(".camera__scene")),
    svgs: Array.prototype.slice.call(document.querySelectorAll(".camera__scene svg")),
    stage: $("camera-stage"),
    chip: $("cam-chip"),
    credit: $("obs-credit"),
    box: $("det-box"),
    boxLabel: $("det-label"),
    analysis: $("demo-analysis"),
    covInfo: $("cov-info"),
    covDistance: $("cov-distance"),
    covArea: $("cov-area"),
    covPct: $("cov-pct"),
    covRemain: $("cov-remaining"),
    covBar: $("cov-bar"),
    logBody: $("log-body"),
    count: $("demo-count"),
    time: $("demo-time"),
    timeline: $("demo-timeline"),
    timelineFill: $("demo-timeline-fill"),
    cardMap: $("card-map"),
    cardLog: $("card-log")
  };

  /* ---- survey map ---- */

  var MAP = { w: 560, h: 400, left: 82, right: 16, top: 16, bottom: 40 };
  var proj = { s: 1, ox: 0, oy: 0 };

  function project() {
    var iw = MAP.w - MAP.left - MAP.right, ih = MAP.h - MAP.top - MAP.bottom;
    var s = Math.min(iw / sc.width, ih / sc.height);
    proj = { s: s, ox: MAP.left + (iw - sc.width * s) / 2, oy: MAP.top + (ih - sc.height * s) / 2 };
  }
  function px(x) { return proj.ox + x * proj.s; }
  function py(y) { return proj.oy + (sc.height - y) * proj.s; }
  function pt(x, y) { return px(x).toFixed(1) + "," + py(y).toFixed(1); }

  function drawMap() {
    project();
    var W = sc.width, H = sc.height, s = proj.s;

    el.bounds.setAttribute("x", px(0).toFixed(1));
    el.bounds.setAttribute("y", py(H).toFixed(1));
    el.bounds.setAttribute("width", (W * s).toFixed(1));
    el.bounds.setAttribute("height", (H * s).toFixed(1));

    el.plan.setAttribute("d", survey.legs.map(function (g, i) {
      return (i === 0 ? "M" + pt(g.x0, g.y0) + " " : "") + "L" + pt(g.x1, g.y1);
    }).join(" "));

    el.cover.innerHTML = survey.legs.filter(function (g) { return g.along; }).map(function () {
      return '<rect y="0" height="0" width="0" x="0"/>';
    }).join("");

    var ticks = "";
    [0, H / 2, H].forEach(function (y) {
      var ll = toLatLon(0, y);
      ticks += '<line x1="' + (px(0) - 5).toFixed(1) + '" x2="' + px(0).toFixed(1) + '" y1="' + py(y).toFixed(1) + '" y2="' + py(y).toFixed(1) + '"/>' +
        '<text x="' + (px(0) - 9).toFixed(1) + '" y="' + (py(y) + 3.5).toFixed(1) + '" text-anchor="end">' + ll[0].toFixed(4) + "° N</text>";
    });
    [0, W / 2, W].forEach(function (x, i) {
      var ll = toLatLon(x, 0);
      ticks += '<line x1="' + px(x).toFixed(1) + '" x2="' + px(x).toFixed(1) + '" y1="' + py(0).toFixed(1) + '" y2="' + (py(0) + 5).toFixed(1) + '"/>' +
        '<text x="' + px(x).toFixed(1) + '" y="' + (py(0) + 18).toFixed(1) + '" text-anchor="' + (i === 2 ? "end" : "middle") + '">' + ll[1].toFixed(4) + "° E</text>";
    });
    var bar = 100 * s, bx = px(W) - bar, by = py(0) + 32;
    ticks += '<line class="scale" x1="' + bx.toFixed(1) + '" x2="' + (bx + bar).toFixed(1) + '" y1="' + by.toFixed(1) + '" y2="' + by.toFixed(1) + '"/>' +
      '<text x="' + (bx - 6).toFixed(1) + '" y="' + (by + 3.5).toFixed(1) + '" text-anchor="end">100 m</text>';
    el.ticks.innerHTML = ticks;
  }

  function renderTrack() {
    var d = state.d;
    var p = positionAt(d);
    var legs = survey.legs;

    var rects = el.cover.children, r = 0;
    legs.forEach(function (g) {
      if (!g.along) return;
      var f = Math.max(0, Math.min(1, (d - g.d0) / g.len));
      var xa = Math.min(g.x0, g.x0 + (g.x1 - g.x0) * f);
      var rect = rects[r++];
      rect.setAttribute("x", px(xa).toFixed(1));
      rect.setAttribute("y", py(g.y0 + survey.strip / 2).toFixed(1));
      rect.setAttribute("width", (Math.abs(g.x1 - g.x0) * f * proj.s).toFixed(1));
      rect.setAttribute("height", (survey.strip * proj.s).toFixed(1));
    });

    var points = [pt(legs[0].x0, legs[0].y0)];
    for (var i = 0; i < p.leg; i++) points.push(pt(legs[i].x1, legs[i].y1));
    points.push(pt(p.x, p.y));
    el.track.setAttribute("points", points.join(" "));

    var cur = legs[p.leg];
    var done = state.status === "complete" || d >= survey.total;
    el.current.setAttribute("d", done ? "" : "M" + pt(p.x, p.y) + " L" + pt(cur.x1, cur.y1));

    el.auv.setAttribute("transform", "translate(" + pt(p.x, p.y) + ") rotate(" + p.heading + ")");
  }

  var MARKER_SHAPES = {
    safe: '<circle r="6.5" fill="#34b27a" stroke="#071a26" stroke-width="1.5"/>',
    hazard: '<rect x="-6.5" y="-6.5" width="13" height="13" fill="#c49837" stroke="#071a26" stroke-width="1.5"/>',
    high: '<circle class="ring" r="14" fill="none" stroke="#ef6b5b" stroke-width="1.5" stroke-dasharray="3 3"/><rect x="-6.5" y="-6.5" width="13" height="13" transform="rotate(45)" fill="#ef6b5b" stroke="#071a26" stroke-width="1.5"/>',
    unknown: '<circle r="7.5" fill="#a9b6c2" stroke="#071a26" stroke-width="1.5"/><text y="3.8" text-anchor="middle" font-family="Archivo, sans-serif" font-size="10" font-weight="800" fill="#071a26">?</text>'
  };

  function addMarker(t) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "marker is-active");
    g.setAttribute("transform", "translate(" + pt(t.x, t.y) + ")");
    g.innerHTML = '<circle class="halo" r="17" fill="none" stroke="#ffffff" stroke-width="2"/>' + MARKER_SHAPES[t.level] +
      '<text x="12" y="-8" font-family="Archivo, sans-serif" font-size="11" font-weight="700" fill="#ffffff">' + t.id.replace("Target ", "") + "</text>";
    el.markers.appendChild(g);
    t.markerEl = g;
  }

  function clearMarkerFocus() {
    Array.prototype.forEach.call(el.markers.children, function (g) { g.classList.remove("is-active", "is-inspecting"); });
  }

  function flash(node) {
    node.classList.remove("is-flash");
    void node.offsetWidth;
    node.classList.add("is-flash");
  }

  /* ---- status, stages ---- */

  var STAGES = ["scanning", "detection", "analysis", "classification", "risk", "decision", "alert", "verification"];

  function setStatus(label, mode) {
    el.statusLabel.textContent = label;
    el.status.setAttribute("data-state", mode);
  }

  function setStage(name) {
    var at = STAGES.indexOf(name);
    el.stages.forEach(function (li) {
      var i = STAGES.indexOf(li.getAttribute("data-stage"));
      li.classList.toggle("is-active", i === at);
      li.classList.toggle("is-done", at > 0 && i < at);
    });
  }

  function allStagesDone() {
    el.stages.forEach(function (li) { li.classList.remove("is-active"); li.classList.add("is-done"); });
  }

  /* ---- observation view (reference imagery, never a live feed) ---- */

  function showScene(name) {
    el.scenes.forEach(function (s) { s.classList.toggle("is-visible", s.getAttribute("data-scene") === name); });
    el.credit.textContent = SCENE_CREDITS[name];
  }

  function setBox(t, classified) {
    if (!t) { el.box.hidden = true; return; }
    el.box.hidden = false;
    el.box.style.left = t.box[0] + "%";
    el.box.style.top = t.box[1] + "%";
    el.box.style.width = t.box[2] + "%";
    el.box.style.height = t.box[3] + "%";
    el.box.classList.toggle("is-classified", classified);
    el.box.classList.toggle("is-flip", t.box[1] < 14);
    el.box.classList.toggle("is-right", t.box[0] + t.box[2] > 75);
    el.box.setAttribute("data-level", classified ? t.level : "");
    el.boxLabel.textContent = t.group === "mine" ? "Potential Mine — unconfirmed" : t.name;
  }

  function setCloseup(on, t, label) {
    if (on && t) {
      el.stage.style.transformOrigin = (t.box[0] + t.box[2] / 2) + "% " + (t.box[1] + t.box[3] / 2) + "%";
      el.chip.textContent = label || "Close-range view";
    } else {
      el.chip.textContent = "Reference image";
    }
    el.stage.classList.toggle("is-closeup", !!on);
  }

  /* ---- alert ---- */

  function renderAlert() {
    var t = state.alert;
    if (!t) {
      var assessing = state.current && state.status === "detected";
      el.alert.setAttribute("data-kind", "idle");
      el.alertTitle.textContent = state.status === "complete" ? "Mission complete — see the summary and target log"
        : assessing ? "Assessing " + state.current.id + " — alert pending" : "No active alerts";
      el.alertBody.innerHTML = '<div class="demo-alert__idle"><dt class="sr-only">Alerts</dt><dd>' +
        (assessing ? "An alert is issued once the target's risk has been assessed." : "Simulated alerts appear here when a target has been assessed.") + "</dd></div>";
      return;
    }
    el.alert.setAttribute("data-kind", t.level);
    el.alertTitle.textContent = ALERTS[t.level];
    el.alertBody.innerHTML = [
      ["Target", t.id],
      ["Risk", t.risk],
      ["Risk type", t.riskType],
      ["Location (Sim.)", fmtLat(t.latlon[0]) + ", " + fmtLon(t.latlon[1])],
      ["Recommended action", t.action]
    ].map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
  }

  /* ---- analysis panel: a decision trail that builds up as the mission runs ---- */

  var BLOCK_ORDER = ["detect", "evidence", "classify", "risk", "decide", "mark", "verify"];

  function section(title, body, cls) {
    return '<section class="trail__block ' + cls + '"><h4>' + title + "</h4>" + body + "</section>";
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + "</dl>";
  }

  var EVIDENCE_STATE = { "Detected": "yes", "Not detected": "no", "Inconclusive": "maybe" };

  function blockHtml(key, t, cls) {
    if (key === "detect") {
      return section("Target detected", '<p class="trail__id">' + t.id + "</p>" + kv([
        ["Detection time (demo clock)", t.time],
        ["Detected by", t.source],
        ["Survey line", "Line " + t.line],
        ["Position (Sim.)", fmtLat(t.latlon[0]) + "<br>" + fmtLon(t.latlon[1])],
        ["Depth (Sim.)", t.depth + " m"],
        ["Distance from AUV (Sim.)", t.distance + " m"],
        ["Bearing from AUV (Sim.)", pad3(t.bearing) + "°"]
      ]), cls);
    }
    if (key === "evidence") {
      var rows = EVIDENCE.map(function (e) {
        var v = t.evidence[e[0]];
        var state_ = EVIDENCE_STATE[v] || "info";
        var label = e[0] === "background" ? e[1] + ' <span class="tag tag--concept">Conceptual</span>' : e[1];
        return '<li><span>' + label + '</span><span class="ev ev--' + state_ + '">' + v + "</span></li>";
      }).join("");
      return section("Detected characteristics", '<ul class="evidence">' + rows + '</ul><p class="trail__meta">Simulation evidence. The background comparison is a conceptual layer, not a trained model.</p>', cls);
    }
    if (key === "classify") {
      return section("Classification", kv([
        ["Identification", t.name],
        ["Classification", "<strong>" + t.classification + "</strong>"],
        ["Object type", t.objectType],
        ["Simulation certainty", t.certainty]
      ]) + '<p class="trail__meta">Rule applied: ' + t.ruleText + "</p>", cls);
    }
    if (key === "risk") {
      return section("Risk assessment", '<p class="trail__decision"><span class="risk risk--' + t.level + '">' + t.risk + "</span></p>" +
        kv([["Risk type", t.riskType]]) +
        '<p class="trail__meta">Potential risk is a priority for the operator to review, not confirmed danger.</p>', cls);
    }
    if (key === "decide") {
      return section("Decision", '<p class="trail__decision"><span class="chip chip--' + t.level + '">' + t.decision + "</span></p>" +
        '<p class="trail__text">' + t.explanation + "</p>" + kv([["Recommended action", t.action]]), cls);
    }
    if (key === "mark") {
      return section("Alert and marking", '<p class="trail__text"><strong>' + ALERTS[t.level] + "</strong></p>" +
        kv([["Status", t.statusNow]]) + '<p class="trail__meta">Marked on the survey map and added to the target log.</p>', cls);
    }
    var v = t.verify;
    var steps = [
      ["First pass — line " + t.line + ": target detected", 0],
      ["Additional pass — line " + t.repass + ", from the other side (additional angle)", 1],
      ["Evidence comparison", 2],
      ["Decision update", 3]
    ].map(function (s) {
      var c = s[1] < state.verifyStep ? "is-done" : s[1] === state.verifyStep ? "is-active" : "";
      return '<li class="' + c + '">' + s[0] + "</li>";
    }).join("");
    var results = "";
    if (state.verifyStep >= 1) results += kv([["Additional pass (Sim.)", t.repassRel.distance + " m, bearing " + pad3(t.repassRel.bearing) + "°"]]);
    if (state.verifyStep >= 2) results += '<p class="trail__text">' + v.compare + "</p>" + kv([["Conceptual multi-angle consensus", v.consensus]]);
    if (state.verifyStep >= 3) results += '<p class="trail__text"><strong>Decision update:</strong> ' + v.update + "</p>";
    return section('Multi-pass verification <span class="tag tag--concept">Conceptual</span>', '<ol class="inspect-steps">' + steps + "</ol>" + results, cls);
  }

  function summaryHtml() {
    var m = state.marked;
    var count = function (fn) { return m.filter(fn).length; };
    var byGroup = function (g) { return function (t) { return t.group === g; }; };
    var cov = coverageAt(state.d);
    var tiles = [
      ["Targets detected", m.length],
      ["Marine life", count(byGroup("life"))],
      ["Shipwreck / man-made", count(byGroup("structure"))],
      ["Potential mine", count(byGroup("mine"))],
      ["Unknown", count(byGroup("unknown"))],
      ["Requires verification", count(function (t) { return t.decision === "Requires Verification"; })]
    ].map(function (s) { return "<div><strong>" + s[1] + "</strong><span>" + s[0] + "</span></div>"; }).join("");
    return '<div class="summary trail__block is-new"><h4>Mission complete</h4><div class="summary__grid">' + tiles + "</div>" +
      kv([
        ["Distance covered (Sim.)", fmtNum(cov.distance) + " m"],
        ["Area covered (Sim.)", fmtNum(cov.covered) + " m²"],
        ["Coverage (Sim.)", cov.pct.toFixed(1) + "%"],
        ["Demo time", formatTime(state.ms)]
      ]) +
      '<p class="trail__text">Every target has been logged with a risk assessment, a decision and a recommended action. Two targets still need verification.</p>' +
      '<p class="trail__meta">Simulated demonstration values, not field results.</p></div>';
  }

  function renderAnalysis() {
    var t = state.current;
    if (state.status === "complete") { el.analysis.innerHTML = summaryHtml(); return; }
    if (!t) {
      var message = state.status === "scanning" ? "Scanning the survey lines for targets…" : "Start the mission to begin the survey.";
      el.analysis.innerHTML = '<div class="analysis__empty"><p>' + message + "</p></div>";
      state.shownBlocks = 0;
      return;
    }
    var visible = BLOCK_ORDER.slice(0, state.blocks);
    el.analysis.innerHTML = visible.map(function (key, i) {
      var cls = (i >= state.shownBlocks ? "is-new " : "") + (i === visible.length - 1 ? "is-current" : "");
      return blockHtml(key, t, cls);
    }).join("");
    var grew = visible.length > state.shownBlocks;
    state.shownBlocks = visible.length;
    if (grew) el.analysis.scrollTop = el.analysis.scrollHeight;
  }

  /* ---- coverage ---- */

  function renderSurveyInfo() {
    var legsLine = survey.lines + " × " + fmtNum(sc.width) + " m + " + (survey.lines - 1) + " × " + LINE_SPACING + " m";
    el.covInfo.innerHTML = [
      ["Scenario", sc.name],
      ["Survey area", fmtNum(sc.width) + " m × " + fmtNum(sc.height) + " m = " + fmtNum(survey.area) + " m²"],
      ["Survey lines", survey.lines + ", spaced " + LINE_SPACING + " m"],
      ["Estimated sensor swath", SWATH + " m — simulation parameter"],
      ["Planned track distance", fmtNum(survey.total) + " m (" + legsLine + ")"]
    ].map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
    el.scenarioNote.textContent = sc.note;
  }

  function renderCoverage() {
    var c = coverageAt(state.d);
    el.covDistance.textContent = fmtNum(c.distance) + " m";
    el.covArea.textContent = fmtNum(c.covered) + " m²";
    el.covPct.textContent = c.pct.toFixed(1) + "%";
    el.covRemain.textContent = fmtNum(c.remaining) + " m²";
    el.covBar.style.width = c.pct.toFixed(2) + "%";
  }

  /* ---- target log + detection timeline ---- */

  function renderLog() {
    el.count.textContent = state.marked.length;
    if (!state.marked.length) {
      el.logBody.innerHTML = '<tr class="is-empty"><td colspan="10">Targets appear here as they are marked.</td></tr>';
      return;
    }
    var last = state.marked.length - 1;
    el.logBody.innerHTML = state.marked.map(function (t, i) {
      return '<tr class="' + (i === last && state.justMarked ? "is-new" : "") + '">' +
        "<td>" + t.id.replace("Target ", "") + "</td>" +
        "<td>" + t.time + "</td>" +
        "<td>" + t.name + "</td>" +
        "<td>" + t.classification + "</td>" +
        '<td><span class="risk risk--' + t.level + ' risk--small">' + t.risk + "</span></td>" +
        '<td class="' + (t.level === "safe" ? "" : "is-alert") + '">' + (t.logDecision || t.decision) + "</td>" +
        "<td>" + t.source + "</td>" +
        "<td>Line " + t.line + ", " + pad3(t.bearing) + "°</td>" +
        "<td>" + fmtLat(t.latlon[0]) + "<br>" + fmtLon(t.latlon[1]) + "</td>" +
        "<td>" + t.depth + " m</td></tr>";
    }).join("");
  }

  function addTimelineMark(t) {
    var mark = document.createElement("span");
    mark.className = "timeline__mark timeline__mark--" + t.level;
    mark.style.left = ((state.ms / plan.total) * 100).toFixed(2) + "%";
    mark.textContent = t.id.replace("Target ", "") + " " + t.time;
    el.timeline.appendChild(mark);
  }

  function renderClock() {
    el.time.textContent = formatTime(state.ms);
    el.timelineFill.style.width = Math.min(100, (state.ms / plan.total) * 100).toFixed(2) + "%";
  }

  function updateButtons() {
    el.start.disabled = state.running && !state.paused;
    el.pause.disabled = !state.running;
    el.pause.textContent = state.paused ? "Resume" : "Pause";
    el.scenario.disabled = state.running;
  }

  /* While paused, freeze every animation too (CSS and SVG). */
  function setPausedVisuals(paused) {
    demo.classList.toggle("is-paused", paused);
    el.svgs.forEach(function (svg) {
      if (svg.pauseAnimations) { if (paused) svg.pauseAnimations(); else svg.unpauseAnimations(); }
    });
  }

  /* ================= 4. Mission ================= */

  var TICK = 100;
  var SCAN_MS = 20000;   // demo time spent moving along the whole track (compressed)
  var TARGET_MS = 7200;  // demo time for one target, detection to marking
  var REPASS_MS = 5400;  // demo time for one additional pass
  var AT = { evidence: 1100, classify: 2200, risk: 3300, decide: 4400, mark: 5600 };
  var RP = { compare: 1700, update: 3400 };

  var timer = null;
  var state = freshState();

  function freshState() {
    return { status: "ready", running: false, paused: false, ms: 0, d: 0, next: 0, counter: 0, current: null, alert: null,
             blocks: 0, shownBlocks: 0, verifyStep: 0, justMarked: false, marked: [], byKey: {} };
  }

  /* Turn the survey and the targets into timed events and AUV movements. */
  function compile() {
    var stops = [];
    TARGETS.forEach(function (tg) {
      stops.push({ d: geo[tg.key].detectD, type: "target", key: tg.key });
      if (tg.repass) stops.push({ d: geo[tg.key].repassD, type: "repass", key: tg.key });
    });
    stops.sort(function (a, b) { return a.d - b.d; });

    var events = [], moves = [], t = 0, d = 0;
    function at(ms, fn, arg) { events.push({ t: ms, run: function () { fn(arg); } }); }
    function scanTo(d1) {
      var ms = Math.max(d === 0 ? 3000 : 1500, Math.round(((d1 - d) / survey.total) * SCAN_MS));
      at(t, enterScan);
      moves.push({ t0: t, t1: t + ms, d0: d, d1: d1 });
      t += ms;
      d = d1;
    }

    stops.forEach(function (s) {
      scanTo(s.d);
      if (s.type === "target") {
        at(t, detect, s.key);
        at(t + AT.evidence, analyze);
        at(t + AT.classify, classify);
        at(t + AT.risk, assessRisk);
        at(t + AT.decide, decide);
        at(t + AT.mark, mark);
        t += TARGET_MS;
      } else {
        at(t, repassStart, s.key);
        at(t + RP.compare, repassCompare);
        at(t + RP.update, repassUpdate);
        t += REPASS_MS;
      }
    });
    scanTo(survey.total);
    at(t, finish);
    return { events: events, moves: moves, total: t };
  }

  function distanceAt(ms) {
    var d = 0;
    for (var i = 0; i < plan.moves.length; i++) {
      var m = plan.moves[i];
      if (ms >= m.t1) d = m.d1;
      else if (ms >= m.t0) { d = m.d0 + ((m.d1 - m.d0) * (ms - m.t0)) / (m.t1 - m.t0); break; }
      else break;
    }
    return d;
  }

  /* --- events (each one runs exactly once, at its time on the mission clock) --- */

  function enterScan() {
    state.status = "scanning";
    state.current = null;
    state.blocks = 0;
    state.justMarked = false;
    setStatus("Scanning", "active");
    setStage("scanning");
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
    renderAnalysis();
  }

  function detect(key) {
    var spec = TARGETS.filter(function (tg) { return tg.key === key; })[0];
    var g = geo[key];
    var rule = evaluate(spec.evidence);
    state.counter += 1;
    var t = {
      key: key, id: "Target #" + pad3(state.counter), name: spec.name, objectType: spec.objectType,
      line: spec.line, repass: spec.repass, depth: spec.depth, source: spec.source, scene: spec.scene, box: spec.box,
      evidence: spec.evidence, decision: spec.decision, logDecision: spec.logDecision, explanation: spec.explanation,
      action: spec.action, statusNow: spec.status, verify: spec.verify,
      classification: rule.classification, group: rule.group, risk: rule.risk, level: rule.level,
      riskType: rule.riskType, certainty: rule.certainty, ruleText: rule.text,
      x: g.x, y: g.y, latlon: g.latlon, distance: g.detect.distance, bearing: g.detect.bearing, repassRel: g.repass,
      time: formatTime(state.ms)
    };
    state.byKey[key] = t;
    state.status = "detected";
    state.current = t;
    state.blocks = 1;
    state.shownBlocks = 0;
    state.verifyStep = 0;
    state.alert = null;
    setStatus("Target detected", "alert");
    setStage("detection");
    showScene(t.scene);
    setBox(t, false);
    addTimelineMark(t);
    renderAlert();
    renderAnalysis();
  }

  function analyze() {
    state.blocks = 2;
    setStatus("Analysing characteristics", "alert");
    setStage("analysis");
    renderAnalysis();
  }

  function classify() {
    state.blocks = 3;
    setStatus("Classifying", "alert");
    setStage("classification");
    setBox(state.current, true);
    renderAnalysis();
  }

  function assessRisk() {
    state.blocks = 4;
    setStatus("Risk assessment", "alert");
    setStage("risk");
    renderAnalysis();
  }

  function decide() {
    state.blocks = 5;
    setStatus("Decision", "alert");
    setStage("decision");
    renderAnalysis();
  }

  function mark() {
    var t = state.current;
    state.marked.push(t);
    state.blocks = 6;
    state.justMarked = true;
    state.alert = t;
    setStatus(t.level === "safe" ? "Logged" : "Alert — target marked", "alert");
    setStage("alert");
    addMarker(t);
    renderAlert();
    renderLog();
    renderAnalysis();
    flash(el.cardMap);
    flash(el.cardLog);
    flash(el.alert);
  }

  function repassStart(key) {
    var t = state.byKey[key];
    state.status = "verifying";
    state.current = t;
    state.blocks = 7;
    state.shownBlocks = 6;
    state.verifyStep = 1;
    state.justMarked = false;
    state.alert = t;
    renderAlert();
    setStatus("Verification — additional pass", "alert");
    setStage("verification");
    clearMarkerFocus();
    if (t.markerEl) t.markerEl.classList.add("is-inspecting");
    showScene(t.scene);
    setBox(t, true);
    setCloseup(true, t, "Additional pass — reference image");
    renderAnalysis();
  }

  function repassCompare() {
    state.verifyStep = 2;
    setStatus("Comparing evidence", "alert");
    renderAnalysis();
  }

  function repassUpdate() {
    var t = state.current;
    state.verifyStep = 4;
    t.statusNow = t.verify.status;
    setStatus("Verification required", "alert");
    state.alert = t;
    renderAlert();
    renderAnalysis();
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    state.status = "complete";
    state.running = false;
    state.paused = false;
    state.current = null;
    state.alert = null;
    state.d = survey.total;
    setStatus("Mission complete", "done");
    allStagesDone();
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
    renderTrack();
    renderCoverage();
    renderClock();
    renderAlert();
    renderAnalysis();
    setPausedVisuals(false);
    updateButtons();
  }

  /* --- clock and controls --- */

  function pump() {
    while (state.next < plan.events.length && plan.events[state.next].t <= state.ms) {
      var event = plan.events[state.next];
      state.next += 1;
      event.run();
    }
  }

  function tick() {
    state.ms += TICK;
    state.d = distanceAt(state.ms);
    pump();
    if (state.status === "complete") return;
    renderTrack();
    renderCoverage();
    renderClock();
  }

  function start() {
    if (state.running && state.paused) { resume(); return; }
    if (state.running) return;
    reset();
    state.running = true;
    pump();
    renderTrack();
    timer = setInterval(tick, TICK);
    updateButtons();
  }

  function pause() {
    if (!state.running || state.paused) return;
    state.paused = true;
    clearInterval(timer);
    timer = null;
    setPausedVisuals(true);
    updateButtons();
  }

  function resume() {
    if (!state.running || !state.paused) return;
    state.paused = false;
    setPausedVisuals(false);
    timer = setInterval(tick, TICK);
    updateButtons();
  }

  function reset() {
    clearInterval(timer);
    timer = null;
    state = freshState();
    el.markers.innerHTML = "";
    Array.prototype.slice.call(el.timeline.querySelectorAll(".timeline__mark")).forEach(function (m) { m.remove(); });
    showScene("idle");
    setBox(null);
    setCloseup(false);
    setStage(null);
    setStatus("Ready", "idle");
    [el.cardMap, el.cardLog, el.alert].forEach(function (n) { n.classList.remove("is-flash"); });
    setPausedVisuals(false);
    renderAlert();
    renderAnalysis();
    renderLog();
    renderTrack();
    renderCoverage();
    renderClock();
    updateButtons();
  }

  /* Changing the scenario rebuilds the survey, the target positions and the
     timeline, then resets the mission. */
  function setScenario(key) {
    scenarioKey = SCENARIOS[key] ? key : "redsea";
    sc = SCENARIOS[scenarioKey];
    survey = buildSurvey(sc);
    geo = placeTargets();
    plan = compile();
    drawMap();
    renderSurveyInfo();
  }

  /* --- full-screen demo: a clean layout for screen recording --- */

  function setFullscreen(on) {
    demo.classList.toggle("is-recording", on);
    document.body.classList.toggle("demo-locked", on);
    el.full.setAttribute("aria-pressed", String(on));
    el.full.textContent = on ? "Exit full screen" : "Full-screen demo";
  }

  el.start.addEventListener("click", start);
  el.pause.addEventListener("click", function () { if (state.paused) resume(); else pause(); });
  el.reset.addEventListener("click", reset);
  el.full.addEventListener("click", function () { setFullscreen(!demo.classList.contains("is-recording")); });
  el.scenario.addEventListener("change", function () {
    if (state.running) { el.scenario.value = scenarioKey; return; }
    setScenario(el.scenario.value);
    reset();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && demo.classList.contains("is-recording")) setFullscreen(false);
  });

  el.scenario.value = scenarioKey;
  setScenario(scenarioKey);
  reset();
})();
