// tools/shot-session.mjs — скриншот панели сессии рассказчика в хорошем качестве (для описания и релиза).
// Запуск: node tools/shot-session.mjs [папка]; нужен запущенный мир на localhost:30002 и свободный вход рассказчика.
// Заводит временных персонажей игрока с разными запасами и состояниями (флаг world.e2e), снимает окно и удаляет их.
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

await page.evaluate(async () => {
  const pl = game.users.find(u => !u.isGM), own = pl ? { [pl.id]: 3 } : {};
  const mk = async (name, type, system, statuses = []) => {
    const a = await Actor.create({ name, type, ownership: own, flags: { world: { e2e: true }, [game.system.id]: { created: true } }, system });
    for (const s of statuses) await a.toggleStatusEffect(s, { active: true });
    return a;
  };
  await mk("Жюльен де Бресси", "vampire", { blood: { value: 2 }, willpower: { permanent: 6, temporary: 4 }, health: { lethal: 2 } }, ["r-frenzy"]);
  await mk("Мари Лабрюйер", "vampire", { blood: { value: 9 }, willpower: { permanent: 5, temporary: 5 } });
  await mk("Рвущий-Тишину", "werewolf", { willpower: { permanent: 5, temporary: 2 }, werewolf: { rage: { permanent: 6, value: 6 }, gnosis: { permanent: 4, value: 1 } }, health: { aggravated: 1, lethal: 4 } }, ["r-harano"]);
  await mk("Сестра Агата", "hunter", { willpower: { permanent: 4, temporary: 4 }, hunter: { conviction: 2, mercy: 3 } });
  await mk("Абаддон-из-Пепла", "demon", { willpower: { permanent: 5, temporary: 5 }, faith: { permanent: 4, temporary: 4 } }, ["r-held"]);
  document.querySelectorAll(".notification").forEach(n => n.remove()); ui.notifications?.clear?.();
  const app = game.vtm20.openSessionPanel();
  await new Promise(r => setTimeout(r, 600));
  app.setPosition({ left: 40, top: 30, width: 980, height: 520 });
  await app.render();
  document.querySelectorAll(".notification").forEach(n => n.remove());
});
await page.waitForTimeout(1200);
await page.locator("#r-session-panel").screenshot({ path: path.join(out, "session-panel.png") });
await page.evaluate(async () => {
  foundry.applications.instances.get("r-session-panel")?.close();
  const temp = game.actors.filter(x => x.getFlag("world", "e2e")).map(x => x.id);
  if (temp.length) await Actor.deleteDocuments(temp);
});
await browser.close();
console.log("ok", path.join(out, "session-panel.png"));
