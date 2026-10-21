/* MTCS Tracker Beta v0.2.16 — Google Drive / OneDrive backup (port of AS Forms web js/cloud.js, manual backups only).
 * What: the same full-backup .zip that "Back up now" downloads, saved as MTCS-Tracker-backup.zip in
 *   Google Drive: a visible "MTCS Tracker" folder in My Drive (scope drive.file = the app only sees files it made).
 *   OneDrive:     the app's own folder, Apps / MTCS Tracker (Graph special folder "approot").
 * Sign-in: full-page redirect back to this page. Google (v0.2.25 "connect once"): authorisation code + PKCE; the
 *   mtcs-forms-fetch Worker holds the client secret and swaps the code / refreshes. The device keeps only a sealed
 *   refresh token (encrypted by the Worker, useless without it). If the Worker is unreachable we fall back to the old
 *   browser token flow (response_type=token, ~1 h).
 *   OneDrive: code + PKCE (S256), refresh token kept so backups keep working without signing in again.
 * Tokens are kept in this browser's localStorage only and never leave it except to Google/Microsoft. */
(function (global) {
  const CFG = () => global.MtcsCloudConfig;
  const STATE_KEY = "mtcs.cloud", PENDING_KEY = "mtcs.cloud.pending";
  const FOLDER_NAME = "MTCS Tracker", ZIP_NAME = "MTCS-Tracker-backup.zip";
  const KINDS = { google: { label: "Google Drive" }, onedrive: { label: "OneDrive" } };
  const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";
  const ONEDRIVE_SCOPES = "Files.ReadWrite User.Read offline_access";
  const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
  const MS_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
  const GRAPH = "https://graph.microsoft.com/v1.0", DRIVE = "https://www.googleapis.com/drive/v3", DRIVE_UP = "https://www.googleapis.com/upload/drive/v3";
  const EARLY_MS = 5 * 60 * 1000;

  const load = () => { try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null") || {}; } catch (_) { return {}; } };
  const listeners = new Set();
  function save(patch) { const n = { ...load(), ...patch }; localStorage.setItem(STATE_KEY, JSON.stringify(n)); emit(); return n; }
  function emit() { listeners.forEach(fn => { try { fn(status()); } catch (e) { console.error(e); } }); }
  let busy = false;
  function status() {
    const s = load();
    return { silent: !!s.grt || s.kind === "onedrive", connected: !!s.kind, kind: s.kind || null, label: s.kind ? KINDS[s.kind].label : null, email: s.email || "",
      folderName: s.kind === "onedrive" ? "Apps / MTCS Tracker" : FOLDER_NAME, lastBackupAt: s.lastBackupAt || null,
      cloudSize: s.cloudSize ?? null, cloudUpdatedAt: s.cloudUpdatedAt || null, needsSignIn: !!s.needsSignIn, busy, lastError: s.lastError || null };
  }

  // ——— PKCE ———
  const b64url = bytes => { let s = ""; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const randomString = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); };
  async function challengeFor(v) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)); return b64url(new Uint8Array(d)); }

  /** Build the authorise URL and remember what we were doing. Returns { url, pending } (does not navigate). */
  async function buildAuthUrl(kind, mode, resume, opts) {
    if (!CFG().isConfigured(kind)) throw new Error("Cloud sign-in is not set up yet for " + KINDS[kind].label + ".");
    const state = randomString(16), redirect = CFG().redirectUri();
    const pending = { kind, state, mode: mode || "connect", resume: resume || null, back: global.location.hash || "#/more", at: Date.now() };
    let url;
    if (kind === "google") {
      const useCode = (opts && opts.legacy) ? false : await workerOk();
      const p = new URLSearchParams({ client_id: CFG().config.googleClientId, redirect_uri: redirect, response_type: useCode ? "code" : "token", scope: GOOGLE_SCOPES, include_granted_scopes: "true", state });
      if (useCode) { pending.verifier = randomString(48); pending.flow = "code"; p.set("code_challenge", await challengeFor(pending.verifier)); p.set("code_challenge_method", "S256"); p.set("access_type", "offline"); }
      const s0 = load(); if (s0.email && /@/.test(s0.email)) p.set("login_hint", s0.email);
      if (mode === "renew" && !useCode) p.set("prompt", "none"); else p.set("prompt", useCode ? "consent select_account" : "select_account");
      url = GOOGLE_AUTH + "?" + p;
    } else {
      pending.verifier = randomString(48);
      const p = new URLSearchParams({ client_id: CFG().config.oneDriveClientId, redirect_uri: redirect, response_type: "code", response_mode: "query", scope: ONEDRIVE_SCOPES, code_challenge: await challengeFor(pending.verifier), code_challenge_method: "S256", state, prompt: "select_account" });
      url = MS_AUTH + "/authorize?" + p;
    }
    return { url, pending };
  }
  const WORKER = () => (CFG().config.workerBase || "").replace(/\/$/, "");
  let workerSeen = null;
  async function workerOk() { if (workerSeen !== null) return workerSeen; if (!WORKER()) return (workerSeen = false);
    try { const r = await fetch(WORKER() + "/google/health", { method: "GET" }); const j = await r.json().catch(() => ({})); workerSeen = r.ok && !!j.google; } catch (_) { workerSeen = false; } return workerSeen; }
  async function workerPost(path, body) { const r = await fetch(WORKER() + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; }
  async function startSignIn(kind, mode, resume, opts) {
    const { url, pending } = await buildAuthUrl(kind, mode, resume, opts);
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    global.location.assign(url);
    return new Promise(() => {});
  }

  /** Grab ?code=… / #access_token=… before the app's hash router sees it, then tidy the address bar. */
  let landed = null;
  function captureRedirect() {
    try {
      const loc = global.location, q = new URLSearchParams(loc.search), h = new URLSearchParams((loc.hash || "").replace(/^#/, ""));
      const src = (h.get("access_token") || (h.get("error") && h.get("state"))) ? h : (q.get("code") || (q.get("error") && q.get("state"))) ? q : null;
      if (!src) return null;
      const out = {}; src.forEach((v, k) => { out[k] = v; });
      let back = "#/more"; try { const pd = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); if (pd && /^#\//.test(pd.back || "")) back = pd.back; } catch (_) {}
      history.replaceState(history.state, "", loc.pathname + back);
      return out;
    } catch (_) { return null; }
  }
  landed = captureRedirect();

  async function postForm(url, params) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
    return { status: res.status, body: await res.text() };
  }

  /** Finish a sign-in that just came back. null | { kind, mode, resume, cloudHasData, error } */
  async function completeRedirect() {
    if (!landed) return null;
    const L = landed; landed = null;
    let pending = null; try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch (_) {}
    localStorage.removeItem(PENDING_KEY);
    if (!pending || pending.state !== L.state) return { error: "Sign-in could not be checked — try Connect again." };
    const kind = pending.kind, now = Date.now();
    if (L.error) {
      if (pending.mode === "renew") { save({ needsSignIn: true }); return { kind, mode: pending.mode, error: "Sign in again to continue." }; }
      return { kind, mode: pending.mode, error: L.error === "access_denied" ? "Sign-in cancelled." : "Sign-in failed (" + L.error + ")." };
    }
    if (kind === "google" && pending.flow === "code") {
      let r; try { r = await workerPost("/google/token", { code: L.code, code_verifier: pending.verifier, redirect_uri: CFG().redirectUri() }); } catch (e) { r = { status: 0, j: {} }; }
      if (r.status !== 200 || !r.j.access_token) return { kind, mode: pending.mode, error: "Google sign-in failed" + (r.j.error ? " (" + r.j.error + ")" : "") + " — try Connect again." };
      save({ kind, access: r.j.access_token, expiresAt: now + (Number(r.j.expires_in) || 3600) * 1000, refresh: null, grt: r.j.sealed_refresh || null, needsSignIn: false, lastError: null });
    } else if (kind === "google") {
      save({ kind, access: L.access_token, expiresAt: now + (Number(L.expires_in) || 3600) * 1000, refresh: null, grt: null, needsSignIn: false, lastError: null });
    } else {
      const r = await postForm(MS_AUTH + "/token", { client_id: CFG().config.oneDriveClientId, grant_type: "authorization_code", code: L.code, redirect_uri: CFG().redirectUri(), code_verifier: pending.verifier, scope: ONEDRIVE_SCOPES });
      let j = {}; try { j = JSON.parse(r.body); } catch (_) {}
      if (r.status !== 200 || !j.access_token) return { kind, mode: pending.mode, error: "OneDrive sign-in failed" + (j.error_description ? ": " + String(j.error_description).split("\n")[0] : "") };
      save({ kind, access: j.access_token, refresh: j.refresh_token || null, expiresAt: now + (Number(j.expires_in) || 3600) * 1000, needsSignIn: false, lastError: null });
    }
    let cloudHasData = null;
    try {
      const p = provider(); const email = await p.email(); const f = await p.ensureFolder();
      save({ email, folderId: f.id });
      const zip = (await p.list(f.id)).find(x => x.name === ZIP_NAME);
      if (zip) { save({ cloudSize: zip.size, cloudUpdatedAt: zip.modified }); if (pending.mode === "connect") cloudHasData = { size: zip.size, modified: zip.modified }; }
    } catch (e) { save({ lastError: friendly(e) }); }
    return { kind, mode: pending.mode, resume: pending.resume, cloudHasData, error: null };
  }

  // ——— Tokens ———
  class SignInRequired extends Error { constructor() { super("Sign-in has expired"); } }
  class Unauthorized extends Error {}
  async function token(force) {
    const s = load(), now = Date.now();
    if (!force && s.access && !(s.expiresAt && s.expiresAt <= now + EARLY_MS)) return s.access;
    if (s.kind === "google") {
      if (s.grt) { /* v0.2.25: silent renewal through the Worker */
        let r; try { r = await workerPost("/google/refresh", { sealed_refresh: s.grt }); } catch (e) { throw new Error("Network error while renewing sign-in"); }
        if (r.status === 200 && r.j.access_token) { save({ access: r.j.access_token, grt: r.j.sealed_refresh || s.grt, expiresAt: now + (Number(r.j.expires_in) || 3600) * 1000, needsSignIn: false }); return r.j.access_token; }
        if (r.status === 400 || r.status === 401) { save({ grt: null, needsSignIn: true }); throw new SignInRequired(); }
        throw new Error("Sign-in renewal failed (HTTP " + r.status + ")");
      }
      /* old token flow: never jump to Google in the middle of an automatic backup */
      if (!interactive) { save({ needsSignIn: true }); throw new SignInRequired(); }
      await startSignIn("google", "renew", resumeFor); throw new SignInRequired(); }
    if (!s.refresh) throw new SignInRequired();
    let r; try { r = await postForm(MS_AUTH + "/token", { client_id: CFG().config.oneDriveClientId, grant_type: "refresh_token", refresh_token: s.refresh, scope: ONEDRIVE_SCOPES }); }
    catch (e) { throw new Error("Network error while renewing sign-in"); }
    let j = {}; try { j = JSON.parse(r.body); } catch (_) {}
    if (r.status === 200 && j.access_token) { save({ access: j.access_token, refresh: j.refresh_token || s.refresh, expiresAt: now + (Number(j.expires_in) || 3600) * 1000, needsSignIn: false }); return j.access_token; }
    if (/invalid_grant|interaction_required|login_required|consent_required/i.test(r.body)) throw new SignInRequired();
    throw new Error("Sign-in renewal failed (HTTP " + r.status + ")");
  }
  let resumeFor = null, interactive = true;
  async function api(url, init, as) {
    const call = async tok => {
      const res = await fetch(url, { ...(init || {}), headers: { ...((init && init.headers) || {}), Authorization: "Bearer " + tok } });
      if (res.status === 401) throw new Unauthorized("HTTP 401");
      if (!res.ok) { const e = new Error(cloudMessage(res.status, await res.text())); e.status = res.status; throw e; }
      if (as === "raw") return res; if (as === "blob") return res.blob(); if (res.status === 204) return null;
      const t = await res.text(); return t ? JSON.parse(t) : null;
    };
    try { return await call(await token(false)); }
    catch (e) { if (!(e instanceof Unauthorized)) throw e; try { return await call(await token(true)); } catch (e2) { if (e2 instanceof Unauthorized) throw new SignInRequired(); throw e2; } }
  }
  function cloudMessage(st, body) {
    if (st === 507 || /quota|insufficientStorage|storageQuotaExceeded/i.test(body)) return "Cloud storage is full — free some space, then try again.";
    if (st === 403) return "The cloud refused access (403). Disconnect and connect again.";
    if (st === 429 || st >= 500) return "The cloud is busy — try again shortly.";
    return "Cloud error (HTTP " + st + ").";
  }

  // ——— Providers ———
  const google = {
    async email() { const j = await api(DRIVE + "/about?fields=user(emailAddress,displayName)"); return (j && j.user && (j.user.emailAddress || j.user.displayName)) || "Google account"; },
    async ensureFolder() {
      const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='" + FOLDER_NAME + "' and trashed=false");
      const found = await api(DRIVE + "/files?q=" + q + "&spaces=drive&fields=files(id,name)&pageSize=25&orderBy=createdTime");
      const files = (found && found.files) || []; if (files.length) return { id: files[files.length - 1].id };
      const made = await api(DRIVE + "/files?fields=id,name", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }) });
      return { id: made.id };
    },
    async list(folderId) {
      const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
      const j = await api(DRIVE + "/files?q=" + q + "&spaces=drive&fields=files(id,name,size,modifiedTime)&pageSize=200");
      return ((j && j.files) || []).map(f => ({ id: f.id, name: f.name, size: Number(f.size) || 0, modified: Date.parse(f.modifiedTime) || 0 }));
    },
    read(id) { return api(DRIVE + "/files/" + encodeURIComponent(id) + "?alt=media", null, "blob"); },
    async write(folderId, blob, existingId) {
      const start = await api(existingId ? DRIVE_UP + "/files/" + encodeURIComponent(existingId) + "?uploadType=resumable&fields=id,size,modifiedTime" : DRIVE_UP + "/files?uploadType=resumable&fields=id,size,modifiedTime",
        { method: existingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/zip", "X-Upload-Content-Length": String(blob.size) },
          body: JSON.stringify(existingId ? { name: ZIP_NAME } : { name: ZIP_NAME, parents: [folderId], mimeType: "application/zip" }) }, "raw");
      const where = start.headers.get("Location"); if (!where) throw new Error("Google Drive did not return an upload address.");
      const res = await fetch(where, { method: "PUT", headers: { "Content-Type": "application/zip" }, body: await blob.arrayBuffer() }); /* v0.2.18 Safari: send bytes, not a Blob */
      if (!res.ok) throw new Error(cloudMessage(res.status, await res.text()));
      const j = await res.json(); return { size: Number(j.size) || blob.size, modified: Date.parse(j.modifiedTime) || Date.now() };
    },
    async revoke(tok) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(tok), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }); } catch (_) {} },
  };
  const onedrive = {
    async email() { const j = await api(GRAPH + "/me?$select=userPrincipalName,mail,displayName"); return (j && (j.mail || j.userPrincipalName || j.displayName)) || "Microsoft account"; },
    async ensureFolder() { const root = await api(GRAPH + "/me/drive/special/approot?$select=id,name"); return { id: root.id }; },
    async list(folderId) {
      const j = await api(GRAPH + "/me/drive/items/" + folderId + "/children?$select=id,name,size,lastModifiedDateTime,file&$top=200");
      return ((j && j.value) || []).filter(f => f.file).map(f => ({ id: f.id, name: f.name, size: f.size || 0, modified: Date.parse(f.lastModifiedDateTime) || 0 }));
    },
    async read(id) { const meta = await api(GRAPH + "/me/drive/items/" + id + "?$select=id,@microsoft.graph.downloadUrl"); const res = await fetch(meta["@microsoft.graph.downloadUrl"]); if (!res.ok) throw new Error(cloudMessage(res.status, "")); return res.blob(); },
    async write(folderId, blob) {
      const path = GRAPH + "/me/drive/items/" + folderId + ":/" + encodeURIComponent(ZIP_NAME) + ":";
      if (blob.size <= 4 * 1024 * 1024) { const j = await api(path + "/content", { method: "PUT", headers: { "Content-Type": "application/zip" }, body: await blob.arrayBuffer() }); /* v0.2.18 Safari: send bytes, not a Blob */ return { size: j.size || blob.size, modified: Date.parse(j.lastModifiedDateTime) || Date.now() }; }
      const sess = await api(path + "/createUploadSession", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }) });
      const CHUNK = 320 * 1024 * 16; let last = null;
      for (let off = 0; off < blob.size; off += CHUNK) { const end = Math.min(off + CHUNK, blob.size);
        const res = await fetch(sess.uploadUrl, { method: "PUT", headers: { "Content-Range": "bytes " + off + "-" + (end - 1) + "/" + blob.size }, body: await blob.slice(off, end).arrayBuffer() });
        if (!res.ok && res.status !== 202) throw new Error(cloudMessage(res.status, await res.text())); last = res; }
      const j = last && (last.status === 200 || last.status === 201) ? await last.json() : {}; return { size: j.size || blob.size, modified: Date.parse(j.lastModifiedDateTime) || Date.now() };
    },
    async revoke() {},
  };
  const provider = () => load().kind === "onedrive" ? onedrive : google;
  function friendly(e) {
    if (e instanceof SignInRequired) return (KINDS[load().kind || "google"] || KINDS.google).label + " sign-in has expired — tap Sign in again.";
    if (e instanceof TypeError || !navigator.onLine) return "You're offline — try again when you have a connection.";
    return (e && e.message) || String(e);
  }
  async function folderId() { const s = load(); if (s.folderId) return s.folderId; const f = await provider().ensureFolder(); save({ folderId: f.id }); return f.id; }

  /** Upload the given backup zip blob (the same file "Back up now" downloads). */
  async function backup(blob, opts) {
    const s = load(); if (!s.kind) return { error: "Not connected." }; if (busy) return { skipped: true };
    if (opts && opts.auto && s.needsSignIn) return { paused: true };
    if (!navigator.onLine) { save({ lastError: "You're offline — try again when you have a connection." }); return { offline: true, error: "You're offline." }; }
    busy = true; resumeFor = "backup"; interactive = !(opts && opts.auto); emit();
    try {
      const fid = await folderId(), p = provider();
      const existing = (await p.list(fid)).find(f => f.name === ZIP_NAME);
      const out = await p.write(fid, blob, existing && existing.id);
      save({ lastBackupAt: Date.now(), cloudSize: out.size, cloudUpdatedAt: out.modified, lastError: null, needsSignIn: false });
      return { ok: true, size: blob.size };
    } catch (e) { if (e instanceof SignInRequired) save({ needsSignIn: true }); const msg = friendly(e); save({ lastError: msg }); return { error: msg, signIn: e instanceof SignInRequired, offline: e instanceof TypeError || !navigator.onLine }; }
    finally { busy = false; resumeFor = null; interactive = true; emit(); }
  }
  /** Download the cloud backup zip (the caller shows the usual "Import this backup?" review). */
  async function download() {
    busy = true; resumeFor = "restore"; emit();
    try {
      const fid = await folderId(), p = provider(); const ref = (await p.list(fid)).find(f => f.name === ZIP_NAME);
      if (!ref) throw new Error("No " + ZIP_NAME + " in your " + status().label + " yet — back up first.");
      const blob = await p.read(ref.id); save({ cloudSize: ref.size, cloudUpdatedAt: ref.modified, lastError: null }); return { ok: true, blob };
    } catch (e) { if (e instanceof SignInRequired) save({ needsSignIn: true }); const msg = friendly(e); save({ lastError: msg }); return { error: msg }; }
    finally { busy = false; resumeFor = null; emit(); }
  }
  async function disconnect() { const s = load();
    if (s.kind === "google" && s.grt) { try { await workerPost("/google/revoke", { sealed_refresh: s.grt }); } catch (_) {} }
    else if (s.kind === "google" && s.access) await google.revoke(s.access);
    localStorage.removeItem(STATE_KEY); emit(); }

  global.MtcsCloud = { KINDS, FOLDER_NAME, ZIP_NAME, GOOGLE_SCOPES, ONEDRIVE_SCOPES, status, onChange: fn => (listeners.add(fn), () => listeners.delete(fn)),
    buildAuthUrl, startSignIn, completeRedirect, workerOk, backup, download, disconnect, friendly, _internal: { load, save, challengeFor, b64url, hasLanded: () => !!landed } };
})(window);
