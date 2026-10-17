/* MTCS Portfolio Tracker: layout prototype. Front end only, sample data, hash routing. */
(function () {
  "use strict";
  const S = window.SAMPLE;
  const PACK = window.PACKS[S.candidate.packId];
  const app = document.getElementById("app");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- Pack helpers ----------
  const COMPS = [];
  const CRITS = [];
  PACK.units.forEach(u => u.competences.forEach(c => {
    const comp = Object.assign({}, c, { unitName: u.name, unitId: u.id });
    COMPS.push(comp);
    c.criteria.forEach(k => CRITS.push(Object.assign({}, k, { comp })));
  }));
  const critById = id => CRITS.find(c => c.id === id);
  const compLabel = c => (c.unitId === "core" ? "Core " : "Surveyor ") + c.number;
  const cov = (id, a) => (S.coverage[id] || {})[a];
  const RANK = { gap: 0, planned: 1, mapped: 2, signed: 3 };
  function critState(id) {
    let best = "gap";
    [1, 2, 3].forEach(a => { const c = cov(id, a); if (c && RANK[c.state] > RANK[best]) best = c.state; });
    return best;
  }
  const here = () => (location.hash.split("?")[0] || "#/dashboard");
  const evFor = id => S.evidence.filter(e => e.criteria.includes(id));
  const actOf = n => S.activities.find(a => a.n === Number(n));
  function compStats(comp) {
    const r = { signed: 0, mapped: 0, planned: 0, gap: 0, total: comp.criteria.length, acts: 0 };
    comp.criteria.forEach(k => r[critState(k.id)]++);
    [1, 2, 3].forEach(a => { if (comp.criteria.some(k => cov(k.id, a))) r.acts++; });
    return r;
  }
  function totals() {
    const t = { signed: 0, mapped: 0, planned: 0, gap: 0 };
    CRITS.forEach(k => t[critState(k.id)]++);
    let direct = 0, indirect = 0;
    CRITS.forEach(k => [1, 2, 3].forEach(a => { const c = cov(k.id, a); if (!c) return; if ("OP".includes(c.code)) direct++; else if ("WQ".includes(c.code)) indirect++; }));
    t.directPct = Math.round(100 * direct / (direct + indirect));
    t.direct = direct; t.indirect = indirect;
    t.compsAll3 = COMPS.filter(c => compStats(c).acts === 3).length;
    return t;
  }
  const STATE_LABEL = { signed: "Signed", mapped: "Evidenced", planned: "Planned", gap: "Gap" };
  const pill = st => `<span class="pill ${st}">${STATE_LABEL[st]}</span>`;
  const codeBadge = (code, st) => `<span class="code" style="background:${st === "signed" ? "var(--signed-bg)" : st === "mapped" ? "var(--mapped-bg)" : "#eef1f5"}">${esc(code)}</span>`;
  const EV_ICON = { photo: "📷", file: "📄", written: "✍️", witness: "🧾", record: "✅" };
  const EV_TYPE = { photo: "Photo", file: "File", written: "Written product", witness: "Witness statement", record: "Work record" };

  // ---------- Routes (role + grade, Core added automatically) ----------
  // GA course ids from research notes (Oct 2026). Only G2 Surveyor has a loaded criteria pack.
  const CORE_COURSE = { G2: 228, G1: 227, Senior: 213 };
  const ROLES = [
    { key: "surveyor", name: "Surveyor", ico: "🧭", blurb: "Online and offshore survey operations", grades: { G2: { pack: "g2-surveyor-2026", course: 1844 }, G1: { course: 1833, note: "About 14 competences, 84 criteria" }, Senior: { course: 1823 } } },
    { key: "engineer", name: "Survey Engineer", ico: "🔧", blurb: "Survey equipment, mobilisation and fault finding", grades: { G2: { course: 1843 }, G1: { course: 1832 }, Senior: { course: 1822 } } },
    { key: "processor", name: "Data Processor", ico: "🗺️", blurb: "Processing, QC and charting of survey data", grades: { G2: { course: 1834 }, G1: { course: 1824 }, Senior: { course: 1816 } } },
    { key: "partychief", name: "Party Chief", ico: "🧑‍✈️", blurb: "Leading the survey team offshore", single: true, grades: { "Single level": { course: 1846 } } },
    { key: "clientrep", name: "Client Representative", ico: "🤝", blurb: "Representing the client on site", single: true, grades: { "Single level": { course: 1809 } } }
  ];
  const roleOf = k => ROLES.find(r => r.key === k);
  const routeName = (r, g) => r.single ? r.name : `${g} ${r.name}`;
  const coreName = (r, g) => r.single ? "Core unit to be confirmed with MTCS" : `${g} Core`;

  // ---------- Official MTCS forms: listed here, downloaded from MTCS (not hosted by this site) ----------
  const TPL = window.TEMPLATES || [];
  const MP = window.MTCS_PAGES || {};
  const MTCS_NOTE = "Official forms are © MTCS Ltd. Download the current versions from MTCS.";
  const tplFind = (unit, kind, comp) => TPL.find(t => t.unit === unit && t.kind === kind && (comp == null || t.comp === comp));
  const packCount = k => TPL.filter(t => t.pack === k).length;
  const PACK_STATE = "not-imported"; // layout sample only; nothing is imported or stored yet
  // --- Sample: activities shared with you as zips (no accounts, browser-local) ---
  const SHARED = [
    { n: 2, candidate: "[Candidate A]", route: "G2 Surveyor + G2 Core", title: "Routine online pre-trench shift", dates: "8–11 Oct 2026", status: "awaiting", statusLabel: "Awaiting review", exportedBy: "[Candidate A]", exportedAt: "15 Oct 2026, 09:14 BST", pkg: 4, basedOn: 3, app: "0.2 (layout)", criteria: 31, files: 5, progress: "Plan agreed · 0 of 31 coded" },
    { n: 3, candidate: "[Candidate B]", route: "G2 Surveyor + G2 Core", title: "Data handover and reporting", dates: "12–14 Oct 2026", status: "ready", statusLabel: "Ready to return", exportedBy: "[Candidate B]", exportedAt: "16 Oct 2026, 18:02 BST", pkg: 2, basedOn: 1, app: "0.2 (layout)", criteria: 20, files: 3, progress: "Signed · feedback added" },
    { n: 1, candidate: "[Candidate A]", route: "G2 Surveyor + G2 Core", title: "Set-up and calibration checks", dates: "4–7 Oct 2026", status: "imported", statusLabel: "Imported", exportedBy: "[Candidate A]", exportedAt: "17 Oct 2026, 08:40 BST", pkg: 1, basedOn: 0, app: "0.2 (layout)", criteria: 42, files: 8, progress: "Not reviewed yet" }];
  const sharedOf = n => SHARED.find(x => x.n === Number(n)) || SHARED[0];
  const sharedRow = x => `<a class="shared-row" href="#/shared/${x.n}"><span class="num">${x.n}</span><span class="grow"><b>Activity ${x.n} · ${esc(x.title)}</b><span class="small muted">From ${esc(x.candidate)} · ${esc(x.dates)} · Package v${x.pkg}</span><span class="small muted">${esc(x.progress)}</span></span><span class="pill ${x.status === "ready" ? "signed" : x.status === "awaiting" ? "mapped" : "planned"}">${x.statusLabel}</span><span class="chev" aria-hidden="true">›</span></a>`;
  const packBanner = (where) => `<div class="pack-banner" role="note"><span class="pb-ico" aria-hidden="true">🧰</span><div class="grow"><b>Forms pack: not imported yet</b><div class="small muted">Download the current pack from MTCS when you start compiling your portfolio, then import it here. The app uses those blank templates throughout. A weekly check can flag "pack update available" if MTCS publishes a newer revision.</div></div><a class="btn sm primary" href="#/forms">Get the forms pack</a></div>`;
  const tplLink = (t, label, tag) => t ? `<div class="tpl-item"><span class="tpl-ico" aria-hidden="true">📄</span><span class="grow"><b>${esc(label || t.label)}</b><span class="fname">${esc(t.file)}${t.mtcsType === "zip" ? " (inside the MTCS ‘All Files’ zip)" : ""}</span>${tag || ""}
      <span class="tpl-acts">${t.pack && t.pack.startsWith("g2-") ? `<span class="pill planned">Included in pack</span>` : ""}${t.mtcsUrl ? `<a class="btn sm primary" href="${esc(t.mtcsUrl)}" target="_blank" rel="noopener" title="Opens MTCS Online in a new tab">Download from MTCS ↗</a>` : `<a class="btn sm primary" href="${esc((MP[t.pack] || MP["g2-surveyor"] || {}).url || "")}" target="_blank" rel="noopener">Download from MTCS ↗</a>`}<button class="btn sm" data-toast="Layout only. Later you'll pick the PDF you downloaded and it's kept in this browser.">Add my downloaded copy</button></span></span></div>` : "";
  const shortLabel = txt => { const s = txt.replace(/^(Demonstrates|Has demonstrated|Has)\s+(the ability to|an understanding of|a basic understanding of|a good understanding of|a willingness to|knowledge of|an awareness of|the correct usage of)?\s*/i, ""); return s.charAt(0).toUpperCase() + s.slice(1); };
  const DISCLAIMER = `<footer class="disclaimer">Prototype for discussion. Not affiliated with or endorsed by MTCS or IMarEST. Sample data only. Official forms are © MTCS Ltd. Download the current versions from MTCS.</footer>`;

  // ---------- Router ----------
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, q] = h.split("?");
    const params = new URLSearchParams(q || "");
    return { parts: path.split("/").filter(Boolean), params };
  }
  const ui = { active: { role: "surveyor", grade: "G2" }, staleBackup: false, mUnit: "all", mState: "gap", mSearch: "", mSearchOpen: false, mLegend: false, aStep: 1, eType: "all", eUnmapped: false, eSearch: "" };
  const backupDays = () => ui.staleBackup ? 9 : 3;
  const backupWhen = () => ui.staleBackup ? "8 Oct 23:58 (BST)" : "14 Oct 23:58 (BST)";

  function render() {
    const { parts, params } = parse();
    const page = parts[0] || "route";
    let role = "candidate", body = "", nav = page;
    if (page === "assessor") { role = "assessor"; body = viewAssessor(parts[1] || 2, params); }
    else if (page === "witness") { role = "witness"; body = viewWitness(parts[1] || 1); }
    else if (page === "activity") { body = viewActivity(parts[1] || 1); nav = "activity" + (parts[1] || 1); }
    else if (page === "matrix") body = viewMatrix(params);
    else if (page === "evidence") body = viewEvidence();
    else if (page === "export") body = viewExport();
    else if (page === "settings") body = viewSettings();
    else if (page === "backup") body = viewBackup();
    else if (page === "forms") body = viewForms();
    else if (page === "more") body = viewMore();
    else if (page === "shared") { role = "shared"; body = viewShared(parts[1] || 2); }
    else if (page === "route") { role = "landing"; body = viewLanding(params); }
    else { body = viewDashboard(); nav = "dashboard"; }

    const ar = roleOf(ui.active.role);
    const preview = role === "candidate" && !ar.grades[ui.active.grade].pack
      ? `<div class="preview-banner" role="note"><b>${esc(routeName(ar, ui.active.grade))}: criteria pack not loaded yet (layout preview).</b> The screens below show the G2 Surveyor sample so you can see the layout. <a href="#/">Change route</a></div>` : "";
    const shell = role === "candidate"
      ? `<div class="shell">${sidenav(nav)}<main id="main">${preview}${body}${DISCLAIMER}</main></div>${bottomnav(nav)}`
      : role === "landing" ? `<main id="main" class="landing-main">${body}${DISCLAIMER}</main>`
      : `<main id="main" class="link-main">${body}${DISCLAIMER}</main>`;
    let overlay = "";
    if (params.get("c")) overlay = drawer(params.get("c"));
    if (params.get("modal") === "send") overlay = sendModal(parts[1] || 2);
    if (params.get("modal") === "merge") overlay = mergeModal(parts[1] || 2);
    app.innerHTML = topbar(role, parts) + `<div class="proto-banner">Layout prototype: sample data only. Buttons are not wired up yet.</div>` + shell + overlay;
    document.title = "MTCS Portfolio Tracker – " + ({ assessor: "Assessor view", witness: "Witness view", shared: "Shared with me", landing: "Choose your route" }[role] || page);
  }

  function topbar(role, parts) {
    const ar = roleOf(ui.active.role);
    if (role === "assessor" || role === "witness" || role === "shared") {
      return `<header class="topbar">
        <div class="brand"><div class="logo" aria-hidden="true">MT</div><span>Portfolio Tracker</span></div>
        <span class="pack-chip">${role === "assessor" ? "Assessor view" : role === "witness" ? "Witness view" : "Imported copy"}</span>
        <div class="spacer"></div>
        <button class="route-chip exit" data-href="${role === "shared" ? "#/" : "#/activity/" + esc(parts[1] || 1)}" title="Leave this view">✕ ${role === "shared" ? "Exit imported copy" : "Exit preview"}</button>
      </header>`;
    }
    const landing = role === "landing";
    return `<header class="topbar">
      <div class="brand"><div class="logo" aria-hidden="true">MT</div><span>Portfolio Tracker</span></div>
      ${landing ? "" : `<button class="route-chip" data-href="#/" title="Change route">${esc(routeName(ar, ui.active.grade)) + (ar.single ? "" : " + Core")} <span aria-hidden="true">▾</span></button>`}
      <div class="spacer"></div>
      <button class="backup-chip${backupDays() > 7 ? " stale" : ""}" data-href="#/backup" title="Backup and restore. Last backup ${backupWhen()}"><span class="bdot" aria-hidden="true"></span><span aria-hidden="true">☁</span><span class="bl">Backed up ${backupDays()} days ago</span><span class="sr-only">Backup and restore</span></button>
    </header>`;
  }

  function sidenav(cur) {
    const t = totals();
    const a = (id, href, ico, label, count) => `<a href="${href}" class="${cur === id ? "active" : ""}"><span class="ico" aria-hidden="true">${ico}</span><span class="lbl">${label}</span>${count != null ? `<span class="count${count.alert ? " alert" : ""}" title="${count.title}">${count.n}</span>` : ""}</a>`;
    const unm = S.evidence.filter(e => !e.criteria.length).length;
    return `<nav class="sidenav" aria-label="Main">
      ${a("dashboard", "#/dashboard", "◧", "Dashboard")}
      <div class="group">Activities</div>
      ${S.activities.map(x => a("activity" + x.n, "#/activity/" + x.n, x.n, esc(x.title))).join("")}
      <a href="#" data-toast="Adding a fourth activity is allowed if the assessor wants one."><span class="ico">＋</span>New activity</a>
      <div class="group">Portfolio</div>
      ${a("matrix", "#/matrix", "▦", "Coverage matrix", { n: t.gap, alert: t.gap > 0, title: t.gap + " criteria with a gap" })}
      ${a("evidence", "#/evidence", "▤", "Evidence library", { n: unm || S.evidence.length, alert: unm > 0, title: unm ? unm + " items unmapped" : "items" })}
      ${a("forms", "#/forms", "📄", "Forms and templates")}
      <a href="#/"><span class="ico">⇄</span><span class="lbl">Shared with me</span></a>
      ${a("export", "#/export", "⇪", "Export for MTCS")}
      ${a("backup", "#/backup", "☁", "Backup and restore")}
      ${a("settings", "#/settings", "⚙", "Settings")}
      <div class="trip-box"><b>Current trip</b><br>${esc(S.trip.vessel)}<br>${esc(S.trip.project)}<br><span class="muted">${esc(S.trip.dates)}</span></div>
    </nav>`;
  }
  function bottomnav(cur) {
    const t = totals();
    const more = ["more", "export", "backup", "settings", "forms"].includes(cur);
    const a = (on, href, ico, label, badge) => `<a href="${href}" class="${on ? "active" : ""}"><span class="ico">${ico}${badge ? `<span class="badge">${badge}</span>` : ""}</span>${label}</a>`;
    return `<nav class="bottomnav" aria-label="Main">${a(cur === "dashboard", "#/dashboard", "◧", "Home")}${a(cur.startsWith("activity"), "#/activity/" + (ui.lastAct || 2), "▣", "Activities")}${a(cur === "matrix", "#/matrix?f=gap", "▦", "Gaps", t.gap || "")}${a(cur === "evidence", "#/evidence", "▤", "Evidence")}${a(more, "#/more", "☰", "More", backupDays() > 7 ? "!" : "")}</nav>`;
  }

  // ---------- 1. Dashboard ----------
  const ctxChip = () => { const ar = roleOf(ui.active.role); return `<a class="ctx-chip" href="#/" title="Change route"><b>${esc(routeName(ar, ui.active.grade))}${ar.single ? "" : " + Core"}</b><span>${esc(S.trip.vessel)} · ${esc(S.trip.project)}</span></a>`; };
  function backupNudge() {
    return backupDays() > 7 ? `<div class="nudge" role="alert"><span aria-hidden="true">☁</span><div class="grow"><b>No backup for ${backupDays()} days.</b><div class="small">Your portfolio is only in this browser. Back up so it isn't lost.</div></div><a class="btn sm primary" href="#/backup">Back up now</a></div>` : "";
  }
  function nextItems() {
    const t = totals();
    const gaps = CRITS.filter(k => critState(k.id) === "gap").map(k => k.id);
    const planned = CRITS.filter(k => critState(k.id) === "planned").length;
    const flagged = S.evidence.filter(e => e.redact).length;
    const unm = S.evidence.filter(e => !e.criteria.length).length;
    return [
      gaps.length && { st: "gap", t: `${gaps.length} criteria with a gap (${gaps.join(", ")})`, s: "Not in any activity yet. Decide with the assessor.", href: "#/matrix?f=gap" },
      planned && { st: "planned", t: `${planned} planned with no evidence`, s: "Mostly Activity 3", href: "#/matrix?f=planned" },
      { st: "mapped", t: "Activity 2 with assessor, link expires 25 Oct", s: "Sent 11 Oct. Chase [Assessor] to sign.", href: "#/activity/2" },
      flagged && { st: "warn", t: `${flagged} items flagged for client data`, s: "Check before sharing or exporting", href: "#/evidence" },
      unm && { st: "warn", t: `${unm} evidence items not mapped to a criterion`, s: "Alarm call point photo, TSS calibration sheet", href: "#/evidence" },
      { st: backupDays() > 7 ? "gap" : "ok", t: `Last backup ${backupDays()} days ago`, s: backupWhen() + " · this device", href: "#/backup" }
    ].filter(Boolean);
  }
  const DOT = { gap: "var(--gap)", planned: "var(--planned-dot)", mapped: "var(--mapped-dot)", signed: "var(--signed)", warn: "#c99a00", ok: "var(--signed)" };
  function viewDashboard() {
    const t = totals();
    const n = CRITS.length;
    const pct = v => Math.round(100 * v / n);
    const compRows = COMPS.map(c => {
      const s = compStats(c);
      return `<a class="comp-row" href="#/matrix?f=all&comp=${c.id}"><span class="id">${c.unitId === "core" ? "C" : "S"}${c.number}</span>
        <span class="t" title="${esc(c.title)}">${esc(c.title)}</span>
        <div class="bar" aria-label="${s.signed} signed, ${s.mapped} evidenced of ${s.total}"><span class="s" style="width:${100 * s.signed / s.total}%"></span><span class="m" style="width:${100 * s.mapped / s.total}%"></span><span class="p" style="width:${100 * s.planned / s.total}%"></span></div>
        <span class="small muted pct">${s.signed + s.mapped}/${s.total}${s.gap ? ` <b style="color:var(--gap)">·${s.gap}</b>` : ""}</span></a>`;
    });
    const items = nextItems();
    return `
    <h1 class="sr-only">Dashboard</h1>
    ${backupNudge()}
    <div class="dash-head">${ctxChip()}<div class="actions"><button class="btn sm" data-toast="Quick capture would open the camera or file picker.">＋ Add evidence</button></div></div>

    <section class="card next-card"><div class="card-head"><h2>What's next</h2><span class="right pill info">${items.length}</span></div>
      <div class="next-list">${items.map(i => `<a class="next-row" href="${i.href}"><span class="dot" style="background:${DOT[i.st]}"></span><span class="grow"><b>${esc(i.t)}</b><span class="small muted">${esc(i.s)}</span></span><span class="chev" aria-hidden="true">›</span></a>`).join("")}</div>
    </section>
    ${packBanner("dashboard")}

    <div class="grid g-3" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Readiness</h2><span class="right small muted">${n} criteria</span></div>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <div class="ring" style="--v:${pct(t.signed)};--w:${pct(t.signed + t.mapped)};--x:${pct(t.signed + t.mapped + t.planned)}" data-label="${t.signed} signed\n${t.gap} gaps" role="img" aria-label="${t.signed} signed, ${t.gap} gaps"></div>
          <div class="small" style="flex:1;min-width:150px">
            ${statLine("signed", t.signed)}${statLine("mapped", t.mapped)}${statLine("planned", t.planned)}${statLine("gap", t.gap)}
            <div style="margin-top:6px" class="muted"><b>${t.compsAll3}/13</b> competences in all 3 activities</div>
          </div></div>
      </section>
      <section class="card"><div class="card-head"><h2>Direct evidence</h2><span class="right pill ${t.directPct >= 70 ? "signed" : "gap"}">${t.directPct >= 70 ? "On track" : "Below 70%"}</span></div>
        <div class="kpi"><div class="value">${t.directPct}%</div><div class="label">observation and work product (O, P)</div></div>
        <div style="margin:26px 0 8px"><div class="meter" style="--d:${t.directPct}%"><span class="mark"></span></div></div>
        <p class="small muted">${t.direct} direct and ${t.indirect} indirect (W, Q) entries. MTCS asks for at least 70% direct. How MTCS counts this isn't confirmed, so treat it as a guide.</p>
      </section>
      <section class="card"><div class="card-head"><h2>Outstanding signatures</h2><span class="right pill mapped">6</span></div>
        <ul class="list small">
          <li><span class="dot" style="background:var(--mapped-dot)"></span><div class="grow"><b>Activity 2</b>: 13 competence sheets, Feedback Form, UKQs<div class="muted">With [Assessor] since 11 Oct</div></div></li>
          <li><span class="dot" style="background:var(--planned-dot)"></span><div class="grow"><b>Activity 3</b>: plan agreed, sheets not sent yet</div></li>
          <li><span class="dot" style="background:var(--mapped-dot)"></span><div class="grow"><b>Record of Witness</b>: [Witness], Activity 1 rows</div></li>
          <li><span class="dot" style="background:var(--planned-dot)"></span><div class="grow"><b>Assessor Sign-off</b> ×2 (Surveyor, Core): ink, after Activity 3</div></li>
          <li><span class="dot" style="background:var(--planned-dot)"></span><div class="grow"><b>Witness Statements</b> ×2: referee forms, [Shore manager]</div></li>
        </ul></section>
    </div>

    <div class="grid g-main" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Progress by competence</h2><a class="right btn sm ghost" href="#/matrix?f=all">All criteria →</a></div>
        ${legend()}
        <h3 class="small muted" style="margin-top:10px">G2 Core</h3>${compRows.slice(0, 3).join("")}
        <h3 class="small muted" style="margin-top:14px">G2 Surveyor</h3>${compRows.slice(3).join("")}
      </section>
      <section class="card"><div class="card-head"><h2>Activities</h2></div>
        <div class="stack" style="gap:10px">${S.activities.map(activityCard).join("")}</div></section>
    </div>`;
  }
  const statLine = (st, v) => `<div class="stat-line"><span class="sw ${st}"></span><b>${v}</b> ${STATE_LABEL[st]}</div>`;
  const legend = () => `<div class="legend">${["signed", "mapped", "planned", "gap"].map(st => `<span><i class="sw ${st}"></i>${STATE_LABEL[st]}</span>`).join("")}</div>`;
  function activityCard(a) {
    const ids = CRITS.filter(k => cov(k.id, a.n));
    const withEv = ids.filter(k => ["mapped", "signed"].includes(cov(k.id, a.n).state)).length;
    const signed = ids.filter(k => cov(k.id, a.n).state === "signed").length;
    return `<a class="act-card ${a.status}" href="#/activity/${a.n}">
      <div class="num">${a.n}</div>
      <div class="grow"><b>${esc(a.title)}</b><div class="small muted">${esc(a.dates)} · ${ids.length} criteria · ${withEv} with evidence · ${signed} signed</div>
        <div class="bar" style="margin-top:6px"><span class="s" style="width:${100 * signed / ids.length}%"></span><span class="m" style="width:${100 * (withEv - signed) / ids.length}%"></span><span class="p" style="width:${100 * (ids.length - withEv) / ids.length}%"></span></div></div>
      <span class="pill ${actPill(a)}">${esc(a.statusLabel)}</span></a>`;
  }
  const actPill = a => a.status === "signed" ? "signed" : a.status === "with-assessor" ? "mapped" : "planned";

  // ---------- 2. Activity workspace ----------
  function actSwitch(cur, base) {
    return `<div class="act-switch" role="tablist" aria-label="Activity">${S.activities.map(x => `<a role="tab" href="${base}${x.n}" class="${x.n === cur ? "on" : ""}" aria-selected="${x.n === cur}"><b>${x.n}</b><span>${esc(x.title.split(" ")[0])}</span><i class="sw ${actPill(x)}"></i></a>`).join("")}</div>`;
  }
  function viewActivity(n) {
    const a = actOf(n) || S.activities[0];
    ui.lastAct = a.n;
    const ev = S.evidence.filter(e => e.act === a.n);
    const planned = CRITS.filter(k => cov(k.id, a.n));
    const noEv = planned.filter(k => cov(k.id, a.n).state === "planned").length;
    const next = a.status === "signed" ? `Signed and locked by [Assessor] on ${esc(a.signedOn)}. Nothing more to do here.`
      : a.status === "with-assessor" ? `With [Assessor] since ${esc(a.linkSent)}. Link expires 25 Oct 2026. Chase for signature.`
      : `${noEv} of ${planned.length} planned criteria still need evidence. Add it, then send to the assessor.`;
    const groups = COMPS.map(c => {
      const ks = c.criteria.filter(k => cov(k.id, a.n));
      if (!ks.length) return "";
      return `<div class="crit-group"><div class="small cg-head">${compLabel(c)} <span class="muted">· ${esc(c.title)}</span></div>
        ${ks.map(k => { const cv = cov(k.id, a.n); return `<a href="#/activity/${a.n}?c=${k.id}" class="crit-line">
          <span class="mcell ${cv.state}" title="${STATE_LABEL[cv.state]}">${cv.code}${cv.state === "signed" ? " ✓" : ""}</span><span class="crit-id">${k.id}</span><span class="cl-text">${esc(shortLabel(k.text))}</span></a>`; }).join("")}</div>`;
    }).join("");
    const f = (unit, kind, label) => tplLink(tplFind(unit, kind), label);
    return `
    ${actSwitch(a.n, "#/activity/")}
    <section class="card act-status ${a.status}">
      <div class="as-top"><div class="num">${a.n}</div><div class="grow"><h1>${esc(a.title)}</h1><div class="small muted">${esc(a.dates)} · ${esc(S.trip.vessel)}</div></div><span class="pill ${actPill(a)}">${esc(a.statusLabel)}</span></div>
      <div class="next-step"><b>Next step</b><span>${next}</span></div>
      <div class="btn-row">
        ${a.status === "signed" ? "" : `<a class="btn primary" href="#/activity/${a.n}?modal=send">${a.linkSent ? "Resend link" : "Send to assessor ➜"}</a>`}
        <a class="btn" href="#/assessor/${a.n}">Preview assessor view</a>
        <a class="btn" href="#/witness/${a.n}">Preview witness view</a>
      </div>
    </section>

    <div class="act-grid">
      <section class="card ag-evidence"><div class="card-head"><h2>Evidence</h2><span class="right small muted">${ev.length} items</span></div>
        <div class="add-row">
          <button class="add-tile" data-toast="Would open the camera. Photos are named Criterion_Activity_Title_Date."><span class="ev-ico photo">📷</span><div><b>Photo</b><span>Take or upload</span></div></button>
          <button class="add-tile" data-toast="Would open the file picker."><span class="ev-ico">📄</span><div><b>File</b><span>Log, report, plot</span></div></button>
          <button class="add-tile" data-toast="Would open a short write-up editor."><span class="ev-ico written">✍️</span><div><b>Written</b><span>Note or testimony</span></div></button>
          <button class="add-tile" data-toast="Would send a narrow witness link."><span class="ev-ico witness">🧾</span><div><b>Witness</b><span>Ask a witness</span></div></button>
        </div>
        <ul class="list">${ev.map(evRow).join("") || `<li class="muted small">No evidence yet.</li>`}</ul>
      </section>

      <section class="card ag-criteria"><div class="card-head"><h2>Criteria</h2><span class="right small muted">${planned.length}</span></div>
        ${legend()}
        <p class="tiny muted" style="margin:6px 0 10px">Tap a criterion for its full wording, evidence and notes.</p>
        ${groups}
      </section>

      <details class="card ag-plan" ${a.planAgreed ? "" : "open"}><summary><h2>Assessment Plan</h2><span class="pill ${a.planAgreed ? "signed" : "planned"}">${a.planAgreed ? "Agreed " + esc(a.planAgreed) : "Draft"}</span></summary>
        <dl class="kv">
          <dt>Work activity</dt><dd>${esc(a.summary)}</dd>
          <dt>Criteria</dt><dd>${planned.length} criteria across all 13 competences (Surveyor 1–10, Core 1–3)</dd>
          <dt>Evidence types</dt><dd>Observation, work product, questioning${a.n === 3 ? ", written (historic LBL testimony)" : ""}</dd>
          <dt>Dates</dt><dd>${esc(a.dates)}</dd>
          <dt>Where</dt><dd>${esc(a.where)}</dd>
          <dt>Witness</dt><dd>${esc(a.witness)}</dd>
          <dt>Assessor</dt><dd>[Assessor], Senior Surveyor</dd>
        </dl>
        <div class="btn-row"><button class="btn sm" data-toast="Would open the plan editor (one plan per unit: Surveyor and Core).">Edit plan</button></div>
      </details>

      <section class="card ag-people"><div class="card-head"><h2>People and link</h2></div>
        <ul class="list small">
          <li><span class="avatar" style="width:30px;height:30px;color:#fff">As</span><div class="grow"><b>[Assessor]</b><div class="muted">Assessor · Senior Surveyor</div></div><span class="pill ${a.status === "signed" ? "signed" : a.linkSent ? "mapped" : "planned"}">${a.status === "signed" ? "Signed " + esc(a.signedOn) : a.linkSent ? "Link sent" : "Not sent"}</span></li>
          <li><span class="avatar" style="width:30px;height:30px;color:#fff;background:#8a94a6">W</span><div class="grow"><b>${a.witness === "None" ? "No witness" : esc(a.witness)}</b><div class="muted">Witness (optional, named on plan)</div></div>${a.witness === "None" ? `<button class="btn sm" data-toast="Would add a witness to the plan.">Add</button>` : `<span class="pill mapped">Rows to sign</span>`}</li>
        </ul>
      </section>

      <section class="card ag-forms"><div class="card-head"><h2>Blank MTCS forms</h2><a class="right btn sm ghost" href="#/forms">All forms →</a></div>
        <p class="tiny muted" style="margin:0 0 8px">These come from your imported forms pack (Forms and templates). Not imported yet in this sample. The links below are for one-off downloads from MTCS. ${MTCS_NOTE}</p>
        <a class="btn sm primary" href="#/forms" style="margin-bottom:8px">Open forms pack</a>
        <div class="tpl-list">
          ${f("surveyor", "plan", "Assessment Plan – G2 Surveyor")}${f("core", "plan", "Assessment Plan – G2 Core")}
          ${f("surveyor", "feedback", "Feedback Form – G2 Surveyor")}${f("core", "feedback", "Feedback Form – G2 Core")}
          ${a.witness !== "None" ? f("surveyor", "witness-record", "Record of Witness Form") : ""}
          ${f("surveyor", "testimony", "Candidate Testimony")}
        </div>
        <a class="small" href="#/forms">Competence sheets and UKQ sheets (13 each) →</a>
      </section>

      <section class="card ag-share"><div class="card-head"><h2>Share this activity (zip)</h2><span class="right pill planned">No accounts</span></div>
        <div class="share-block"><b>Export activity for assessor (.zip)</b>
          <p class="small muted">One zip for this activity: plan, criteria states, evidence files and manifest.json (IDs, version, SHA-256 hashes). Send it by email, message or USB. Your assessor does not need your portfolio or an account.</p>
          <div class="btn-row"><button class="btn primary" data-toast="Layout only: no zip is created yet.">⤓ Export activity for assessor (.zip)</button></div>
          <p class="tiny muted">Sample: last export v3 · 11 Oct 2026 · ${planned.length} criteria · hashes included to detect missing or changed files.</p></div>
        <div class="share-block"><b>Import assessor return (.zip)</b>
          <p class="small muted">When your assessor sends a reviewed zip back, import it here. You review the changes first. Import never silently overwrites: it is applied as a new version on top, with rollback.</p>
          <div class="btn-row"><a class="btn" href="#/activity/${a.n}?modal=merge">⤒ Import assessor return (.zip)</a></div></div>
        <div class="share-block"><b>Version history</b>
          <ul class="list small">
            <li><span class="pill signed">v3</span><div class="grow">Current · exported to assessor 11 Oct 2026</div></li>
            <li><span class="pill planned">v2</span><div class="grow">Before Activity ${a.n} evidence tidy-up</div><button class="btn sm" data-toast="Layout only: restore is not wired.">Restore</button></li>
            <li><span class="pill planned">v1</span><div class="grow">First plan</div><button class="btn sm" data-toast="Layout only: restore is not wired.">Restore</button></li>
          </ul>
          <p class="tiny muted">After an import, the previous version stays here as a snapshot. Use Restore previous version to roll back.</p></div>
      </section>
    </div>`;
  }
  function evRow(e) {
    return `<li class="${e.criteria.length ? "" : "unmapped"}" style="${e.criteria.length ? "" : "padding-left:10px"}"><span class="ev-ico ${e.type}" aria-hidden="true">${EV_ICON[e.type]}</span>
      <div class="grow"><b class="small">${esc(e.title)}</b>${e.redact ? ` <span class="pill warn">Check for client data</span>` : ""}
        <div class="fname">${esc(e.file)}</div>
        <div>${e.criteria.map(c => `<a class="ev-chip" href="${here()}?c=${c}">${c}</a>`).join("") || `<span class="pill gap" style="margin-top:6px">Unmapped</span>`}</div></div>
      <div style="text-align:right">${e.code ? `<span class="code" style="background:var(--brand-soft);color:var(--brand)" title="Evidence type">${e.code}</span>` : ""}<div class="tiny muted" style="margin-top:4px">${esc(e.date)}</div><button class="btn sm ghost" data-toast="Layout only: no preview yet. Sample item: no file attached yet.">View</button></div></li>`;
  }


  // ---------- 3. Coverage matrix ----------
  const CODE_HELP = `<div class="code-help" id="codehelp">
    <h3>What the cells mean</h3>
    <p class="small">Each cell is one activity. The letter is the type of evidence from the MTCS competence sheet; the colour is the status.</p>
    <dl class="kv small"><dt>O</dt><dd>Observation by the assessor</dd><dt>P</dt><dd>Work product (log, report, plot)</dd><dt>W</dt><dd>Written (e.g. candidate testimony)</dd><dt>Q</dt><dd>Questioning</dd><dt>N/C · N/A</dt><dd>Not covered · Not applicable</dd><dt>✓</dt><dd>The assessor has signed it, e.g. <b>O ✓</b> = observed and signed</dd><dt>–</dt><dd>Not in this activity's plan</dd></dl>
    ${legend()}</div>`;
  function viewMatrix(params) {
    if (params && params.get("f") && ui.fApplied !== location.hash) { ui.mState = params.get("f"); ui.fApplied = location.hash; }
    const compFocus = params && params.get("comp");
    const t = totals();
    const q = ui.mSearch.toLowerCase();
    const match = k => {
      const st = critState(k.id);
      if (ui.mState !== "all" && st !== ui.mState) return false;
      if (q && !(k.id.toLowerCase().includes(q) || k.text.toLowerCase().includes(q))) return false;
      return true;
    };
    const comps = COMPS.filter(c => (ui.mUnit === "all" || ui.mUnit === c.unitId) && (!compFocus || c.id === compFocus));
    const cell = cv => `<span class="mcell ${cv ? cv.state : "empty"}" title="${cv ? STATE_LABEL[cv.state] : "Not in this activity"}">${cv ? cv.code + (cv.state === "signed" ? " ✓" : "") : "–"}</span>`;
    let rows = "", cards = "", hidden = 0;
    comps.forEach(c => {
      const ks = c.criteria.filter(match);
      const s = compStats(c);
      if (!ks.length) { hidden++; return; }
      rows += `<tr class="group-row"><td colspan="6">${compLabel(c)} · ${esc(c.title)} <span class="small muted" style="font-weight:400">· ${s.signed + s.mapped}/${s.total} evidenced · in ${s.acts}/3 activities · ${esc(c.imca)}</span></td></tr>`;
      ks.forEach(k => { rows += `<tr class="crit-row" data-href="#/matrix?c=${k.id}" tabindex="0"><td class="crit-id">${k.id}</td><td class="crit-text">${esc(k.text)}</td>${[1, 2, 3].map(a => `<td class="cell">${cell(cov(k.id, a))}</td>`).join("")}<td class="status">${pill(critState(k.id))}</td></tr>`; });
      cards += `<details class="comp-card" ${ui.mState !== "all" || compFocus || q ? "open" : ""}>
        <summary><span class="cc-title"><b>${compLabel(c)}</b> · ${s.signed + s.mapped}/${s.total} · ${s.acts}/3 activities</span><span class="cc-sub small muted">${esc(c.title)}</span>
          <span class="bar"><span class="s" style="width:${100 * s.signed / s.total}%"></span><span class="m" style="width:${100 * s.mapped / s.total}%"></span><span class="p" style="width:${100 * s.planned / s.total}%"></span></span></summary>
        ${ks.map(k => `<a class="cc-row" href="#/matrix?c=${k.id}"><span class="crit-id">${k.id}</span><span class="cl-text">${esc(shortLabel(k.text))}</span><span class="chips">${[1, 2, 3].map(a => { const cv = cov(k.id, a); return `<span class="chip ${cv ? cv.state : "empty"}" title="Activity ${a}: ${cv ? STATE_LABEL[cv.state] : "not in plan"}"><i>${a}</i>${cv ? cv.code + (cv.state === "signed" ? "✓" : "") : "–"}</span>`; }).join("")}</span></a>`).join("")}
      </details>`;
    });
    const seg = (key, val, label) => `<button data-ui="${key}" data-val="${val}" class="${ui[key] === val ? "on" : ""}">${label}</button>`;
    const none = `<p class="small muted card">Nothing here for "${ui.mState === "all" ? "All" : STATE_LABEL[ui.mState]}". <button class="btn sm" data-ui="mState" data-val="all">Show all</button></p>`;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Coverage matrix</h1>
      <p class="muted hide-sm" style="margin:0">All ${CRITS.length} criteria against Activities 1–3. Each competence must appear in all 3 activities; each criterion at least once.</p></div>
      <div class="actions hide-sm"><button class="btn" data-toast="Would print the matrix as a one-page summary for the assessor.">Print summary</button></div></div>
    <div class="kpi-strip">
      <button data-ui="mState" data-val="all" class="${ui.mState === "all" ? "on" : ""}"><b>${CRITS.length}</b> All</button>
      <button data-ui="mState" data-val="signed" class="${ui.mState === "signed" ? "on" : ""}"><span class="sw signed"></span><b>${t.signed}</b> Signed</button>
      <button data-ui="mState" data-val="mapped" class="${ui.mState === "mapped" ? "on" : ""}"><span class="sw mapped"></span><b>${t.mapped}</b> Evidenced</button>
      <button data-ui="mState" data-val="planned" class="${ui.mState === "planned" ? "on" : ""}"><span class="sw planned"></span><b>${t.planned}</b> Planned</button>
      <button data-ui="mState" data-val="gap" class="${ui.mState === "gap" ? "on" : ""}"><span class="sw gap"></span><b>${t.gap}</b> Gap</button>
    </div>
    <div class="filters">
      <div class="seg" role="group" aria-label="Status">${seg("mState", "all", "All")}${seg("mState", "gap", "Gap")}${seg("mState", "planned", "Planned")}${seg("mState", "mapped", "Evidenced")}${seg("mState", "signed", "Signed")}</div>
      <div class="seg" role="group" aria-label="Unit">${seg("mUnit", "all", "Both units")}${seg("mUnit", "core", "Core")}${seg("mUnit", "surveyor", "Surveyor")}</div>
      <button class="icon-btn" data-ui="mSearchOpen" data-val="toggle" aria-label="Search criteria" aria-expanded="${ui.mSearchOpen || !!ui.mSearch}">🔍</button>
      <button class="icon-btn" data-ui="mLegend" data-val="toggle" aria-label="What the codes mean" aria-expanded="${ui.mLegend}">?</button>
      ${ui.mSearchOpen || ui.mSearch ? `<label class="sr-only" for="msearch">Search criteria</label><input type="search" id="msearch" data-ui-input="mSearch" placeholder="Search, e.g. USBL or S08" value="${esc(ui.mSearch)}">` : ""}
    </div>
    ${compFocus ? `<p class="small">Showing ${esc(compFocus)} only. <a href="#/matrix">Show all competences</a></p>` : ""}
    ${ui.mLegend ? CODE_HELP : ""}
    <div class="only-wide"><div class="table-wrap" style="max-height:calc(100vh - 330px);min-height:360px"><table>
      <thead><tr><th>ID</th><th>Criterion (verbatim)</th><th style="text-align:center">Activity 1<br><span style="font-weight:400;text-transform:none">Set-up</span></th><th style="text-align:center">Activity 2<br><span style="font-weight:400;text-transform:none">Online shift</span></th><th style="text-align:center">Activity 3<br><span style="font-weight:400;text-transform:none">Handover</span></th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">Nothing matches these filters.</td></tr>`}</tbody></table></div></div>
    <div class="only-narrow">${cards || none}${cards && hidden ? `<p class="small muted">${hidden} other competences have nothing in this filter. <button class="btn sm" data-ui="mState" data-val="all">Show all</button></p>` : ""}</div>
    <p class="small muted">Tap <b>?</b> for what the codes mean. Tap a criterion for its full wording.</p>`;
  }

  // ---------- 4. Criterion drawer ----------
  function drawer(id) {
    const k = critById(id);
    if (!k) return "";
    const ev = evFor(id);
    const st = critState(id);
    const back = location.hash.split("?")[0];
    const actRows = [1, 2, 3].map(a => { const cv = cov(id, a); const A = actOf(a);
      return `<tr><td>Activity ${a}<div class="tiny muted">${esc(A.title)}</div></td><td>${cv ? `<span class="mcell ${cv.state}">${cv.code}${cv.state === "signed" ? " ✓" : ""}</span>` : "–"}</td><td>${cv ? pill(cv.state) : `<span class="muted small">Not in plan</span>`}</td><td class="small">${cv && cv.state === "signed" ? "[Assessor], " + esc(A.signedOn) : "–"}</td></tr>`; }).join("");
    const gapNote = { S09d: "No USBL calibration this trip, only verifications. Ask the assessor whether a verification counts, or plan it for a future mobilisation.", S09f: "No LBL calibration on this job. Options: N/A, questioning now, or a later job. The assessor decides.", S08f: "LBL was used on the pipelay job. Historic testimony is linked; the assessor decides if it is accepted.", S10e: "No land survey work offshore. Covered by questioning in Activity 3." }[id];
    const sheet = tplFind(k.comp.unitId, "criteria", k.comp.number), ukqT = tplFind(k.comp.unitId, "ukq", k.comp.number);
    return `<div class="scrim" data-href="${back}"></div>
    <aside class="drawer" role="dialog" aria-label="Criterion ${id}">
      <header><div><div class="small muted">${compLabel(k.comp)} · ${esc(k.comp.unitName)}</div><h2 style="margin:2px 0 6px">${id} ${pill(st)}</h2></div><button class="close" data-href="${back}" aria-label="Close">✕</button></header>
      <div class="body">
        <div class="quote">${esc(k.text)}</div>
        <dl class="kv small"><dt>Competence</dt><dd>${esc(k.comp.title)}</dd><dt>IMCA reference</dt><dd>${esc(k.comp.imca)}</dd><dt>Source form</dt><dd class="fname">${esc(k.comp.file)}</dd></dl>
        <div class="tpl-list" style="margin-top:10px">${tplLink(sheet, "Blank competence sheet")}${tplLink(ukqT, "Blank UKQ sheet")}</div><p class="tiny muted" style="margin:0">${MTCS_NOTE}</p>
        ${gapNote ? `<div class="card" style="background:var(--warn-bg);border-color:#f0dfa6;margin-top:14px;padding:12px"><b class="small">Note</b><p class="small" style="margin:4px 0 0">${gapNote}</p></div>` : ""}
        <h3 style="margin-top:18px">By activity</h3>
        <div class="table-wrap"><table><thead><tr><th>Activity</th><th>Code</th><th>Status</th><th>Assessor</th></tr></thead><tbody>${actRows}</tbody></table></div>
        <h3 style="margin-top:18px">Linked evidence (${ev.length})</h3>
        <div class="sample-note slim"><span aria-hidden="true">ℹ️</span><div><b>Sample data:</b> in the real app each item is a real file stored in this browser, and previews here. These sample items have no file attached yet.</div></div>
        <ul class="list">${ev.map(evRow).join("") || `<li class="small muted">No evidence linked yet.</li>`}</ul>
        <h3 style="margin-top:18px">Assessor notes</h3>
        <div class="field"><textarea readonly>${st === "signed" ? "Observed during set-up checks. Candidate explained each step clearly." : ""}</textarea></div>
        <h3>My notes</h3>
        <div class="field"><textarea placeholder="e.g. what to ask the party chief, where the record is saved"></textarea></div>
      </div>
      <footer><button class="btn" data-toast="Would open the evidence library to link an item.">Link evidence</button><button class="btn primary" data-toast="Would capture new evidence for ${id}.">＋ Add evidence</button></footer>
    </aside>`;
  }

  // ---------- 5. Evidence library ----------
  function viewEvidence() {
    const q = ui.eSearch.toLowerCase();
    const items = S.evidence.slice().sort((x, y) => (x.criteria.length ? 1 : 0) - (y.criteria.length ? 1 : 0)).filter(e => (ui.eType === "all" || e.type === ui.eType) && (!ui.eUnmapped || !e.criteria.length) &&
      (!q || (e.title + e.file + e.tags.join(" ") + e.criteria.join(" ")).toLowerCase().includes(q)));
    const unm = S.evidence.filter(e => !e.criteria.length);
    const seg = (val, label) => `<button data-ui="eType" data-val="${val}" class="${ui.eType === val ? "on" : ""}">${label}</button>`;
    const rows = items.map(e => `<tr class="${e.criteria.length ? "" : "unmapped"}">
      <td><div style="display:flex;gap:10px;align-items:center"><span class="ev-ico ${e.type}" aria-hidden="true">${EV_ICON[e.type]}</span><div><b>${esc(e.title)}</b><div class="fname">${esc(e.file)}</div></div></div></td>
      <td class="small">${EV_TYPE[e.type]}</td>
      <td class="small">${e.act ? "Activity " + e.act : `<span class="muted">None</span>`}</td>
      <td>${e.code ? `<span class="code" style="background:var(--brand-soft);color:var(--brand)">${e.code}</span>` : "–"}</td>
      <td>${e.criteria.map(c => `<a class="ev-chip" href="${here()}?c=${c}">${c}</a>`).join("") || `<span class="pill gap">Unmapped</span>`}</td>
      <td>${e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}${e.redact ? `<span class="pill warn">Check client data</span>` : ""}</td>
      <td class="small" style="white-space:nowrap">${esc(e.date)}</td>
      <td><button class="btn sm" data-toast="Layout only: no preview yet. Sample item: no file attached yet.">Preview</button><div class="tiny muted" style="margin-top:3px">No file attached yet</div></td></tr>`).join("");
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Evidence library</h1>
      <p class="muted" style="margin:0">Everything you've captured, across all activities and past jobs.</p></div>
    <div class="sample-note" role="note"><span aria-hidden="true">ℹ️</span><div><b>Sample data:</b> in the real app each item is a real file stored in this browser, and previews here. In this prototype the items below are labels only, so Preview says "No file attached yet".</div></div>
      <div class="actions"><button class="btn" data-toast="Would rename files to Criterion_Activity_Title_Date.">Tidy file names</button><button class="btn primary" data-toast="Would open quick capture.">＋ Add evidence</button></div></div>
    ${unm.length ? `<div class="card" style="border-left:4px solid var(--gap);margin-bottom:16px;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>${unm.length} items aren't mapped to any criterion yet.</b><span class="small muted">${unm.map(e => esc(e.title)).join(" · ")}</span><button class="btn sm" data-ui="eUnmapped" data-val="toggle" style="margin-left:auto">${ui.eUnmapped ? "Show all" : "Show unmapped only"}</button></div>` : ""}
    <div class="filters">
      <label class="sr-only" for="esearch">Search evidence</label>
      <input type="search" id="esearch" data-ui-input="eSearch" placeholder="Search titles, tags or criteria" value="${esc(ui.eSearch)}">
      <div class="seg" role="group" aria-label="Type">${seg("all", "All")}${seg("photo", "Photos")}${seg("file", "Files")}${seg("written", "Written")}${seg("witness", "Witness")}${seg("record", "Records")}</div>
      <label class="checkline"><input type="checkbox" data-ui="eUnmapped" data-val="toggle" ${ui.eUnmapped ? "checked" : ""}> Unmapped only</label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Activity</th><th>Code</th><th>Criteria</th><th>Tags</th><th>Date</th><th>File</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="muted">Nothing matches.</td></tr>`}</tbody></table></div>
    <p class="small muted">Codes are the evidence type the item supports (O, P, W, Q). The assessor's final code for each criterion is set on the competence sheet.</p>`;
  }


  // ---------- 6. Assessor link view (5 steps; sign only on the last) ----------
  const PENDING = { 2: ["S09c", "S10d"], 3: [] }; // sample: criteria the assessor hasn't coded yet
  function viewAssessor(n, params) {
    const a = actOf(n) || S.activities[1];
    const signed = a.status === "signed";
    const planned = CRITS.filter(k => cov(k.id, a.n));
    const pend = signed ? [] : (a.status === "with-assessor" ? PENDING[a.n] || [] : planned.filter(k => cov(k.id, a.n).state === "planned").map(k => k.id));
    const coded = planned.length - pend.length;
    if (params.get("step") && ui.stepApplied !== location.hash) { ui.aStep = Number(params.get("step")) || 1; ui.stepApplied = location.hash; }
    const step = Math.min(5, Math.max(1, ui.aStep));
    const STEPS = ["Plan", "Criteria", "Knowledge", "Feedback", "Sign"];
    const qsData = S.ukq[a.n] || S.ukq[2];
    const qMarked = qsData.filter(u => u.ok).length;
    let first = 0, sec = "";
    if (step === 1) sec = `<section class="card" id="s-plan"><div class="card-head"><span class="step">1</span><h2>Assessment Plan</h2><span class="right pill ${a.planAgreed ? "signed" : "planned"}">${a.planAgreed ? "Agreed " + esc(a.planAgreed) : "Awaiting agreement"}</span></div>
        <div class="seg" style="margin-bottom:12px"><button class="on">G2 Surveyor plan</button><button>G2 Core plan</button></div>
        <dl class="kv small">
          <dt>Work activity to be assessed</dt><dd>${esc(a.summary)}</dd>
          <dt>Performance criteria</dt><dd>Surveyor 1–10 and Core 1–3: ${planned.length} criteria</dd>
          <dt>Type of evidence</dt><dd>Observation, work product, questioning</dd>
          <dt>Date(s)</dt><dd>${esc(a.dates)}</dd>
          <dt>Where</dt><dd>${esc(a.where)}</dd>
          <dt>Needs and witness</dt><dd>12:00–00:00 shift. Witness: ${esc(a.witness)}</dd>
        </dl>
        <div class="btn-row"><button class="btn sm" data-toast="Would let the assessor suggest changes to the plan.">Suggest changes</button><button class="btn sm ${a.planAgreed ? "success" : "primary"}" data-toast="Would record the assessor's agreement with name and date.">${a.planAgreed ? "✓ Plan agreed" : "Agree plan"}</button></div>
      </section>`;
    if (step === 2) sec = `<section id="s-crit"><div class="card-head" style="margin:6px 4px 10px"><span class="step">2</span><h2>Criteria and evidence</h2><span class="right small muted">${planned.length} criteria</span></div>
        ${legend()}<p class="tiny muted">Pick a code for each criterion. ${pend.length ? `${pend.length} not coded yet: ${pend.join(", ")}.` : ""}</p>
        <div class="stack" style="gap:10px">${COMPS.map(c => {
          const ks = c.criteria.filter(k => cov(k.id, a.n));
          if (!ks.length) return "";
          first++;
          const hasPend = ks.some(k => pend.includes(k.id));
          return `<details class="card" style="padding:0" ${first <= 1 || hasPend ? "open" : ""}><summary style="padding:14px 16px;cursor:pointer"><b>${compLabel(c)}</b> <span class="small muted">· ${esc(c.title)}</span> <span class="pill ${hasPend ? "planned" : "info"}" style="float:right">${ks.length} criteria</span></summary>
            <div style="padding:0 16px 8px">${ks.map(k => { const cv = cov(k.id, a.n); const isP = pend.includes(k.id); const ev = evFor(k.id).filter(e => e.act === a.n || !e.act);
              return `<div class="crit-card${isP ? " pending" : ""}"><div class="top"><span class="crit-id">${k.id}</span><div class="small" style="flex:1">${esc(k.text)}</div></div>
                <div>${ev.map(e => `<span class="ev-chip">${EV_ICON[e.type]} ${esc(e.title)}</span>`).join("") || `<span class="tiny muted">No file linked. Candidate proposes ${cv.code === "O" ? "observation" : cv.code === "Q" ? "questioning" : "evidence"}.</span>`}</div>
                <div class="codebar" role="group" aria-label="Evidence code for ${k.id}">${["O", "P", "W", "Q", "N/C", "N/A"].map(cd => `<button data-pick="${k.id}" class="${!isP && cd === cv.code ? "on" : ""}" ${signed ? "disabled" : ""}>${cd}</button>`).join("")}</div></div>`; }).join("")}</div></details>`;
        }).join("")}</div></section>`;
    if (step === 3) sec = `<section class="card" id="s-ukq"><div class="card-head"><span class="step">3</span><h2>Underpinning knowledge questions</h2></div>
        <p class="small muted">Oral or written. The candidate has suggested questions; use, edit or replace them. Blank UKQ sheets: one per competence.</p>
        ${qsData.map((u, i) => `<div class="crit-card"><div class="top"><span class="step">${i + 1}</span><div style="flex:1"><div class="small muted">Surveyor ${Number(u.comp.slice(1))}</div><b class="small">${esc(u.q)}</b>
          <div class="field" style="margin:8px 0 0"><textarea aria-label="Answer note" placeholder="Note of the candidate's answer">${esc(u.a)}</textarea></div></div></div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px;justify-content:flex-end"><span class="small muted">Satisfactory?</span><div class="yn"><button class="${u.ok === "Y" ? "y" : ""}" data-yn>Yes</button><button data-yn>No</button></div></div></div>`).join("")}
        <div class="btn-row"><button class="btn sm" data-toast="Would add a blank question row (up to 10 per competence sheet).">＋ Add question</button></div>
        <div class="field" style="margin-top:12px"><label for="ukqfb">Feedback on answers received</label><textarea id="ukqfb"></textarea></div>
      </section>`;
    if (step === 4) sec = `<section class="card" id="s-fb"><div class="card-head"><span class="step">4</span><h2>Assessment Feedback Form</h2></div>
        <div class="field"><label for="dec">Decision and feedback</label><textarea id="dec" placeholder="What you saw, and how it met the criteria"></textarea></div>
        <div class="field"><label>Has the candidate demonstrated competence in this activity?</label><div class="yn"><button class="y" data-yn>Yes</button><button data-yn>No</button></div></div>
        <div class="field"><label>Has the candidate now demonstrated competence in three activities?</label><div class="yn"><button data-yn>Yes</button><button class="y" data-yn>No</button></div></div>
        <div class="field"><label for="why">Reasons for your decision</label><textarea id="why"></textarea></div>
        <div class="field"><label for="fa">Summary of further action for the candidate</label><textarea id="fa" placeholder="e.g. tide reduction and QC plots in Activity 3; S09d and S09f outstanding"></textarea></div>
        <div class="field"><label>Candidate's comments</label><textarea readonly placeholder="Aidan adds these after you submit"></textarea></div>
      </section>`;
    if (step === 5) sec = `<section class="card" id="s-sign"><div class="card-head"><span class="step">5</span><h2>Check and sign</h2></div>
        <div class="sum-box">
          <div class="sum-line ${pend.length ? "warn" : "ok"}"><span>${pend.length ? "⚠️" : "✅"}</span><div class="grow"><b>${planned.length} criteria: ${coded} coded, ${pend.length} not coded yet</b>${pend.length ? `<div class="small muted">${pend.join(", ")}. Uncoded criteria are left blank on the sheets.</div>` : ""}</div>${pend.length ? `<button class="btn sm" data-ui="aStep" data-val="2">Review</button>` : ""}</div>
          <div class="sum-line ${qMarked === qsData.length ? "ok" : "warn"}"><span>${qMarked === qsData.length ? "✅" : "⚠️"}</span><div class="grow"><b>Knowledge: ${qMarked} of ${qsData.length} questions marked</b></div><button class="btn sm" data-ui="aStep" data-val="3">Review</button></div>
          <div class="sum-line ok"><span>✅</span><div class="grow"><b>Feedback Form: decision recorded</b></div><button class="btn sm" data-ui="aStep" data-val="4">Review</button></div>
          <div class="sum-line ok"><span>✅</span><div class="grow"><b>Plan ${a.planAgreed ? "agreed " + esc(a.planAgreed) : "not agreed yet"}</b></div></div>
        </div>
        <p class="small">Signing records your name and the date on the 2 Assessment Plans, ${COMPS.length} competence sheets, the UKQ sheets and 2 Feedback Forms for Activity ${a.n}. Signed items are locked; a later edit needs a new signature.</p>
        <div class="grid g-2" style="gap:10px"><div class="field"><label for="an">Your name</label><input id="an" value="[Assessor]"></div><div class="field"><label for="ar">Job role</label><input id="ar" value="Senior Surveyor"></div></div>
        <div class="sigpad" aria-label="Signature pad">Sign here with your finger or mouse</div>
        <label class="checkline"><input type="checkbox"> I confirm I assessed this activity as recorded above.</label>
        <p class="tiny muted">The Assessor Sign Off form needs an ink signature. It is printed for you after Activity 3.</p>
      </section>`;
    return `<div class="link-shell">
      <div class="link-hero"><div class="small" style="opacity:.85">Assessor view · shared by Aidan</div>
        <h1 style="margin:4px 0 2px">Activity ${a.n} · ${esc(a.title)}</h1>
        <div class="small" style="opacity:.9">${esc(PACK.name)} · ${esc(S.trip.vessel)} · ${esc(a.dates)}</div>
        <div class="meta"><span class="pill">✓ Email code verified</span><span class="pill">Link expires 25 Oct 2026</span><span class="pill">${planned.length} criteria</span><span class="pill">${signed ? "Signed and locked" : "Not signed yet"}</span></div></div>
      <nav class="section-nav steps" aria-label="Steps">${STEPS.map((l, i) => `<button data-ui="aStep" data-val="${i + 1}" class="${step === i + 1 ? "on" : ""}${i + 1 < step ? " done" : ""}" aria-current="${step === i + 1 ? "step" : "false"}">${i + 1} ${l}</button>`).join("")}</nav>
      ${sec}
      <div class="sticky-sign" style="margin-top:16px"><div class="small grow"><b>${planned.length} criteria</b><span class="muted"> · step ${step} of 5</span></div>
        ${step > 1 ? `<button class="btn" data-ui="aStep" data-val="${step - 1}" aria-label="Back">‹</button>` : ""}
        <button class="btn hide-sm" data-toast="Saved as a draft. Nothing is signed yet.">Save draft</button>
        ${step < 5 ? `<button class="btn primary" data-ui="aStep" data-val="${step + 1}">Next: ${STEPS[step]} ›</button>` : `<button class="btn primary" ${signed ? "disabled" : ""} data-toast="Would sign and lock Activity ${a.n}.">${signed ? "Signed" : "Sign and lock"}</button>`}
      </div>
    </div>`;
  }

  // ---------- 7. Witness link view ----------
  function viewWitness(n) {
    const a = actOf(n) || S.activities[0];
    const comps = COMPS.filter(c => c.criteria.some(k => cov(k.id, a.n)));
    return `<div class="link-shell" style="max-width:760px">
      <div class="link-hero" style="background:linear-gradient(135deg,#5b3d8a,#14213d)"><div class="small" style="opacity:.85">Witness view · shared by Aidan</div>
        <h1 style="margin:4px 0 2px">Activity ${a.n} · ${esc(a.title)}</h1>
        <div class="small" style="opacity:.9">${esc(S.trip.vessel)} · ${esc(a.dates)}</div>
        <div class="meta"><span class="pill">✓ Email code verified</span><span class="pill">Named on the Assessment Plan</span></div></div>
      <section class="card"><h2>What you're confirming</h2>
        <div class="quote small">"I have witnessed the candidate completing activities as summarised on their Assessment Plans and associated competence documentation."</div>
        <p class="small muted">From the MTCS Record of Witness Form. You only see the task summary, not client files or the assessor's notes.</p>
        <dl class="kv small"><dt>Task</dt><dd>${esc(a.summary)}</dd><dt>Where</dt><dd>${esc(a.where)}</dd><dt>Assessor</dt><dd>[Assessor]</dd></dl>
      </section>
      <section class="card"><h2>Competences you saw</h2><p class="small muted">Tick the ones you witnessed in Activity ${a.n}. Each tick becomes your signature and date on that row.</p>
        <ul class="list">${comps.map((c, i) => `<li><input type="checkbox" ${i < 9 ? "checked" : ""} style="width:22px;height:22px;accent-color:var(--brand);flex:none" aria-label="${compLabel(c)}"><div class="grow"><b class="small">${compLabel(c)}</b><div class="small muted">${esc(c.title)}</div></div></li>`).join("")}</ul>
      </section>
      <section class="card"><h2>Your details</h2>
        <div class="grid g-2" style="gap:10px">
          <div class="field"><label for="wn">Witness name</label><input id="wn" value="[Witness]"></div>
          <div class="field"><label for="wr">Job role</label><input id="wr" value="Party Chief"></div>
          <div class="field"><label for="we">Email</label><input id="we" value="[witness email]"></div>
          <div class="field"><label for="wp">Contact number</label><input id="wp" placeholder="+44 …"></div>
        </div>
        <p class="tiny muted">MTCS may email you to confirm you completed this form.</p>
        <div class="field"><label>Optional comment</label><textarea placeholder="Anything the assessor should know"></textarea></div>
        <div class="sigpad">Sign here</div>
        <label class="checkline"><input type="checkbox"> I confirm the above is correct.</label>
        <button class="btn primary block" style="margin-top:10px" data-toast="Would sign the witness rows for Activity ${a.n}.">Sign witness rows</button>
      </section></div>`;
  }

  // ---------- 8. Export ----------
  function viewExport() {
    const t = totals();
    const f = (name, st, note) => `<div class="file-line"><span aria-hidden="true">📄</span><div class="grow"><span class="fname" style="color:var(--ink)">${name}</span>${note ? `<div class="tiny muted">${note}</div>` : ""}</div>${st === "ready" ? `<span class="pill signed">Ready</span>` : st === "wait" ? `<span class="pill mapped">Awaiting signature</span>` : st === "ink" ? `<span class="pill warn">Ink, scan needed</span>` : `<span class="pill planned">Not started</span>`}</div>`;
    const area = (n, title, files, note) => `<section class="card"><div class="area"><div class="n">${n}</div><div><h3 style="margin:4px 0 2px">${title}</h3>${note ? `<p class="small muted" style="margin:0 0 8px">${note}</p>` : ""}${files}</div>
      <div class="area-act"><button class="btn sm" data-toast="Would preview the merged PDF.">Preview</button><a class="btn sm ghost" href="#/forms">Blank forms (MTCS)</a></div></div></section>`;
    const acts = (label, sts) => [1, 2, 3].map(i => f(`Activity ${i} - ${label}.pdf`, sts[i - 1])).join("");
    const blockers = [
      ["gap", `${t.gap} criteria with a gap: S09d, S09f`, "#/matrix?c=S09d"],
      ["mapped", "Activity 2 awaiting assessor signature", "#/activity/2"],
      ["planned", `Activity 3 evidence in progress (${CRITS.filter(k => cov(k.id, 3) && cov(k.id, 3).state !== "planned").length} of ${CRITS.filter(k => cov(k.id, 3)).length})`, "#/activity/3"],
      ["mapped", "Record of Witness: [Witness] to sign Activity 1 rows", "#/witness/1"],
      ["planned", "Assessor Sign-off (ink) after Activity 3", "#/export"],
      ["planned", "2 Witness Statements from referees", "#/export"]
    ];
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Export for MTCS Online</h1>
      <p class="muted" style="margin:0">One zip per MTCS course, laid out by upload area. You upload it to MTCS Online yourself.</p></div>
      <div class="actions"><button class="btn" data-toast="Would build the print pack: Sign-off and Record of Witness, pre-filled for ink.">Print pack for ink signatures</button><button class="btn primary" disabled style="opacity:.55;cursor:not-allowed" title="Available when the checklist is complete">Build zip</button></div></div>
    <div class="seg" style="margin-bottom:16px"><button class="on">G2 Surveyor course</button><button data-toast="Would switch to the G2 Core course export.">G2 Core course</button></div>
    <div class="grid g-main">
      <div class="stack">
        ${area(1, "Assessment Plans and Feedback Forms", acts("Assessment Plan and Feedback Form", ["ready", "wait", "draft"]), "One merged PDF per activity: the plan plus the feedback form.")}
        ${area(2, "Performance Criteria completed over at least three activities", acts("Performance Criteria", ["ready", "wait", "draft"]), "10 competence sheets per activity, pre-filled with codes, names and dates.")}
        ${area(3, "Underpinning knowledge documents", f("Underpinning Knowledge Questions S01–S10.pdf", "draft", "10 UKQ sheets (one per competence). Per-activity sheets are also supported."), "")}
        ${area(4, "Assessor sign off form & Record of Witness Form", f("Competence Assessment Sign Off Sheet.pdf", "ink", "Original signature, scanned") + f("Record of Witness - [Witness].pdf", "ink") + f("Assessor Contact Details.pdf", "ready"), "")}
        ${area(7, "Candidate Statement", f("Candidate Testimony - A1 SVP cast.pdf", "ready") + f("Candidate Testimony - S08f LBL (historic).pdf", "draft"), "")}
        <section class="card" style="background:#f8fafc"><h3>Supporting evidence</h3><p class="small muted">Witness Statements, medical and survival certificates, logbook pages. Which upload area these go in isn't confirmed (areas 5 and 6 aren't in the pack). Check on MTCS Online.</p>
          ${f("Witness Statement - [Shore manager].pdf", "draft")}${f("Witness Statement - [Offshore manager].pdf", "draft")}${f("Medical and Survival certificates.pdf", "ready")}${f("IMCA logbook pages Oct 2026.pdf", "draft")}</section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Before you export</h2><span class="right pill gap">${blockers.length} to do</span></div>
          <ul class="list small">${blockers.map(b => `<li><span class="dot" style="background:${b[0] === "gap" ? "var(--gap)" : b[0] === "mapped" ? "#e08a1e" : "#b7c0cd"}"></span><div class="grow">${b[1]}</div><a class="btn sm ghost" href="${b[2]}">Go</a></li>`).join("")}</ul></section>
        <section class="card"><h2>Checks the export will run</h2><ul class="list small">
          <li><span>✅</span><div class="grow">Every competence appears in 3 activities</div></li>
          <li><span>⚠️</span><div class="grow">Every criterion covered at least once (2 missing)</div></li>
          <li><span>✅</span><div class="grow">Direct evidence ${t.directPct}% (70% minimum)</div></li>
          <li><span>✅</span><div class="grow">Files named by activity and competence</div></li>
          <li><span>✅</span><div class="grow">Mac and Windows junk files removed</div></li>
          <li><span>⚠️</span><div class="grow">2 items flagged to check for client data</div></li></ul></section>
        <section class="card"><h2>Official forms</h2><p class="small muted">The app fills in the official MTCS PDFs and leaves them unaltered. It never submits to MTCS and never signs for anyone.</p></section>
      </div>
    </div>`;
  }

  // ---------- 9. Settings ----------
  function viewSettings() {
    const ar = roleOf(ui.active.role), G = ar.grades[ui.active.grade];
    const roles = ["Surveyor", "Survey Engineer", "Data Processor", "Survey Party Chief", "Client Representative"];
    const packs = window.PACK_CATALOGUE;
    const roleBlock = r => `<div><h3 style="margin:14px 0 8px">${r}</h3><div class="grid g-3">${packs.filter(p => p.role === r).map(p => `
      <div class="pack ${p.status === "active" ? "active" : "later"}">
        <div style="display:flex;align-items:center;gap:8px"><b>${esc(p.label)}</b><span class="pill ${p.status === "active" ? "signed" : "planned"}" style="margin-left:auto">${p.status === "active" ? "Loaded" : "Coming soon"}</span></div>
        <div class="small">GA course ${p.gaCourse}${CORE_COURSE[p.grade] ? ` · Core course ${CORE_COURSE[p.grade]}` : ""}${p.note ? " · " + esc(p.note) : ""}</div>
        ${p.status === "active" ? `<div class="small">${COMPS.length} competences · ${CRITS.length} criteria · ${TPL.filter(t => t.pack !== "guidance").length} MTCS forms linked</div>` : `<div class="small">Criteria not loaded yet</div>`}
      </div>`).join("")}</div></div>`;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Settings</div><h1>Settings</h1></div></div>
    <div class="grid g-main">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Your route</h2><a class="right btn sm primary" href="#/">Change route</a></div>
          <div class="rs-title">${esc(routeName(ar, ui.active.grade))} <span class="plus">+</span> ${esc(coreName(ar, ui.active.grade))}</div>
          <div class="rs-meta" style="margin-top:8px"><span class="pill info">GA course ${G.course}</span>${ar.single ? "" : `<span class="pill info">Core course ${CORE_COURSE[ui.active.grade]}</span>`}${G.pack ? `<span class="pill signed">Criteria loaded: ${COMPS.length} competences, ${CRITS.length} criteria</span>` : `<span class="pill warn">Criteria pack not loaded yet</span>`}</div>
        </section>
        <section class="card"><div class="card-head"><h2>Forms pack</h2><a class="right btn sm" href="#/forms">Forms and templates</a></div>
          ${packBanner("settings")}
          <p class="tiny muted" style="margin:8px 0 0">Stored originals stay unchanged. Filled copies are saved separately in your portfolio (later, when wired).</p>
        </section>
        <section class="card"><div class="card-head"><h2>Competence packs</h2><span class="right small muted hide-sm">Packs are data files, so new roles and grades slot in later</span></div>
          ${roles.map(roleBlock).join("")}
        </section>
      </div>
      <div class="stack">
        <section class="card"><h2>Profile</h2>
          <div class="field"><label for="pn">Name</label><input id="pn" value="Aidan"></div>
          <div class="field"><label for="pr">Current role</label><input id="pr" value="Online Surveyor"></div>
          <div class="field"><label for="pe">Employer</label><input id="pe" value="[Company]"></div>
          <div class="field"><label for="pt">Current trip</label><input id="pt" value="${esc(S.trip.vessel)} · ${esc(S.trip.project)}"></div>
        </section>
        <section class="card"><h2>Links</h2>
          <div class="field"><label for="le">Assessor link expires after</label><select id="le"><option>14 days</option><option>7 days</option><option>30 days</option></select></div>
          <label class="checkline"><input type="checkbox" checked> Ask for an email code when a link is opened</label>
          <label class="checkline"><input type="checkbox" checked> Witnesses see task summaries only</label>
        </section>
        <section class="card"><h2>Backup</h2><p class="small muted">Last backup ${backupDays()} days ago. Your data lives in this browser.</p>
          <div class="btn-row"><a class="btn primary" href="#/backup">Backup and restore</a></div>
          <label class="checkline"><input type="checkbox" data-ui="staleBackup" data-val="toggle" ${ui.staleBackup ? "checked" : ""}> Prototype only: pretend the last backup was 9 days ago</label></section>
        <section class="card"><h2>About this prototype</h2>
          <p class="small">This is a layout prototype for discussion. It is <b>not affiliated with or endorsed by MTCS or IMarEST</b>. All names, dates and evidence are sample data. Nothing is saved, sent or signed.</p>
          <p class="small muted">The official MTCS forms listed under Forms and templates are © MTCS Ltd and are not hosted here: each button opens the download on MTCS Online. The app never submits to MTCS and never signs for anyone.</p></section>
        <section class="card"><h2>Assessor training</h2><p class="small muted">Later: an assessor side to track your own Stage 2 candidates.</p><span class="pill planned">Coming soon</span></section>
      </div>
    </div>`;
  }

  // ---------- 11. More (phone) ----------
  function viewMore() {
    const r = (href, ico, t, s, badge) => `<a class="more-row" href="${href}"><span class="opt-ico" aria-hidden="true">${ico}</span><span class="grow"><b>${t}</b><span class="small muted">${s}</span></span>${badge || ""}<span class="chev" aria-hidden="true">›</span></a>`;
    return `<div class="page-head"><div><h1>More</h1></div></div>
    <section class="card more-list">
      ${r("#/backup", "☁", "Backup and restore", `Last backup ${backupDays()} days ago`, backupDays() > 7 ? `<span class="pill gap">${backupDays()} days</span>` : "")}
      ${r("#/export", "⇪", "Export for MTCS", "Zip by upload area, checklist")}
      ${r("#/forms", "📄", "Forms and templates", "Links to the official MTCS forms")}
      ${r("#/", "⇄", "Shared with me", "Import an activity zip someone sent you")}
      ${r("#/matrix?f=all", "▦", "Coverage matrix (all)", "All 79 criteria × 3 activities")}
      ${r("#/settings", "⚙", "Settings", "Route, packs, profile, links, about")}
      ${r("#/", "⇄", "Change route", "Pick another role or grade")}
    </section>`;
  }

  // ---------- 12. Forms and templates ----------
  function viewForms() {
    const areas = PACK.uploadAreas;
    const row = t => `<li>${tplLink(t, null, `<span class="pill ${t.both ? "signed" : t.unit === "core" ? "info" : "planned"} unit-pill">${t.both ? "Both units" : t.unit === "core" ? "G2 Core" : "G2 Surveyor"}</span>`)}</li>`;
    const dedupe = list => { const seen = {}; return list.filter(t => { if (seen[t.sha256]) { seen[t.sha256].both = true; return false; } seen[t.sha256] = t; return true; }); };
    const byArea = n => dedupe(TPL.filter(t => t.area === n && t.kind !== "readme").map(t => Object.assign({}, t)));
    const packCard = (key, title, zipName) => { const P = MP[key] || {}; return `<section class="card pack-card">
      <div class="card-head"><span class="imp-ico" aria-hidden="true">🗜️</span><h2>${title}</h2><span class="right pill planned">${packCount(key)} files</span></div>
      <div class="fname" style="margin-bottom:10px">${zipName}</div>
      <ol class="pack-steps">
        <li><span class="step">1</span><div class="grow"><b>Download pack from MTCS</b><div class="small muted">Opens MTCS Online in a new tab and saves the zip from MTCS to this device.</div></div><a class="btn primary" href="${esc(P.zip || "")}" target="_blank" rel="noopener">Download pack from MTCS ↗</a></li>
        <li><span class="step">2</span><div class="grow"><b>Import downloaded pack (.zip)</b><div class="small muted">Pick that same zip. The app unpacks it in this browser (layout only here).</div></div><button class="btn" data-toast="Layout only: no file is read or stored yet. Later you'd pick the zip you just downloaded.">Import downloaded pack (.zip)</button></li>
        <li><span class="step">3</span><div class="grow"><b>Status</b><div class="pack-status not-imported"><b>Forms pack: not imported yet</b><span class="small">Download at portfolio start, then import above.</span></div></div></li>
      </ol>
      <p class="tiny muted" style="margin:8px 0 0">Stored originals stay unchanged; filled copies are saved separately in your portfolio.</p>
    </section>`; };
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Forms and templates</h1>
      <p class="muted" style="margin:0">${MTCS_NOTE}</p>
      <p class="small" style="margin:8px 0 0">At the start of compiling your portfolio, download the current pack once. The app then uses those blank templates throughout, and a weekly check can flag "pack update available" if MTCS publishes a newer revision.</p></div></div>

    <div class="grid g-2 pack-grid">
      ${packCard("g2-surveyor", "G2 Surveyor – All Files.zip", "G2Surveyor - All Files.zip")}
      ${packCard("g2-core", "G2 Core – All Files.zip", "G2CoreComp - All Files.zip")}
    </div>

    <div class="pack-example" role="note"><span class="pill planned">Example</span><div class="small"><b>How the status will look once imported (sample only, not your data):</b><br>
      Imported 12 Oct 2026 · ${packCount("g2-surveyor")} files · Pack rev: MTCS 2026 forms · Last update check 17 Oct 2026 · <b>Up to date</b>. If MTCS publishes a newer pack, this banner shows <b>"Update available"</b> instead.</div></div>

    <p class="small muted" style="margin:14px 2px">Prefer forms one at a time? Each form below still has a "Download from MTCS" link. ${MP.howTo ? `<a href="${esc(MP.howTo.url)}" target="_blank" rel="noopener">How MTCS says to get the forms ↗</a>` : ""}</p>

    <h2 class="sec-h">Forms in the packs</h2>
    <div class="stack">
      <section class="card"><div class="card-head"><h2>Start here</h2></div><ul class="list tpl-ul">
        ${dedupe(TPL.filter(t => t.kind === "readme").map(t => Object.assign({}, t))).map(row).join("")}${TPL.filter(t => t.kind === "guidance").map(t => `<li>${tplLink(t, null, `<span class="pill planned unit-pill">MTCS guidance</span>`)}</li>`).join("")}</ul></section>
      ${areas.map(a => `<section class="card"><div class="area"><div class="n">${a.n}</div><div><h3 style="margin:4px 0 2px">${esc(a.name)}</h3>
        <p class="tiny muted" style="margin:0 0 6px">MTCS Online upload area ${a.n}${a.n === 2 ? ": one competence sheet per competence, used once per activity" : a.n === 3 ? ": blank sheets, the assessor writes the questions" : a.n === 4 ? ": Sign Off needs an original ink signature (scanned). Witness Statements are referee forms." : ""}</p></div></div>
        <ul class="list tpl-ul">${byArea(a.n).map(row).join("")}</ul></section>`).join("")}
    </div>`;
  }

  // ---------- 0. Opening screen: choose your route ----------
  function viewLanding(params) {
    const sel = params.get("role"), selGrade = params.get("grade"), showAll = params.get("all") === "1";
    const t = totals();
    const card = r => {
      const open = sel === r.key;
      const gkeys = Object.keys(r.grades);
      const g = r.single ? gkeys[0] : (open && r.grades[selGrade] ? selGrade : null);
      const anyLoaded = gkeys.some(k => r.grades[k].pack);
      let inner = "";
      if (open) {
        const seg = r.single
          ? `<div class="grade-seg single"><button class="on" aria-pressed="true" disabled>Single level</button></div><p class="tiny muted" style="margin:6px 0 0">MTCS has one level for this role.</p>`
          : `<div class="grade-seg" role="group" aria-label="Grade">${gkeys.map(k => `<button data-href="#/?role=${r.key}&grade=${k}" aria-pressed="${k === g}" class="${k === g ? "on" : ""}">${k}${r.grades[k].pack ? "" : `<span class="soon">soon</span>`}</button>`).join("")}</div>`;
        let summary = `<p class="small muted" style="margin:10px 0 0">Pick the grade you're working towards.</p>`;
        if (g) {
          const G = r.grades[g];
          summary = `<div class="route-summary">
            <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em">Your route</div>
            <div class="rs-title">${esc(routeName(r, g))} <span class="plus">+</span> ${esc(coreName(r, g))}</div>
            <p class="small" style="margin:6px 0 0">${r.single ? "Which Core unit goes with this role still needs confirming with MTCS." : `${g} Core${g === "G2" ? " (C1–C3)" : ""} included, done once for all ${g} roles.`}</p>
            ${G.pack ? "" : `<p class="small" style="margin:6px 0 0;color:var(--warn)"><b>Coming soon:</b> criteria for this route aren't loaded yet. You can preview the layout.</p>`}
            <button class="btn primary block lg" data-open="${r.key}|${g}" style="margin-top:12px">${G.pack ? "Open portfolio →" : "Open layout preview →"}</button>
          </div>`;
        }
        inner = `<div class="role-body">${seg}${summary}</div>`;
      }
      return `<section class="role-card${open ? " open" : ""}" id="role-${r.key}">
        <button class="role-head" data-href="${open ? "#/?role=" : "#/?role=" + r.key}" aria-expanded="${open}">
          <span class="role-ico" aria-hidden="true">${r.ico}</span>
          <span class="grow"><b>${esc(r.name)}</b><span class="small muted">${esc(r.blurb)}</span>
            <span class="tiny muted">${r.single ? "Single level" : "G2 · G1 · Senior"}</span></span>
          ${anyLoaded ? `<span class="pill signed">Available</span>` : `<span class="pill planned">Coming soon</span>`}
          <span class="chev" aria-hidden="true">${open ? "▴" : "▾"}</span>
        </button>${inner}</section>`;
    };
    const avail = r => Object.values(r.grades).some(G => G.pack);
    // Once a role is open, roles that are only "coming soon" collapse into one line.
    const collapse = sel && !showAll;
    const shown = collapse ? ROLES.filter(r => r.key === sel || avail(r)) : ROLES;
    const folded = collapse ? ROLES.filter(r => !shown.includes(r)) : [];
    return `<div class="landing">
      <div class="landing-hero"><div class="small" style="opacity:.85">Hi Aidan</div>
        <h1>Choose your MTCS route</h1>
        <p style="margin:4px 0 0;opacity:.92">Tap your role, then pick the grade. The matching Core competences are included automatically.</p></div>

      <section class="card my-ports"><div class="card-head"><h2>My portfolios</h2><span class="right small muted">1 in progress</span></div>
        <div class="port-row">
          <div class="role-ico sm" aria-hidden="true">🧭</div>
          <div class="grow"><b>G2 Surveyor + G2 Core</b><div class="small muted">${t.signed} of ${CRITS.length} signed · ${t.gap} gaps · Activity 2 with assessor</div>
            <div class="bar" style="margin-top:6px"><span class="s" style="width:${100 * t.signed / CRITS.length}%"></span><span class="m" style="width:${100 * t.mapped / CRITS.length}%"></span><span class="p" style="width:${100 * t.planned / CRITS.length}%"></span></div></div>
          <button class="btn primary" data-open="surveyor|G2">Open</button>
        </div>
        <p class="tiny muted" style="margin:10px 0 0">You can keep more than one route, for example G2 Surveyor now and G1 later.</p>
      </section>

      <h2 class="landing-h2" id="switch">Start or switch route</h2>
      <div class="role-list">${shown.map(card).join("")}
        ${folded.length ? `<a class="soon-line" href="#/?role=${sel}${selGrade ? "&grade=" + selGrade : ""}&all=1"><span class="pill planned">Coming soon</span><span class="grow small">${folded.map(r => esc(r.name)).join(" · ")}</span><span class="chev" aria-hidden="true">▾</span></a>` : ""}
      </div>

      <section class="card shared-card" id="shared"><div class="card-head"><span class="imp-ico" aria-hidden="true">⇄</span><h2>Shared with me</h2><span class="right pill info">${SHARED.length} sample</span></div>
        <p class="small" style="margin:0 0 8px">Has someone sent you an activity to review? You don't need their portfolio or an account. Import their activity zip here: it opens as a separate imported copy in this browser. Review, edit and sign it, then export a return zip and send it back any way you like (email, message, USB).</p>
        <div class="btn-row"><button class="btn primary" data-toast="Layout only: no zip is read yet. Later you'd pick the .zip you were sent.">⤒ Import activity zip (.zip)</button></div>
        <div class="shared-list">${SHARED.map(sharedRow).join("")}</div>
        <p class="tiny muted" style="margin:8px 0 0">Imported copies stay separate from your own portfolios. Sample data only.</p>
      </section>

      <section class="card import-card"><div class="card-head"><span class="imp-ico" aria-hidden="true">⤒</span><h2>Lost your data? Import a backup</h2></div>
        <p class="small" style="margin:0 0 6px">Your portfolio is stored <b>in this browser on this device</b>. If the browser data is cleared, or you move to a new phone or laptop, import your backup <b>.zip</b> and everything is restored.</p>
        <div class="btn-row"><button class="btn primary" data-toast="Not connected yet – layout only. Would open the file picker for a backup .zip.">⤒ Import backup (.zip)</button><a class="btn" href="#/backup">More restore options</a></div>
      </section>
    </div>`;
  }

  // ---------- 10. Backup and restore ----------
  function viewBackup() {
    const NC = "Not connected yet – layout only.";
    const place = (ico, title, status, btn, toastMsg, primary) => `<div class="place-row"><span class="opt-ico" aria-hidden="true">${ico}</span><div class="grow"><b>${title}</b><div class="small muted">${status}</div></div><button class="btn sm ${primary ? "primary" : ""}" data-toast="${NC} ${toastMsg}">${btn}</button></div>`;
    const stale = backupDays() > 7;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Backup and restore</h1></div></div>

    <section class="card status-card ${stale ? "stale" : ""}"><div class="st-row"><span class="st-dot ${stale ? "bad" : "ok"}" aria-hidden="true"></span><div class="grow"><b>Last backup ${backupDays()} days ago</b><div class="small muted">${backupWhen()} · this device and Google Drive · 48 MB</div></div></div>
      <button class="btn primary block lg" style="margin-top:12px" data-toast="${NC} Would back up to every place switched on below.">Back up now</button>
      <p class="tiny muted" style="margin:8px 0 0">Your portfolio lives in this browser on this device. A backup is how you get it back if the browser data is cleared or the phone is replaced.</p></section>

    <h2 class="sec-h">Back up to</h2>
    <section class="card places">
      ${place("📱", "This device (.zip)", `Last saved ${backupWhen()}`, "Save backup to this device (.zip)", "Would download MTCS_Backup_[date].zip to Downloads.", true)}
      ${place("🟢", "Google Drive", "Connected (sample) · MTCS Portfolio/Backups", "Back up", "Would upload the backup to Google Drive.")}
      ${place("🔵", "OneDrive", "Not connected", "Connect", "Would ask you to sign in to Microsoft.")}
    </section>

    <h2 class="sec-h">Restore</h2>
    <section class="card restore-card">
      <button class="restore-tile primary block" data-toast="${NC} Would open the file picker for a backup .zip."><span class="opt-ico" aria-hidden="true">⤒</span><span><b>Restore from local zip</b><span class="small">Pick a backup .zip from this device</span></span></button>
      ${place("🟢", "From Google Drive", "Choose a backup from Drive", "Choose", "Would list backups in Google Drive.")}
      ${place("🔵", "From OneDrive", "Not connected", "Connect", "Would ask you to sign in to Microsoft.")}
      <p class="tiny muted" style="margin:10px 0 0">Importing a backup restores routes, activities, evidence files, signatures with their audit trail, and settings. You see what's in it before anything in this browser is replaced.</p>
    </section>

    <div class="grid g-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Automatic backup</h2>
        <label class="switch right"><input type="checkbox" checked><span class="slider" aria-hidden="true"></span><span class="sr-only">Automatic backup</span></label></div>
        <div class="field"><label for="bf">How often</label><select id="bf"><option>Daily</option><option>After every change</option><option>Weekly</option><option>Only when I tap Back up now</option></select></div>
        <div class="field"><label for="bd">Where</label><select id="bd"><option>This device (.zip)</option><option>Google Drive</option><option>OneDrive</option><option>All connected places</option></select></div>
        <div class="field"><label for="bk">Keep</label><select id="bk"><option>Last 5 backups</option><option>Last 10 backups</option><option>All backups</option></select></div>
        <label class="checkline"><input type="checkbox" checked> Only on Wi-Fi (saves offshore data allowance)</label>
        <label class="checkline"><input type="checkbox" checked> Remind me if there's no backup for 7 days</label>
      </section>
      <section class="card"><h2>What's in a backup</h2>
        <ul class="list small">
          <li><span>✅</span><div class="grow">Routes and activities, plans, codes and notes</div></li>
          <li><span>✅</span><div class="grow">Evidence files (photos, logs, written products)</div></li>
          <li><span>✅</span><div class="grow">Signatures and the audit trail</div></li>
          <li><span>✅</span><div class="grow">Settings and the loaded criteria packs</div></li>
          <li><span>✅</span><div class="grow">Shared (imported) activities and version-history snapshots</div></li>
        </ul>
        <p class="tiny muted">The backup holds your evidence, so keep it somewhere private. Check that client data is allowed to leave the vessel before backing up to the cloud.</p>
      </section>
    </div>`;
  }

  // ---------- 13. Shared activity (imported copy, not your portfolio) ----------
  function viewShared(n) {
    const x = sharedOf(n);
    const a = actOf(x.n) || S.activities[1];
    return `<div class="link-shell">
      <div class="imported-banner" role="note"><b>Imported copy — not your portfolio.</b><span>Changes here only affect this imported copy in this browser. Nothing is merged into your own portfolios. When you're done, export a reviewed zip and send it back to the candidate.</span></div>
      <div class="link-hero shared"><div class="small" style="opacity:.85">Shared with me · imported activity</div>
        <h1 style="margin:4px 0 2px">Activity ${x.n} · ${esc(x.title)}</h1>
        <div class="small" style="opacity:.9">Candidate: ${esc(x.candidate)} · ${esc(x.route)} · ${esc(x.dates)}</div>
        <div class="meta"><span class="pill">${x.statusLabel}</span><span class="pill">${x.criteria} criteria</span><span class="pill">${x.files} evidence files</span></div></div>

      <section class="card"><div class="card-head"><h2>Package details</h2><span class="right pill info">manifest.json</span></div>
        <dl class="kv small">
          <dt>Exported by</dt><dd>${esc(x.exportedBy)}</dd><dt>Exported</dt><dd>${esc(x.exportedAt)}</dd>
          <dt>Package version</dt><dd>v${x.pkg} (export sequence ${x.pkg})</dd><dt>Based on</dt><dd>Candidate activity v${x.basedOn}</dd>
          <dt>App version</dt><dd>${esc(x.app)}</dd><dt>IDs</dt><dd class="fname">portfolio: sample-pf-001 · activity: sample-act-${x.n}</dd>
          <dt>Files & hashes</dt><dd>${x.files} evidence files listed in manifest.json with SHA-256 hashes · <b>All hashes verified on import</b></dd>
        </dl>
        <p class="tiny muted" style="margin:8px 0 0">Hashes detect missing or changed files. If a file is missing or its hash doesn't match, the import review warns you before anything is applied.</p>
      </section>

      <section class="card"><div class="card-head"><h2>Review this activity</h2><span class="right small muted">${esc(x.progress)}</span></div>
        <div class="review-actions">
          ${[["1", "Plan", "Read and agree the Assessment Plan", "#/assessor/" + x.n + "?step=1"], ["2", "Criteria", "Code criteria O/P/W/Q/N/C/N/A against the evidence", "#/assessor/" + x.n + "?step=2"], ["3", "Knowledge", "Record underpinning-knowledge questions and answers", "#/assessor/" + x.n + "?step=3"], ["4", "Feedback", "Fill in the Assessment Feedback Form", "#/assessor/" + x.n + "?step=4"], ["5", "Sign", "Check the summary, then sign and lock", "#/assessor/" + x.n + "?step=5"]].map(r => `<a class="review-row" href="${r[3]}"><span class="step">${r[0]}</span><span class="grow"><b>${r[1]}</b><span class="small muted">${r[2]}</span></span><span class="chev" aria-hidden="true">›</span></a>`).join("")}
        </div>
        <div class="field" style="margin-top:12px"><label for="ac">Your comments (saved in this imported copy)</label><textarea id="ac" placeholder="e.g. S09c coded from verification report; two questions still to ask"></textarea></div>
      </section>

      <section class="card return-card"><div class="card-head"><h2>Send it back</h2></div>
        <p class="small" style="margin:0 0 8px">Export one zip with your codes, comments, feedback and signatures, plus an updated manifest.json (new export sequence, based on v${x.basedOn}). Send it by email, message or USB. The candidate reviews the changes before anything is applied to their portfolio.</p>
        <button class="btn primary block lg" data-toast="Layout only: no zip is created yet.">⤓ Export reviewed activity zip (.zip)</button>
        <p class="tiny muted" style="margin:8px 0 0">Layout only: importing and exporting zips are not wired in this prototype.</p>
      </section>
    </div>`;
  }

  // ---------- 14. Pre-import review / merge ----------
  function mergeModal(n) {
    const a = actOf(n) || S.activities[1];
    const back = "#/activity/" + a.n;
    const row = (label, expected, received, cls) => `<div class="cmp-row ${cls || ""}"><span class="cmp-l">${label}</span><span class="cmp-e">${expected}</span><span class="cmp-r">${received}</span></div>`;
    return `<div class="scrim" data-href="${back}"></div>
    <div class="modal merge" role="dialog" aria-label="Review assessor return before importing">
      <header><div><h2 style="margin:0">Review before you import</h2><p class="small muted" style="margin:4px 0 0">Activity ${a.n} · ${esc(a.title)}</p></div><button class="close" data-href="${back}" aria-label="Close">✕</button></header>
      <div class="body">
        <p class="small" style="margin:0 0 10px"><span class="fname">Activity${a.n}_assessor-return_v4.zip</span> from [Assessor]. <b>Import never silently overwrites.</b> Nothing changes until you choose below.</p>

        <div class="cmp-head cmp-row"><span class="cmp-l"></span><span class="cmp-e">Expected (yours)</span><span class="cmp-r">Received</span></div>
        ${row("Package based on", "Your current activity v3", "Candidate v2", "warn")}
        ${row("Criteria changed", "—", "29 of 31 coded or signed", "ok")}
        ${row("Assessor comments", "0", "+6 comments, 1 feedback form", "ok")}
        ${row("Signatures", "0 signed by assessor", "+29 criteria signed, feedback signed", "ok")}
        ${row("Evidence items", "5 files", "5 files · 0 removed", "ok")}
        ${row("File hashes (SHA-256)", "5 in manifest", "5 verified · 0 missing", "ok")}

        <div class="warn-box"><b>⚠️ Warnings</b><ul class="small">
          <li><b>Based on an older version:</b> this return is based on your v2, but your activity is now v3. You edited 2 criteria after v2 (S06b note, S05c evidence link). Applying applies the assessor's changes as a new version on top; your 2 edits are kept and listed after import.</li>
          <li>No warning: signed and evidence counts have not gone down, and no files are missing.</li>
        </ul></div>
        <p class="tiny muted">If a return had fewer signed or evidence items, missing files, or a hash mismatch, that would be listed here as a warning too.</p>

        <details class="manifest"><summary><b class="small">What's in manifest.json (sample)</b></summary>
          <pre class="manifest-pre">{
  "portfolioId": "sample-pf-001", "activityId": "sample-act-${a.n}",
  "candidate": "[Candidate]", "assessor": "[Assessor]",
  "exportSeq": 4, "baseVersion": 2, "appVersion": "0.2-layout",
  "exportedAt": "2026-10-17T14:20:00+01:00",
  "criteria": [{ "id": "S01a", "code": "O", "state": "signed" }, "…"],
  "files": [{ "name": "S05d_A2_OnlineLog_20261008.pdf",
              "sha256": "9f2c…a41b" }, "…"]
}</pre>
          <p class="tiny muted" style="margin:6px 0 0">SHA-256 hashes detect missing or changed files before anything is applied.</p>
        </details>

        <label class="checkline backup-first"><input type="checkbox" checked> <span><b>Create backup zip first (recommended)</b><span class="small muted" style="display:block">Saves a backup of your whole portfolio before applying. On by default.</span></span></label>
      </div>
      <footer class="merge-foot">
        <a class="btn" href="${back}">Cancel</a>
        <button class="btn" data-toast="Layout only: no copy is saved yet.">Save as separate copy</button>
        <button class="btn primary" data-toast="Layout only: nothing is imported or changed yet.">Import and apply</button>
      </footer>
      <p class="tiny muted" style="padding:0 20px 16px;margin:0">Applying makes this activity v4 on top of your v3. Your previous version stays under Version history with <b>Restore previous version</b>, so you can roll back. Layout only: no zip is read or applied in this prototype.</p>
    </div>`;
  }

  // ---------- Send modal ----------
  function sendModal(n) {
    const a = actOf(n) || S.activities[1];
    const back = location.hash.split("?")[0];
    return `<div class="scrim" data-href="${back}"></div>
    <div class="modal" role="dialog" aria-label="Send activity link">
      <header><div><h2 style="margin:0">Send Activity ${a.n} to your assessor</h2><p class="small muted" style="margin:4px 0 0">They get a link and an email code. Nothing to install.</p></div><button class="close" data-href="${back}" aria-label="Close">✕</button></header>
      <div class="body">
        <div class="nudge ${backupDays() > 7 ? "" : "soft"}"><span aria-hidden="true">☁</span><div class="grow"><b>Back up before you share?</b><div class="small">Last backup ${backupDays()} days ago. The assessor's signatures will come back into this browser.</div></div><button class="btn sm" data-toast="Not connected yet – layout only.">Back up now</button></div>
        <div class="field"><label for="to">Assessor email</label><input id="to" value="[assessor email]"></div>
        <div class="field"><label>Who is it for?</label><div class="seg"><button class="on">Assessor</button><button>Witness</button></div></div>
        <div class="field"><label>They can</label>
          <label class="checkline"><input type="checkbox" checked> View the plan, evidence and criteria</label>
          <label class="checkline"><input type="checkbox" checked> Code criteria and record questions</label>
          <label class="checkline"><input type="checkbox" checked> Fill in the Feedback Form and sign</label>
          <label class="checkline"><input type="checkbox"> Download original files</label></div>
        <div class="grid g-2" style="gap:10px"><div class="field"><label for="exp">Expires</label><select id="exp"><option>In 14 days</option><option>In 7 days</option></select></div>
          <div class="field"><label for="msg">Message</label><input id="msg" value="Activity ${a.n} is ready for you to look at."></div></div>
      </div>
      <footer><a class="btn" href="#/assessor/${a.n}">Preview as assessor</a><button class="btn primary" data-toast="Not wired up: no email is sent in the prototype.">Send link</button></footer>
    </div>`;
  }

  // ---------- Events ----------
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
  }
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-href],[data-toast],[data-ui],[data-pick],[data-yn],[data-jump],[data-open]");
    if (!t) return;
    if (t.dataset.jump) { e.preventDefault(); document.getElementById(t.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
      t.parentElement.querySelectorAll("a").forEach(x => x.classList.toggle("on", x === t)); return; }
    if (t.dataset.open) { const [r, g] = t.dataset.open.split("|"); ui.active = { role: r, grade: g }; if (location.hash === "#/dashboard") render(); else location.hash = "#/dashboard"; return; }
    if (t.dataset.href) { e.preventDefault(); location.hash = t.dataset.href; return; }
    if (t.dataset.toast) { e.preventDefault(); toast(t.dataset.toast); return; }
    if (t.dataset.pick) { t.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("on", b === t)); return; }
    if (t.hasAttribute("data-yn")) { t.parentElement.querySelectorAll("button").forEach(b => b.classList.toggle("y", b === t)); return; }
    if (t.dataset.ui) {
      const k = t.dataset.ui; ui[k] = t.dataset.val === "toggle" ? !ui[k] : t.dataset.val; render();
      if (k === "aStep") window.scrollTo(0, 0);
      if (k === "mSearchOpen" && ui.mSearchOpen) { const el = document.getElementById("msearch"); if (el) el.focus(); }
    }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.matches("tr[data-href]")) location.hash = e.target.dataset.href;
    if (e.key === "Escape" && /[?&](c|modal)=/.test(location.hash)) location.hash = location.hash.split("?")[0];
  });
  document.addEventListener("input", e => {
    const k = e.target.dataset && e.target.dataset.uiInput;
    if (!k) return;
    ui[k] = e.target.value; const pos = e.target.selectionStart; render();
    const el = document.querySelector(`[data-ui-input="${k}"]`); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
  });
  window.addEventListener("hashchange", () => { const keep = /[?&](c|modal|role)=/.test(location.hash); const y = window.scrollY; render(); if (keep) window.scrollTo(0, y); else window.scrollTo(0, 0); });
  render();
})();
