/* USV B01 project site — interactive demo (software simulation).

   A fixed, scripted two-pass crosshatch survey that shows how the proposed
   USV B01 could detect underwater objects, classify them, assess their potential
   risk, explain the decision and recommend an action — then observe every
   target a second time from a perpendicular survey heading:

     Pass A  Primary Sweep — horizontal boustrophedon (lawn-mower) pass.
             Each target: Detection > Analysis > Classification > Risk
             assessment > Decision > Alert & marking.
     T       Transition leg to the start of Pass B.
     Pass B  Orthogonal Crosshatch Sweep — a complete vertical pass over the
             same area. Each target is observed again (same ID, same position,
             same marker) and the two observations are compared.
     Review  Cross-pass verification summary, then Mission complete.

   The route, line counts, distances, coverage and observation times come
   from js/survey-model.js (window.SurveyModel) and the survey-area
   parameters; nothing is hard-coded. A second heading adds an observation;
   it never turns a potential hazardous object into a confirmed one or forces
   an unknown object into a class.

   Everything is driven by ONE mission clock. Pause stops the clock and the
   CSS/SVG animations (a transition already under way finishes), Reset throws
   the whole state away, and nothing is scheduled outside the clock — so no
   late event can appear after a Reset. The run is deterministic.

   Survey numbers are simulation parameters, not vehicle or sensor
   specifications. Demo time is compressed and says nothing about speed.

   Sections of this file:
     1. Survey setup – survey area, simulation parameters, coordinates
     2. Targets      – evidence, decision rules, target content
     3. Views        – map, observation view, alert, analysis, coverage, log
     4. Mission      – event timeline, clock, Start / Pause / Reset, full screen */
(function () {
  "use strict";

  var demo = document.getElementById("demo");
  var Survey = window.SurveyModel;
  if (!demo || !Survey) return;

  var $ = function (id) { return document.getElementById(id); };
  var SVG_NS = "http://www.w3.org/2000/svg";

  /* ================= 1. Survey setup ================= */

  /* The survey area. origin = [latitude, longitude] of its south-west corner.
     Target positions are plan-view metres from that corner: x east, y north.
     Illustrative positions only. */
  var sc = {
    origin: [21.62, 39.08],
    width: 400,
    height: 240,
    targets: { fish: [160, 36], wreck: [248, 44], mine: [232, 160], unknown: [320, 200] },
    note: "All positions are simulated."
  };

  /* Simulation parameters — not validated hardware specifications. */
  var CONFIG = {
    lineSpacing: 40,   // m, requested spacing between survey lines
    swath: 50,         // m, estimated sensor swath
    cell: 5            // m, coverage-grid resolution used for unique coverage
  };
  var M_PER_DEG = 111320;  // metres per degree of latitude (approximation)

  var route, grid, observations, plan;

  function toLatLon(x, y) {
    var lat = sc.origin[0] + y / M_PER_DEG;
    var lon = sc.origin[1] + x / (M_PER_DEG * Math.cos((sc.origin[0] * Math.PI) / 180));
    return [lat, lon];
  }

  function fmtLat(v) { return ltr(v.toFixed(5) + "° N"); }
  function fmtLon(v) { return ltr(v.toFixed(5) + "° E"); }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function fmtDeg(h) { return ltr(String(Math.round(h) % 360).padStart(3, "0") + "°"); }
  function pad3(n) { return String(n).padStart(3, "0"); }
  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function list(values) {
    if (values.length <= 4) return values.map(fmtNum).join(", ");
    return fmtNum(values[0]) + ", " + fmtNum(values[1]) + " … " + fmtNum(values[values.length - 1]);
  }

  /* ---- language: the English text is written in this file; AR holds the Arabic.
     js/i18n.js switches the page and fires "sitelang"; relabel() (section 4)
     then rewrites the live text. tx("text") gives the text in the page
     language, tf("… {0} …", a) fills in values. Logic always uses the English. */

  function isAr() { return !!window.SiteLang && window.SiteLang.get() === "ar"; }
  function tx(s) { return isAr() && AR[s] != null ? AR[s] : s; }
  function tf(s) {
    var args = arguments;
    return tx(s).replace(/\{(\d)\}/g, function (m, i) { return args[Number(i) + 1]; });
  }
  /* coordinates, headings and line lists stay left to right inside Arabic text */
  function ltr(s) { return isAr() ? "⁦" + s + "⁩" : s; }
  function tid(t) { return isAr() ? "الهدف " + t.id.replace("Target ", "") : t.id; }

  var AR = {
    /* evidence */
    "Biological morphology": "شكل حيوي",
    "Movement consistent with marine life": "حركة تتسق مع الحياة البحرية",
    "Rigid / geometric structure": "بنية صلبة / هندسية",
    "Non-biological appearance": "مظهر غير حيوي",
    "Size category": "فئة الحجم",
    "Return differs from surrounding background": "الصدى يختلف عن الخلفية المحيطة",
    "Detected": "مرصود",
    "Not detected": "غير مرصود",
    "Inconclusive": "غير حاسم",
    "Small": "صغير",
    "Large": "كبير",
    "Compact": "مدمج",
    "Medium": "متوسط",

    /* decision rules */
    "Biological morphology detected → Marine Life.": "رُصد شكل حيوي ← حياة بحرية.",
    "Rigid, non-biological and large → man-made structure.": "صلب وغير حيوي وكبير ← هيكل من صنع الإنسان.",
    "Rigid, non-biological and compact → potential hazardous object. The identity cannot be confirmed.": "صلب وغير حيوي ومدمج ← جسم خطِر محتمل. لا يمكن تأكيد هويته.",
    "No rule is met with enough evidence → Unknown. The system does not force a class.": "لا تنطبق أي قاعدة بأدلة كافية ← غير معروف. لا يفرض النظام تصنيفًا.",
    "Marine Life": "حياة بحرية",
    "Man-Made Structure": "هيكل من صنع الإنسان",
    "Potential Hazardous Object": "جسم خطِر محتمل",
    "Unknown": "غير معروف",
    "Likely Non-Hazardous": "غير خطِر على الأرجح",
    "Potential Hazard — Requires Verification": "خطر محتمل، يحتاج تحققًا",
    "High Potential Hazard — Requires Verification": "خطر محتمل مرتفع، يحتاج تحققًا",
    "Unknown — Requires Verification": "غير معروف، يحتاج تحققًا",
    "Biological / Marine Life": "حيوي / حياة بحرية",
    "Navigation / Obstruction Risk": "خطر ملاحي / عائق",
    "Potential Explosive Hazard": "خطر انفجار محتمل",
    "Unknown Risk": "خطر غير معروف",
    "High — all defining features detected": "مرتفعة — رُصدت كل السمات المحدِّدة",
    "Moderate — identity not confirmed": "متوسطة — الهوية غير مؤكدة",
    "Low — insufficient evidence": "منخفضة — الأدلة غير كافية",
    "STATUS — Likely Non-Hazardous": "حالة — غير خطِر على الأرجح",
    "ALERT — Potential Hazard — Requires Verification": "تنبيه — خطر محتمل، يحتاج تحققًا",
    "ALERT — High Potential Hazard — Requires Verification": "تنبيه — خطر محتمل مرتفع، يحتاج تحققًا",
    "NOTICE — Unknown — Requires Verification": "إشعار — غير معروف، يحتاج تحققًا",

    /* targets */
    "Lionfish (demo example)": "سمكة الأسد (مثال توضيحي)",
    "Lionfish": "سمكة الأسد",
    "Fish": "سمكة",
    "Water-Column Acoustic Data": "بيانات صوتية لعمود الماء",
    "Continue Survey / Log Observation": "متابعة المسح / تسجيل الملاحظة",
    "Log Observation": "تسجيل الملاحظة",
    "Biological morphology and expected marine-life characteristics detected.": "رُصد شكل حيوي وخصائص متوقعة للحياة البحرية.",
    "Continue the survey and log the observation.": "متابعة المسح وتسجيل الملاحظة.",
    "Logged": "مُسجَّل",
    "The perpendicular heading also shows biological morphology and movement.": "الاتجاه العمودي يُظهر أيضًا شكلًا حيويًا وحركة.",
    "Consistent across two orthogonal passes": "متسق عبر تمريرتين متعامدتين",
    "No change: Marine Life — Likely Non-Hazardous. Continue survey / log observation.": "لا تغيير: حياة بحرية — غير خطِر على الأرجح. متابعة المسح / تسجيل الملاحظة.",
    "Logged — observed on both headings": "مُسجَّل — رُصد من الاتجاهين",
    "Shipwreck": "حطام سفينة",
    "Large structure on the seafloor": "هيكل كبير على قاع البحر",
    "Multibeam + Side-Scan Sonar": "سونار متعدد الحزم + سونار المسح الجانبي",
    "Requires Inspection": "يحتاج فحصًا",
    "Large rigid structure with non-biological geometric characteristics detected on or near the seafloor.": "رُصد هيكل صلب كبير بخصائص هندسية غير حيوية على قاع البحر أو بالقرب منه.",
    "Mark the position and schedule an inspection.": "تعليم الموقع وجدولة فحص.",
    "Marked for inspection": "مُعلَّم للفحص",
    "The perpendicular heading also shows a large, rigid, non-biological structure.": "الاتجاه العمودي يُظهر أيضًا هيكلًا كبيرًا صلبًا غير حيوي.",
    "No change: Man-Made Structure — Potential Hazard — Requires Verification. Decision: Requires Inspection. A second heading adds an observation; it does not identify the wreck.": "لا تغيير: هيكل من صنع الإنسان — خطر محتمل، يحتاج تحققًا. القرار: يحتاج فحصًا. الاتجاه الثاني يضيف رصدًا، ولا يحدد هوية الحطام.",
    "Marked for inspection — observed on both headings": "مُعلَّم للفحص — رُصد من الاتجاهين",
    "Compact object on the seafloor": "جسم مدمج على قاع البحر",
    "Requires Verification": "يحتاج تحققًا",
    "Detected characteristics are consistent with a potential hazardous man-made object, but the simulation cannot confirm the object's identity.": "الخصائص المرصودة تتسق مع جسم خطِر محتمل من صنع الإنسان، لكن المحاكاة لا تستطيع تأكيد هوية الجسم.",
    "Do not treat as confirmed. Request further inspection / verification.": "لا يُعامَل على أنه مؤكد. اطلب مزيدًا من الفحص / التحقق.",
    "Awaiting verification": "بانتظار التحقق",
    "Both headings show a compact, rigid, non-biological return.": "الاتجاهان يُظهران صدى مدمجًا صلبًا غير حيوي.",
    "Consistent across two orthogonal passes — identity not confirmed": "متسق عبر تمريرتين متعامدتين — الهوية غير مؤكدة",
    "Still High Potential Hazard — Requires Verification. The identity is not confirmed; the second pass adds an observation, not certainty.": "لا يزال خطرًا محتملًا مرتفعًا، يحتاج تحققًا. الهوية غير مؤكدة؛ التمريرة الثانية تضيف رصدًا لا يقينًا.",
    "Verification required": "يحتاج تحققًا",
    "Unknown Object": "جسم غير معروف",
    "Unresolved object": "جسم غير محدد",
    "Detected object contains insufficient evidence for reliable classification.": "الجسم المرصود لا يحمل أدلة كافية لتصنيف موثوق.",
    "Additional inspection / multi-pass verification.": "فحص إضافي / تحقق بتمريرات متعددة.",
    "The perpendicular heading does not resolve the shape either.": "الاتجاه العمودي لا يحسم الشكل أيضًا.",
    "Still inconclusive": "لا يزال غير حاسم",
    "Remains Unknown — Requires Verification.": "يبقى غير معروف، يحتاج تحققًا.",

    /* reference images */
    "Reference imagery appears here when a target is detected. It is not a live feed from B01.": "تظهر هنا صورة مرجعية عند رصد هدف. وهي ليست بثًا مباشرًا من B01.",
    "Reference image: lionfish on a reef. Photograph supplied by the team.": "صورة مرجعية: سمكة أسد على شعاب مرجانية. الصورة مقدمة من الفريق.",
    "Reference image: synthetic aperture sonar image of an unknown shipwreck off of Nantucket. Image courtesy of ThayerMahan, Inc., Kraken Robotics, and the NOAA Office of Ocean Exploration and Research.": "صورة مرجعية: صورة سونار ذي فتحة تركيبية لحطام سفينة مجهول قبالة نانتوكيت. الصورة بإذن من ThayerMahan, Inc. وKraken Robotics ومكتب NOAA لاستكشاف المحيطات وأبحاثها.",
    "Reference image: wreck site on the seabed. Photograph supplied by the team. The marked object is a simulated target, not a photographed hazardous object.": "صورة مرجعية: موقع حطام على قاع البحر. الصورة مقدمة من الفريق. الجسم المُعلَّم هدف محاكى، وليس جسمًا خطِرًا مُصوَّرًا.",
    "Reference image: coral-covered metal structure. Photograph supplied by the team. The marked object is a simulated target.": "صورة مرجعية: هيكل معدني مغطى بالمرجان. الصورة مقدمة من الفريق. الجسم المُعلَّم هدف محاكى.",
    "Reference image": "صورة مرجعية",
    "Close-range view": "منظر قريب",
    "Pass B — reference image": "التمريرة B — صورة مرجعية",
    "All positions are simulated.": "جميع المواقع محاكاة.",

    /* phases, status, buttons */
    "Primary Sweep — Horizontal Pass A": "المسح الأساسي — التمريرة الأفقية A",
    "Transitioning to Orthogonal Pass": "الانتقال إلى التمريرة المتعامدة",
    "Crosshatch Sweep — Vertical Pass B": "المسح المتقاطع — التمريرة العمودية B",
    "Cross-Pass Verification": "التحقق بين التمريرتين",
    "Mission Complete": "اكتملت المهمة",
    "Ready": "جاهز",
    "Target detected — Pass A, line {0}": "رُصد هدف — التمريرة A، الخط {0}",
    "Analysing characteristics": "تحليل الخصائص",
    "Classifying": "التصنيف",
    "Risk assessment": "تقييم الخطورة",
    "Decision": "القرار",
    "Alert — target marked": "تنبيه — عُلِّم الهدف",
    "Cross-Pass Observation — {0}": "رصد بين التمريرتين — {0}",
    "Comparing evidence — {0}": "مقارنة الأدلة — {0}",
    "Verification required — {0}": "يحتاج تحققًا — {0}",
    "Decision unchanged — {0}": "القرار دون تغيير — {0}",
    "Cross-Pass Verification — {0} of {1} targets on both headings": "التحقق بين التمريرتين — {0} من {1} أهداف من الاتجاهين",
    "Mission complete": "اكتملت المهمة",
    "Pause": "إيقاف مؤقت",
    "Resume": "استئناف",
    "Full-screen demo": "العرض بملء الشاشة",
    "Exit full screen": "الخروج من ملء الشاشة",

    /* alert */
    "Mission complete — see the summary and target log": "اكتملت المهمة — راجع الملخص وسجل الأهداف",
    "Assessing {0} — alert pending": "تقييم {0} — التنبيه قيد الانتظار",
    "No active alerts": "لا توجد تنبيهات نشطة",
    "Alerts": "التنبيهات",
    "An alert is issued once the target's risk has been assessed.": "يصدر التنبيه بعد تقييم خطورة الهدف.",
    "All simulated alerts are recorded in the target log.": "جميع تنبيهات المحاكاة مسجلة في سجل الأهداف.",
    "Simulated alerts appear here when a target has been assessed.": "تظهر تنبيهات المحاكاة هنا بعد تقييم الهدف.",
    " — second observation (Pass B)": " — الرصد الثاني (التمريرة B)",
    "Target": "الهدف",
    "Risk": "الخطورة",
    "Risk type": "نوع الخطر",
    "Location (Sim.)": "الموقع (محاكاة)",
    "Recommended action": "الإجراء الموصى به",

    /* analysis trail */
    "Target detected": "رُصد هدف",
    "Detection time (demo clock)": "وقت الرصد (ساعة العرض)",
    "Detected by": "رُصد بواسطة",
    "Survey pass / line": "تمريرة / خط المسح",
    "Pass A (primary) — line {0}": "التمريرة A (الأساسية) — الخط {0}",
    "B01 heading (Sim.)": "اتجاه B01 (محاكاة)",
    "Position (Sim.)": "الموقع (محاكاة)",
    "Depth (Sim.)": "العمق (محاكاة)",
    "{0} m": "{0} م",
    "{0} m²": "{0} م²",
    "Distance from B01 (Sim.)": "المسافة من B01 (محاكاة)",
    "Bearing from B01 (Sim.)": "السمت من B01 (محاكاة)",
    "Detected characteristics": "الخصائص المرصودة",
    "Conceptual": "مفهومي",
    "Simulation evidence. The background comparison is a conceptual layer, not a trained model.": "أدلة محاكاة. المقارنة بالخلفية طبقة مفهومية، وليست نموذجًا مدرَّبًا.",
    "Classification": "التصنيف",
    "Identification": "التعرّف",
    "Object type": "نوع الجسم",
    "Simulation certainty": "يقين المحاكاة",
    "Rule applied: {0}": "القاعدة المطبقة: {0}",
    "Potential risk is a priority for the operator to review, not confirmed danger.": "الخطورة المحتملة أولوية ليراجعها المشغّل، وليست خطرًا مؤكدًا.",
    "Alert and marking": "التنبيه والتعليم",
    "Status": "الحالة",
    "Marked on the survey map and added to the target log. A second observation follows on Pass B.": "عُلِّم على خريطة المسح وأُضيف إلى سجل الأهداف. ويتبعه رصد ثانٍ في التمريرة B.",
    "Pass {0} — line {1}, heading {2}": "التمريرة {0} — الخط {1}، الاتجاه {2}",
    "{0}: first observation": "{0}: الرصد الأول",
    "{0}: second observation, perpendicular heading": "{0}: الرصد الثاني، باتجاه عمودي",
    "Evidence comparison": "مقارنة الأدلة",
    "Decision update": "تحديث القرار",
    "Same target, same position (Sim.)": "الهدف نفسه، الموقع نفسه (محاكاة)",
    "Pass B observation (Sim.)": "رصد التمريرة B (محاكاة)",
    "{0} m abeam, bearing {1}": "{0} م على الجانب، السمت {1}",
    "Aspect difference between headings": "فرق الزاوية بين الاتجاهين",
    "Conceptual multi-aspect consensus": "توافق مفهومي متعدد الزوايا",
    "Decision update:": "تحديث القرار:",
    "Cross-pass verification": "التحقق بين التمريرتين",
    "Multi-aspect observation means two survey headings, not every angle. A second pass does not guarantee a correct classification.": "الرصد متعدد الزوايا يعني اتجاهَي مسح، لا كل الزوايا. والتمريرة الثانية لا تضمن تصنيفًا صحيحًا.",
    "Pass A": "التمريرة A",
    "Pass B": "التمريرة B",
    "Δ heading": "فرق الاتجاه",
    "Result": "النتيجة",
    "Not observed on Pass B": "لم يُرصد في التمريرة B",
    "Cross-pass verification — summary": "التحقق بين التمريرتين — ملخص",
    "{0} of {1} targets observed on both survey headings.": "رُصد {0} من {1} أهداف من اتجاهَي المسح.",
    "Simulation. Consistent observations keep each decision; they do not confirm an identity. The potential hazardous object still requires verification and the unknown object remains unknown.": "محاكاة. الأرصاد المتسقة تُبقي كل قرار كما هو، ولا تؤكد الهوية. ولا يزال الجسم الخطِر المحتمل يحتاج تحققًا، ويبقى الجسم غير المعروف غير معروف.",
    "Targets detected": "الأهداف المرصودة",
    "Marine life": "حياة بحرية",
    "Shipwreck / man-made": "حطام / من صنع الإنسان",
    "Potential hazardous object": "جسم خطِر محتمل",
    "Requires verification": "يحتاج تحققًا",
    "Targets observed on both headings": "أهداف رُصدت من الاتجاهين",
    "{0} of {1}": "{0} من {1}",
    "Route run (Sim.)": "المسار المقطوع (محاكاة)",
    "{0} m of {1} m": "{0} م من {1} م",
    "Pass A / transition / Pass B (Sim.)": "التمريرة A / الانتقال / التمريرة B (محاكاة)",
    "{0} / {1} / {2} m": "{0} / {1} / {2} م",
    "Unique area coverage (Sim.)": "تغطية المساحة الفريدة (محاكاة)",
    "{0}% of {1} m²": "{0}% من {1} م²",
    "Area seen on both headings (Sim.)": "المساحة المرصودة من الاتجاهين (محاكاة)",
    "Demo time": "زمن العرض",
    "Every target has been logged with a risk assessment, a decision and a recommended action, and observed a second time from a perpendicular heading. ": "سُجّل كل هدف مع تقييم للخطورة وقرار وإجراء موصى به، ورُصد مرة ثانية من اتجاه عمودي. ",
    "One target still needs verification.": "لا يزال هدف واحد بحاجة إلى تحقق.",
    "{0} targets still need verification.": "لا يزال {0} من الأهداف بحاجة إلى تحقق.",
    "Simulated demonstration values, not field results.": "قيم عرض محاكاة، وليست نتائج ميدانية.",
    "Start the mission to begin the survey.": "ابدأ المهمة لبدء المسح.",
    "Transition leg to the start of the perpendicular pass…": "مقطع الانتقال إلى بداية التمريرة العمودية…",
    "Pass B — running the perpendicular lines; each target will be observed again…": "التمريرة B — تنفيذ الخطوط العمودية؛ وسيُرصد كل هدف مرة أخرى…",
    "Pass A — scanning the horizontal survey lines for targets…": "التمريرة A — مسح الخطوط الأفقية بحثًا عن أهداف…",

    /* survey information, log and results */
    "Survey area": "منطقة المسح",
    "{0} m × {1} m = {2} m²": "{0} م × {1} م = {2} م²",
    "Pass A — primary, horizontal": "التمريرة A — أساسية، أفقية",
    "{0} lines at y = {1} m, spacing {2} m": "{0} خطوط عند y = {1} م، بتباعد {2} م",
    "Pass B — orthogonal, vertical": "التمريرة B — متعامدة، عمودية",
    "{0} lines at x = {1} m, spacing {2} m": "{0} خطوط عند x = {1} م، بتباعد {2} م",
    "Estimated sensor swath": "عرض المسح التقديري للمستشعر",
    "{0} m — simulation parameter": "{0} م — مُعامل محاكاة",
    "Pass A distance": "مسافة التمريرة A",
    "{0} m ({1} m legs + {2} m turns)": "{0} م ({1} م مقاطع + {2} م انعطافات)",
    "Transition leg": "مقطع الانتقال",
    "Pass B distance": "مسافة التمريرة B",
    "Planned route": "المسار المخطط",
    "{0} m = Pass A + transition + Pass B": "{0} م = التمريرة A + الانتقال + التمريرة B",
    "Same lines, straight connectors": "الخطوط نفسها بوصلات مستقيمة",
    "{0} + {1} = {2} m, without transition — reference": "{0} + {1} = {2} م، دون مقطع الانتقال — للمرجع",
    "Targets appear here as they are marked.": "تظهر الأهداف هنا عند تعليمها.",
    "Comparing…": "مقارنة…",
    "Pending — Pass B": "بانتظار التمريرة B",
    "{0} m² ({1} m × {2} m)": "{0} م² ({1} م × {2} م)",
    "Survey pattern": "نمط المسح",
    "Two-pass cross-hatch grid: {0} + {1} lines, {2} m apart": "شبكة متقاطعة بتمريرتين: {0} + {1} خطًا، بتباعد {2} م",
    "Unique area coverage": "تغطية المساحة الفريدة",
    "{0}% ({1} m²)": "{0}% ({1} م²)",
    "Area seen on both headings": "المساحة المرصودة من الاتجاهين",
    "{0} ({1} marine life, {2} shipwreck, {3} potential hazardous object, {4} unknown)": "{0} ({1} حياة بحرية، {2} حطام سفينة، {3} جسم خطِر محتمل، {4} غير معروف)",
    "Observed on both survey headings": "رُصدت من اتجاهَي المسح"
  };

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
      risk: "Likely Non-Hazardous", level: "safe", riskType: "Biological / Marine Life",
      certainty: "High — all defining features detected"
    },
    {
      test: function (e) { return e.rigid === "Detected" && e.nonbio === "Detected" && e.size === "Large"; },
      text: "Rigid, non-biological and large → man-made structure.",
      classification: "Man-Made Structure", group: "structure",
      risk: "Potential Hazard — Requires Verification", level: "hazard", riskType: "Navigation / Obstruction Risk",
      certainty: "High — all defining features detected"
    },
    {
      test: function (e) { return e.rigid === "Detected" && e.nonbio === "Detected" && e.size === "Compact"; },
      text: "Rigid, non-biological and compact → potential hazardous object. The identity cannot be confirmed.",
      classification: "Potential Hazardous Object", group: "mine",
      risk: "High Potential Hazard — Requires Verification", level: "high", riskType: "Potential Explosive Hazard",
      certainty: "Moderate — identity not confirmed"
    },
    {
      test: function () { return true; },
      text: "No rule is met with enough evidence → Unknown. The system does not force a class.",
      classification: "Unknown", group: "unknown",
      risk: "Unknown — Requires Verification", level: "unknown", riskType: "Unknown Risk",
      certainty: "Low — insufficient evidence"
    }
  ];

  var ALERTS = {
    safe: "STATUS — Likely Non-Hazardous",
    hazard: "ALERT — Potential Hazard — Requires Verification",
    high: "ALERT — High Potential Hazard — Requires Verification",
    unknown: "NOTICE — Unknown — Requires Verification"
  };

  /* Target content. Positions come from the survey area (plan-view x, y);
     box = [left, top, width, height] of the frame in the reference image, in %.
     xpass = what the second, perpendicular observation shows. It never
     resolves an identity the first pass could not confirm. */
  var TARGETS = [
    {
      key: "fish", name: "Lionfish (demo example)", logName: "Lionfish", objectType: "Fish", depth: 9,
      source: "Water-Column Acoustic Data", scene: "fish", box: [31, 5, 60, 80],
      evidence: { bio: "Detected", motion: "Detected", rigid: "Not detected", nonbio: "Not detected", size: "Small", background: "Detected" },
      decision: "Continue Survey / Log Observation", logDecision: "Log Observation",
      explanation: "Biological morphology and expected marine-life characteristics detected.",
      action: "Continue the survey and log the observation.", status: "Logged",
      xpass: {
        compare: "The perpendicular heading also shows biological morphology and movement.",
        consensus: "Consistent across two orthogonal passes",
        update: "No change: Marine Life — Likely Non-Hazardous. Continue survey / log observation.",
        status: "Logged — observed on both headings"
      }
    },
    {
      key: "wreck", name: "Shipwreck", objectType: "Large structure on the seafloor", depth: 26,
      source: "Multibeam + Side-Scan Sonar", scene: "wreck", box: [18, 18, 60, 48],
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Detected", nonbio: "Detected", size: "Large", background: "Detected" },
      decision: "Requires Inspection",
      explanation: "Large rigid structure with non-biological geometric characteristics detected on or near the seafloor.",
      action: "Mark the position and schedule an inspection.", status: "Marked for inspection",
      xpass: {
        compare: "The perpendicular heading also shows a large, rigid, non-biological structure.",
        consensus: "Consistent across two orthogonal passes",
        update: "No change: Man-Made Structure — Potential Hazard — Requires Verification. Decision: Requires Inspection. A second heading adds an observation; it does not identify the wreck.",
        status: "Marked for inspection — observed on both headings"
      }
    },
    {
      key: "mine", name: "Potential Hazardous Object", objectType: "Compact object on the seafloor", depth: 21,
      source: "Multibeam + Side-Scan Sonar", scene: "mine", box: [89, 53, 10.5, 11.5],
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Detected", nonbio: "Detected", size: "Compact", background: "Detected" },
      decision: "Requires Verification",
      explanation: "Detected characteristics are consistent with a potential hazardous man-made object, but the simulation cannot confirm the object's identity.",
      action: "Do not treat as confirmed. Request further inspection / verification.", status: "Awaiting verification",
      xpass: {
        compare: "Both headings show a compact, rigid, non-biological return.",
        consensus: "Consistent across two orthogonal passes — identity not confirmed",
        update: "Still High Potential Hazard — Requires Verification. The identity is not confirmed; the second pass adds an observation, not certainty.",
        status: "Verification required"
      }
    },
    {
      key: "unknown", name: "Unknown Object", objectType: "Unresolved object", depth: 28,
      source: "Multibeam + Side-Scan Sonar", scene: "unknown", box: [13, 33, 72, 24],
      evidence: { bio: "Not detected", motion: "Not detected", rigid: "Inconclusive", nonbio: "Inconclusive", size: "Medium", background: "Detected" },
      decision: "Requires Verification",
      explanation: "Detected object contains insufficient evidence for reliable classification.",
      action: "Additional inspection / multi-pass verification.", status: "Awaiting verification",
      xpass: {
        compare: "The perpendicular heading does not resolve the shape either.",
        consensus: "Still inconclusive",
        update: "Remains Unknown — Requires Verification.",
        status: "Unknown — Requires Verification"
      }
    }
  ];

  var SCENE_CREDITS = {
    idle: "Reference imagery appears here when a target is detected. It is not a live feed from B01.",
    fish: "Reference image: lionfish on a reef. Photograph supplied by the team.",
    wreck: "Reference image: synthetic aperture sonar image of an unknown shipwreck off of Nantucket. Image courtesy of ThayerMahan, Inc., Kraken Robotics, and the NOAA Office of Ocean Exploration and Research.",
    mine: "Reference image: wreck site on the seabed. Photograph supplied by the team. The marked object is a simulated target, not a photographed hazardous object.",
    unknown: "Reference image: coral-covered metal structure. Photograph supplied by the team. The marked object is a simulated target."
  };

  function evaluate(evidence) {
    for (var i = 0; i < RULES.length; i++) if (RULES[i].test(evidence)) return RULES[i];
    return RULES[RULES.length - 1];
  }

  function spec(key) { return TARGETS.filter(function (tg) { return tg.key === key; })[0]; }

  /* ================= 3. Views ================= */

  var el = {
    status: $("demo-status"),
    statusLabel: $("demo-status-label"),
    start: $("demo-start"),
    pause: $("demo-pause"),
    reset: $("demo-reset"),
    full: $("demo-full"),
    mapNote: $("demo-map-note"),
    phases: Array.prototype.slice.call($("demo-phases").children),
    stages: Array.prototype.slice.call($("demo-stages").children),
    alert: $("demo-alert"),
    alertTitle: $("demo-alert-title"),
    alertBody: $("demo-alert-body"),
    clipRect: $("demo-clip-rect"),
    bounds: $("demo-bounds"),
    coverA: $("demo-cover-a"),
    coverB: $("demo-cover-b"),
    planA: $("demo-plan-a"),
    planB: $("demo-plan-b"),
    planT: $("demo-plan-t"),
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
    covPct: $("cov-pct"),
    covPctB: $("cov-pct-b"),
    covRemain: $("cov-remaining"),
    covXpass: $("cov-xpass"),
    covBar: $("cov-bar"),
    covA: $("cov-a"),
    covABar: $("cov-a-bar"),
    covB: $("cov-b"),
    covBBar: $("cov-b-bar"),
    covBoth: $("cov-both"),
    covBothBar: $("cov-both-bar"),
    logBody: $("log-body"),
    count: $("demo-count"),
    time: $("demo-time"),
    timeline: $("demo-timeline"),
    timelineFill: $("demo-timeline-fill"),
    cardMap: $("card-map"),
    cardLog: $("card-log")
  };

  /* ---- survey map (plan view: x east, y north) ---- */

  var MAP = { w: 560, h: 400, left: 82, right: 8, top: 8, bottom: 34 };
  var proj = { s: 1, ox: 0, oy: 0, pad: 0 };

  function project() {
    var pad = Math.max(route.A.spacing, route.B.spacing) / 2 + 6;   // room for the end turns
    var iw = MAP.w - MAP.left - MAP.right, ih = MAP.h - MAP.top - MAP.bottom;
    var s = Math.min(iw / (sc.width + 2 * pad), ih / (sc.height + 2 * pad));
    proj = {
      s: s, pad: pad,
      ox: MAP.left + (iw - (sc.width + 2 * pad) * s) / 2 + pad * s,
      oy: MAP.top + (ih - (sc.height + 2 * pad) * s) / 2 + pad * s
    };
  }
  function px(x) { return proj.ox + x * proj.s; }
  function py(y) { return proj.oy + (sc.height - y) * proj.s; }
  function pt(x, y) { return px(x).toFixed(1) + "," + py(y).toFixed(1); }
  function pathOf(segs) {
    return segs.map(function (s, i) {
      return s.points.map(function (p, k) { return (i === 0 && k === 0 ? "M" : "L") + pt(p[0], p[1]); }).join(" ");
    }).join(" ");
  }
  function setRect(node, x, y, w, h) {
    node.setAttribute("x", px(x).toFixed(1));
    node.setAttribute("y", py(y + h).toFixed(1));
    node.setAttribute("width", Math.max(0, w * proj.s).toFixed(1));
    node.setAttribute("height", Math.max(0, h * proj.s).toFixed(1));
  }

  function drawMap() {
    project();
    var W = sc.width, H = sc.height;
    setRect(el.bounds, 0, 0, W, H);
    setRect(el.clipRect, 0, 0, W, H);

    var bySeg = function (pass) { return route.segments.filter(function (s) { return s.pass === pass; }); };
    el.planA.setAttribute("d", pathOf(bySeg("A")));
    el.planB.setAttribute("d", pathOf(bySeg("B")));
    el.planT.setAttribute("d", pathOf(bySeg("T")));

    /* one swath rectangle per survey leg, grown as the leg is run */
    [["A", el.coverA], ["B", el.coverB]].forEach(function (p) {
      p[1].innerHTML = route.segments.filter(function (s) { return s.pass === p[0] && s.type === "survey"; })
        .map(function () { return '<rect x="0" y="0" width="0" height="0"/>'; }).join("");
    });

    var ticks = "", tx = px(-proj.pad), ty = py(-proj.pad);
    [0, H / 2, H].forEach(function (y) {
      var ll = toLatLon(0, y);
      ticks += '<line x1="' + (tx - 5).toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + py(y).toFixed(1) + '" y2="' + py(y).toFixed(1) + '"/>' +
        '<text x="' + (tx - 9).toFixed(1) + '" y="' + (py(y) + 3.5).toFixed(1) + '" text-anchor="end">' + ll[0].toFixed(4) + "° N</text>";
    });
    [0, W / 2, W].forEach(function (x, i) {
      var ll = toLatLon(x, 0);
      ticks += '<line x1="' + px(x).toFixed(1) + '" x2="' + px(x).toFixed(1) + '" y1="' + ty.toFixed(1) + '" y2="' + (ty + 5).toFixed(1) + '"/>' +
        '<text x="' + px(x).toFixed(1) + '" y="' + (ty + 17).toFixed(1) + '" text-anchor="' + (i === 2 ? "end" : i === 0 ? "start" : "middle") + '">' + ll[1].toFixed(4) + "° E</text>";
    });
    var bar = 100 * proj.s, bx = px(W + proj.pad) - bar, by = ty + 28;
    ticks += '<line class="scale" x1="' + bx.toFixed(1) + '" x2="' + (bx + bar).toFixed(1) + '" y1="' + by.toFixed(1) + '" y2="' + by.toFixed(1) + '"/>' +
      '<text x="' + (bx - 6).toFixed(1) + '" y="' + (by + 3.5).toFixed(1) + '" text-anchor="end">100 m</text>';
    el.ticks.innerHTML = ticks;
  }

  function renderTrack() {
    var d = state.d, p = Survey.positionAt(route, d);

    [["A", el.coverA], ["B", el.coverB]].forEach(function (pair) {
      var rects = pair[1].children, r = 0, half = CONFIG.swath / 2;
      route.segments.forEach(function (s) {
        if (s.pass !== pair[0] || s.type !== "survey") return;
        var f = Math.max(0, Math.min(1, (d - s.d0) / s.length)), rect = rects[r++];
        if (s.axis === "x") {
          var xa = Math.min(s.x0, s.x0 + (s.x1 - s.x0) * f);
          setRect(rect, xa, s.y0 - half, Math.abs(s.x1 - s.x0) * f, 2 * half);
        } else {
          var ya = Math.min(s.y0, s.y0 + (s.y1 - s.y0) * f);
          setRect(rect, s.x0 - half, ya, 2 * half, Math.abs(s.y1 - s.y0) * f);
        }
      });
    });

    el.track.setAttribute("points", Survey.pointsBetween(route, 0, d).map(function (q) { return pt(q[0], q[1]); }).join(" "));
    var done = state.status === "complete" || state.status === "review" || d >= route.lengths.total;
    el.current.setAttribute("points", done ? "" : Survey.pointsBetween(route, d, p.segment.d1).map(function (q) { return pt(q[0], q[1]); }).join(" "));
    el.auv.setAttribute("transform", "translate(" + pt(p.x, p.y) + ") rotate(" + p.heading.toFixed(1) + ")");
  }

  var MARKER_SHAPES = {
    safe: '<circle r="6.5" fill="#34b27a" stroke="#071a26" stroke-width="1.5"/>',
    hazard: '<rect x="-6.5" y="-6.5" width="13" height="13" fill="#c49837" stroke="#071a26" stroke-width="1.5"/>',
    high: '<circle class="ring" r="14" fill="none" stroke="#ef6b5b" stroke-width="1.5" stroke-dasharray="3 3"/><rect x="-6.5" y="-6.5" width="13" height="13" transform="rotate(45)" fill="#ef6b5b" stroke="#071a26" stroke-width="1.5"/>',
    unknown: '<circle r="7.5" fill="#a9b6c2" stroke="#071a26" stroke-width="1.5"/><text y="3.8" text-anchor="middle" font-family="Archivo, sans-serif" font-size="10" font-weight="800" fill="#071a26">?</text>'
  };

  /* One marker per target. The second observation reuses it (adds a ring). */
  function addMarker(t) {
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "marker is-active");
    g.setAttribute("data-target", t.key);
    g.setAttribute("transform", "translate(" + pt(t.x, t.y) + ")");
    g.innerHTML = '<circle class="halo" r="17" fill="none" stroke="#ffffff" stroke-width="2"/>' +
      '<circle class="xring" r="10.5" fill="none" stroke="#e7c76a" stroke-width="1.6"/>' + MARKER_SHAPES[t.level] +
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

  /* ---- survey phase, status, stages ---- */

  var PHASES = ["A", "T", "B", "review", "complete"];
  var PHASE_LABELS = {
    A: "Primary Sweep — Horizontal Pass A",
    T: "Transitioning to Orthogonal Pass",
    B: "Crosshatch Sweep — Vertical Pass B",
    review: "Cross-Pass Verification",
    complete: "Mission Complete"
  };

  function currentPhase() {
    if (state.status === "complete") return "complete";
    if (state.status === "review") return "review";
    if (state.status === "ready") return null;
    return Survey.positionAt(route, state.d).pass;
  }

  function renderPhase() {
    var ph = currentPhase(), at = PHASES.indexOf(ph);
    el.phases.forEach(function (li, i) {
      li.classList.toggle("is-active", i === at && ph !== "complete");
      li.classList.toggle("is-done", at >= 0 && (i < at || ph === "complete"));
    });
    if (state.status === "scanning" && ph) setStatus(PHASE_LABELS[ph], "active");
  }

  var STAGES = ["scanning", "detection", "analysis", "classification", "risk", "decision", "alert", "verification"];

  /* label: English text, or a function that writes it (kept for a language change) */
  function setStatus(label, mode) {
    state.statusLabel = label;
    state.statusMode = mode;
    label = typeof label === "function" ? label() : tx(label);
    if (el.statusLabel.textContent !== label) el.statusLabel.textContent = label;
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

  var sceneNow = "idle", chipNow = "Reference image";

  function showScene(name) {
    sceneNow = name;
    el.scenes.forEach(function (s) { s.classList.toggle("is-visible", s.getAttribute("data-scene") === name); });
    el.credit.textContent = tx(SCENE_CREDITS[name]);
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
    el.box.setAttribute("data-level", classified && (state.blocks >= 4 || state.status === "verifying") ? t.level : "");
    el.boxLabel.textContent = tx(t.name);
  }

  function setCloseup(on, t, label) {
    if (on && t) {
      el.stage.style.transformOrigin = (t.box[0] + t.box[2] / 2) + "% " + (t.box[1] + t.box[3] / 2) + "%";
      chipNow = label || "Close-range view";
      el.chip.textContent = tx(chipNow);
    } else {
      chipNow = "Reference image";
      el.chip.textContent = tx(chipNow);
    }
    el.stage.classList.toggle("is-closeup", !!on);
  }

  /* ---- alert ---- */

  function renderAlert() {
    var t = state.alert;
    if (!t) {
      var assessing = state.current && state.status === "detected";
      el.alert.setAttribute("data-kind", "idle");
      el.alertTitle.textContent = state.status === "complete" ? tx("Mission complete — see the summary and target log")
        : assessing ? tf("Assessing {0} — alert pending", tid(state.current)) : tx("No active alerts");
      el.alertBody.innerHTML = '<div class="demo-alert__idle"><dt class="sr-only">' + tx("Alerts") + '</dt><dd>' +
        tx(assessing ? "An alert is issued once the target's risk has been assessed."
          : state.status === "complete" ? "All simulated alerts are recorded in the target log."
          : "Simulated alerts appear here when a target has been assessed.") + "</dd></div>";
      return;
    }
    el.alert.setAttribute("data-kind", t.level);
    el.alertTitle.textContent = tx(ALERTS[t.level]) + (state.status === "verifying" ? tx(" — second observation (Pass B)") : "");
    el.alertBody.innerHTML = [
      ["Target", tid(t)],
      ["Risk", tx(t.risk)],
      ["Risk type", tx(t.riskType)],
      ["Location (Sim.)", fmtLat(t.latlon[0]) + (isAr() ? "، " : ", ") + fmtLon(t.latlon[1])],
      ["Recommended action", tx(t.action)]
    ].map(function (r) { return "<div><dt>" + tx(r[0]) + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
  }

  /* ---- analysis panel: a decision trail that builds up as the mission runs ---- */

  var BLOCK_ORDER = ["detect", "evidence", "classify", "risk", "decide", "mark", "verify"];

  function section(title, body, cls) {
    return '<section class="trail__block ' + cls + '"><h4>' + tx(title) + "</h4>" + body + "</section>";
  }

  function kv(rows) {
    return '<dl class="kv">' + rows.map(function (r) { return "<div><dt>" + tx(r[0]) + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + "</dl>";
  }

  var EVIDENCE_STATE = { "Detected": "yes", "Not detected": "no", "Inconclusive": "maybe" };

  function obsLine(o) { return tf("Pass {0} — line {1}, heading {2}", o.pass, o.lineId, fmtDeg(o.auvHeadingDeg)); }

  function blockHtml(key, t, cls) {
    var o = t.obs[0];
    if (key === "detect") {
      return section("Target detected", '<p class="trail__id">' + tid(t) + "</p>" + kv([
        ["Detection time (demo clock)", o.time],
        ["Detected by", tx(t.source)],
        ["Survey pass / line", tf("Pass A (primary) — line {0}", o.lineId)],
        ["B01 heading (Sim.)", fmtDeg(o.auvHeadingDeg)],
        ["Position (Sim.)", fmtLat(t.latlon[0]) + "<br>" + fmtLon(t.latlon[1])],
        ["Depth (Sim.)", tf("{0} m", t.depth)],
        ["Distance from B01 (Sim.)", tf("{0} m", Math.round(o.distanceToTargetM))],
        ["Bearing from B01 (Sim.)", fmtDeg(o.bearingToTargetDeg)]
      ]), cls);
    }
    if (key === "evidence") {
      var rows = EVIDENCE.map(function (e) {
        var v = t.evidence[e[0]];
        var state_ = EVIDENCE_STATE[v] || "info";
        var label = e[0] === "background" ? tx(e[1]) + ' <span class="tag tag--concept">' + tx("Conceptual") + '</span>' : tx(e[1]);
        return '<li><span>' + label + '</span><span class="ev ev--' + state_ + '">' + tx(v) + "</span></li>";
      }).join("");
      return section("Detected characteristics", '<ul class="evidence">' + rows + '</ul><p class="trail__meta">' + tx("Simulation evidence. The background comparison is a conceptual layer, not a trained model.") + '</p>', cls);
    }
    if (key === "classify") {
      return section("Classification", kv([
        ["Identification", tx(t.name)],
        ["Classification", "<strong>" + tx(t.classification) + "</strong>"],
        ["Object type", tx(t.objectType)],
        ["Simulation certainty", tx(t.certainty)]
      ]) + '<p class="trail__meta">' + tf("Rule applied: {0}", tx(t.ruleText)) + "</p>", cls);
    }
    if (key === "risk") {
      return section("Risk assessment", '<p class="trail__decision"><span class="risk risk--' + t.level + '">' + tx(t.risk) + "</span></p>" +
        kv([["Risk type", tx(t.riskType)]]) +
        '<p class="trail__meta">' + tx("Potential risk is a priority for the operator to review, not confirmed danger.") + '</p>', cls);
    }
    if (key === "decide") {
      return section("Decision", '<p class="trail__decision"><span class="chip chip--' + t.level + '">' + tx(t.decision) + "</span></p>" +
        '<p class="trail__text">' + tx(t.explanation) + "</p>" + kv([["Recommended action", tx(t.action)]]), cls);
    }
    if (key === "mark") {
      return section("Alert and marking", '<p class="trail__text"><strong>' + tx(ALERTS[t.level]) + "</strong></p>" +
        kv([["Status", tx(t.statusNow)]]) + '<p class="trail__meta">' + tx("Marked on the survey map and added to the target log. A second observation follows on Pass B.") + '</p>', cls);
    }
    var b = t.obs[1] || t.plannedB, x = t.xpass;
    var steps = [
      [tf("{0}: first observation", obsLine(o)), 0],
      [tf("{0}: second observation, perpendicular heading", obsLine(b)), 1],
      [tx("Evidence comparison"), 2],
      [tx("Decision update"), 3]
    ].map(function (s) {
      var c = s[1] < state.verifyStep ? "is-done" : s[1] === state.verifyStep ? "is-active" : "";
      return '<li class="' + c + '">' + s[0] + "</li>";
    }).join("");
    var results = "";
    if (state.verifyStep >= 1) {
      results += kv([
        ["Same target, same position (Sim.)", tid(t) + " — " + fmtLat(t.latlon[0]) + (isAr() ? "، " : ", ") + fmtLon(t.latlon[1])],
        ["Pass B observation (Sim.)", tf("{0} m abeam, bearing {1}", Math.round(b.distanceToTargetM), fmtDeg(b.bearingToTargetDeg))],
        ["Aspect difference between headings", ltr(Math.round(Survey.aspectDifference(o.auvHeadingDeg, b.auvHeadingDeg)) + "°")]
      ]);
    }
    if (state.verifyStep >= 2) results += '<p class="trail__text">' + tx(x.compare) + "</p>" + kv([["Conceptual multi-aspect consensus", tx(x.consensus)]]);
    if (state.verifyStep >= 3) results += '<p class="trail__text"><strong>' + tx("Decision update:") + '</strong> ' + tx(x.update) + "</p>";
    return section(tx("Cross-pass verification") + ' <span class="tag tag--concept">' + tx("Conceptual") + '</span>', '<ol class="inspect-steps">' + steps + "</ol>" + results +
      '<p class="trail__meta">' + tx("Multi-aspect observation means two survey headings, not every angle. A second pass does not guarantee a correct classification.") + '</p>', cls);
  }

  function crossTable() {
    return '<table class="xtable"><thead><tr><th>' + ["Target", "Pass A", "Pass B", "Δ heading", "Result"].map(tx).join("</th><th>") + '</th></tr></thead><tbody>' +
      state.marked.map(function (t) {
        var a = t.obs[0], b = t.obs[1];
        return "<tr><td>" + t.id.replace("Target ", "") + " " + tx(t.logName || t.name) + "</td>" +
          "<td>" + ltr(a.lineId + " · " + fmtDeg(a.auvHeadingDeg)) + "</td>" +
          "<td>" + (b ? ltr(b.lineId + " · " + fmtDeg(b.auvHeadingDeg)) : "—") + "</td>" +
          "<td>" + (b ? ltr(Math.round(Survey.aspectDifference(a.auvHeadingDeg, b.auvHeadingDeg)) + "°") : "—") + "</td>" +
          "<td>" + tx(t.verified ? t.xpass.consensus : "Not observed on Pass B") + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function crossCount() { return state.marked.filter(function (t) { return t.verified; }).length; }

  function reviewHtml() {
    return '<section class="trail__block is-current is-new"><h4>' + tx("Cross-pass verification — summary") + '</h4>' +
      '<p class="trail__text">' + tf("{0} of {1} targets observed on both survey headings.", crossCount(), state.marked.length) + "</p>" + crossTable() +
      '<p class="trail__meta">' + tx("Simulation. Consistent observations keep each decision; they do not confirm an identity. The potential hazardous object still requires verification and the unknown object remains unknown.") + '</p></section>';
  }

  function summaryHtml() {
    var m = state.marked;
    var count = function (fn) { return m.filter(fn).length; };
    var byGroup = function (g) { return function (t) { return t.group === g; }; };
    var cov = grid.stats(), L = route.lengths;
    var pending = count(function (t) { return t.decision === "Requires Verification"; });
    var tiles = [
      ["Targets detected", m.length],
      ["Marine life", count(byGroup("life"))],
      ["Shipwreck / man-made", count(byGroup("structure"))],
      ["Potential hazardous object", count(byGroup("mine"))],
      ["Unknown", count(byGroup("unknown"))],
      ["Requires verification", pending]
    ].map(function (s) { return "<div><strong>" + s[1] + "</strong><span>" + tx(s[0]) + "</span></div>"; }).join("");
    return '<div class="summary trail__block is-new"><h4>' + tx("Mission complete") + '</h4><div class="summary__grid">' + tiles + "</div>" +
      kv([
        ["Targets observed on both headings", tf("{0} of {1}", crossCount(), m.length)],
        ["Route run (Sim.)", tf("{0} m of {1} m", fmtNum(state.d), fmtNum(L.total))],
        ["Pass A / transition / Pass B (Sim.)", tf("{0} / {1} / {2} m", fmtNum(L.A), fmtNum(L.T), fmtNum(L.B))],
        ["Unique area coverage (Sim.)", tf("{0}% of {1} m²", cov.uniquePct.toFixed(1), fmtNum(grid.total))],
        ["Area seen on both headings (Sim.)", cov.bothPct.toFixed(1) + "%"],
        ["Demo time", formatTime(state.ms)]
      ]) + crossTable() +
      '<p class="trail__text">' + tx("Every target has been logged with a risk assessment, a decision and a recommended action, and observed a second time from a perpendicular heading. ") +
      (pending === 1 ? tx("One target still needs verification.") : tf("{0} targets still need verification.", pending)) + "</p>" +
      '<p class="trail__meta">' + tx("Simulated demonstration values, not field results.") + '</p></div>';
  }

  function renderAnalysis() {
    var t = state.current;
    if (state.status === "complete") { el.analysis.innerHTML = summaryHtml(); return; }
    if (state.status === "review") { el.analysis.innerHTML = reviewHtml(); return; }
    if (!t) {
      var ph = currentPhase();
      var message = state.status !== "scanning" ? "Start the mission to begin the survey."
        : ph === "T" ? "Transition leg to the start of the perpendicular pass…"
        : ph === "B" ? "Pass B — running the perpendicular lines; each target will be observed again…"
        : "Pass A — scanning the horizontal survey lines for targets…";
      el.analysis.innerHTML = '<div class="analysis__empty"><p>' + tx(message) + "</p></div>";
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
    var L = route.lengths, A = route.A, B = route.B;
    el.covInfo.innerHTML = [
      ["Survey area", tf("{0} m × {1} m = {2} m²", fmtNum(sc.width), fmtNum(sc.height), fmtNum(sc.width * sc.height))],
      ["Pass A — primary, horizontal", tf("{0} lines at y = {1} m, spacing {2} m", A.count, ltr(list(A.positions)), fmtNum(A.spacing))],
      ["Pass B — orthogonal, vertical", tf("{0} lines at x = {1} m, spacing {2} m", B.count, ltr(list(B.positions)), fmtNum(B.spacing))],
      ["Estimated sensor swath", tf("{0} m — simulation parameter", CONFIG.swath)],
      ["Pass A distance", tf("{0} m ({1} m legs + {2} m turns)", fmtNum(L.A), fmtNum(L.legsA), fmtNum(L.turnsA))],
      ["Transition leg", tf("{0} m", fmtNum(L.T))],
      ["Pass B distance", tf("{0} m ({1} m legs + {2} m turns)", fmtNum(L.B), fmtNum(L.legsB), fmtNum(L.turnsB))],
      ["Planned route", tf("{0} m = Pass A + transition + Pass B", fmtNum(L.total))],
      ["Same lines, straight connectors", tf("{0} + {1} = {2} m, without transition — reference", fmtNum(L.straightA), fmtNum(L.straightB), fmtNum(L.straightA + L.straightB))]
    ].map(function (r) { return "<div><dt>" + tx(r[0]) + "</dt><dd>" + r[1] + "</dd></div>"; }).join("");
    el.mapNote.textContent = tx(sc.note);
  }

  function pct(f) { return (f * 100).toFixed(1) + "%"; }

  function renderCoverage() {
    if (state.d > state.dCovered) {
      grid.markRoute(route, state.dCovered, state.d);
      state.dCovered = state.d;
    }
    var c = grid.stats();
    var pa = Survey.passProgress(route, "A", state.d), pb = Survey.passProgress(route, "B", state.d);
    el.covDistance.textContent = tf("{0} m", fmtNum(state.d));
    el.covPct.textContent = c.uniquePct.toFixed(1) + "%";
    el.covPctB.textContent = c.uniquePct.toFixed(1) + "%";
    el.covBar.style.width = c.uniquePct.toFixed(2) + "%";
    el.covRemain.textContent = tf("{0} m²", fmtNum(c.remainingArea));
    el.covA.textContent = pct(pa);
    el.covABar.style.width = (pa * 100).toFixed(2) + "%";
    el.covB.textContent = pct(pb);
    el.covBBar.style.width = (pb * 100).toFixed(2) + "%";
    el.covBoth.textContent = c.bothPct.toFixed(1) + "%";
    el.covBothBar.style.width = c.bothPct.toFixed(2) + "%";
    el.covXpass.textContent = crossCount() + " / " + TARGETS.length;
  }

  /* ---- target log + detection timeline ---- */

  function renderLog() {
    el.count.textContent = state.marked.length;
    if (!state.marked.length) {
      el.logBody.innerHTML = '<tr class="is-empty"><td colspan="11">' + tx("Targets appear here as they are marked.") + '</td></tr>';
      return;
    }
    el.logBody.innerHTML = state.marked.map(function (t) {
      var a = t.obs[0], b = t.obs[1];
      var obs = '<span class="obs">' + ltr(a.lineId + " · " + fmtDeg(a.auvHeadingDeg) + " · " + a.time) + "</span>" +
        (b ? '<span class="obs">' + ltr(b.lineId + " · " + fmtDeg(b.auvHeadingDeg) + " · " + b.time) + "</span>" : "");
      var xp = t.verified
        ? ltr("Δ " + Math.round(Survey.aspectDifference(a.auvHeadingDeg, b.auvHeadingDeg)) + "°") + " — " + tx(t.xpass.consensus) + '<span class="xp">' + tx(t.statusNow) + "</span>"
        : '<span class="xp">' + tx(b ? "Comparing…" : "Pending — Pass B") + "</span>";
      return '<tr class="' + (t.key === state.flashKey ? "is-new" : "") + '" data-target="' + t.key + '">' +
        "<td>" + t.id.replace("Target ", "") + "</td>" +
        "<td>" + a.time + "</td>" +
        "<td>" + tx(t.logName || t.name) + "</td>" +
        "<td>" + tx(t.classification) + "</td>" +
        '<td><span class="risk risk--' + t.level + ' risk--small">' + tx(t.risk) + "</span></td>" +
        '<td class="' + (t.level === "safe" ? "" : "is-alert") + '">' + tx(t.logDecision || t.decision) + "</td>" +
        "<td>" + tx(t.source) + "</td>" +
        "<td>" + obs + "</td>" +
        "<td>" + xp + "</td>" +
        "<td>" + fmtLat(t.latlon[0]) + "<br>" + fmtLon(t.latlon[1]) + "</td>" +
        "<td>" + tf("{0} m", t.depth) + "</td></tr>";
    }).join("");
  }

  function addTimelineMark(t, second) {
    var mark = document.createElement("span");
    mark.className = "timeline__mark timeline__mark--" + t.level + (second ? " timeline__mark--b" : "");
    mark.style.left = ((state.ms / plan.total) * 100).toFixed(2) + "%";
    mark.setAttribute("data-mark", t.key + (second ? "-B" : "-A"));
    mark.innerHTML = t.id.replace("Target ", "") + (second ? "·B" : "") + '<span class="timeline__time">' + formatTime(state.ms) + "</span>";
    el.timeline.appendChild(mark);
  }

  function renderClock() {
    el.time.textContent = formatTime(state.ms);
    el.timelineFill.style.width = Math.min(100, (state.ms / plan.total) * 100).toFixed(2) + "%";
  }

  function updateButtons() {
    el.start.disabled = state.running;
    el.pause.disabled = !state.running;
    el.pause.textContent = tx(state.paused ? "Resume" : "Pause");
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
  var SCAN_MS = 32000;   // demo time spent moving along the whole route (compressed)
  var TARGET_MS = 7200;  // demo time for one first observation, detection to marking
  var CROSS_MS = 5400;   // demo time for one second (Pass B) observation
  var REVIEW_MS = 4500;  // demo time for the cross-pass verification summary
  var AT = { evidence: 1100, classify: 2200, risk: 3300, decide: 4400, mark: 5600 };
  var XP = { compare: 1700, update: 3400 };

  var timer = null;
  var state = freshState();

  function freshState() {
    return { status: "ready", running: false, paused: false, ms: 0, d: 0, dCovered: 0, next: 0, counter: 0,
             current: null, alert: null, blocks: 0, shownBlocks: 0, verifyStep: 0, flashKey: null, marked: [], byKey: {} };
  }

  /* Turn the route and the target observations into timed events and vessel
     movements. The vessel holds position while a target is being analysed. */
  function compile() {
    var stops = [];
    TARGETS.forEach(function (tg) {
      observations[tg.key].forEach(function (o) {
        stops.push({ d: o.d, type: o.pass === "A" ? "first" : "second", key: tg.key });
      });
    });
    /* the vessel also passes the start and the end of the transition leg, so the
       (short) leg between the two passes stays visible for a moment */
    stops.push({ d: route.passStart.T, type: "waypoint" }, { d: route.passStart.B, type: "waypoint" });
    stops.sort(function (a, b) { return a.d - b.d || (a.type === "waypoint" ? -1 : b.type === "waypoint" ? 1 : 0); });

    var events = [], moves = [], t = 0, d = 0;
    function at(ms, fn, arg) { events.push({ t: ms, run: function () { fn(arg); } }); }
    function scanTo(d1) {
      var ms = Math.max(d === 0 ? 2500 : 1200, Math.round(((d1 - d) / route.lengths.total) * SCAN_MS));
      at(t, enterScan);
      moves.push({ t0: t, t1: t + ms, d0: d, d1: d1 });
      t += ms;
      d = d1;
    }

    stops.forEach(function (s) {
      scanTo(s.d);
      if (s.type === "waypoint") return;
      if (s.type === "first") {
        at(t, detect, s.key);
        at(t + AT.evidence, analyze);
        at(t + AT.classify, classify);
        at(t + AT.risk, assessRisk);
        at(t + AT.decide, decide);
        at(t + AT.mark, mark);
        t += TARGET_MS;
      } else {
        at(t, crossStart, s.key);
        at(t + XP.compare, crossCompare);
        at(t + XP.update, crossUpdate);
        t += CROSS_MS;
      }
    });
    scanTo(route.lengths.total);
    at(t, review);
    t += REVIEW_MS;
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
    state.flashKey = null;
    setStage("scanning");
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
    renderPhase();
    renderAnalysis();
  }

  function observe(t, o) {
    var rec = {
      pass: o.pass, lineId: o.lineId, time: formatTime(state.ms), auvHeadingDeg: o.auvHeadingDeg,
      bearingToTargetDeg: o.bearingToTargetDeg, distanceToTargetM: o.distanceToTargetM
    };
    t.obs.push(rec);
    return rec;
  }

  /* First observation, Pass A: the full detection-to-marking sequence. */
  function detect(key) {
    var sp = spec(key), rule = evaluate(sp.evidence), pos = sc.targets[key];
    state.counter += 1;
    var t = {
      key: key, id: "Target #" + pad3(state.counter), name: sp.name, objectType: sp.objectType,
      depth: sp.depth, source: sp.source, scene: sp.scene, box: sp.box, logName: sp.logName,
      evidence: sp.evidence, decision: sp.decision, logDecision: sp.logDecision, explanation: sp.explanation,
      action: sp.action, statusNow: sp.status, xpass: sp.xpass,
      classification: rule.classification, group: rule.group, risk: rule.risk, level: rule.level,
      riskType: rule.riskType, certainty: rule.certainty, ruleText: rule.text,
      x: pos[0], y: pos[1], latlon: toLatLon(pos[0], pos[1]),
      obs: [], plannedB: observations[key][1], verified: false
    };
    observe(t, observations[key][0]);
    state.byKey[key] = t;
    state.status = "detected";
    state.current = t;
    state.blocks = 1;
    state.shownBlocks = 0;
    state.verifyStep = 0;
    state.alert = null;
    setStatus(function () { return tf("Target detected — Pass A, line {0}", t.obs[0].lineId); }, "alert");
    setStage("detection");
    renderPhase();
    showScene(t.scene);
    setBox(t, false);
    addTimelineMark(t, false);
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
    setBox(state.current, true);
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
    state.flashKey = t.key;
    state.alert = t;
    setStatus(t.level === "safe" ? "Logged" : "Alert — target marked", "alert");
    setStage("alert");
    addMarker(t);
    renderAlert();
    renderLog();
    renderCoverage();
    renderAnalysis();
    flash(el.cardMap);
    flash(el.cardLog);
    flash(el.alert);
  }

  /* Second observation, Pass B: same target, same position, same marker. */
  function crossStart(key) {
    var t = state.byKey[key];
    observe(t, observations[key][1]);
    state.status = "verifying";
    state.current = t;
    state.blocks = 7;
    state.shownBlocks = 6;
    state.verifyStep = 1;
    state.flashKey = t.key;
    state.alert = t;
    setStatus(function () { return tf("Cross-Pass Observation — {0}", tid(t)); }, "alert");
    setStage("verification");
    renderPhase();
    clearMarkerFocus();
    if (t.markerEl) t.markerEl.classList.add("is-inspecting");
    showScene(t.scene);
    setBox(t, true);
    setCloseup(true, t, "Pass B — reference image");
    addTimelineMark(t, true);
    renderAlert();
    renderLog();
    renderAnalysis();
  }

  function crossCompare() {
    state.verifyStep = 2;
    var tc = state.current;
    setStatus(function () { return tf("Comparing evidence — {0}", tid(tc)); }, "alert");
    renderAnalysis();
  }

  function crossUpdate() {
    var t = state.current;
    state.verifyStep = 4;
    t.verified = true;
    t.statusNow = t.xpass.status;
    if (t.markerEl) t.markerEl.classList.add("is-crosschecked");
    setStatus(function () { return tf(t.decision === "Requires Verification" ? "Verification required — {0}" : "Decision unchanged — {0}", tid(t)); }, "alert");
    renderAlert();
    renderLog();
    renderCoverage();
    renderAnalysis();
  }

  function review() {
    state.status = "review";
    state.current = null;
    state.alert = null;
    state.flashKey = null;
    var nx = crossCount(), nm = state.marked.length;
    setStatus(function () { return tf("Cross-Pass Verification — {0} of {1} targets on both headings", nx, nm); }, "alert");
    setStage("verification");
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
    renderPhase();
    renderTrack();
    renderAlert();
    renderLog();
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
    state.d = route.lengths.total;
    setStatus("Mission complete", "done");
    allStagesDone();
    renderPhase();
    showScene("idle");
    setBox(null);
    setCloseup(false);
    clearMarkerFocus();
    renderTrack();
    renderCoverage();
    renderClock();
    renderAlert();
    renderLog();
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
    if (state.status === "scanning") renderPhase();
  }

  function start() {
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
    grid.reset();
    el.markers.innerHTML = "";
    Array.prototype.slice.call(el.timeline.querySelectorAll(".timeline__mark")).forEach(function (m) { m.remove(); });
    showScene("idle");
    setBox(null);
    setCloseup(false);
    setStage(null);
    renderPhase();
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

  /* Build the route, the target observations, the coverage grid and the
     timeline for the survey area. */
  function setupSurvey() {
    route = Survey.buildRoute({ width: sc.width, height: sc.height }, CONFIG);
    grid = new Survey.CoverageGrid({ width: sc.width, height: sc.height }, CONFIG.cell);
    observations = {};
    TARGETS.forEach(function (tg) {
      var pos = sc.targets[tg.key];
      observations[tg.key] = Survey.observationsFor(route, { x: pos[0], y: pos[1] });
    });
    plan = compile();
    drawMap();
    renderSurveyInfo();
  }

  /* ---- results section: the software outcome of the demo's survey,
     calculated with the same survey model and rules as the demo ---- */

  function renderResults() {
    var box = $("results-sim");
    if (!box) return;
    var area = { width: sc.width, height: sc.height }, r = route;
    var g = new Survey.CoverageGrid(area, CONFIG.cell);
    g.markRoute(r, 0, r.lengths.total);
    var cov = g.stats();
    var groups = TARGETS.map(function (tg) { return evaluate(tg.evidence).group; });
    var count = function (group) { return groups.filter(function (x) { return x === group; }).length; };
    var both = TARGETS.filter(function (tg) { return observations[tg.key].length === 2; }).length;
    var verify = TARGETS.filter(function (tg) { return tg.decision === "Requires Verification"; }).length;
    box.innerHTML = [
      ["Survey area", tf("{0} m² ({1} m × {2} m)", fmtNum(area.width * area.height), fmtNum(area.width), fmtNum(area.height))],
      ["Survey pattern", tf("Two-pass cross-hatch grid: {0} + {1} lines, {2} m apart", r.A.count, r.B.count, fmtNum(r.A.spacing))],
      ["Planned route", tf("{0} m", fmtNum(r.lengths.total))],
      ["Unique area coverage", tf("{0}% ({1} m²)", cov.uniquePct.toFixed(1), fmtNum(cov.uniqueArea))],
      ["Area seen on both headings", cov.bothPct.toFixed(1) + "%"],
      ["Targets detected", tf("{0} ({1} marine life, {2} shipwreck, {3} potential hazardous object, {4} unknown)",
        TARGETS.length, count("life"), count("structure"), count("mine"), count("unknown"))],
      ["Observed on both survey headings", tf("{0} of {1}", both, TARGETS.length)],
      ["Requires verification", String(verify)]
    ].map(function (row) { return "<div><dt>" + tx(row[0]) + "</dt><dd>" + row[1] + "</dd></div>"; }).join("");
  }

  /* --- full-screen demo: a clean layout for screen recording --- */

  function setFullscreen(on) {
    demo.classList.toggle("is-recording", on);
    document.body.classList.toggle("demo-locked", on);
    el.full.setAttribute("aria-pressed", String(on));
    el.full.textContent = tx(on ? "Exit full screen" : "Full-screen demo");
  }

  /* language change (js/i18n.js): write the live text again, without replaying animations */
  function relabel() {
    setStatus(state.statusLabel || "Ready", state.statusMode || "idle");
    updateButtons();
    el.full.textContent = tx(demo.classList.contains("is-recording") ? "Exit full screen" : "Full-screen demo");
    showScene(sceneNow);
    el.chip.textContent = tx(chipNow);
    if (state.current && !el.box.hidden) el.boxLabel.textContent = tx(state.current.name);
    state.shownBlocks = state.blocks;
    renderAlert();
    renderAnalysis();
    renderLog();
    renderSurveyInfo();
    renderCoverage();
    renderResults();
  }
  document.addEventListener("sitelang", relabel);

  el.start.addEventListener("click", start);
  el.pause.addEventListener("click", function () { if (state.paused) resume(); else pause(); });
  el.reset.addEventListener("click", reset);
  el.full.addEventListener("click", function () { setFullscreen(!demo.classList.contains("is-recording")); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && demo.classList.contains("is-recording")) setFullscreen(false);
  });

  setupSurvey();
  reset();
  renderResults();
})();
