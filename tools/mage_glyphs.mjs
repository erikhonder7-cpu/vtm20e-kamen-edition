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
  "group-traditions": "Фракции/CouncilofNine", "group-technocracy": "Фракции/Faction-Technocracy", "group-marauders": "Фракции/SectMarauder", "group-nephandi": "Фракции/SectNephandi",
  "sphere-correspondence": "Сферы/Связи/SphereCorrespondence", "sphere-entropy": "Сферы/Энтропия/SphereEntropy", "sphere-forces": "Сферы/Силы/SphereForces",
  "sphere-life": "Сферы/Жизнь/SphereLife", "sphere-matter": "Сферы/Материя/SphereMatter", "sphere-mind": "Сферы/Разум/SphereMind",
  "sphere-prime": "Сферы/Основы/SpherePrime", "sphere-spirit": "Сферы/Дух/SphereSpirit", "sphere-time": "Сферы/Время/SphereTime", "sphere-telos": "Сферы/Телос/SphereTelos"
};
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
for (const [name, rel] of Object.entries(MAP)) {
  const file = path.join(SRC, rel + ".webp");
  if (!fs.existsSync(file)) { console.log("НЕТ", rel); continue; }
  const url = "data:image/webp;base64," + fs.readFileSync(file).toString("base64");
  const res = await p.evaluate(async url => {
    const img = new Image(); img.src = url; await img.decode();
    const S = 256, pad = 6, c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d"), k = Math.min((S - 2 * pad) / img.width, (S - 2 * pad) / img.height), w = img.width * k, h = img.height * k;
    g.imageSmoothingQuality = "high"; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    const d = g.getImageData(0, 0, S, S), px = d.data; let dark = 0, lightOpaque = 0;
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114), a = px[i + 3]; if (a > 128 && l < 96) dark++; if (a > 128 && l > 200) lightOpaque++; }
    // знак — тёмное; белый фон — в прозрачность
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114); const a = Math.round((255 - l) * px[i + 3] / 255); px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a; }
    g.putImageData(d, 0, 0);
    return { png: c.toDataURL("image/png"), dark, lightOpaque };
  }, url);
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
