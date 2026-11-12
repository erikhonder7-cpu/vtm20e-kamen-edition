// Знаки призраков от пользователя (webp, чёрное на белом или прозрачном) → маски PNG 256×256 в assets/wraith:
// arcanos-<ключ Арканоса> — знаки Гильдий, legion-<ключ Легиона> — знаки Легионов. Запуск: node tools/wraith_glyphs.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const SRC = "D:/Загрузки/Призраки", OUT = "assets/wraith";
const ARC = ["argos", "castigate", "embody", "fatalism", "flux", "inhabit", "intimation", "keening", "lifeweb", "mnemosynis", "moliate",
  "outrage", "pandemonium", "phantasm", "puppetry", "usury"];
const MAP = {
  ...Object.fromEntries(ARC.map(k => [`arcanos-${k}`, `Arcanoi  Guilds/${k[0].toUpperCase()}${k.slice(1)}_sigil`])),
  ...Object.fromEntries(["emerald", "fate", "grim", "iron", "paupers", "penitent", "silent", "skeletal"]
    .map(k => [`legion-${k}`, `Легионы/Sigil${k[0].toUpperCase()}${k.slice(1)}`]))
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
    const d = g.getImageData(0, 0, S, S), px = d.data; let dark = 0;
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114); if (px[i + 3] > 128 && l < 96) dark++; }
    // знак — тёмное; белый фон и белые линии рисунка — в прозрачность
    for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114); const a = Math.round((255 - l) * px[i + 3] / 255); px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a; }
    g.putImageData(d, 0, 0);
    return { png: c.toDataURL("image/png"), dark };
  }, url);
  fs.writeFileSync(path.join(OUT, name + ".png"), Buffer.from(res.png.split(",")[1], "base64"));
  if (res.dark < 800) console.log("МАЛО ТЁМНОГО", name, res.dark);
}
// контактный лист для проверки глазами — в цветах «Пепла и Плёнки»
const names = Object.keys(MAP);
await p.setViewportSize({ width: 1300, height: 560 });
await p.setContent(`<body style="margin:0;background:#121315;display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding:8px;font:10px sans-serif;color:#bdbbb6">${names.map(n =>
  `<div style="text-align:center"><div style="height:110px;background:linear-gradient(170deg,#f2f4f6,#8b929c);-webkit-mask:url(data:image/png;base64,${fs.readFileSync(path.join(OUT, n + ".png")).toString("base64")}) center/contain no-repeat"></div>${n}</div>`).join("")}</body>`);
await p.screenshot({ path: "D:/ClaudeData/temp-claude/mage/wraith-glyphs.png" });
await b.close(); console.log("ok", names.length);
