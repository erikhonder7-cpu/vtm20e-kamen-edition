// tools/wiki_glyphs.mjs — знаки, которых не было среди картинок пользователя, — с White Wolf Wiki (whitewolf.fandom.com,
// файлы static.wikia.nocookie.net/whitewolf/images/…):
//   · Искусства подменышей: Infusion.png → art-infusion, Tale_Craft.png → art-taleCraft (цветные «витражи», как прочие
//     Искусства: белый фон вокруг знака вырезается, 192 px по большей стороне, webp; имена — в assets/changeling/index.json);
//   · гербы семи Домов падших: LogoHouseDevil/Scourge/Malefactor/Fiend/Defiler/Devourer/Slayer.png → assets/demon/house-<ключ>.png
//     (маски 256×256: чёрный знак на прозрачном, цвет задаёт CSS — как контурные знаки Dark Ages: Fae).
// Скачанные файлы лежат в tools/.cache/dl-wiki (*.webp — CDN отдаёт их в webp). CDN пускает только запросы со страницы
// в браузере, поэтому скачивание — вручную из браузера; этот скрипт только переводит их в формат системы.
// Запуск: node tools/wiki_glyphs.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SRC = "tools/.cache/dl-wiki";
const JOBS = [
  ["art-infusion", "assets/changeling", "color"], ["art-taleCraft", "assets/changeling", "color"],
  ...["devils", "scourges", "malefactors", "fiends", "defilers", "devourers", "slayers"].map(k => [`house-${k}`, "assets/demon", "mask"])
];

const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
const made = [];
for (const [name, out, mode] of JOBS) {
  const file = path.join(SRC, `${name}.webp`);
  if (!fs.existsSync(file)) { console.log("НЕТ", file); continue; }
  const url = "data:image/webp;base64," + fs.readFileSync(file).toString("base64");
  const data = await p.evaluate(async ([url, mode]) => {
    const img = new Image(); img.src = url; await img.decode();
    if (mode === "mask") {
      const S = 256, pad = 6, c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d"), k = Math.min((S - 2 * pad) / img.width, (S - 2 * pad) / img.height), w = img.width * k, h = img.height * k;
      g.fillStyle = "#fff"; g.fillRect(0, 0, S, S);   // прозрачное в исходнике — как белый фон
      g.imageSmoothingQuality = "high"; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      const d = g.getImageData(0, 0, S, S), px = d.data;
      for (let i = 0; i < px.length; i += 4) { const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = Math.round(255 - l); }
      g.putImageData(d, 0, 0);
      return c.toDataURL("image/png");
    }
    // цветной: белый фон вокруг круга — в прозрачность заливкой от краёв, затем 192 px
    const W = img.width, H = img.height, src = document.createElement("canvas"); src.width = W; src.height = H;
    const sg = src.getContext("2d"); sg.drawImage(img, 0, 0);
    const d = sg.getImageData(0, 0, W, H), px = d.data, seen = new Uint8Array(W * H), stack = [];
    const white = i => px[i * 4 + 3] > 0 && px[i * 4] > 232 && px[i * 4 + 1] > 232 && px[i * 4 + 2] > 232;
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i] || !white(i)) continue;
      seen[i] = 1; px[i * 4 + 3] = 0;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
    }
    for (let i = 0; i < W * H; i++) {   // светлая кайма у вырезанного фона — полупрозрачная, без белого ореола
      if (seen[i] || px[i * 4 + 3] === 0) continue;
      const x = i % W, y = (i / W) | 0;
      if (!((x > 0 && seen[i - 1]) || (x < W - 1 && seen[i + 1]) || (y > 0 && seen[i - W]) || (y < H - 1 && seen[i + W]))) continue;
      const l = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
      if (l > 180) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * (255 - l) / 75);
    }
    sg.putImageData(d, 0, 0);
    const S = 192, k = Math.min(1, S / Math.max(W, H)), c = document.createElement("canvas");
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.9);
  }, [url, mode]);
  fs.mkdirSync(out, { recursive: true });
  const ext = mode === "mask" ? "png" : "webp";
  fs.writeFileSync(path.join(out, `${name}.${ext}`), Buffer.from(data.split(",")[1], "base64"));
  made.push([out, name]);
  console.log(`${out}/${name}.${ext}`);
}
await b.close();
// новые Искусства — в список знаков подменышей
const idxFile = "assets/changeling/index.json";
const idx = new Set(JSON.parse(fs.readFileSync(idxFile, "utf8")));
for (const [out, name] of made) if (out === "assets/changeling") idx.add(name);
fs.writeFileSync(idxFile, JSON.stringify([...idx].sort(), null, 0) + "\n");
