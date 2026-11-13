// tools/e2e-shots.mjs — снимки-сравнения окон: листы всех линеек и варианты подменыша (ликиец, Хсиен, инанимае, Тёмные века),
// вкладки подменыша, лист мотли, мастер создания, HUD, атласы линеек, библиотека, окно броска, карта города и стратегия.
// Каждый снимок сравнивается с эталоном (tools/.cache/shots/base/<имя>.png): доля заметно изменившихся точек больше порога — провал,
// рядом кладётся <имя>.diff.png (отличия подсвечены) и <имя>.new.png. Анимации, мигание курсора и часы на снимках отключены.
//
//   node tools/e2e-shots.mjs [--update] [--only имя,имя] [--url …] [--threshold 0.5]
//   --update — записать текущие снимки эталонами (после намеренной правки вида); без эталона снимок становится эталоном сам.
// Foundry (preview foundry-portable, порт 30002) должна быть запущена. Сравнение — в браузере (canvas), без сторонних библиотек.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const URL = arg("--url", "http://localhost:30002").replace(/\/$/, "");
const UPDATE = argv.includes("--update");
const ONLY = (arg("--only", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const THRESHOLD = Number(arg("--threshold", 0.5)) || 0.5;          // % точек, которым позволено отличаться
const DIR = path.join(ROOT, "tools/.cache/shots"), BASE = path.join(DIR, "base");
fs.mkdirSync(BASE, { recursive: true });

// что снимать: имя, тип актёра, данные, вкладка (или особый режим)
const SHEET = (type, system = {}, tab = "traits") => ({ type, system, tab });
const SUBJECTS = {
  "vampire": SHEET("vampire", { clan: "brujah", generation: 12, attributes: { strength: { value: 3 } } }),
  "ghoul": SHEET("ghoul", { ghoulType: "vassal" }),
  "revenant": SHEET("ghoul", { ghoulType: "revenant", family: "grimaldi" }),
  "dhampir": SHEET("ghoul", { ghoulType: "dhampir" }),
  "mortal": SHEET("mortal"),
  "hunter": SHEET("hunter", { hunter: { creed: "defense", conviction: 3 } }),
  "werewolf": SHEET("werewolf"),
  "mage": SHEET("mage", { mage: { arete: 2 } }),
  "wraith": SHEET("wraith"),
  "demon": SHEET("demon", { house: "devils" }),
  "changeling": SHEET("changeling", { changeling: { kith: "pooka", seeming: "wilder", court: "seelie", glamour: { permanent: 5, temporary: 3 }, banality: { permanent: 3, temporary: 1 },
    nightmare: 2, arts: { chicanery: 2, wayfare: 1 }, realms: { actor: 2, scene: 1 } } }),
  "changeling-arts": SHEET("changeling", { changeling: { kith: "troll", arts: { chicanery: 2 }, realms: { actor: 2 },
    treasures: [{ name: "Пергамент", art: "naming", level: 1, store: 2, text: "" }], oaths: [{ key: "clasped", with: "Брат", text: "", broken: false }] } }, "disciplines"),
  "motley": { type: "coterie", system: { kind: "motley", motley: { freehold: "Мельница", rating: 3, archetype: "workshop", size: 2, sanctuary: 1 } }, group: true },
  "creator-ghoul": { type: "ghoul", creator: true },
  "creator-changeling": { type: "changeling", creator: true },
  "hud-changeling": { type: "changeling", system: { changeling: { kith: "pooka", glamour: { permanent: 5, temporary: 4 }, nightmare: 2, arts: { chicanery: 2 } } }, hud: true },
  // варианты подменыша: шапка и вкладка «Искусства»
  "changeling-lykeian": SHEET("changeling", { changeling: { variant: "lykeian", lykeian: { guise: "oppidan", shape: "mythic", thesis: "Укрытие от бури",
    redes: [{ key: "pgtwoplacesatonce", pts: 2 }] } } }, "disciplines"),
  "changeling-hsien": SHEET("changeling", { changeling: { variant: "hsien", kith: "hsien-nyan", hsien: { yin: 2, yang: 4, yugen: 5, court: "liShen", schools: { houtan: 3, neitan: 2 } } } }, "disciplines"),
  "changeling-inanimae": SHEET("changeling", { changeling: { variant: "inanimae", kith: "inanimae-solimonds", inanimae: { court: "krofted", anchor: "Печь", slivers: { pyros: 3 } } } }, "disciplines"),
  "changeling-daf": SHEET("changeling", { changeling: { variant: "daf", daf: { origin: "firstborn", court: "summer", mists: { permanent: 4, temporary: 3 },
    weaving: { permanent: 2, temporary: 2 }, dominions: { day: 3, night: 1 }, cantrips: ["day:candorslight", "night:owleyes"] } } }, "disciplines"),
  // окна без листа: атласы, библиотека, окно броска, карта города и стратегия
  "atlas-changeling": { app: "atlas", line: "changeling" },
  "atlas-mage": { app: "atlas", line: "mage" },
  "atlas-wraith": { app: "atlas", line: "wraith" },
  "library-disciplines": { app: "library", kind: "discipline" },
  "roll-dialog": { app: "roll", type: "vampire", system: { attributes: { dexterity: { value: 3 } }, abilities: { brawl: { value: 2 } } } },
  "city-map": { app: "city", wait: 6000 },
  "strategy": { app: "strategy", wait: 6000 }
};
const names = Object.keys(SUBJECTS).filter(n => !ONLY.length || ONLY.includes(n));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`${URL}/join`, { waitUntil: "networkidle", timeout: 60000 });
if (page.url().includes("/join")) { await page.selectOption("select[name=userid]", { label: "Gamemaster" }); await page.click("button[name=join]"); }
await page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120000 });
// без анимаций, переходов, курсора и часов — снимки не зависят от момента
await page.addStyleTag({ content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  .r-sheet-foot, .r-foot, #r-clock, .r-cal-dial { visibility: hidden !important; } .notification, #notifications { display: none !important; }` });

let failed = 0;
for (const name of names) {
  const S = SUBJECTS[name];
  const sel = await page.evaluate(async ([name, S]) => {
    const sid = game.system.id, wait = ms => new Promise(r => setTimeout(r, ms));
    for (const x of game.actors.filter(a => a.name.startsWith("SHOT —"))) await x.delete();
    for (const w of [...foundry.applications.instances.values()]) if (w.rendered && w.id !== "r-hud" && w.options?.classes?.includes?.("vtm20")) { try { await w.close(); } catch {} }
    try { const C = await import(`/systems/${sid}/module/ui/citymap.mjs`); if (document.querySelector(".vtm20.r-city.open")) { C.closeCity(); await wait(900); } } catch {}
    // окна без листа персонажа
    if (S.app === "atlas") {
      const { openAtlas } = await import(`/systems/${sid}/module/apps/atlas.mjs`); const w = await openAtlas(S.line); await wait(1200);
      w.setPosition({ left: 10, top: 10, width: 1000, height: 760 }); await wait(400); return `#${w.id}`;
    }
    if (S.app === "library") {
      const { openLibrary } = await import(`/systems/${sid}/module/apps/library.mjs`); const w = openLibrary({ kind: S.kind }); await wait(1500);
      w.setPosition({ left: 10, top: 10, width: 1000, height: 760 }); await wait(400); return `#${w.id}`;
    }
    if (S.app === "city" || S.app === "strategy") {
      const M = await import(`/systems/${sid}/module/ui/${S.app === "city" ? "citymap" : "strategy"}.mjs`);
      await (S.app === "city" ? M.openCity() : M.openStrategy()); await wait(S.wait ?? 4000);
      return ".vtm20.r-city";
    }
    const a = await Actor.create({ name: `SHOT — ${name}`, type: S.type, img: `systems/${sid}/assets/icons/${S.type === "coterie" ? "changeling" : S.type}.svg`,
      flags: { [sid]: { created: !S.creator } }, system: S.system ?? {} });
    if (S.creator) {
      const { openCreator } = await import(`/systems/${sid}/module/apps/creator.mjs`); await openCreator(a); await wait(1200);
      const cr = [...foundry.applications.instances.values()].find(x => x.constructor.name === "VtMCreator" && x.actor === a);
      cr.setPosition({ left: 10, top: 10, width: 1260, height: 900 }); await wait(400);
      return `#${cr.id}`;
    }
    if (S.app === "roll") {
      const { RollDialog } = await import(`/systems/${sid}/module/dice/dialog.mjs`);
      const w = await RollDialog.prompt(a, { title: "SHOT", trait1: "attributes.dexterity", trait2: "abilities.brawl", difficulty: 6 }); await wait(800);
      return `#${w.id}`;
    }
    if (S.hud) {
      const H = await import(`/systems/${sid}/module/ui/hud.mjs`);
      await game.user.update({ character: a.id }); await wait(300); canvas.tokens?.releaseAll(); H.renderHud(); await wait(700);
      return "#r-hud";
    }
    await a.sheet.render({ force: true }); await wait(1000);
    a.sheet.setPosition({ left: 10, top: 10, width: S.group ? 900 : 1000, height: 900 });
    if (S.tab && a.sheet.changeTab) { a.sheet.changeTab(S.tab, "primary"); await wait(500); }
    a.sheet.element.querySelector(".window-content")?.scrollTo?.(0, 0);
    return `#${a.sheet.id}`;
  }, [name, S]);
  await page.waitForTimeout(500);
  const shot = await page.locator(sel).first().screenshot();
  const basePath = path.join(BASE, `${name}.png`);
  if (UPDATE || !fs.existsSync(basePath)) {
    fs.writeFileSync(basePath, shot);
    console.log(`◆ ${name}: эталон ${UPDATE ? "обновлён" : "создан"}`);
    continue;
  }
  // сравнение в браузере: точка «изменилась», если хоть один канал отличается больше чем на 40
  const res = await page.evaluate(async ([a64, b64]) => {
    const load = async b => { const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b}`)).blob()); return img; };
    const [A, B] = await Promise.all([load(a64), load(b64)]);
    const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
    const ctx = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = ctx(A), db = ctx(B), out = new OffscreenCanvas(w, h), ox = out.getContext("2d"), od = ox.createImageData(w, h);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > 40) { n++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 200; od.data[i + 3] = 255; }
      else { const g = (db[i] + db[i + 1] + db[i + 2]) / 3 * .35; od.data[i] = od.data[i + 1] = od.data[i + 2] = g; od.data[i + 3] = 255; }
    }
    ox.putImageData(od, 0, 0);
    const blob = await out.convertToBlob({ type: "image/png" }), buf = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { pct: n / (w * h) * 100, size: A.width === B.width && A.height === B.height, diff: btoa(s) };
  }, [fs.readFileSync(basePath).toString("base64"), shot.toString("base64")]);
  const bad = !res.size || res.pct > THRESHOLD;
  if (bad) {
    failed++;
    fs.writeFileSync(path.join(DIR, `${name}.new.png`), shot);
    fs.writeFileSync(path.join(DIR, `${name}.diff.png`), Buffer.from(res.diff, "base64"));
  }
  console.log(`${bad ? "✗" : "✓"} ${name}: отличий ${res.pct.toFixed(2)}%${res.size ? "" : " (другой размер)"}${bad ? ` — смотрите tools/.cache/shots/${name}.diff.png` : ""}`);
}
await page.evaluate(async () => {
  try { const C = await import(`/systems/${game.system.id}/module/ui/citymap.mjs`); C.closeCity(); } catch {}
  for (const w of [...foundry.applications.instances.values()]) if (w.rendered && w.id !== "r-hud" && w.options?.classes?.includes?.("vtm20")) { try { await w.close(); } catch {} }
  for (const x of game.actors.filter(a => a.name.startsWith("SHOT —"))) await x.delete();
  await game.user.update({ character: null });
});
await browser.close();
console.log(failed ? `\nИзменилось окон: ${failed}. Если так и задумано — node tools/e2e-shots.mjs --update` : "\nВсе окна как в эталоне.");
process.exit(failed ? 1 : 0);
