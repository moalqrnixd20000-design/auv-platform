# Design decisions

Notes for the team. This folder is not part of the public site.

| Decision | Reason |
|---|---|
| One static site: plain HTML, CSS and classic scripts (no modules). | No dependencies; deployable anywhere; `index.html` still works when double-clicked (modules are blocked on `file://`). |
| Top navigation with seven sections: Home, About AUV, How It Works, AUV Design, Interactive Demo, Video, Project Materials. | A presentation site, not a documentation portal. |
| No labels, legends or filters that explain project maturity. Details that are not available are simply not shown. One disclaimer, in the footer. | The site should read as a project presentation. |
| The team's AUV image is used unmodified (`assets/images/auv-team-design.jpg`); the hover tools only change how it is displayed. | The design must not be altered. |
| No labelled parts on the AUV image. | The team has not said which component is which. |
| The demo is built into the page (`js/demo.js`) and driven by one mission clock. | Pause, Resume and Reset are exact; no timers to get out of step. |
| Demo values (confidence, priority, positions) are scripted and labelled "Demo Confidence" where shown. | They are not measurements. |
| The man-made-object case uses the wreck photograph; the lionfish uses the lionfish photograph; clownfish and grouper are simple illustrations. | Only two suitable photographs were supplied. |
| Communication is described only as "Signal-Based Communication" and kept separate from the sensing layer. | No specification has been given. |
| Red Sea fish (lionfish, clownfish, grouper) are presented as selected examples. | The recognition is not a general species classifier. |
| Fonts are self-hosted. | No third-party requests; works offline at a venue. |
| Light background, navy accents, hull-gold highlight sampled from the team's render. | Marine technology look; the image sits naturally on a light page. |
| The demo's decision is a simple weighted rule: each target has weighted factors, the weighted sum is the demo score, and a threshold rule gives the decision. The analysis panel builds up stage by stage. | It shows how an inspection decision can be made and explained. The scores are scripted demo values, not measurements. |
| The demo runs on one mission clock and is fully deterministic; a full-screen mode is provided for screen recording. | Predictable recordings; Pause and Reset are exact. |
