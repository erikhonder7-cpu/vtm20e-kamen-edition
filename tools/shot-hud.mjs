// tools/shot-hud.mjs — снимки HUD для разных типов персонажей (для описания, релиза и сравнения до/после).
// Запуск: node tools/shot-hud.mjs [папка] [приставка]; нужен запущенный мир на localhost:30002 и свободный вход рассказчика.
// Заводит временных персонажей (флаг world.e2e) с жетонами на текущей сцене, выделяет жетон, снимает HUD и всё удаляет.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.FVTT_URL ?? "http://localhost:30002", USER = process.env.FVTT_USER ?? "Gamemaster";
const out = process.argv[2] ?? "D:/ClaudeData/temp-claude/shots", pre = process.argv[3] ?? "hud";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
if (page.url().includes("/join")) { await page.selectOption("select[name=userid]", { label: USER }); await page.click("button[name=join]"); }
await page.waitForFunction(() => window.game?.ready === true && !!canvas?.scene, null, { timeout: 120000 });

const KINDS = [
  ["vampire", "Жюльен де Бресси", { blood: { value: 7 }, willpower: { permanent: 6, temporary: 4 }, health: { lethal: 2 } }],
  ["werewolf", "Рвущий-Тишину", { willpower: { permanent: 5, temporary: 3 }, werewolf: { rage: { permanent: 6, value: 4 }, gnosis: { permanent: 4, value: 3 }, form: "crinos" } }],
  ["demon", "Абаддон-из-Пепла", { willpower: { permanent: 5, temporary: 5 }, faith: { permanent: 4, temporary: 3 }, torment: { permanent: 4, temporary: 2 } }],
  ["hunter", "Сестра Агата", { willpower: { permanent: 4, temporary: 4 }, hunter: { conviction: 5, mercy: 3, creed: "redeemer" } }],
  ["ghoul", "Пьер-слуга", { willpower: { permanent: 4, temporary: 4 } }],
  ["mortal", "Мадлен Ферро", { willpower: { permanent: 3, temporary: 3 } }]
];
for (const [type, name, system] of KINDS) {
  await page.evaluate(async ([type, name, system]) => {
    for (const a of game.actors.filter(x => x.getFlag("world", "e2e"))) await a.delete();
    const a = await Actor.create({ name, type, flags: { world: { e2e: true }, [game.system.id]: { created: true } }, system });
    const [tk] = await canvas.scene.createEmbeddedDocuments("Token", [{ name, actorId: a.id, actorLink: true, x: 600, y: 400, texture: { src: a.img } }]);
    await new Promise(r => setTimeout(r, 600));
    canvas.tokens.get(tk.id)?.control({ releaseOthers: true });
    document.querySelectorAll(".notification").forEach(n => n.remove()); ui.notifications?.clear?.();
    await new Promise(r => setTimeout(r, 600));
  }, [type, name, system]);
  await page.waitForTimeout(500);
  // табличка с именем висит над рамкой HUD — снимаем с запасом сверху
  const box = await page.locator("#r-hud").boundingBox();
  await page.screenshot({ path: path.join(out, `${pre}-${type}.png`), clip: { x: box.x - 2, y: box.y - 32, width: box.width + 4, height: box.height + 36 } });
  await page.evaluate(async () => {
    for (const tk of canvas.scene.tokens.filter(t => game.actors.get(t.actorId)?.getFlag("world", "e2e"))) await tk.delete();
    for (const a of game.actors.filter(x => x.getFlag("world", "e2e"))) await a.delete();
  });
}
await browser.close();
console.log("ok", out);
