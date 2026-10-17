// Usage: NODE_PATH=<dir with playwright> node tools/screenshots.js [baseUrl]
const { chromium } = require("playwright");
const base = process.argv[2] || "http://127.0.0.1:8765/index.html";
const out = __dirname + "/../screenshots/";
const desktop = [
  ["01-dashboard", "#/"], ["02-activity-workspace", "#/activity/2"], ["02b-send-to-assessor", "#/activity/2?modal=send"],
  ["03-coverage-matrix", "#/matrix"], ["04-criterion-drawer", "#/matrix?c=S09d"], ["05-evidence-library", "#/evidence"],
  ["06-assessor-link-desktop", "#/assessor/2"], ["07-witness-link-desktop", "#/witness/1"], ["08-export", "#/export"], ["09-settings-packs", "#/settings"]];
const phone = [["06-assessor-link-phone", "#/assessor/2"], ["07-witness-link-phone", "#/witness/1"], ["01-dashboard-phone", "#/"], ["04-criterion-drawer-phone", "#/matrix?c=S08f"]];
(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function shoot(list, vp, suffix, full) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: suffix ? 2 : 1 });
    const p = await ctx.newPage();
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    for (const [name, hash] of list) {
      await p.goto(base + hash); await p.waitForTimeout(250);
      await p.screenshot({ path: out + name + ".png", fullPage: false });
      if (full) await p.screenshot({ path: out + name + "-full.png", fullPage: true });
    }
    await ctx.close();
  }
  await shoot(desktop, { width: 1440, height: 900 }, "", false);
  await shoot(phone, { width: 390, height: 844 }, "phone", true);
  await b.close();
  console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
})();
