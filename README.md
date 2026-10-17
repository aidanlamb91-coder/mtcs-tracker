# MTCS Portfolio Tracker – layout prototype

A clickable **layout prototype** of a web app for building an MTCS Grade Assessment (GA) portfolio.
It's front end only: no backend, no accounts, no real links, nothing is sent or saved. Buttons either move
between mock screens or show a "not wired up yet" message. All names, dates and evidence are **sample data**.
The criteria text is verbatim from the MTCS G2 packs.

Scope for now: **G2 Surveyor with G2 Core** (13 competences, 79 criteria). Other roles and grades are shown
in the pack selector as "coming later".

## Open it
- Offline: double-click `index.html`. It works from `file://`, with no server needed.
- Or serve the folder: `python3 -m http.server 8765`, then go to http://127.0.0.1:8765/

Use the switcher in the header to view as **Candidate**, **Assessor link** or **Witness link**.

## Screens (hash routes)
| Route | Screen |
|---|---|
| `#/` | **Opening screen**: choose your route. Role cards (Surveyor, Survey Engineer, Data Processor, Party Chief, Client Rep), grade picker G2 / G1 / Senior, route summary (role + matching Core added automatically), My portfolios, and "Lost your data? Import a backup" |
| `#/?role=surveyor&grade=G2` | Opening screen with Surveyor expanded and G2 picked |
| `#/dashboard` | Candidate dashboard: readiness, 70/30 direct-evidence meter, outstanding signatures, next actions, activity cards |
| `#/backup` | Backup and restore: save backup .zip to this device, Google Drive, OneDrive, restore from local zip / Drive / OneDrive, auto-backup toggle and frequency (all layout only) |
| `#/activity/1` to `#/activity/3` | Activity workspace: plan summary, evidence and add buttons, criteria checklist, send to assessor |
| `#/activity/2?modal=send` | Send-link dialog |
| `#/matrix` | Coverage matrix: 79 criteria × Activities 1–3, with filters |
| `…?c=S09d` (any page) | Criterion detail drawer |
| `#/evidence` | Evidence library, with unmapped items flagged |
| `#/assessor/2` | Assessor link view (phone-first single page): plan, criteria codes, UKQs, Feedback Form, sign and lock |
| `#/witness/1` | Witness link view (narrow scope) |
| `#/export` | Export / submission checklist by MTCS upload area (1, 2, 3, 4, 7) |
| `#/settings` | Settings and pack selector |

## Structure
```
index.html                 entry point; plain <script> tags (no modules, no fetch) so file:// works
css/styles.css             all styles; responsive breakpoints at 1100, 820 and 520 px
js/app.js                  router + views (vanilla JS, template strings)
js/sample-data.js          dummy portfolio state (activities, coverage, evidence, UKQs)
js/packs.generated.js      GENERATED from packs/*.json by tools/build-data.py
packs/index.json           catalogue of role/grade packs (only active ones have a data file)
packs/g2-surveyor-2026.json  G2 Surveyor + G2 Core pack: units, competences, criteria, codes, upload areas
tools/extract_criteria.py  one-off: builds the pack JSON from the extracted MTCS pack text
tools/build-data.py        bundles the pack JSON into js/packs.generated.js
tools/screenshots.js       Playwright screenshots (desktop 1440×900, phone 390×844)
tools/screenshots-route.js Phone (412×900) screenshots of the opening and backup screens, plus a click-through check
screenshots/               current screenshots
```

## Packs are data
Each role and grade is one JSON file (`units → competences → criteria`, plus evidence codes, rules and upload
areas). To add a pack, such as G1 Surveyor: add `packs/g1-surveyor-….json`, set its catalogue entry to `"status": "active"`
with a `file`, then run `python3 tools/build-data.py`. The views read everything from the pack, so no screen
code is tied to G2.

## Not in this prototype (later)
Backend and storage, real activity links with email codes, e-signatures and audit trail, pre-filling the
official MTCS PDFs, zip export, offline sync, and the assessor-training side. The app will never submit to MTCS
or sign on anyone's behalf.

## Routes and backup (Oct 2026 update)
- Only **G2 Surveyor + G2 Core** has criteria loaded. Picking any other route opens the same screens with a
  "criteria pack not loaded yet (layout preview)" banner. Change route from the header chip or the side menu.
- Party Chief and Client Rep are single level. Which Core unit goes with them is still to be confirmed with MTCS.
- Data will live in the browser on the device, so the backup .zip is the recovery path: import it from the
  opening screen or the Backup screen. Cloud backup (Google Drive / OneDrive) is layout only for now.
