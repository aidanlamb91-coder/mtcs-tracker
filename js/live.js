/* MTCS Tracker live activity rooms (Beta 0.2.30). Talks to the mtcs-live Worker (EU Durable Objects).
   Everything sent is AES-GCM encrypted in the browser with a per-invite key that only travels in the
   invite link fragment (#...), so the relay never sees plan text, answers or names. */
(function (global) {
  "use strict";
  const DEFAULT_BASE = "https://mtcs-live.aidanlamb91.workers.dev";
  const BASE = () => { try { const o = localStorage.getItem("mtcs.qa.liveBase"); if (o && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return o; } catch (e) {} return DEFAULT_BASE; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64u = (s) => { s = String(s || "").replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const sha = async (x) => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof x === "string" ? enc.encode(x) : x));
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function newCode() { const r = crypto.getRandomValues(new Uint8Array(6)); return [...r].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join(""); }
  function newKey() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }
  const keyCache = new Map();
  async function aes(k) { if (!keyCache.has(k)) keyCache.set(k, await crypto.subtle.importKey("raw", unb64u(k), "AES-GCM", false, ["encrypt", "decrypt"])); return keyCache.get(k); }
  async function seal(k, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(k), enc.encode(JSON.stringify(obj)))); const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64u(out); }
  async function open(k, s) { const a = unb64u(s); return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: a.slice(0, 12) }, await aes(k), a.slice(12)))); }

  async function api(roomId, path, opt) {
    opt = opt || {};
    const url = BASE() + (roomId ? "/rooms/" + roomId + (path || "") : path);
    let r;
    try { r = await fetch(url, { method: opt.method || "GET", headers: Object.assign({ "Content-Type": "application/json" }, opt.auth ? { Authorization: opt.auth } : {}), body: opt.body ? JSON.stringify(opt.body) : undefined, cache: "no-store" }); }
    catch (e) { return { ok: false, offline: true, error: "Can't reach the live service — check your connection." }; }
    let j = {}; try { j = await r.json(); } catch (e) {}
    return Object.assign({ ok: r.ok, status: r.status }, j, r.ok ? {} : { error: j.error || "Live service error " + r.status });
  }
  const createRoom = () => api(null, "/rooms", { method: "POST" });

  // --- passkeys ---------------------------------------------------------------
  const passkeysSupported = () => !!(global.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  // Checks the phone code first (server counts tries), then creates the passkey. Returns {fields} or {error}.
  async function registerPasskey(roomId, code, displayName, role) {
    const ch = await api(roomId, "/challenge", { method: "POST", body: { code } }); if (!ch.ok) return ch;
    let cred; try { cred = await navigator.credentials.create({ publicKey: {
      challenge: unb64u(ch.challenge), rp: { name: "MTCS Tracker", id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "MTCS " + role + " · " + roomId.slice(0, 6), displayName: displayName || "MTCS " + role },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" }, attestation: "none", timeout: 180000 } }); } catch (e) { return { ok: false, error: "Passkey not created (" + (e && e.name || "cancelled") + "). Try again." }; }
    const resp = cred.response;
    if (!resp.getPublicKey) return { ok: false, error: "This browser can't create a passkey for this app. Update it, or use Safari / Chrome / Edge." };
    return { ok: true, credId: b64u(cred.rawId), publicKey: b64u(resp.getPublicKey()), alg: resp.getPublicKeyAlgorithm(), clientDataJSON: b64u(resp.clientDataJSON) };
  }
  async function assertPasskey(credId, challengeBytes) {
    const cred = await navigator.credentials.get({ publicKey: { challenge: challengeBytes, rpId: location.hostname, allowCredentials: [{ type: "public-key", id: unb64u(credId) }], userVerification: "preferred", timeout: 180000 } });
    const r = cred.response;
    return { credId: b64u(cred.rawId), authenticatorData: b64u(r.authenticatorData), clientDataJSON: b64u(r.clientDataJSON), signature: b64u(r.signature) };
  }
  async function login(roomId, credId) {
    const ch = await api(roomId, "/challenge", { method: "POST" }); if (!ch.ok) return ch;
    let a; try { a = await assertPasskey(credId, unb64u(ch.challenge)); } catch (e) { return { ok: false, error: "Passkey cancelled or not available on this device." }; }
    return api(roomId, "/login", { method: "POST", body: a });
  }
  // Verify a passkey assertion locally (used by the candidate for signed operations). Mirrors the Worker.
  function derToRaw(der) { let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f; const rd = () => { if (der[i++] !== 2) throw new Error("bad sig"); const len = der[i++]; let v = der.slice(i, i + len); i += len; while (v.length > 32 && v[0] === 0) v = v.slice(1); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; }; const r = rd(), s = rd(); const out = new Uint8Array(64); out.set(r); out.set(s, 32); return out; }
  async function verifyAssertion(cred, a, expectChallenge) {
    try {
      const cdj = unb64u(a.clientDataJSON), cd = JSON.parse(dec.decode(cdj));
      if (cd.type !== "webauthn.get" || cd.challenge !== expectChallenge || cd.origin !== location.origin || a.credId !== cred.id) return false;
      const ad = unb64u(a.authenticatorData), rp = await sha(location.hostname);
      if (ad.length < 37 || rp.some((x, i) => x !== ad[i]) || !(ad[32] & 1)) return false;
      const data = new Uint8Array(ad.length + 32); data.set(ad); data.set(await sha(cdj), ad.length);
      const spki = unb64u(cred.pk);
      if (cred.alg === -7) { const k = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]); return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derToRaw(unb64u(a.signature)), data); }
      if (cred.alg === -257) { const k = await crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]); return crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, unb64u(a.signature), data); }
    } catch (e) {}
    return false;
  }

  // --- live connection: WebSocket with polling fallback -------------------------
  // onEvent({t:"op"|"state"|"info"|"gone"}), onStatus("live"|"polling"|"offline")
  function connect(roomId, token, kind, onEvent, onStatus) {
    let ws = null, closed = false, timer = null, fails = 0, poll = null, ping = null;
    const status = (s) => { try { onStatus && onStatus(s); } catch (e) {} };
    function startPolling() { if (poll || closed) return; status(navigator.onLine === false ? "offline" : "polling"); poll = setInterval(() => { if (!closed) onEvent({ t: "poll" }); }, 30000); }
    function open() {
      if (closed) return;
      try { ws = new WebSocket(BASE().replace(/^http/, "ws") + "/rooms/" + roomId + "/ws", ["mtcs", (kind === "owner" ? "o." : "s.") + token]); } catch (e) { fails++; startPolling(); return; }
      ws.onopen = () => { fails = 0; if (poll) { clearInterval(poll); poll = null; } status("live"); onEvent({ t: "open" }); ping = setInterval(() => { try { ws.send("ping"); } catch (e) {} }, 25000); };
      ws.onmessage = (e) => { if (e.data === "pong") return; try { onEvent(JSON.parse(e.data)); } catch (x) {} };
      ws.onclose = (e) => { clearInterval(ping); ws = null; if (closed) return; if (e.code === 4410) { onEvent({ t: "gone" }); return; } fails++; if (fails >= 2) startPolling(); timer = setTimeout(open, Math.min(60000, 2000 * fails)); };
      ws.onerror = () => {};
    }
    open();
    return { close() { closed = true; clearTimeout(timer); clearInterval(poll); clearInterval(ping); try { ws && ws.close(1000); } catch (e) {} }, get live() { return !!(ws && ws.readyState === 1); } };
  }

  global.MtcsLive = { base: BASE, api, createRoom, newCode, newKey, seal, open, sha, b64u, unb64u, passkeysSupported, registerPasskey, assertPasskey, login, verifyAssertion, connect };
})(window);
