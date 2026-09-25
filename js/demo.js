/* AUV project site — interactive demo.
   A fixed, scripted mission that shows how the proposed AUV reaches and
   explains an inspection decision:

     Scanning > Detection > Object analysis > Classification >
     Decision support > Target marking > Inspection > Mission summary

   Everything is driven by ONE mission clock. Pause stops the clock (and
   the animations), Reset throws the whole state away, and nothing is ever
   scheduled outside the clock — so no late event can appear after a Reset.
   The sequence is deterministic: no randomness, same result every run.

   Sections of this file:
     1. Content   – species, the man-made-object case, decision factors, mission script
     2. Map       – the simulated spiral search area
     3. Views     – functions that draw the current state into the page
     4. Mission   – event timeline, clock, Start / Pause / Reset, full-screen mode   */
(function () {
  "use strict";

  var demo = document.getElementById("demo");
  if (!demo) return;

  var $ = function (id) { return document.getElementById(id); };
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ================= 1. Content ================= */

  /* Decision factors: [label, weight, score]. Weights add up to 1. The demo
     score is the weighted sum — a simple rule-based / weighted decision. */
  var FISH_LABELS = ["Biological body shape", "Recognizable fish morphology", "Movement consistent with marine life"];
  var FISH_WEIGHTS = [0.40, 0.35, 0.25];

  /* box = [left, top, width, height] of the detection frame, in % of the camera view */
  var SPECIES = {
    lionfish:  { name: "Lionfish",  scene: "lionfish",  box: [31, 5, 60, 80],  confidence: 87, scores: [0.95, 0.90, 0.85] },
    clownfish: { name: "Clownfish", scene: "clownfish", box: [37, 29, 42, 36], confidence: 91, scores: [0.97, 0.93, 0.86] },
    grouper:   { name: "Grouper",   scene: "grouper",   box: [27, 25, 55, 49], confidence: 83, scores: [0.92, 0.82, 0.80] }
  };

  var OBJECT_CASE = {
    name: "Potential Man-Made Object",
    scene: "object",
    box: [34, 36, 47, 56],
    confidence: 74,
    factors: [
      ["Non-biological shape detected", 0.30, 0.90],
      ["Rigid geometric structure", 0.25, 0.95],
      ["Unusual structural appearance", 0.20, 0.80],
      ["Does not match marine-life characteristics", 0.15, 0.75],
      ["Possible man-made origin", 0.10, 0.70]
    ]
  };

  var FISH_RULE = "Rule: a score of 0.75 or more is classified as Marine Life.";
  var OBJECT_RULE = "Rule: a score of 0.60 or more recommends inspection.";

  /* The mission, in order. "frac" is how far along the spiral the target sits. */
  var MISSION = [
    { type: "scan", ms: 2200 },
    { type: "target", ms: 7000, target: { kind: "fish", key: "lionfish", frac: 0.30 } },
    { type: "scan", ms: 1800 },
    { type: "target", ms: 10200, target: { kind: "object", frac: 0.55 } },
    { type: "scan", ms: 1800 },
    { type: "target", ms: 7000, target: { kind: "fish", key: "clownfish", frac: 0.76 } },
    { type: "scan", ms: 1600 },
    { type: "target", ms: 7000, target: { kind: "fish", key: "grouper", frac: 0.93 } },
    { type: "end", ms: 0 }
  ];

  /* Within a target step: when each stage shows (ms after detection). Kept slow
     enough that every state can be read, or screen-recorded, comfortably. */
  var AT = { analyze: 1200, classify: 2400, decide: 3600, explain: 4500, mark: 5400,
             inspect: 6400, closeup: 7600, report: 8800 };

  var STAGES = ["scanning", "detection", "analysis", "classification", "decision", "marking", "inspection"];

  /* ================= 2. Map: simulated spiral search ================= */

  var CENTER = { x: 280, y: 230 };
  var TURNS = 3.2, MAX_RADIUS = 195, POINT_COUNT = 260;
  var points = buildSpiral();

  function buildSpiral() {
    var list = [];
    var total = TURNS * Math.PI * 2;
    for (var i = 0; i < POINT_COUNT; i++) {
      var t = i / (POINT_COUNT - 1);
      var angle = t * total;
      var radius = 12 + t * (MAX_RADIUS - 12);
      list.push({
        x: CENTER.x + radius * Math.cos(angle),
        y: CENTER.y + radius * Math.sin(angle),
        deg: (angle * 180) / Math.PI,
        ring: Math.min(5, Math.floor(t * 5) + 1)
      });
    }
    return list;
  }

  function pointIndex(frac) { return Math.round(frac * (POINT_COUNT - 1)); }
  function describePosition(p) { return "Ring " + p.ring + " / " + Math.round(p.deg % 360) + "°"; }
  function pad(n) { return String(n).padStart(3, "0"); }
  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function score(factors) {
    var sum = 0;
    factors.forEach(function (f) { sum += f[1] * f[2]; });
    return Math.round(sum * 100) / 100;
  }

  /* ================= 3. Views ================= */

  var el = {
    status: $("demo-status"),
    statusLabel: $("demo-status-label"),
    start: $("demo-start"),
    pause: $("demo-pause"),
    reset: $("demo-reset"),
    full: $("demo-full"),
    stages: Array.prototype.slice.call($("demo-stages").children),
    rings: $("demo-rings"),
    ticks: $("demo-ticks"),
    path: $("demo-path"),
    markers: $("demo-markers"),
    auv: $("demo-auv"),
    scenes: Array.prototype.slice.call(document.querySelectorAll(".camera__scene")),
    svgs: Array.prototype.slice.call(document.querySelectorAll(".camera__scene svg")),
    stage: $("camera-stage"),
    chip: $("cam-chip"),
    box: $("det-box"),
    boxLabel: $("det-label"),
    analysis: $("demo-analysis"),
    logBody: $("log-body"),
    count: $("demo-count"),
    time: $("demo-time"),
    cardMap: $("card-map"),
    cardLog: $("card-log")
  };

  function drawMap() {
    var radii = [40, 80, 120, 160, 195];
    el.rings.innerHTML = radii.map(function (r, i) {
      return '<circle cx="' + CENTER.x + '" cy="' + CENTER.y + '" r="' + r + '" stroke-opacity="' + (0.1 + i * 0.03).toFixed(2) + '"/>';
    }).join("");

    var ticks = "";
    ["A", "B", "C", "D", "E"].forEach(function (c, i) { ticks += '<text x="' + (90 + i * 90) + '" y="450">' + c + "</text>"; });
    for (var r = 1; r <= 4; r++) ticks += '<text x="10" y="' + (70 + r * 90) + '">' + r + "</text>";
    el.ticks.innerHTML = ticks;

    el.path.setAttribute("d", points.map(function (p, i) {
      return (i === 0 ? "M" : "L") + p.x.toFixed(1) + "," + p.y.toFixed(1);
    }).join(" "));
  }

  function renderAuv() {
    var i = robotIndexAt(state.ms);
    var p = points[i];
    var n = points[Math.min(i + 1, POINT_COUNT - 1)];
    var heading = (Math.atan2(n.y - p.y, n.x - p.x) * 180) / Math.PI + 90;
    el.auv.setAttribute("transform", "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ") rotate(" + heading.toFixed(1) + ")");
  }

  function addMarker(t) {
    var p = points[t.pointIndex];
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "marker is-active");
    g.setAttribute("transform", "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")");
    var shape = t.kind === "fish"
      ? '<circle r="6.5" fill="#7fd6e6" stroke="#071a26" stroke-width="1.5"/>'
      : '<circle class="ring" r="15" fill="none" stroke="#c49837" stroke-width="1.5" stroke-dasharray="3 3"/><rect x="-6.5" y="-6.5" width="13" height="13" transform="rotate(45)" fill="#c49837" stroke="#071a26" stroke-width="1.5"/>';
    g.innerHTML = '<circle class="halo" r="17" fill="none" stroke="#ffffff" stroke-width="2"/>' + shape +
      '<text x="12" y="4" font-family="Archivo, sans-serif" font-size="11" font-weight="600" fill="#ffffff">' + t.id.replace("Target ", "") + "</text>";
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

  function setStatus(label, mode) {
    el.statusLabel.textContent = label;
    el.status.setAttribute("data-state", mode);
  }

  /* Highlight one stage; everything before it shows as done. */
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

  function showScene(name) {
    el.scenes.forEach(function (s) { s.classList.toggle("is-visible", s.getAttribute("data-scene") === name); });
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
    el.boxLabel.textContent = t.name + " · " + t.confidence + "%";
  }

  /* Close-range view: the camera view zooms toward the target. */
  function setCloseup(on, t) {
    if (on && t) {
      el.stage.style.transformOrigin = (t.box[0] + t.box[2] / 2) + "% " + (t.box[1] + t.box[3] / 2) + "%";
      el.chip.textContent = "Close-range view";
    } else {
      el.chip.textContent = "Camera";
    }
    el.stage.classList.toggle("is-closeup", !!on);
  }

  /* ---- the analysis panel: a decision trail that builds up as the mission runs ---- */

  var BLOCK_ORDER = ["detect", "analysis", "classify", "decide", "explain", "mark", "inspect"];

  function section(title, body, cls) {
    return '<section class="trail__block ' + cls + '"><h4>' + title + "</h4>" + body + "</section>";
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + "</dl>";
  }

  function blockHtml(key, t, cls) {
    if (key === "detect") {
      return section("Target detected", '<p class="trail__id">' + t.id + '</p><p class="trail__meta">Detected by ' + t.detectedBy + ".</p>", cls);
    }
    if (key === "analysis") {
      var rows = t.factors.map(function (f) {
        return '<li><div class="factors__row"><span>' + f[0] + '</span><span class="factors__w">weight ' + f[1].toFixed(2) +
          '</span></div><div class="bar"><i style="--w:' + Math.round(f[2] * 100) + '%"></i></div></li>';
      }).join("");
      return section(t.kind === "object" ? "Object analysis" : "Analysis",
        '<ul class="factors">' + rows + '</ul><p class="trail__meta">Demo score <strong>' + t.score.toFixed(2) + "</strong>. " + t.rule + "</p>", cls);
    }
    if (key === "classify") {
      var list = [["Category", "<strong>" + t.category + "</strong>"]];
      if (t.kind === "fish") list.push(["Species", t.name]);
      list.push(["Demo Confidence", t.confidence + "%"]);
      return section("Classification", kv(list), cls);
    }
    if (key === "decide") {
      var chip = '<span class="chip' + (t.kind === "object" ? " chip--alert" : "") + '">' + t.decision + "</span>";
      return section("Decision", '<p class="trail__decision">' + chip + "</p>" + kv([["Inspection priority", t.priority]]), cls);
    }
    if (key === "explain") {
      return section("Decision explanation", '<p class="trail__text">' + t.explanation + "</p>", cls);
    }
    if (key === "mark") {
      return section("Target marked", kv([["Position", t.position]]) + '<p class="trail__meta">Placed on the search map and added to the target log.</p>', cls);
    }
    var steps = [
      ["AUV approaches the target", 1],
      ["Close-range camera view", 2],
      ["Report to the operator", 3]
    ].map(function (s) {
      var mark_ = s[1] < state.inspectStep ? "is-done" : s[1] === state.inspectStep ? "is-active" : "";
      return '<li class="' + mark_ + '">' + s[0] + "</li>";
    }).join("");
    return section("Inspection required",
      kv([["Status", "Requires Inspection"], ["Inspection priority", t.priority]]) +
      '<ol class="inspect-steps">' + steps + '<li class="is-future">Sample collection — Future Sampling Capability</li></ol>', cls);
  }

  function summaryHtml() {
    var total = state.marked.length;
    var life = state.marked.filter(function (t) { return t.category === "Marine Life"; }).length;
    var objects = state.marked.filter(function (t) { return t.kind === "object"; }).length;
    var inspect = state.marked.filter(function (t) { return t.decision === "Requires Inspection"; }).length;
    var tiles = [["Targets detected", total], ["Marine life", life], ["Potential man-made objects", objects], ["Inspection required", inspect]]
      .map(function (s) { return "<div><strong>" + s[1] + "</strong><span>" + s[0] + "</span></div>"; }).join("");
    return '<div class="summary trail__block is-new"><h4>Mission complete</h4><div class="summary__grid">' + tiles +
      '</div><p class="trail__text">All detected targets have been logged and marked for operator review.</p>' +
      '<p class="trail__meta">Simulated demonstration values.</p></div>';
  }

  function renderAnalysis() {
    var t = state.current;
    if (state.status === "complete") { el.analysis.innerHTML = summaryHtml(); return; }
    if (!t) {
      var message = state.status === "scanning" ? "Scanning for targets…" : "Start the mission to begin scanning.";
      el.analysis.innerHTML = '<div class="analysis__empty"><p>' + message + "</p></div>";
      state.shownBlocks = 0;
      return;
    }
    var visible = BLOCK_ORDER.slice(0, state.blocks).filter(function (k) { return k !== "inspect" || t.kind === "object"; });
    el.analysis.innerHTML = visible.map(function (key, i) {
      var cls = (i >= state.shownBlocks ? "is-new " : "") + (i === visible.length - 1 ? "is-current" : "");
      return blockHtml(key, t, cls);
    }).join("");
    var grew = visible.length > state.shownBlocks;
    state.shownBlocks = visible.length;
    if (grew) el.analysis.scrollTop = el.analysis.scrollHeight;
  }

  function renderLog() {
    el.count.textContent = state.marked.length;
    if (!state.marked.length) {
      el.logBody.innerHTML = '<tr class="is-empty"><td colspan="7">Targets appear here as they are marked.</td></tr>';
      return;
    }
    var last = state.marked.length - 1;
    el.logBody.innerHTML = state.marked.map(function (t, i) {
      return '<tr class="' + (i === last && state.justMarked ? "is-new" : "") + '"><td>' + t.id + "</td><td>" + t.category + "</td><td>" +
        (t.kind === "fish" ? t.name : "Object of interest") + "</td><td>" + t.detectedBy + "</td><td>" + t.position + "</td><td>" + t.time +
        '</td><td class="' + (t.kind === "object" ? "is-alert" : "") + '">' + t.decision + "</td></tr>";
    }).join("");
  }

  function updateButtons() {
    el.start.disabled = state.running && !state.paused;
    el.pause.disabled = !state.running;
    el.pause.textContent = state.paused ? "Resume" : "Pause";
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
  var timer = null;
  var state = freshState();
  var plan = compile();

  function freshState() {
    return { status: "ready", running: false, paused: false, ms: 0, next: 0, counter: 0, current: null,
             blocks: 0, shownBlocks: 0, inspectStep: 0, justMarked: false, marked: [] };
  }

  /* Turn the mission script into timed events and AUV movements. */
  function compile() {
    var events = [], moves = [], t = 0, at = 0;

    function later(ms, fn, arg) { events.push({ t: ms, run: function () { fn(arg); } }); }

    MISSION.forEach(function (step, i) {
      if (step.type === "scan") {
        var next = MISSION.slice(i + 1).filter(function (s) { return s.type === "target"; })[0];
        var to = next ? pointIndex(next.target.frac) : at;
        later(t, enterScan);
        moves.push({ t0: t, t1: t + step.ms, from: at, to: to });
        at = to;
      } else if (step.type === "target") {
        later(t, detect, step.target);
        later(t + AT.analyze, analyze);
        later(t + AT.classify, classify);
        later(t + AT.decide, decide);
        later(t + AT.explain, explain);
        later(t + AT.mark, mark);
        if (step.target.kind === "object") {
          later(t + AT.inspect, inspectStart);
          later(t + AT.closeup, closeup);
          later(t + AT.report, report);
        }
      } else {
        later(t, finish);
      }
      t += step.ms;
    });
    return { events: events, moves: moves };
  }

  function robotIndexAt(ms) {
    var index = 0;
    for (var i = 0; i < plan.moves.length; i++) {
      var m = plan.moves[i];
      if (ms >= m.t1) index = m.to;
      else if (ms >= m.t0) { index = Math.round(m.from + ((m.to - m.from) * (ms - m.t0)) / (m.t1 - m.t0)); break; }
      else break;
    }
    return index;
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

  function detect(spec) {
    state.counter += 1;
    var t;
    if (spec.kind === "fish") {
      var sp = SPECIES[spec.key];
      var factors = FISH_LABELS.map(function (label, i) { return [label, FISH_WEIGHTS[i], sp.scores[i]]; });
      t = { kind: "fish", name: sp.name, scene: sp.scene, box: sp.box, confidence: sp.confidence, factors: factors,
            rule: FISH_RULE, category: "Marine Life", detectedBy: "Camera", decision: "Log Observation", priority: "Routine",
            explanation: "The target matches a selected marine species. It is logged as an observation; no inspection is needed." };
    } else {
      t = { kind: "object", name: OBJECT_CASE.name, scene: OBJECT_CASE.scene, box: OBJECT_CASE.box, confidence: OBJECT_CASE.confidence,
            factors: OBJECT_CASE.factors, rule: OBJECT_RULE, category: "Potential Man-Made Object",
            detectedBy: "Multibeam Echosounder + Camera Confirmation", decision: "Requires Inspection", priority: "Review",
            explanation: "The detected characteristics indicate a possible man-made structure. The target is marked for operator inspection. The system recommends inspection; it does not determine danger." };
    }
    t.score = score(t.factors);
    t.id = "Target #" + pad(state.counter);
    t.pointIndex = pointIndex(spec.frac);
    t.position = describePosition(points[t.pointIndex]);

    state.status = "detected";
    state.current = t;
    state.blocks = 1;
    state.shownBlocks = 0;
    state.inspectStep = 0;
    setStatus("Target detected", "alert");
    setStage("detection");
    showScene(t.scene);
    setBox(t, false);
    renderAnalysis();
  }

  function analyze() {
    state.blocks = 2;
    setStatus("Analysing target", "alert");
    setStage("analysis");
    renderAnalysis();
  }

  function classify() {
    state.blocks = 3;
    setStatus("Classifying target", "alert");
    setStage("classification");
    setBox(state.current, true);
    renderAnalysis();
  }

  function decide() {
    state.blocks = 4;
    setStatus("Decision support", "alert");
    setStage("decision");
    renderAnalysis();
  }

  function explain() {
    state.blocks = 5;
    renderAnalysis();
  }

  function mark() {
    var t = state.current;
    t.time = formatTime(state.ms);
    state.marked.push(t);
    state.blocks = 6;
    state.justMarked = true;
    setStatus("Target marked", "alert");
    setStage("marking");
    addMarker(t);
    renderLog();
    renderAnalysis();
    flash(el.cardMap);
    flash(el.cardLog);
  }

  function inspectStart() {
    state.blocks = 7;
    state.inspectStep = 1;
    setStatus("Inspection", "alert");
    setStage("inspection");
    if (state.current.markerEl) state.current.markerEl.classList.add("is-inspecting");
    renderAnalysis();
  }

  function closeup() {
    state.inspectStep = 2;
    setCloseup(true, state.current);
    renderAnalysis();
  }

  function report() {
    state.inspectStep = 3;
    setCloseup(false);
    renderAnalysis();
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    state.status = "complete";
    state.running = false;
    state.paused = false;
    state.current = null;
    setStatus("Mission complete", "done");
    allStagesDone();
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
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
    pump();
    renderAuv();
    el.time.textContent = formatTime(state.ms);
  }

  function start() {
    if (state.running && state.paused) { resume(); return; }
    if (state.running) return;
    reset();
    state.running = true;
    pump();
    renderAuv();
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
    showScene("idle");
    setBox(null);
    setCloseup(false);
    setStage(null);
    setStatus("Ready", "idle");
    el.time.textContent = "00:00";
    el.cardMap.classList.remove("is-flash");
    el.cardLog.classList.remove("is-flash");
    setPausedVisuals(false);
    renderAnalysis();
    renderLog();
    renderAuv();
    updateButtons();
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
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && demo.classList.contains("is-recording")) setFullscreen(false);
  });

  drawMap();
  reset();
})();
