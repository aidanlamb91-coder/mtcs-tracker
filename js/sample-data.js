// Sample (dummy) portfolio state for the layout prototype. Nothing here is real evidence.
(function () {
  const candidate = {
    name: "Aidan", role: "Online Surveyor", employer: "[Company]",
    email: "aidan@example.com", goal: "G2 Surveyor (GA)", packId: "g2-surveyor-2026"
  };
  const trip = {
    vessel: "North Sea Enabler", project: "P5459 Inch Cape OWF",
    scope: "ROV pre-trench survey (dual-head MBES, TSS cable tracking)",
    dates: "3–14 Oct 2026"
  };
  const people = {
    assessor: { name: "[Assessor]", role: "Senior Surveyor / MTCS assessor", email: "[assessor email]" },
    witness: { name: "[Witness]", role: "Party Chief", email: "[witness email]" },
    referee1: { name: "[Shore manager]", role: "Survey Operations Manager" },
    referee2: { name: "[Offshore manager]", role: "Offshore Manager" }
  };

  // Planned coverage per activity: "competenceId:letters:code"
  const plan = {
    1: "C1:abcefi:O C2:acde:O C3:abcd:O S01:abcd:O S02:a:Q S03:abc:O S04:abc:Q S05:ac:Q S06:c:P S07:abcd:O S08:abce:O S09:abc:O S10:abc:P",
    2: "C1:dghjk:O C2:bfghi:O C3:fg:P S01:efghij:O S02:ab:O S03:de:O S04:b:Q S05:bd:P S06:a:O S07:e:Q S08:de:O S09:c:Q S10:d:Q",
    3: "C1:g:Q C2:cg:O C3:eh:P S01:j:P S02:b:P S03:c:O S04:c:P S05:cd:P S06:abde:P S07:a:P S08:af:W S09:e:Q S10:e:Q"
  };
  // Activity 1 signed, Activity 2 evidence mapped (with assessor), Activity 3 part mapped.
  const a3Mapped = ["C3e", "C3h", "S01j", "S06a", "S06b", "S06d", "S08f", "S02b", "S05c"];

  const coverage = {}; // coverage[criterionId][activity] = {code, state}
  Object.entries(plan).forEach(([act, spec]) => {
    spec.split(" ").forEach(tok => {
      const [comp, letters, code] = tok.split(":");
      letters.split("").forEach(l => {
        const id = comp + l;
        coverage[id] = coverage[id] || {};
        let state = "planned";
        if (act === "1") state = "signed";
        else if (act === "2") state = "mapped";
        else if (a3Mapped.includes(id)) state = "mapped";
        coverage[id][act] = { code, state };
      });
    });
  });

  const activities = [
    { n: 1, title: "Set-up and calibration checks", dates: "4–7 Oct 2026", status: "signed", statusLabel: "Signed and locked",
      summary: "Geodesy and GNSS/heading checks, USBL and INS/DVL checks, SVP v SV probe, MBES patch test (data collection), TSS set-up, permits.",
      where: "North Sea Enabler, online room and ROV hangar", witness: "[Witness], Party Chief", planAgreed: "4 Oct 2026", signedOn: "7 Oct 2026" },
    { n: 2, title: "Routine online pre-trench shift", dates: "8–11 Oct 2026", status: "with-assessor", statusLabel: "With assessor",
      summary: "Online logging, line keeping, events and fixes, QC monitoring, handling a USBL outage, shift handover.",
      where: "North Sea Enabler, online room (12:00–00:00 shift)", witness: "None", planAgreed: "8 Oct 2026", linkSent: "11 Oct 2026, 23:40 BST" },
    { n: 3, title: "Data handover and reporting", dates: "12–14 Oct 2026", status: "gathering", statusLabel: "Gathering evidence",
      summary: "Online to offline transfer, cleaning and QC plots, tide reduction, daily progress report, knowledge questions.",
      where: "North Sea Enabler, online room and processing desk", witness: "None", planAgreed: "12 Oct 2026" }
  ];

  const evidence = [
    { id: "E01", type: "record", title: "Signed vessel induction record", file: "C1a_A1_VesselInduction_20261003.pdf", date: "3 Oct 2026", act: 1, code: "P", criteria: ["C1a"], tags: ["HSE", "Induction"] },
    { id: "E02", type: "photo", title: "Station bill showing muster duty", file: "C1i_A1_StationBill_20261003.jpg", date: "3 Oct 2026", act: 1, code: "P", criteria: ["C1i", "C1e"], tags: ["HSE", "Emergency"] },
    { id: "E03", type: "file", title: "Geodetic parameter check with test-point conversion", file: "S01c_A1_GeodeticCheck_20261004.pdf", date: "4 Oct 2026", act: 1, code: "P", criteria: ["S01c", "S10a", "S10b", "S10c"], tags: ["Geodesy"] },
    { id: "E04", type: "photo", title: "Annotated online software configuration", file: "S01a_A1_OnlineConfig_20261004.png", date: "4 Oct 2026", act: 1, code: "P", criteria: ["S01a", "S01b", "S03a"], tags: ["Online software"], redact: true },
    { id: "E05", type: "file", title: "System diagram: GNSS, gyro, MRU, USBL, INS/DVL, MBES, TSS", file: "S03a_A1_SystemDiagram_20261005.pdf", date: "5 Oct 2026", act: 1, code: "P", criteria: ["S03a", "S04c"], tags: ["Systems"] },
    { id: "E06", type: "file", title: "SVP cast QC plot v SV probe", file: "S07c_A1_SVPCast_20261005.pdf", date: "5 Oct 2026", act: 1, code: "P", criteria: ["S07c", "S06c", "S07d"], tags: ["Water column"] },
    { id: "E07", type: "file", title: "MBES patch test data collection log", file: "S09b_A1_PatchTestLog_20261006.xlsx", date: "6 Oct 2026", act: 1, code: "P", criteria: ["S09a", "S09b", "S04a"], tags: ["Calibration", "MBES"] },
    { id: "E08", type: "file", title: "USBL verification report (box-in)", file: "S09c_A1_USBLVerification_20261006.pdf", date: "6 Oct 2026", act: 1, code: "P", criteria: ["S08e", "S09c"], tags: ["Calibration", "USBL"], redact: true },
    { id: "E09", type: "record", title: "Toolbox talk sheet (ROV hangar, SVP deployment)", file: "C1c_A1_ToolboxTalk_20261005.pdf", date: "5 Oct 2026", act: 1, code: "P", criteria: ["C1b", "C1c", "C1f"], tags: ["HSE"] },
    { id: "E10", type: "file", title: "Online survey log, shift 8 Oct", file: "S05d_A2_OnlineLog_20261008.pdf", date: "8 Oct 2026", act: 2, code: "P", criteria: ["S05b", "S05d", "C2f"], tags: ["Logging"] },
    { id: "E11", type: "photo", title: "Runline and target assignment screen", file: "S01h_A2_Runlines_20261009.png", date: "9 Oct 2026", act: 2, code: "P", criteria: ["S01g", "S01h", "S01e"], tags: ["Online software"], redact: true },
    { id: "E12", type: "written", title: "USBL outage: what happened and what I did", file: "S03e_A2_OutageNote_20261010.docx", date: "10 Oct 2026", act: 2, code: "W", criteria: ["S03e", "S02b", "C2d"], tags: ["QC", "Outage"] },
    { id: "E13", type: "file", title: "Event listing and fix printout", file: "S01i_A2_EventsFixes_20261010.pdf", date: "10 Oct 2026", act: 2, code: "P", criteria: ["S01i", "S01j"], tags: ["Online software"] },
    { id: "E14", type: "file", title: "Shift handover sheet", file: "C2c_A2_Handover_20261011.pdf", date: "11 Oct 2026", act: 2, code: "P", criteria: ["C2c", "C2g", "C3f"], tags: ["Teamwork"] },
    { id: "E15", type: "file", title: "Data transfer checklist and QC plots", file: "S06a_A3_TransferQC_20261012.pdf", date: "12 Oct 2026", act: 3, code: "P", criteria: ["S06a", "S06b", "S06d"], tags: ["Processing"] },
    { id: "E16", type: "file", title: "Daily progress report draft", file: "C3h_A3_DPR_20261013.docx", date: "13 Oct 2026", act: 3, code: "P", criteria: ["C3h", "C3e", "S05c"], tags: ["Reporting"] },
    { id: "E17", type: "witness", title: "Witness testimony: LBL operation on pipelay job", file: "S08f_Hist_LBL_Testimony.pdf", date: "Historic (2026)", act: 3, code: "W", criteria: ["S08f"], tags: ["Historic", "LBL"], note: "Assessor to decide if historic evidence is accepted" },
    { id: "E18", type: "photo", title: "Fire alarm call point by online room", file: "IMG_20261007_1412.jpg", date: "7 Oct 2026", act: null, code: "", criteria: [], tags: ["HSE"] },
    { id: "E19", type: "file", title: "TSS calibration sheet (previous job)", file: "TSS_cal_sheet_scan.pdf", date: "Historic (2026)", act: null, code: "", criteria: [], tags: ["Calibration", "Historic"] },
    { id: "E20", type: "written", title: "Candidate testimony: SVP cast and apply", file: "CandidateTestimony_A1_SVP.pdf", date: "5 Oct 2026", act: 1, code: "W", criteria: ["S07c"], tags: ["Testimony"] }
  ];

  const ukq = {
    2: [
      { comp: "S03", q: "What would you check first if the USBL position drops out during a line?", a: "Beacon status, transceiver comms, SV and noise, then raise with the party chief.", ok: "Y" },
      { comp: "S05", q: "What must go in the online log when logging is stopped and restarted?", a: "Time, reason, file names, line and KP, and who was told.", ok: "Y" },
      { comp: "S07", q: "How does a poor SV profile show up in MBES data?", a: "Smiles or frowns on the outer beams and depth bias.", ok: "Y" },
      { comp: "S10", q: "Explain the difference between precision and accuracy for a USBL fix.", a: "", ok: "" }
    ]
  };

  window.SAMPLE = { candidate, trip, people, activities, coverage, evidence, ukq, today: "17 Oct 2026" };
})();
