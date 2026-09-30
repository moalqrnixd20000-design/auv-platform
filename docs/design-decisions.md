# Design decisions

Notes for the team. This folder is not part of the public site.

| Decision | Reason |
|---|---|
| One static site: plain HTML, CSS and classic scripts (no modules). | No dependencies; deployable anywhere; `index.html` still works when double-clicked (modules are blocked on `file://`). |
| Top navigation with seven sections: Home, About AUV, How It Works, AUV Design, Interactive Demo, Video, Project Materials. | A presentation site, not a documentation portal. |
| Simulated, conceptual and reference content carries a small label ("Simulation", "Conceptual", "Reference image", "TBD"). The main disclaimer stays in the footer. | The brief asks for a clear line between reference, simulation, concept and future development. |
| The team's AUV image is used unmodified (`assets/images/auv-team-design.jpg`); the hover tools only change how it is displayed. | The design must not be altered. |
| No labelled parts on the AUV image. | The team has not said which component is which. |
| The demo is built into the page (`js/demo.js`) and driven by one mission clock. | Pause, Resume and Reset are exact; no timers to get out of step. |
| Demo values (positions, depths, times, coverage) are simulated and labelled "Sim." or "Simulation" where shown. | They are not measurements. |
| Communication is described as "Underwater Acoustic Communication" (concept) and kept separate from the sensing layer. Specifications: TBD. | No specification has been given. |
| Red Sea fish (lionfish, clownfish, grouper) are presented as selected examples. | The recognition is not a general species classifier. |
| Fonts are self-hosted. | No third-party requests; works offline at a venue. |
| Light background, navy accents, hull-gold highlight sampled from the team's render. | Marine technology look; the image sits naturally on a light page. |
| The demo runs on one mission clock and is fully deterministic; a full-screen mode is provided for screen recording. | Predictable recordings; Pause and Reset are exact. |
| No camera is described as AUV hardware. Sensing is multibeam echosounder, water-column acoustic data and onboard sensors (specifications TBD). Demo images are labelled "Reference image — not a live feed"; detection sources are sensor names, never a camera. | The official AUV design does not show a camera. |
| Project direction: underwater object detection, hazard assessment, explainable decision support and inspection prioritization. Conceptual operating range 1–30 m (a target for the concept, not a tested rating). | Brief from the team. |
| The demo is a grid (parallel-line) survey. Survey area, line spacing (40 m) and estimated swath (50 m) are simulation parameters; track distance, area covered and coverage are calculated from them (area covered = along-line distance × min(swath, spacing)). | Numbers that agree with each other, no hard-coded coverage. |
| Decisions come from explainable rules over simulated evidence (biological morphology, rigid structure, size category, background difference). The last rule is "Unknown — requires verification"; the system never forces a class. No numeric confidence is shown; certainty is qualitative and labelled as simulation. | No fabricated AI metrics. |
| Four targets: lionfish (non-hazardous), shipwreck (potential hazard), potential mine (high potential hazard, never "confirmed"), unknown object. The mine and the unknown object are passed again from the next survey line (conceptual multi-pass / multi-angle verification). | The brief's sequence. |
| Reference images: the three team photographs plus the team-supplied NOAA sonar shipwreck image. For Targets #003 and #004 the marked object is simulated; the captions say so. | Only the images the team supplied. |
