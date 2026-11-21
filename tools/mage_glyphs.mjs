// Официальные символы магов (webp, чёрное на белом или прозрачном) → маски PNG 256×256 в assets/mage. Запуск: node tools/mage_glyphs.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const SRC = "D:/Загрузки/маги", OUT = "assets/mage";
const MAP = {
  "faction-akashayana": "Традиции/LogoTradAkashicBrotherhood", "faction-celestial-chorus": "Традиции/LogoTradCelestialChorus",
  "faction-cult-of-ecstasy": "Традиции/LogoTradCultofEcstasy", "faction-dreamspeakers": "Традиции/LogoTradDreamspeakers",
  "faction-euthanatoi": "Традиции/LogoTradEuthanatos", "faction-order-of-hermes": "Традиции/LogoTradOrderofHermes",
  "faction-society-of-ether": "Традиции/LogoTradSonsofEther", "faction-verbena": "Традиции/LogoTradVerbena",
  "faction-virtual-adepts": "Традиции/PERFECTADEPTLOGO2.0",
  "faction-iteration-x": "Конвенции/LogoConvIterationX", "faction-new-world-order": "Конвенции/LogoConvNewWorldOrder",
  "faction-progenitors": "Конвенции/LogoConvProgenitors", "faction-syndicate": "Конвенции/LogoConvSyndicate", "faction-void-engineers": "Конвенции/LogoConvVoidEngineers",
  "faction-ahl-i-batin": "Диспирады/LogoM20AhliBatin", "faction-bata-a": "Диспирады/LogoCraftBataa", "faction-children-of-knowledge": "Диспирады/LogoCraftChildrenofKnowledge",
  "faction-hollow-ones": "Традиции/LogoTradHollowOnes", "faction-kopa-loei": "Диспирады/LogoCraftKopaLoei", "faction-ngoma": "Диспирады/LogoCraftNgoma",
  "faction-orphans": "Диспирады/LogoCraftOrphans", "faction-sisters-of-hippolyta": "Диспирады/LogoCraftSistersofHippolyta", "faction-taft-ni": "Диспирады/LogoM20Taftani",
  "faction-templar-knights": "Диспирады/LogoCraftTemplars", "faction-wu-lung": "Диспирады/LogoCraftWuLung",
  ...Object.fromEntries(["Bonisagus", "ExMiscellanea", "Flambeau", "Fortunae", "Janissary", "Quaesitor", "Shaea", "Solificati", "Thig", "Tytalus", "Verditius"]
    .map(h => [`house-${h.replace("ExMiscellanea", "ex-miscellanea").toLowerCase()}`, `Дома Гермесистов/LogoHouse${h}`])),
  "group-traditions": "Фракции/CouncilofNine", "group-technocracy": "Фракции/Faction-Technocracy", "group-marauders": "Фракции/SectMarauder", "group-nephandi": "Фракции/SectNephandi",
  ...Object.fromEntries([["crombey-farm", "CrombeyFarm"], ["drachus-vachar", "DrachusVachar"], ["house-of-helekar", "HouseofHelekar"], ["lodge-of-the-gray-squirrel", "LodgeoftheGraySquirrel"],
    ["mecha", "MECHA"], ["maze-of-ebon-gates", "MazeofEbonGates"], ["null-b", "Null-B"], ["research-plantation-4", "ResearchPlantationNo4"], ["sepulcher", "Sepulcher"], ["vali-shallar", "ValiShallar"]]
    .map(([k, f]) => [`chantry-${k}`, `Chantries, Constructs, Labyrinths/Chantry${f}`])),
  "sphere-correspondence": "Сферы/Связи/SphereCorrespondence", "sphere-entropy": "Сферы/Энтропия/SphereEntropy", "sphere-forces": "Сферы/Силы/SphereForces",
  "sphere-life": "Сферы/Жизнь/SphereLife", "sphere-matter": "Сферы/Материя/SphereMatter", "sphere-mind": "Сферы/Разум/SphereMind",
  "sphere-prime": "Сферы/Основы/SpherePrime", "sphere-spirit": "Сферы/Дух/SphereSpirit", "sphere-time": "Сферы/Время/SphereTime", "sphere-telos": "Сферы/Телос/SphereTelos",
  // сплошные (Core) — для мелких мест: кружок Сферы на листе, мастер, чат; контурные тонкие штрихи там рассыпаются
  ...Object.fromEntries([["correspondence", "Связи", "Correspondence"], ["entropy", "Энтропия", "Entropy"], ["forces", "Силы", "Forces"], ["life", "Жизнь", "Life"],
    ["matter", "Материя", "Matter"], ["mind", "Разум", "Mind"], ["prime", "Основы", "Prime"], ["spirit", "Дух", "Spirit"], ["time", "Время", "Time"], ["telos", "Телос", "Telos"]]
    .map(([k, d, f]) => [`sphere-${k}-core`, `Сферы/${d}/SphereCore${f}`]))
};
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
for (const [name, rel] of Object.entries(MAP)) {
  const file = path.join(SRC, rel + ".webp");
  if (!fs.existsSync(file)) { console.log("НЕТ", rel); continue; }
  const url = "data:image/webp;base64," + fs.readFileSync(file).toString("base64");
  const res = await p.evaluate(async ([url, tight]) => {
    const img = new Image(); img.src = url; await img.decode();
    const S = 256, pad = 6, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d");
    // Сферы: исходники с разными полями — обрезать по самому знаку и вписать одинаково: широкий знак — во всю ширину,
    // квадратный — чуть меньше (вписан в скруглённый квадрат), чтобы в кружке листа все Сферы были одного веса и по центру
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (tight) {
      const t = document.createElement("canvas"); t.width = img.width; t.height = img.height;
      const tg = t.getContext("2d"); tg.drawImage(img, 0, 0);
      const px = tg.getImageData(0, 0, t.width, t.height).data;
      let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1;
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
        const i = (y * t.width + x) * 4, l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
        if (px[i + 3] > 40 && l < 160) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 >= 0) { sx = x0; sy = y0; sw = x1 - x0 + 1; sh = y1 - y0 + 1; }
    }
    const room = S - 2 * pad;
    let k = Math.min(room / sw, room / sh);
    if (tight) k = Math.min(k, room * 1.18 / Math.hypot(sw, sh));
    const w = sw * k, h = sh * k;
    g.imageSmoothingQuality = "high"; g.drawImage(img, sx, sy, sw, sh, (S - w) / 2, (S - h) / 2, w, h);
    const d = g.getImageData(0, 0, S, S), px = d.data; let dark = 0, lightOpaque = 0;
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114), a = px[i + 3]; if (a > 128 && l < 96) dark++; if (a > 128 && l > 200) lightOpaque++; }
    // знак — тёмное; белый фон — в прозрачность
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114); const a = Math.round((255 - l) * px[i + 3] / 255); px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a; }
    g.putImageData(d, 0, 0);
    // Сферы: оптическое центрирование — знак сдвигается к центру своего «веса» (центр масс непрозрачного) на 60%:
    // по рамке «Силы» и «Жизнь» тяжелее слева, «Дух» и «Соответствие» — снизу, и в кружке кажутся сдвинутыми.
    // Сдвиг не выводит знак за поле в pad/2.
    if (tight) {
      let sx2 = 0, sy2 = 0, sa = 0, x0 = S, y0 = S, x1 = 0, y1 = 0;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const a = px[(y * S + x) * 4 + 3] / 255; if (!a) continue;
        sx2 += x * a; sy2 += y * a; sa += a;
        if (a > .25) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      const lim = pad / 2;
      let dx = Math.round(-0.6 * (sx2 / sa - S / 2)), dy = Math.round(-0.6 * (sy2 / sa - S / 2));
      dx = Math.max(lim - x0, Math.min(S - 1 - lim - x1, dx)); dy = Math.max(lim - y0, Math.min(S - 1 - lim - y1, dy));
      if (dx || dy) {
        const c2 = document.createElement("canvas"); c2.width = c2.height = S;
        c2.getContext("2d").drawImage(c, dx, dy);
        return { png: c2.toDataURL("image/png"), dark, lightOpaque };
      }
    }
    return { png: c.toDataURL("image/png"), dark, lightOpaque };
  }, [url, name.startsWith("sphere-")]);
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(res.png.split(",")[1], "base64"));
  if (res.dark < 800) console.log("МАЛО ТЁМНОГО", name, res.dark, res.lightOpaque);
}
// контактный лист для проверки глазами
const names = Object.keys(MAP);
await p.setViewportSize({ width: 1300, height: 760 });
await p.setContent(`<body style="margin:0;background:#1a1626;display:grid;grid-template-columns:repeat(10,1fr);gap:6px;padding:8px;font:10px sans-serif;color:#cbb">${names.map(n =>
  `<div style="text-align:center"><div style="height:110px;background:linear-gradient(170deg,#efe3c0,#a58fd0);-webkit-mask:url(data:image/png;base64,${fs.readFileSync(path.join(OUT, n + ".png")).toString("base64")}) center/contain no-repeat"></div>${n.replace(/^(faction|sphere|group)-/, "")}</div>`).join("")}</body>`);
await p.screenshot({ path: "D:/ClaudeData/temp-claude/mage/sheet.png" });
await b.close(); console.log("ok", names.length);
