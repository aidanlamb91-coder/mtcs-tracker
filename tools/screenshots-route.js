// Phone screenshots of the opening screen and backup screen. Usage: NODE_PATH=<playwright dir> node tools/screenshots-route.js [baseUrl]
const { chromium } = require("playwright");
const base = process.argv[2] || "file://" + require("path").resolve(__dirname, "../index.html");
const out = __dirname + "/../screenshots/";
const shots = [
  ["10-opening-route-chooser-phone", "#/"],
  ["11-opening-surveyor-expanded-phone", "#/?role=surveyor&grade=G2"],
  ["12-opening-g1-coming-soon-phone", "#/?role=surveyor&grade=G1"],
  ["13-backup-restore-phone", "#/backup"]];
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  for (const [name, hash] of shots) {
    await p.goto(base + hash); await p.waitForTimeout(300);
    if (name.startsWith("11")) await p.evaluate(() => document.querySelector(".role-card.open").scrollIntoView({ block: "start" }));
    await p.screenshot({ path: out + name + ".png" });
    await p.screenshot({ path: out + name + "-full.png", fullPage: true });
  }
  // Click-through: role tap, grade tap, Open portfolio, G1 preview banner, header backup chip, toast
  await p.goto(base + "#/"); await p.waitForTimeout(200);
  await p.click(".role-card:nth-child(3) .role-head"); await p.waitForTimeout(150);
  const dpOpen = await p.$(".role-card.open .grade-seg"); 
  await p.click(".role-card:nth-child(1) .role-head"); await p.click("[data-href='#/?role=surveyor&grade=G1']"); await p.waitForTimeout(150);
  await p.click("[data-open='surveyor|G1']"); await p.waitForTimeout(200);
  const banner = await p.$eval(".preview-banner", e => e.textContent).catch(() => null);
  await p.screenshot({ path: out + "14-g1-preview-dashboard-phone.png" });
  await p.click(".backup-chip"); await p.waitForTimeout(150);
  const onBackup = await p.$eval("h1", e => e.textContent);
  await p.click("text=Save backup to this device (.zip)"); await p.waitForTimeout(100);
  const toast = await p.$eval(".toast", e => e.textContent).catch(() => null);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(JSON.stringify({ dpExpanded: !!dpOpen, banner, onBackup, toast, horizontalOverflow: ov }));
  await b.close();
  console.log(errs.length ? "ERRORS:\n" + errs.join("\n") : "no console errors");
})();
