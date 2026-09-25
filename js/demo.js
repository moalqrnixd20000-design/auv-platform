/* AUV project site — interactive demo.
   A scripted mission that shows the workflow the AUV is designed around:
   scanning, detection, classification, decision support, target marking
   and inspection. Everything is driven by one mission clock, so Pause,
   Resume and Reset are exact: while the clock is stopped nothing moves.

   Sections of this file:
     1. Content   – species, the man-made-object case, the mission script
     2. Map       – the simulated spiral search area
     3. Views     – functions that draw the current state into the page
     4. Mission   – event timeline, clock, Start / Pause / Reset            */
(function () {
  "use strict";

  if (!document.getElementById("demo")) return;

  var $ = function (id) { return document.getElementById(id); };
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ================= 1. Content ================= */

  /* box = [left, top, width, height] of the detection frame, in % of the camera view */
  var SPECIES = {
    lionfish:  { name: "Lionfish",  scene: "lionfish",  box: [31, 5, 60, 80],  confidence: 87, cue: "Striped body with long, fan-like fins" },
    clownfish: { name: "Clownfish", scene: "clownfish", box: [37, 29, 42, 36], confidence: 91, cue: "Orange body with white bands" },
    grouper:   { name: "Grouper",   scene: "grouper",   box: [27, 25, 55, 49], confidence: 83, cue: "Large, stout body with a mottled pattern" }
  };

  var OBJECT_CASE = {
    name: "Potential Man-Made Object",
    scene: "object",
    box: [34, 36, 47, 56],
    confidence: 74,
    reasons: [
      "Non-biological shape detected",
      "Rigid geometric structure",
      "Appearance differs from expected marine life",
      "Further inspection required"
    ]
  };

  /* The mission, in order. "frac" is how far along the spiral the target sits. */
  var MISSION = [
    { type: "scan", ms: 2200 },
    { type: "target", ms: 3400, target: { kind: "fish", key: "lionfish", frac: 0.30 } },
    { type: "scan", ms: 1800 },
    { type: "target", ms: 3400, target: { kind: "object", frac: 0.55 } },
    { type: "inspect", ms: 2600 },
    { type: "scan", ms: 1800 },
    { type: "target", ms: 3400, target: { kind: "fish", key: "clownfish", frac: 0.76 } },
    { type: "scan", ms: 1600 },
    { type: "target", ms: 3400, target: { kind: "fish", key: "grouper", frac: 0.93 } },
    { type: "end", ms: 0 }
  ];

  /* Within a target step: when each stage of the workflow shows (ms after detection). */
  var CLASSIFY_AT = 900, DECIDE_AT = 1800, MARK_AT = 2600;

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

  /* ================= 3. Views ================= */

  var el = {
    status: $("demo-status"),
    statusLabel: $("demo-status-label"),
    start: $("demo-start"),
    pause: $("demo-pause"),
    reset: $("demo-reset"),
    stages: Array.prototype.slice.call($("demo-stages").children),
    rings: $("demo-rings"),
    ticks: $("demo-ticks"),
    path: $("demo-path"),
    markers: $("demo-markers"),
    auv: $("demo-auv"),
    scenes: Array.prototype.slice.call(document.querySelectorAll(".camera__scene")),
    box: $("det-box"),
    boxLabel: $("det-label"),
    analysis: $("demo-analysis"),
    logBody: $("log-body"),
    count: $("demo-count"),
    time: $("demo-time")
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
    g.setAttribute("transform", "translate(" + p.x.toFixed(1) + "," + p.y.toFixed(1) + ")");
    var shape = t.kind === "fish"
      ? '<circle r="6.5" fill="#7fd6e6" stroke="#071a26" stroke-width="1.5"/>'
      : '<rect x="-6.5" y="-6.5" width="13" height="13" transform="rotate(45)" fill="#c49837" stroke="#071a26" stroke-width="1.5"/>';
    g.innerHTML = shape + '<text x="11" y="4" font-family="Archivo, sans-serif" font-size="11" font-weight="600" fill="#ffffff">' + t.id.replace("Target ", "") + "</text>";
    el.markers.appendChild(g);
  }

  function setStatus(label, mode) {
    el.statusLabel.textContent = label;
    el.status.setAttribute("data-state", mode);
  }

  function setStage(name) {
    el.stages.forEach(function (li) { li.classList.toggle("is-active", li.getAttribute("data-stage") === name); });
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

  function renderAnalysis() {
    var t = state.current;
    if (!t) {
      var message = state.status === "scanning" ? "Scanning for targets…"
        : state.status === "complete" ? "Mission complete. The target log lists every marked target."
        : "Start the mission to begin scanning.";
      el.analysis.innerHTML = '<div class="analysis__empty"><p>' + message + "</p></div>";
      return;
    }

    var rows = [["Detected by", t.detectedBy]];
    if (state.stage >= 1) {
      rows.push(["Category", t.category]);
      if (t.kind === "fish") rows.push(["Identification", t.name]);
      rows.push(["Demo Confidence", t.confidence + "%"]);
    }
    if (state.stage >= 2) {
      rows.push(["Decision", t.decision, t.kind === "object"]);
      rows.push(["Inspection priority", t.priority]);
    }
    if (state.stage >= 3) rows.push(["Marked at", t.position]);

    var stateLabels = ["Detected", "Classified", "Decision ready", "Marked"];
    var html = '<div class="analysis__top"><span class="analysis__id">' + t.id + '</span><span class="analysis__state">' + stateLabels[state.stage] + '</span></div><dl class="analysis__rows">';
    rows.forEach(function (row, i) {
      var cls = i >= state.shownRows ? "is-new" : "";
      html += '<div class="' + cls + '"><dt>' + row[0] + "</dt><dd" + (row[2] ? ' class="is-alert"' : "") + ">" + row[1] + "</dd></div>";
    });
    html += "</dl>";
    if (state.stage >= 2) {
      html += '<div class="analysis__why' + (state.stage === 2 ? " is-new" : "") + '"><p>Why</p><ul>' +
        t.reasons.map(function (r) { return "<li>" + r + "</li>"; }).join("") + "</ul></div>";
    }
    state.shownRows = rows.length;
    el.analysis.innerHTML = html;
  }

  function renderLog() {
    el.count.textContent = state.marked.length;
    if (!state.marked.length) {
      el.logBody.innerHTML = '<tr class="is-empty"><td colspan="7">Targets appear here as they are marked.</td></tr>';
      return;
    }
    el.logBody.innerHTML = state.marked.map(function (t) {
      return "<tr><td>" + t.id + "</td><td>" + t.category + "</td><td>" + (t.kind === "fish" ? t.name : "Object of interest") +
        "</td><td>" + t.detectedBy + "</td><td>" + t.position + "</td><td>" + t.time +
        '</td><td class="' + (t.kind === "object" ? "is-alert" : "") + '">' + t.decision + "</td></tr>";
    }).join("");
  }

  function updateButtons() {
    el.start.disabled = state.running && !state.paused;
    el.pause.disabled = !state.running;
    el.pause.textContent = state.paused ? "Resume" : "Pause";
  }

  /* ================= 4. Mission ================= */

  var TICK = 100;
  var timer = null;
  var state = freshState();
  var plan = compile();

  function freshState() {
    return { status: "ready", running: false, paused: false, ms: 0, next: 0, counter: 0, current: null, stage: 0, shownRows: 0, marked: [] };
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
        later(t + CLASSIFY_AT, classify);
        later(t + DECIDE_AT, decide);
        later(t + MARK_AT, mark);
      } else if (step.type === "inspect") {
        later(t, inspect);
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

  /* --- events --- */

  function enterScan() {
    state.status = "scanning";
    state.current = null;
    setStatus("Scanning", "active");
    setStage("scanning");
    showScene("idle");
    setBox(null);
    renderAnalysis();
  }

  function detect(spec) {
    state.counter += 1;
    var t;
    if (spec.kind === "fish") {
      var sp = SPECIES[spec.key];
      t = { kind: "fish", name: sp.name, scene: sp.scene, box: sp.box, confidence: sp.confidence,
            category: "Marine Life", detectedBy: "Camera", decision: "Log observation", priority: "Routine",
            reasons: ["Organic body shape", sp.cue, "Movement typical of marine life"] };
    } else {
      t = { kind: "object", name: OBJECT_CASE.name, scene: OBJECT_CASE.scene, box: OBJECT_CASE.box, confidence: OBJECT_CASE.confidence,
            category: "Potential Man-Made Object", detectedBy: "Multibeam echosounder, camera confirmation",
            decision: "Requires Inspection", priority: "High", reasons: OBJECT_CASE.reasons };
    }
    t.id = "Target #" + pad(state.counter);
    t.pointIndex = pointIndex(spec.frac);
    t.position = describePosition(points[t.pointIndex]);

    state.status = "detected";
    state.current = t;
    state.stage = 0;
    state.shownRows = 0;
    setStatus("Target detected", "alert");
    setStage("detection");
    showScene(t.scene);
    setBox(t, false);
    renderAnalysis();
  }

  function classify() {
    state.stage = 1;
    setStage("classification");
    setBox(state.current, true);
    renderAnalysis();
  }

  function decide() {
    state.stage = 2;
    setStage("decision");
    renderAnalysis();
  }

  function mark() {
    var t = state.current;
    state.stage = 3;
    t.time = formatTime(state.ms);
    state.marked.push(t);
    setStage("marking");
    addMarker(t);
    renderLog();
    renderAnalysis();
  }

  function inspect() {
    state.status = "inspection";
    setStatus("Inspection", "alert");
    setStage("inspection");
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    state.status = "complete";
    state.running = false;
    state.paused = false;
    state.current = null;
    setStatus("Mission complete", "done");
    setStage(null);
    showScene("idle");
    setBox(null);
    renderAnalysis();
    updateButtons();
  }

  /* --- clock and controls --- */

  function pump() {
    while (state.next < plan.events.length && plan.events[state.next].t <= state.ms) {
      plan.events[state.next].run();
      state.next += 1;
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
    updateButtons();
  }

  function resume() {
    if (!state.running || !state.paused) return;
    state.paused = false;
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
    setStage(null);
    setStatus("Ready", "idle");
    el.time.textContent = "00:00";
    renderAnalysis();
    renderLog();
    renderAuv();
    updateButtons();
  }

  el.start.addEventListener("click", start);
  el.pause.addEventListener("click", function () { if (state.paused) resume(); else pause(); });
  el.reset.addEventListener("click", reset);

  drawMap();
  reset();
})();
