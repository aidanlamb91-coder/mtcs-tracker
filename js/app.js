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
  const STATE_LABEL = { signed: "Assessor signed", mapped: "Evidence mapped", planned: "Planned", gap: "Not covered" };
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
  const LAST_BACKUP = "Today 16:42 (BST)";

  // ---------- Router ----------
  function parse() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, q] = h.split("?");
    const params = new URLSearchParams(q || "");
    return { parts: path.split("/").filter(Boolean), params };
  }
  const ui = { active: { role: "surveyor", grade: "G2" }, mUnit: "all", mState: "all", mSearch: "", eType: "all", eUnmapped: false, eSearch: "" };

  function render() {
    const { parts, params } = parse();
    const page = parts[0] || "route";
    let role = "candidate", body = "", nav = page;
    if (page === "assessor") { role = "assessor"; body = viewAssessor(parts[1] || 2); }
    else if (page === "witness") { role = "witness"; body = viewWitness(parts[1] || 1); }
    else if (page === "activity") { body = viewActivity(parts[1] || 1); nav = "activity" + (parts[1] || 1); }
    else if (page === "matrix") body = viewMatrix();
    else if (page === "evidence") body = viewEvidence();
    else if (page === "export") body = viewExport();
    else if (page === "settings") body = viewSettings();
    else if (page === "backup") body = viewBackup();
    else if (page === "route") { role = "landing"; body = viewLanding(params); }
    else { body = viewDashboard(); nav = "dashboard"; }

    const ar = roleOf(ui.active.role);
    const preview = role === "candidate" && !ar.grades[ui.active.grade].pack
      ? `<div class="preview-banner" role="note"><b>${esc(routeName(ar, ui.active.grade))}: criteria pack not loaded yet (layout preview).</b> The screens below show the G2 Surveyor sample so you can see the layout. <a href="#/">Change route</a></div>` : "";
    const shell = role === "candidate"
      ? `<div class="shell">${sidenav(nav)}<main id="main">${preview}${body}</main></div>${bottomnav(nav)}`
      : role === "landing" ? `<main id="main" class="landing-main">${body}</main>`
      : `<main id="main" class="link-main">${body}</main>`;
    let overlay = "";
    if (params.get("c")) overlay = drawer(params.get("c"));
    if (params.get("modal") === "send") overlay = sendModal(parts[1] || 2);
    app.innerHTML = topbar(role === "landing" ? "candidate" : role, role === "landing") + `<div class="proto-banner">Layout prototype: sample data only. Buttons are not wired up yet.</div>` + shell + overlay;
    document.title = "MTCS Portfolio Tracker – " + ({ assessor: "Assessor link", witness: "Witness link", landing: "Choose your route" }[role] || page);
  }

  function topbar(role, landing) {
    const r = (id, label, href) => `<button data-href="${href}" aria-pressed="${role === id && !landing}">${label}</button>`;
    const ar = roleOf(ui.active.role);
    const own = role === "candidate";
    return `<header class="topbar">
      <div class="brand"><div class="logo" aria-hidden="true">MT</div><span>Portfolio Tracker</span></div>
      ${own ? `<button class="route-chip" data-href="#/" title="Change route">${landing ? "Choose route" : esc(routeName(ar, ui.active.grade)) + (ar.single ? "" : " + Core")} <span aria-hidden="true">▾</span></button>` : `<span class="pack-chip">${esc(PACK.name)}</span>`}
      <div class="spacer"></div>
      ${own ? `<button class="backup-chip" data-href="#/backup" title="Backup and restore. Last backup ${LAST_BACKUP}"><span class="bdot" aria-hidden="true"></span><span aria-hidden="true">☁</span><span class="bl">Backed up 16:42</span><span class="sr-only">Backup and restore</span></button>` : ""}
      <div class="roles" role="group" aria-label="View as">
        ${r("candidate", "Candidate", "#/dashboard")}${r("assessor", "Assessor link", "#/assessor/2")}${r("witness", "Witness link", "#/witness/1")}
      </div>
      <div class="avatar" title="${role === "candidate" ? "Aidan" : role === "assessor" ? "[Assessor]" : "[Witness]"}">${role === "candidate" ? "A" : role === "assessor" ? "As" : "W"}</div>
    </header>`;
  }

  function sidenav(cur) {
    const t = totals();
    const a = (id, href, ico, label, count) => `<a href="${href}" class="${cur === id ? "active" : ""}"><span class="ico" aria-hidden="true">${ico}</span><span class="lbl">${label}</span>${count != null ? `<span class="count${count.alert ? " alert" : ""}" title="${count.title}">${count.n}</span>` : ""}</a>`;
    const unm = S.evidence.filter(e => !e.criteria.length).length;
    return `<nav class="sidenav" aria-label="Main">
      ${a("route", "#/", "⇄", "Change route")}
      ${a("dashboard", "#/dashboard", "◧", "Dashboard")}
      <div class="group">Activities</div>
      ${S.activities.map(x => a("activity" + x.n, "#/activity/" + x.n, x.n, esc(x.title))).join("")}
      <a href="#" data-toast="Adding a fourth activity is allowed if the assessor wants one."><span class="ico">＋</span>New activity</a>
      <div class="group">Portfolio</div>
      ${a("matrix", "#/matrix", "▦", "Coverage matrix", { n: t.gap, alert: t.gap > 0, title: t.gap + " criteria not covered" })}
      ${a("evidence", "#/evidence", "▤", "Evidence library", { n: unm || S.evidence.length, alert: unm > 0, title: unm ? unm + " items unmapped" : "items" })}
      ${a("export", "#/export", "⇪", "Export for MTCS")}
      ${a("backup", "#/backup", "☁", "Backup and restore")}
      ${a("settings", "#/settings", "⚙", "Settings and packs")}
      <div class="trip-box"><b>Current trip</b><br>${esc(S.trip.vessel)}<br>${esc(S.trip.project)}<br><span class="muted">${esc(S.trip.dates)}</span></div>
    </nav>`;
  }
  function bottomnav(cur) {
    const a = (id, href, ico, label) => `<a href="${href}" class="${cur === id || (id === "activity" && cur.startsWith("activity")) ? "active" : ""}"><span class="ico">${ico}</span>${label}</a>`;
    return `<nav class="bottomnav" aria-label="Main">${a("dashboard", "#/dashboard", "◧", "Home")}${a("activity", "#/activity/2", "▣", "Activity")}${a("matrix", "#/matrix", "▦", "Matrix")}${a("evidence", "#/evidence", "▤", "Evidence")}${a("export", "#/export", "⇪", "Export")}</nav>`;
  }

  // ---------- 1. Dashboard ----------
  function viewDashboard() {
    const t = totals();
    const n = CRITS.length;
    const pct = v => Math.round(100 * v / n);
    const withEv = t.signed + t.mapped;
    const compRows = COMPS.map(c => {
      const s = compStats(c);
      return `<div class="comp-row"><span class="id">${c.unitId === "core" ? "C" : "S"}${c.number}</span>
        <span class="t" title="${esc(c.title)}">${esc(c.title)}</span>
        <div class="bar" aria-label="${s.signed} signed, ${s.mapped} mapped of ${s.total}"><span class="s" style="width:${100 * s.signed / s.total}%"></span><span class="m" style="width:${100 * s.mapped / s.total}%"></span><span class="p" style="width:${100 * s.planned / s.total}%"></span></div>
        <span class="small muted pct">${s.signed + s.mapped}/${s.total}${s.gap ? ` <b style="color:var(--gap)">·${s.gap}</b>` : ""}</span></div>`;
    });
    const half = 3;
    const a3k = CRITS.filter(k => cov(k.id, 3)); const a3 = { total: a3k.length, ev: a3k.filter(k => cov(k.id, 3).state !== "planned").length };
    return `
    <div class="page-head"><div><div class="crumb">Saturday 17 October 2026</div><h1>Good afternoon, Aidan</h1>
      <p class="muted" style="margin:0">${esc(PACK.name)} · ${esc(S.trip.vessel)} · ${esc(S.trip.project)}</p></div>
      <div class="actions"><button class="btn" data-toast="Quick capture would open the camera or file picker.">＋ Add evidence</button><a class="btn primary" href="#/matrix">Open coverage matrix</a></div></div>

    <div class="grid g-3">
      <section class="card"><div class="card-head"><h2>Readiness</h2><span class="right pill info">G2 Surveyor + Core</span></div>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
          <div class="ring" style="--v:${pct(t.signed)};--w:${pct(withEv)}" data-label="${pct(withEv)}%\nevidenced"></div>
          <div class="small" style="flex:1;min-width:150px">
            <div><b>${t.signed}</b> of ${n} criteria assessor signed</div>
            <div><b>${t.mapped}</b> with evidence, awaiting assessor</div>
            <div><b>${t.planned}</b> planned, no evidence yet</div>
            <div style="color:var(--gap)"><b>${t.gap}</b> not covered anywhere</div>
            <div style="margin-top:6px"><b>${t.compsAll3}/13</b> competences in all 3 activities</div>
          </div></div>
        <div class="legend"><span><i style="background:var(--signed)"></i>Signed</span><span><i style="background:#e08a1e"></i>Mapped</span><span><i style="background:#e8ecf2;border:1px solid #c4ccd8"></i>Not yet</span></div>
      </section>

      <section class="card"><div class="card-head"><h2>Direct evidence</h2><span class="right pill ${t.directPct >= 70 ? "signed" : "gap"}">${t.directPct >= 70 ? "On track" : "Below 70%"}</span></div>
        <div class="kpi"><div class="value">${t.directPct}%</div><div class="label">observation and work product (O, P)</div></div>
        <div style="margin:26px 0 8px"><div class="meter" style="--d:${t.directPct}%"><span class="mark"></span></div></div>
        <p class="small muted">${t.direct} direct and ${t.indirect} indirect (W, Q) criterion entries across the 3 activities. MTCS asks for at least 70% direct. How MTCS counts this is not confirmed, so treat it as a guide.</p>
      </section>

      <section class="card"><div class="card-head"><h2>Outstanding signatures</h2><span class="right pill warn">6</span></div>
        <ul class="list small">
          <li><span class="dot" style="background:#e08a1e"></span><div class="grow"><b>Activity 2</b>: 13 competence sheets, Feedback Form, UKQs<div class="muted">With [Assessor] since 11 Oct</div></div></li>
          <li><span class="dot" style="background:#b7c0cd"></span><div class="grow"><b>Activity 3</b>: plan agreed, sheets not sent yet</div></li>
          <li><span class="dot" style="background:#e08a1e"></span><div class="grow"><b>Record of Witness</b>: [Witness], Activity 1 rows</div></li>
          <li><span class="dot" style="background:#b7c0cd"></span><div class="grow"><b>Assessor Sign-off</b> ×2 (Surveyor, Core): ink, after Activity 3</div></li>
          <li><span class="dot" style="background:#b7c0cd"></span><div class="grow"><b>Witness Statements</b> ×2: referee forms, [Shore manager]</div></li>
        </ul></section>
    </div>

    <div class="grid g-main" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Progress by competence</h2><a class="right btn sm ghost" href="#/matrix">See all criteria →</a></div>
        <h3 class="small muted">G2 Core</h3>${compRows.slice(0, half).join("")}
        <h3 class="small muted" style="margin-top:14px">G2 Surveyor</h3>${compRows.slice(half).join("")}
      </section>
      <section class="card"><div class="card-head"><h2>Next actions</h2></div>
        <ul class="list small">
          <li><span class="check"></span><div class="grow"><b>Chase [Assessor]</b> to sign Activity 2<div class="muted">Link sent 11 Oct, expires 25 Oct</div></div><a class="btn sm" href="#/activity/2">Open</a></li>
          <li><span class="check"></span><div class="grow"><b>Map 2 loose items</b> in the evidence library<div class="muted">Alarm call point photo, TSS calibration sheet</div></div><a class="btn sm" href="#/evidence">Map</a></li>
          <li><span class="check"></span><div class="grow"><b>Decide S09d and S09f</b> with the assessor<div class="muted">USBL and LBL calibrations didn't happen this trip</div></div><a class="btn sm" href="#/matrix?c=S09d">View</a></li>
          <li><span class="check"></span><div class="grow"><b>Finish Activity 3</b> evidence: tide reduction, QC plots<div class="muted">${a3.ev} of ${a3.total} planned criteria have evidence</div></div><a class="btn sm" href="#/activity/3">Open</a></li>
          <li><span class="check"></span><div class="grow"><b>Ask 2 referees</b> for Witness Statements<div class="muted">Shore manager and offshore manager</div></div><button class="btn sm" data-toast="Would open a referee link form.">Ask</button></li>
        </ul></section>
    </div>

    <h2 style="margin:22px 0 10px">Activities</h2>
    <div class="grid g-3">${S.activities.map(activityCard).join("")}</div>`;
  }
  function activityCard(a) {
    const ids = CRITS.filter(k => cov(k.id, a.n));
    const withEv = ids.filter(k => ["mapped", "signed"].includes(cov(k.id, a.n).state)).length;
    const signed = ids.filter(k => cov(k.id, a.n).state === "signed").length;
    const pillCls = a.status === "signed" ? "signed" : a.status === "with-assessor" ? "mapped" : "planned";
    return `<article class="card act-card ${a.status}">
      <div style="display:flex;gap:10px;align-items:center"><div class="num">${a.n}</div><div><b>${esc(a.title)}</b><div class="small muted">${esc(a.dates)}</div></div></div>
      <span class="pill ${pillCls}" style="align-self:flex-start">${esc(a.statusLabel)}</span>
      <p class="small muted" style="margin:0">${esc(a.summary)}</p>
      <div class="bar"><span class="s" style="width:${100 * signed / ids.length}%"></span><span class="m" style="width:${100 * (withEv - signed) / ids.length}%"></span></div>
      <div class="small">${ids.length} criteria planned · ${withEv} with evidence · ${signed} signed</div>
      <div class="foot"><a class="btn sm primary" href="#/activity/${a.n}">Open activity</a><a class="btn sm" href="#/assessor/${a.n}">Assessor view</a></div>
    </article>`;
  }

  // ---------- 2. Activity workspace ----------
  function viewActivity(n) {
    const a = actOf(n) || S.activities[0];
    const ev = S.evidence.filter(e => e.act === a.n);
    const planned = CRITS.filter(k => cov(k.id, a.n));
    const pillCls = a.status === "signed" ? "signed" : a.status === "with-assessor" ? "mapped" : "planned";
    const groups = COMPS.map(c => {
      const ks = c.criteria.filter(k => cov(k.id, a.n));
      if (!ks.length) return "";
      return `<div style="margin-bottom:10px"><div class="small" style="font-weight:700;margin-bottom:4px">${compLabel(c)} <span class="muted" style="font-weight:400">· ${esc(c.title)}</span></div>
        ${ks.map(k => { const cv = cov(k.id, a.n); return `<a href="#/activity/${a.n}?c=${k.id}" class="small" style="display:flex;gap:8px;align-items:center;padding:4px 0;text-decoration:none;color:var(--ink)">
          <span class="mcell ${cv.state}" style="min-width:44px;height:22px">${cv.code}</span><span class="crit-id">${k.id}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(k.text)}</span></a>`; }).join("")}</div>`;
    }).join("");
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Activities</div>
      <h1>Activity ${a.n} · ${esc(a.title)}</h1>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ${pillCls}">${esc(a.statusLabel)}</span><span class="small muted">${esc(a.dates)} · ${esc(S.trip.vessel)}</span></div></div>
      <div class="actions"><a class="btn" href="#/assessor/${a.n}">Preview assessor view</a><a class="btn primary" href="#/activity/${a.n}?modal=send">Send to assessor ➜</a></div></div>

    <div class="grid g-main">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Assessment Plan</h2><span class="right pill ${a.planAgreed ? "signed" : "planned"}">${a.planAgreed ? "Agreed by assessor " + esc(a.planAgreed) : "Draft"}</span></div>
          <dl class="kv">
            <dt>Work activity</dt><dd>${esc(a.summary)}</dd>
            <dt>Criteria</dt><dd>${planned.length} criteria across all 13 competences (Surveyor 1–10, Core 1–3)</dd>
            <dt>Evidence types</dt><dd>Observation, work product, questioning${a.n === 3 ? ", written (historic LBL testimony)" : ""}</dd>
            <dt>Dates</dt><dd>${esc(a.dates)}</dd>
            <dt>Where</dt><dd>${esc(a.where)}</dd>
            <dt>Witness</dt><dd>${esc(a.witness)}</dd>
            <dt>Assessor</dt><dd>[Assessor], Senior Surveyor</dd>
          </dl>
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-toast="Would open the plan editor (one plan per unit: Surveyor and Core).">Edit plan</button><button class="btn sm" data-toast="Would preview the pre-filled MTCS Assessment Plan PDF.">Preview MTCS form</button></div>
        </section>

        <section class="card"><div class="card-head"><h2>Evidence for this activity</h2><span class="right small muted">${ev.length} items</span></div>
          <div class="add-row">
            <button class="add-tile" data-toast="Would open the camera. Photos are named Criterion_Activity_Title_Date."><span class="ev-ico photo">📷</span><div><b>Photo</b><span>Take or upload</span></div></button>
            <button class="add-tile" data-toast="Would open the file picker."><span class="ev-ico">📄</span><div><b>File</b><span>Log, report, plot</span></div></button>
            <button class="add-tile" data-toast="Would open a short write-up editor."><span class="ev-ico written">✍️</span><div><b>Written product</b><span>Note or testimony</span></div></button>
            <button class="add-tile" data-toast="Would send a narrow witness link."><span class="ev-ico witness">🧾</span><div><b>Witness statement</b><span>Ask a witness</span></div></button>
          </div>
          <ul class="list">${ev.map(evRow).join("") || `<li class="muted small">No evidence yet.</li>`}</ul>
        </section>
      </div>

      <div class="stack">
        <section class="card"><div class="card-head"><h2>People and link</h2></div>
          <ul class="list small">
            <li><span class="avatar" style="width:30px;height:30px;color:#fff">As</span><div class="grow"><b>[Assessor]</b><div class="muted">Assessor · Senior Surveyor</div></div><span class="pill ${a.status === "signed" ? "signed" : a.linkSent ? "mapped" : "planned"}">${a.status === "signed" ? "Signed " + esc(a.signedOn) : a.linkSent ? "Link sent" : "Not sent"}</span></li>
            <li><span class="avatar" style="width:30px;height:30px;color:#fff;background:#8a94a6">W</span><div class="grow"><b>${a.witness === "None" ? "No witness" : esc(a.witness)}</b><div class="muted">Witness (optional, named on plan)</div></div>${a.witness === "None" ? `<button class="btn sm" data-toast="Would add a witness to the plan.">Add</button>` : `<span class="pill mapped">Rows to sign</span>`}</li>
          </ul>
          ${a.linkSent ? `<p class="small muted" style="margin-top:8px">Link sent ${esc(a.linkSent)}. Expires 25 Oct 2026. Opened twice.</p>` : ""}
          <a class="btn primary block" href="#/activity/${a.n}?modal=send" style="margin-top:8px">${a.linkSent ? "Resend link" : "Send to assessor ➜"}</a>
        </section>
        <section class="card"><div class="card-head"><h2>Criteria in this activity</h2><span class="right small muted">${planned.length}</span></div>
          <div class="legend" style="margin:0 0 10px"><span><i style="background:var(--signed-bg);border:1px solid #a8dbb9"></i>Signed</span><span><i style="background:var(--mapped-bg);border:1px solid #f3c48a"></i>Evidence mapped</span><span><i style="background:#f3f5f8;border:1px dashed #8a94a6"></i>Planned</span></div>
          <div style="max-height:620px;overflow:auto">${groups}</div>
        </section>
      </div>
    </div>`;
  }
  function evRow(e) {
    return `<li class="${e.criteria.length ? "" : "unmapped"}" style="${e.criteria.length ? "" : "padding-left:10px"}"><span class="ev-ico ${e.type}" aria-hidden="true">${EV_ICON[e.type]}</span>
      <div class="grow"><b class="small">${esc(e.title)}</b>${e.redact ? ` <span class="pill warn">Check for client data</span>` : ""}
        <div class="fname">${esc(e.file)}</div>
        <div>${e.criteria.map(c => `<a class="ev-chip" href="${here()}?c=${c}">${c}</a>`).join("") || `<span class="pill gap" style="margin-top:6px">Unmapped</span>`}</div></div>
      <div style="text-align:right">${e.code ? `<span class="code" style="background:var(--brand-soft);color:var(--brand)" title="Evidence type">${e.code}</span>` : ""}<div class="tiny muted" style="margin-top:4px">${esc(e.date)}</div></div></li>`;
  }

  // ---------- 3. Coverage matrix ----------
  function viewMatrix() {
    const t = totals();
    const q = ui.mSearch.toLowerCase();
    let rows = "";
    PACK.units.forEach(u => {
      if (ui.mUnit !== "all" && ui.mUnit !== u.id) return;
      u.competences.forEach(c0 => {
        const c = COMPS.find(x => x.id === c0.id);
        const ks = c.criteria.filter(k => {
          const st = critState(k.id);
          if (ui.mState === "gap" && !(st === "gap" || st === "planned")) return false;
          if (ui.mState === "mapped" && st !== "mapped") return false;
          if (ui.mState === "signed" && st !== "signed") return false;
          if (q && !(k.id.toLowerCase().includes(q) || k.text.toLowerCase().includes(q))) return false;
          return true;
        });
        if (!ks.length) return;
        const s = compStats(c);
        rows += `<tr class="group-row"><td colspan="6">${compLabel(c)} · ${esc(c.title)} <span class="small muted" style="font-weight:400">· ${s.signed + s.mapped}/${s.total} evidenced · in ${s.acts}/3 activities · ${esc(c.imca)}</span></td></tr>`;
        ks.forEach(k => {
          const cells = [1, 2, 3].map(a => { const cv = cov(k.id, a); return `<td class="cell"><span class="mcell ${cv ? cv.state : "empty"}" title="${cv ? STATE_LABEL[cv.state] : "Not in this activity"}">${cv ? cv.code + (cv.state === "signed" ? " ✓" : "") : "–"}</span></td>`; }).join("");
          rows += `<tr class="crit-row" data-href="#/matrix?c=${k.id}" tabindex="0"><td class="crit-id">${k.id}</td><td class="crit-text">${esc(k.text)}</td>${cells}<td class="status">${pill(critState(k.id))}</td></tr>`;
        });
      });
    });
    const seg = (key, val, label) => `<button data-ui="${key}" data-val="${val}" class="${ui[key] === val ? "on" : ""}">${label}</button>`;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Coverage matrix</h1>
      <p class="muted" style="margin:0">All ${CRITS.length} criteria against Activities 1–3. Each competence must appear in all 3 activities; each criterion at least once.</p></div>
      <div class="actions"><button class="btn" data-toast="Would print the matrix as a one-page summary for the assessor.">Print summary</button></div></div>
    <div class="grid g-4" style="margin-bottom:16px">
      <div class="card kpi"><div class="label">Assessor signed</div><div class="value" style="color:var(--signed)">${t.signed}</div><div class="small muted">of ${CRITS.length} criteria</div></div>
      <div class="card kpi"><div class="label">Evidence mapped</div><div class="value" style="color:#8a4500">${t.mapped}</div><div class="small muted">waiting for assessor</div></div>
      <div class="card kpi"><div class="label">Planned only</div><div class="value">${t.planned}</div><div class="small muted">in a plan, no evidence yet</div></div>
      <div class="card kpi"><div class="label">Not covered</div><div class="value" style="color:var(--gap)">${t.gap}</div><div class="small muted">S09d, S09f: decide with assessor</div></div>
    </div>
    <div class="filters">
      <label class="sr-only" for="msearch">Search criteria</label>
      <input type="search" id="msearch" data-ui-input="mSearch" placeholder="Search criteria, e.g. USBL or S08" value="${esc(ui.mSearch)}">
      <div class="seg" role="group" aria-label="Unit">${seg("mUnit", "all", "All units")}${seg("mUnit", "core", "G2 Core")}${seg("mUnit", "surveyor", "G2 Surveyor")}</div>
      <div class="seg" role="group" aria-label="Status">${seg("mState", "all", "All")}${seg("mState", "gap", "Gaps")}${seg("mState", "mapped", "Mapped")}${seg("mState", "signed", "Signed")}</div>
      <div class="legend" style="margin:0 0 0 auto"><span><span class="mcell empty" style="min-width:26px;height:18px">–</span> not in activity</span><span><span class="mcell planned" style="min-width:26px;height:18px">O</span> planned</span><span><span class="mcell mapped" style="min-width:26px;height:18px">O</span> mapped</span><span><span class="mcell signed" style="min-width:26px;height:18px">O ✓</span> signed</span></div>
    </div>
    <div class="table-wrap" style="max-height:calc(100vh - 330px);min-height:360px"><table>
      <thead><tr><th>ID</th><th>Criterion (verbatim)</th><th style="text-align:center">Activity 1<br><span style="font-weight:400;text-transform:none">Set-up</span></th><th style="text-align:center">Activity 2<br><span style="font-weight:400;text-transform:none">Online shift</span></th><th style="text-align:center">Activity 3<br><span style="font-weight:400;text-transform:none">Handover</span></th><th>Status</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted">No criteria match these filters.</td></tr>`}</tbody></table></div>
    <p class="small muted">Codes: O observation, P work product, W written, Q questioning, N/C not covered, N/A not applicable (from the MTCS competence sheets). Select a row for details.</p>`;
  }

  // ---------- 4. Criterion drawer ----------
  function drawer(id) {
    const k = critById(id);
    if (!k) return "";
    const ev = evFor(id);
    const st = critState(id);
    const back = location.hash.split("?")[0];
    const actRows = [1, 2, 3].map(a => { const cv = cov(id, a); const A = actOf(a);
      return `<tr><td>Activity ${a}<div class="tiny muted">${esc(A.title)}</div></td><td>${cv ? codeBadge(cv.code, cv.state) : "–"}</td><td>${cv ? pill(cv.state) : `<span class="muted small">Not in plan</span>`}</td><td class="small">${cv && cv.state === "signed" ? "[Assessor], " + esc(A.signedOn) : "–"}</td></tr>`; }).join("");
    const gapNote = { S09d: "No USBL calibration this trip, only verifications. Ask the assessor whether a verification counts, or plan it for a future mobilisation.", S09f: "No LBL calibration on this job. Options: N/A, questioning now, or a later job. The assessor decides.", S08f: "LBL was used on the pipelay job. Historic testimony is linked; the assessor decides if it is accepted.", S10e: "No land survey work offshore. Covered by questioning in Activity 3." }[id];
    return `<div class="scrim" data-href="${back}"></div>
    <aside class="drawer" role="dialog" aria-label="Criterion ${id}">
      <header><div><div class="small muted">${compLabel(k.comp)} · ${esc(k.comp.unitName)}</div><h2 style="margin:2px 0 6px">${id} ${pill(st)}</h2></div><button class="close" data-href="${back}" aria-label="Close">✕</button></header>
      <div class="body">
        <div class="quote">${esc(k.text)}</div>
        <dl class="kv small"><dt>Competence</dt><dd>${esc(k.comp.title)}</dd><dt>IMCA reference</dt><dd>${esc(k.comp.imca)}</dd><dt>Source form</dt><dd class="fname">${esc(k.comp.file)}</dd></dl>
        ${gapNote ? `<div class="card" style="background:var(--warn-bg);border-color:#f0dfa6;margin-top:14px;padding:12px"><b class="small">Note</b><p class="small" style="margin:4px 0 0">${gapNote}</p></div>` : ""}
        <h3 style="margin-top:18px">By activity</h3>
        <div class="table-wrap"><table><thead><tr><th>Activity</th><th>Code</th><th>State</th><th>Assessor</th></tr></thead><tbody>${actRows}</tbody></table></div>
        <h3 style="margin-top:18px">Linked evidence (${ev.length})</h3>
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
      <td class="small" style="white-space:nowrap">${esc(e.date)}</td></tr>`).join("");
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Evidence library</h1>
      <p class="muted" style="margin:0">Everything you've captured, across all activities and past jobs.</p></div>
      <div class="actions"><button class="btn" data-toast="Would rename files to Criterion_Activity_Title_Date.">Tidy file names</button><button class="btn primary" data-toast="Would open quick capture.">＋ Add evidence</button></div></div>
    ${unm.length ? `<div class="card" style="border-left:4px solid var(--gap);margin-bottom:16px;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>${unm.length} items aren't mapped to any criterion yet.</b><span class="small muted">${unm.map(e => esc(e.title)).join(" · ")}</span><button class="btn sm" data-ui="eUnmapped" data-val="toggle" style="margin-left:auto">${ui.eUnmapped ? "Show all" : "Show unmapped only"}</button></div>` : ""}
    <div class="filters">
      <label class="sr-only" for="esearch">Search evidence</label>
      <input type="search" id="esearch" data-ui-input="eSearch" placeholder="Search titles, tags or criteria" value="${esc(ui.eSearch)}">
      <div class="seg" role="group" aria-label="Type">${seg("all", "All")}${seg("photo", "Photos")}${seg("file", "Files")}${seg("written", "Written")}${seg("witness", "Witness")}${seg("record", "Records")}</div>
      <label class="checkline"><input type="checkbox" data-ui="eUnmapped" data-val="toggle" ${ui.eUnmapped ? "checked" : ""}> Unmapped only</label>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Activity</th><th>Code</th><th>Criteria</th><th>Tags</th><th>Date</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">Nothing matches.</td></tr>`}</tbody></table></div>
    <p class="small muted">Codes are the evidence type the item supports (O, P, W, Q). The assessor's final code for each criterion is set on the competence sheet.</p>`;
  }

  // ---------- 6. Assessor link view ----------
  function viewAssessor(n) {
    const a = actOf(n) || S.activities[1];
    const signed = a.status === "signed";
    const planned = CRITS.filter(k => cov(k.id, a.n));
    let first = 0;
    const comps = COMPS.map(c => {
      const ks = c.criteria.filter(k => cov(k.id, a.n));
      if (!ks.length) return "";
      first++;
      return `<details class="card" style="padding:0" ${first <= 2 ? "open" : ""}><summary style="padding:14px 16px;cursor:pointer;list-style-position:inside"><b>${compLabel(c)}</b> <span class="small muted">· ${esc(c.title)}</span> <span class="pill info" style="float:right">${ks.length} criteria</span></summary>
        <div style="padding:0 16px 8px">${ks.map(k => { const cv = cov(k.id, a.n); const ev = evFor(k.id).filter(e => e.act === a.n || !e.act || e.act === null);
          return `<div class="crit-card"><div class="top"><span class="crit-id">${k.id}</span><div class="small" style="flex:1">${esc(k.text)}</div></div>
            <div>${ev.map(e => `<span class="ev-chip">${EV_ICON[e.type]} ${esc(e.title)}</span>`).join("") || `<span class="tiny muted">No file linked. Candidate proposes ${cv.code === "O" ? "observation" : cv.code === "Q" ? "questioning" : "evidence"}.</span>`}</div>
            <div class="codebar" role="group" aria-label="Evidence code for ${k.id}">${["O", "P", "W", "Q", "N/C", "N/A"].map(cd => `<button data-pick="${k.id}" class="${cd === cv.code ? "on" : ""}" ${signed ? "disabled" : ""}>${cd}</button>`).join("")}</div></div>`; }).join("")}</div></details>`;
    }).join("");
    const qs = (S.ukq[a.n] || S.ukq[2]).map((u, i) => `<div class="crit-card"><div class="top"><span class="step">${i + 1}</span><div style="flex:1"><div class="small muted">Surveyor ${Number(u.comp.slice(1))}</div><b class="small">${esc(u.q)}</b>
      <div class="field" style="margin:8px 0 0"><textarea aria-label="Answer note" placeholder="Note of the candidate's answer">${esc(u.a)}</textarea></div></div></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;justify-content:flex-end"><span class="small muted">Satisfactory response?</span><div class="yn"><button class="${u.ok === "Y" ? "y" : ""}" data-yn>Yes</button><button data-yn>No</button></div></div></div>`).join("");
    return `<div class="link-shell">
      <div class="link-hero"><div class="small" style="opacity:.85">Assessor view · shared by Aidan</div>
        <h1 style="margin:4px 0 2px">Activity ${a.n} · ${esc(a.title)}</h1>
        <div class="small" style="opacity:.9">${esc(PACK.name)} · ${esc(S.trip.vessel)} · ${esc(a.dates)}</div>
        <div class="meta"><span class="pill">✓ Email code verified</span><span class="pill">Link expires 25 Oct 2026</span><span class="pill">${planned.length} criteria</span><span class="pill">${signed ? "Signed and locked" : "Not signed yet"}</span></div></div>
      <nav class="section-nav" aria-label="Sections"><a href="#/assessor/${a.n}" class="on" data-jump="s-plan">1 Plan</a><a href="#/assessor/${a.n}" data-jump="s-crit">2 Criteria</a><a href="#/assessor/${a.n}" data-jump="s-ukq">3 Knowledge</a><a href="#/assessor/${a.n}" data-jump="s-fb">4 Feedback</a><a href="#/assessor/${a.n}" data-jump="s-sign">5 Sign</a></nav>

      <section class="card" id="s-plan"><div class="card-head"><span class="step">1</span><h2>Assessment Plan</h2><span class="right pill ${a.planAgreed ? "signed" : "planned"}">${a.planAgreed ? "Agreed " + esc(a.planAgreed) : "Awaiting agreement"}</span></div>
        <div class="seg" style="margin-bottom:12px"><button class="on">G2 Surveyor plan</button><button>G2 Core plan</button></div>
        <dl class="kv small">
          <dt>Work activity to be assessed</dt><dd>${esc(a.summary)}</dd>
          <dt>Performance criteria</dt><dd>Surveyor 1–10 and Core 1–3: ${planned.length} criteria (listed below)</dd>
          <dt>Type of evidence</dt><dd>Observation, work product, questioning</dd>
          <dt>Date(s)</dt><dd>${esc(a.dates)}</dd>
          <dt>Where</dt><dd>${esc(a.where)}</dd>
          <dt>Needs and witness</dt><dd>12:00–00:00 shift. Witness: ${esc(a.witness)}</dd>
        </dl>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn sm" data-toast="Would let the assessor suggest changes to the plan.">Suggest changes</button><button class="btn sm ${a.planAgreed ? "success" : "primary"}" data-toast="Would record the assessor's agreement with name and date.">${a.planAgreed ? "✓ Plan agreed" : "Agree plan"}</button></div>
      </section>

      <section id="s-crit" style="margin-top:16px"><div class="card-head" style="margin:6px 4px 10px"><span class="step">2</span><h2>Performance criteria and evidence</h2><span class="right small muted">Tap a code for each criterion</span></div>
        <div class="stack" style="gap:10px">${comps}</div></section>

      <section class="card" id="s-ukq" style="margin-top:16px"><div class="card-head"><span class="step">3</span><h2>Underpinning knowledge questions</h2></div>
        <p class="small muted">Oral or written. The candidate has suggested questions from their bank; you can use, edit or replace them.</p>
        ${qs}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-toast="Would add a blank question row (up to 10 per competence sheet).">＋ Add question</button><button class="btn sm" data-toast="Would show the candidate's suggested question bank.">Pick from question bank</button></div>
        <div class="field" style="margin-top:12px"><label for="ukqfb">Feedback on answers received</label><textarea id="ukqfb" placeholder="Short summary for the UKQ sheets"></textarea></div>
      </section>

      <section class="card" id="s-fb" style="margin-top:16px"><div class="card-head"><span class="step">4</span><h2>Assessment Feedback Form</h2></div>
        <div class="field"><label for="dec">Decision and feedback</label><textarea id="dec" placeholder="What you saw, and how it met the criteria"></textarea></div>
        <div class="grid g-2" style="gap:10px">
          <div class="field"><label>Has the candidate demonstrated competence in this activity?</label><div class="yn"><button class="y" data-yn>Yes</button><button data-yn>No</button></div></div>
          <div class="field"><label>Has the candidate now demonstrated competence in three activities?</label><div class="yn"><button data-yn>Yes</button><button class="y" data-yn>No</button></div></div>
        </div>
        <div class="field"><label for="why">Reasons for your decision</label><textarea id="why"></textarea></div>
        <div class="field"><label for="fa">Summary of further action for the candidate</label><textarea id="fa" placeholder="e.g. tide reduction and QC plots in Activity 3; S09d and S09f outstanding"></textarea></div>
        <div class="field"><label>Candidate's comments</label><textarea readonly placeholder="Aidan adds these after you submit"></textarea></div>
      </section>

      <section class="card" id="s-sign" style="margin-top:16px"><div class="card-head"><span class="step">5</span><h2>Sign and lock</h2></div>
        <p class="small">Signing records your name and the date on: the 2 Assessment Plans, ${COMPS.length} competence sheets, the UKQ sheets and 2 Feedback Forms for Activity ${a.n}. Signed items are locked. Any later edit needs a new signature.</p>
        <div class="grid g-2" style="gap:10px"><div class="field"><label for="an">Your name</label><input id="an" value="[Assessor]"></div><div class="field"><label for="ar">Job role</label><input id="ar" value="Senior Surveyor"></div></div>
        <div class="sigpad" aria-label="Signature pad">Sign here with your finger or mouse</div>
        <label class="checkline"><input type="checkbox"> I confirm I assessed this activity as recorded above.</label>
        <p class="tiny muted">The Assessor Sign-off form needs an ink signature. It is printed for you after Activity 3.</p>
      </section>
      <div class="sticky-sign" style="margin-top:16px"><div class="small" style="flex:1"><b>${planned.length} coded</b><span class="hide-sm"> · 3 of 4 questions marked</span></div><button class="btn" data-toast="Saved as a draft. Nothing is signed yet.">Save draft</button><button class="btn primary" data-toast="Would sign and lock Activity ${a.n}.">Sign and lock</button></div>
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
      <div class="area-act"><button class="btn sm" data-toast="Would preview the merged PDF.">Preview</button></div></div></section>`;
    const acts = (label, sts) => [1, 2, 3].map(i => f(`Activity ${i} - ${label}.pdf`, sts[i - 1])).join("");
    const blockers = [
      ["gap", `${t.gap} criteria not covered: S09d, S09f`, "#/matrix?c=S09d"],
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

  // ---------- 9. Settings and packs ----------
  function viewSettings() {
    const roles = ["Surveyor", "Survey Engineer", "Data Processor", "Survey Party Chief", "Client Representative"];
    const packs = window.PACK_CATALOGUE;
    const roleBlock = r => `<div><h3 style="margin:14px 0 8px">${r}</h3><div class="grid g-3">${packs.filter(p => p.role === r).map(p => `
      <div class="pack ${p.status === "active" ? "active" : "later"}" ${p.status !== "active" ? 'aria-disabled="true"' : ""}>
        <div style="display:flex;align-items:center;gap:8px"><b>${esc(p.label)}</b><span class="pill ${p.status === "active" ? "signed" : "planned"}" style="margin-left:auto">${p.status === "active" ? "Active" : "Coming later"}</span></div>
        <div class="small">${esc(p.grade)} · GA course ${p.gaCourse}${p.note ? " · " + esc(p.note) : ""}</div>
        ${p.status === "active" ? `<div class="small">${COMPS.length} competences · ${CRITS.length} criteria · packs/${esc(p.file)}</div>` : `<div class="small">Criteria not loaded yet</div>`}
      </div>`).join("")}</div></div>`;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Settings</div><h1>Settings and packs</h1></div></div>
    <div class="grid g-main">
      <div class="stack">
        <section class="card"><div class="card-head"><h2>Competence pack</h2><span class="right small muted">Packs are data files, so new roles and grades slot in later</span></div>
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
        <section class="card"><h2>Backup</h2><p class="small muted">Keep a backup file in case the browser clears its storage (iPhones can after 7 days).</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn primary" href="#/backup">Backup and restore</a></div></section>
        <section class="card"><h2>Assessor training</h2><p class="small muted">Later: an assessor side to track your own Stage 2 candidates.</p><span class="pill planned">Coming later</span></section>
      </div>
    </div>`;
  }

  // ---------- 0. Opening screen: choose your route ----------
  function viewLanding(params) {
    const sel = params.get("role"), selGrade = params.get("grade");
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
          : `<div class="grade-seg" role="group" aria-label="Grade">${gkeys.map(k => `<button data-href="#/?role=${r.key}&grade=${k}" aria-pressed="${k === g}" class="${k === g ? "on" : ""}">${k === "Senior" ? "Senior" : k}${r.grades[k].pack ? "" : `<span class="soon">soon</span>`}</button>`).join("")}</div>`;
        let summary = `<p class="small muted" style="margin:10px 0 0">Pick the grade you're working towards.</p>`;
        if (g) {
          const G = r.grades[g];
          summary = `<div class="route-summary">
            <div class="tiny muted" style="text-transform:uppercase;letter-spacing:.06em">Your route</div>
            <div class="rs-title">${esc(routeName(r, g))} <span class="plus">+</span> ${esc(coreName(r, g))}</div>
            <p class="small" style="margin:6px 0 10px">${r.single ? "Core competences apply to every route. Which Core unit goes with this role still needs confirming with MTCS." : `The matching <b>${g} Core</b> unit (C1–C3) is added automatically. Core is shared by every role at ${g}, so you only do it once.`}</p>
            <div class="rs-meta"><span class="pill info">GA course ${G.course}</span>${r.single ? "" : `<span class="pill info">Core course ${CORE_COURSE[g]}</span>`}${G.pack ? `<span class="pill signed">Criteria loaded: ${COMPS.length} competences, ${CRITS.length} criteria</span>` : `<span class="pill warn">Coming soon: criteria pack not loaded</span>`}</div>
            ${G.note ? `<p class="tiny muted" style="margin:6px 0 0">${esc(G.note)}</p>` : ""}
            <button class="btn primary block lg" data-open="${r.key}|${g}" style="margin-top:12px">${G.pack ? "Open portfolio →" : "Open layout preview →"}</button>
          </div>`;
        }
        inner = `<div class="role-body">${seg}${summary}</div>`;
      }
      return `<section class="role-card${open ? " open" : ""}">
        <button class="role-head" data-href="${open ? "#/?role=" : "#/?role=" + r.key}" aria-expanded="${open}">
          <span class="role-ico" aria-hidden="true">${r.ico}</span>
          <span class="grow"><b>${esc(r.name)}</b><span class="small muted">${esc(r.blurb)}</span>
            <span class="tiny muted">${r.single ? "Single level" : "G2 · G1 · Senior"}</span></span>
          ${anyLoaded ? `<span class="pill signed">Available</span>` : `<span class="pill planned">Coming soon</span>`}
          <span class="chev" aria-hidden="true">${open ? "▴" : "▾"}</span>
        </button>${inner}</section>`;
    };
    return `<div class="landing">
      <div class="landing-hero"><div class="small" style="opacity:.85">Saturday 17 October 2026 · Hi Aidan</div>
        <h1>Choose your MTCS route</h1>
        <p style="margin:4px 0 0;opacity:.92">Tap your role, then pick the grade you're working on. The matching Core competences are included automatically.</p></div>

      <section class="card my-ports"><div class="card-head"><h2>My portfolios</h2><span class="right small muted">1 in progress</span></div>
        <div class="port-row">
          <div class="role-ico sm" aria-hidden="true">🧭</div>
          <div class="grow"><b>G2 Surveyor + G2 Core</b><div class="small muted">In progress · ${t.signed} of ${CRITS.length} criteria signed · Activity 2 with assessor</div>
            <div class="bar" style="margin-top:6px"><span class="s" style="width:${100 * t.signed / CRITS.length}%"></span><span class="m" style="width:${100 * t.mapped / CRITS.length}%"></span></div></div>
          <button class="btn primary" data-open="surveyor|G2">Open</button>
        </div>
        <p class="tiny muted" style="margin:10px 0 0">You can keep more than one route, for example G2 Surveyor now and G1 later. Each has its own activities and evidence.</p>
      </section>

      <h2 class="landing-h2">Start or switch route</h2>
      <div class="role-list">${ROLES.map(card).join("")}</div>

      <section class="card import-card"><div class="card-head"><span class="imp-ico" aria-hidden="true">⤒</span><h2>Lost your data? Import a backup</h2></div>
        <p class="small" style="margin:0 0 6px">Your portfolio is stored <b>in this browser on this device</b>. If the browser data is cleared, or you move to a new phone or laptop, import your backup <b>.zip</b> and everything is restored: routes, activities, evidence, signatures and settings.</p>
        <div class="btn-row"><button class="btn primary" data-toast="Not connected yet – layout only. Would open the file picker for a backup .zip.">⤒ Import backup (.zip)</button><button class="btn" data-toast="Not connected yet – layout only. Would list backups in Google Drive.">From Google Drive</button><button class="btn" data-toast="Not connected yet – layout only. Would list backups in OneDrive.">From OneDrive</button></div>
        <a class="small" href="#/backup">Backup and restore options →</a>
      </section>
      <p class="tiny muted" style="text-align:center;margin-top:18px">Layout prototype. Sample data only. Nothing is saved or sent.</p>
    </div>`;
  }

  // ---------- 10. Backup and restore ----------
  function viewBackup() {
    const NC = "Not connected yet – layout only.";
    const opt = (ico, title, sub, status, btn, extra, cls) => `<div class="opt-tile ${cls || ""}"><div class="opt-top"><span class="opt-ico" aria-hidden="true">${ico}</span><div class="grow"><b>${title}</b><div class="small muted">${sub}</div></div></div>
      <div class="opt-status small">${status}</div>
      <button class="btn ${cls === "device" ? "primary" : ""} block lg" data-toast="${NC}${extra ? " " + extra : ""}">${btn}</button></div>`;
    return `
    <div class="page-head"><div><div class="crumb"><a href="#/dashboard">Dashboard</a> › Portfolio</div><h1>Backup and restore</h1>
      <p class="muted" style="margin:0">Your portfolio lives in this browser on this device. Keep a backup so nothing is lost if the browser data is cleared or the phone is replaced.</p></div></div>

    <section class="card status-card"><div class="st-row"><span class="st-dot ok" aria-hidden="true"></span><div class="grow"><b>Last backup: ${LAST_BACKUP}</b><div class="small muted">Saved to this device as MTCS_Backup_2026-10-17_1642.zip · 48 MB · 124 items</div></div>
      <button class="btn primary" data-toast="${NC} Would back up to every place switched on below.">Back up now</button></div></section>

    <h2 class="sec-h">Back up to</h2>
    <div class="opt-grid">
      ${opt("📱", "Save to this device (.zip)", "Downloads a single backup file you can keep, copy or email to yourself", `<span class="pill signed">Last saved ${LAST_BACKUP}</span>`, "⤓ Save backup to this device (.zip)", "Would download MTCS_Backup_[date].zip to Downloads.", "device")}
      ${opt("🟢", "Google Drive", "Saves into a folder you choose, e.g. MTCS Portfolio/Backups", `<span class="pill planned">Not connected</span>`, "Connect and back up to Google Drive", "Would ask you to sign in to Google.")}
      ${opt("🔵", "OneDrive", "Saves into your OneDrive, e.g. Documents/MTCS Backups", `<span class="pill planned">Not connected</span>`, "Connect and back up to OneDrive", "Would ask you to sign in to Microsoft.")}
    </div>

    <h2 class="sec-h">Restore</h2>
    <section class="card restore-card">
      <p class="small" style="margin:0 0 10px"><b>Importing a backup restores everything</b> into this browser: routes, activities, evidence files, assessor and witness signatures with their audit trail, and settings. You'll see what's in the backup before anything is replaced.</p>
      <div class="opt-grid">
        <button class="restore-tile primary" data-toast="${NC} Would open the file picker for a backup .zip."><span class="opt-ico" aria-hidden="true">⤒</span><span><b>Restore from local zip</b><span class="small">Pick a backup .zip from this device</span></span></button>
        <button class="restore-tile" data-toast="${NC} Would list backups in Google Drive."><span class="opt-ico" aria-hidden="true">🟢</span><span><b>Restore from Google Drive</b><span class="small muted">Choose a backup from Drive</span></span></button>
        <button class="restore-tile" data-toast="${NC} Would list backups in OneDrive."><span class="opt-ico" aria-hidden="true">🔵</span><span><b>Restore from OneDrive</b><span class="small muted">Choose a backup from OneDrive</span></span></button>
      </div>
      <p class="tiny muted" style="margin:10px 0 0">Restoring replaces what's in this browser. Back up first if you want to keep the current data.</p>
    </section>

    <div class="grid g-2" style="margin-top:16px">
      <section class="card"><div class="card-head"><h2>Automatic backup</h2>
        <label class="switch right"><input type="checkbox" checked><span class="slider" aria-hidden="true"></span><span class="sr-only">Automatic backup</span></label></div>
        <div class="field"><label for="bf">How often</label><select id="bf"><option>Daily</option><option>After every change</option><option>Weekly</option><option>Only when I tap Back up now</option></select></div>
        <div class="field"><label for="bd">Where</label><select id="bd"><option>This device (.zip)</option><option>Google Drive</option><option>OneDrive</option><option>All connected places</option></select></div>
        <div class="field"><label for="bk">Keep</label><select id="bk"><option>Last 5 backups</option><option>Last 10 backups</option><option>All backups</option></select></div>
        <label class="checkline"><input type="checkbox" checked> Only on Wi-Fi (saves offshore data allowance)</label>
        <label class="checkline"><input type="checkbox"> Remind me if there's no backup for 7 days</label>
      </section>
      <section class="card"><h2>What's in a backup</h2>
        <ul class="list small">
          <li><span>✅</span><div class="grow">Routes and activities, plans, codes and notes</div></li>
          <li><span>✅</span><div class="grow">Evidence files (photos, logs, written products)</div></li>
          <li><span>✅</span><div class="grow">Signatures and the audit trail</div></li>
          <li><span>✅</span><div class="grow">Settings and the loaded criteria packs</div></li>
        </ul>
        <p class="tiny muted">The backup holds your evidence, so keep it somewhere private. Check that client data is allowed to leave the vessel before backing up to the cloud.</p>
        <h3 style="margin-top:12px">Recent backups</h3>
        <ul class="list small">
          <li><span>📱</span><div class="grow">Today 16:42 · this device<div class="tiny muted">48 MB</div></div><button class="btn sm" data-toast="${NC}">Restore</button></li>
          <li><span>📱</span><div class="grow">16 Oct 23:58 · this device<div class="tiny muted">46 MB</div></div><button class="btn sm" data-toast="${NC}">Restore</button></li>
          <li><span>📱</span><div class="grow">15 Oct 23:57 · this device<div class="tiny muted">45 MB</div></div><button class="btn sm" data-toast="${NC}">Restore</button></li>
        </ul>
      </section>
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
