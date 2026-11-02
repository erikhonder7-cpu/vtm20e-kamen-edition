// tools/shot-npcgen.mjs — скриншоты генератора НПС в хорошем качестве (для описания и релиза).
// Запуск: node tools/shot-npcgen.mjs [папка]; нужен запущенный мир на localhost:30002 и свободный вход рассказчика.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.FVTT_URL ?? "http://localhost:30002", USER = process.env.FVTT_USER ?? "Gamemaster";
const out = process.argv[2] ?? "D:/ClaudeData/temp-claude/shots";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 940 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
if (page.url().includes("/join")) { await page.selectOption("select[name=userid]", { label: USER }); await page.click("button[name=join]"); }
await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
await page.evaluate(() => { document.querySelectorAll(".notification").forEach(n => n.remove()); ui.notifications?.clear?.(); });

/** Открыть генератор с условиями и снять окно. */
async function shot(file, setup) {
  await page.evaluate(async setup => {
    const app = foundry.applications.instances.get("r-npc-gen") ?? game.vtm20.openNpcGenerator();
    await new Promise(r => setTimeout(r, 400));
    Object.assign(app.ng, { kind: "vampire", role: "", sub: "", power: "normal", params: {}, name: "" }, setup);
    app.draft = null;
    await app.render({ force: true });
    app.setPosition({ left: 40, top: 30, width: 1200, height: 860 });
    document.querySelectorAll(".notification").forEach(n => n.remove());
  }, setup);
  await page.waitForTimeout(900);
  await page.locator("#r-npc-gen").screenshot({ path: path.join(out, file) });
}

await shot("npc-1-vampire.png", { kind: "vampire", role: "schemer", sub: "harpy", power: "veteran", params: { clan: "toreador", sect: "camarilla" } });
await shot("npc-2-garou.png", { kind: "garou", role: "brute", sub: "", power: "seasoned", params: { tribe: "getOfFenris", auspice: "ahroun" } });
await shot("npc-3-fera.png", { kind: "fera", role: "assassin", sub: "poisoner", power: "legend", params: { fera: "bastet" } });
await shot("npc-4-demon.png", { kind: "demon", role: "occultist", sub: "warlock", power: "veteran", params: {} });
await shot("npc-5-hunter.png", { kind: "hunter", role: "detective", sub: "cop", power: "normal", params: {} });
await shot("npc-6-spirit.png", { kind: "spirit", params: { spiritKind: "bane" } });
await page.evaluate(() => foundry.applications.instances.get("r-npc-gen")?.close());
await browser.close();
console.log("ok", out);
