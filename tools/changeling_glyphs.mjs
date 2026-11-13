// Знаки подменышей от пользователя (D:/Загрузки/Подменыши — цветные «витражи», D:/Загрузки/Dark Ages Fae — контурные) → assets/changeling:
//   · цветные: уменьшаются до 192 px по большей стороне, webp; белый фон вокруг знака (у Обликов ликийцев) вырезается заливкой
//     от краёв — белые стёкла внутри витража остаются;
//   · контурные (daf-*): маски PNG 256×256 — чёрный знак на прозрачном, цвет задаёт CSS.
// Имена: kith-<ключ>, art-<ключ>, realm-<ключ>, house-<ключ>, court-<ключ>, guise-<ключ>, group-<группа иных фэ>, treasure, daf-court-*, daf-origin-*.
// Запуск: node tools/changeling_glyphs.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const SRC = "D:/Загрузки/Подменыши", DAF = "D:/Загрузки/Dark Ages Fae", OUT = "assets/changeling";
const cap = s => s[0].toUpperCase() + s.slice(1);
const COLOR = {
  // киты основной книги, осенние ши; иные фэ — по ключу (other-*) и по группе (group-*)
  "kith-boggan": "LogoKithBoggans", "kith-clurichaun": "KithClurichaun", "kith-eshu": "LogoKithEshu", "kith-nocker": "LogoKithNockers",
  "kith-piskey": "KithPiskey", "kith-pooka": "LogoKithPooka", "kith-redcap": "LogoKithRedcaps", "kith-satyr": "KithSatyr",
  "kith-selkie": "KithSelkie", "kith-sidhe": "LogoKithSidhe", "kith-autumnSidhe": "KithSidheAutumn", "kith-sluagh": "LogoKithSluagh",
  "kith-troll": "LogoKithTroll", "kith-other-merfolk": "LogoKithMerfolk", "kith-other-ghilledhu": "Ghille_Dhu_Kith_Symbol",
  "group-menehune": "SymbolGallainMenehune", "group-nunnehi": "SymbolGallainNunnehi",
  // Искусства; у Хроноса, Небесного ремесла и Метаморфоза — свои имена файлов
  ...Object.fromEntries(["autumn", "chicanery", "contract", "legerdemain", "naming", "oneiromancy", "primal", "pyretics", "soothsay", "sovereign",
    "spring", "summer", "wayfare", "winter"].map(k => [`art-${k}`, `SymbolArt${cap(k)}`])),
  "art-dragonsIre": "SymbolArtDragonsIre", "art-chronos": "Chronos", "art-skycraft": "Skycraft", "art-metamorphosis": "Metamorphasis",
  // Искусства таллейнов (пока без правил в системе) и Ву Тан сяней — пять стихий
  "art-aphrodisia": "Aphrodesia", "art-contempt": "SymbolArtContempt", "art-delusion": "SymbolArtDelusion", "art-kryos": "Kryos",
  "art-ditan": "SymbolArtDiTan", "art-houtan": "SymbolArtHouTan", "art-lintan": "SymbolArtLinTan", "art-shuitan": "SymbolArtShuiTan", "art-tiehtan": "SymbolArtTiehTan",
  ...Object.fromEntries(["actor", "fae", "nature", "prop", "scene", "time"].map(k => [`realm-${k}`, `SymbolRealm${cap(k)}`])),
  ...Object.fromEntries(["aesin", "ailil", "balor", "beaumayn", "daireann", "dougal", "eiluned", "fiona", "gwydion", "leanhaun", "liam", "scathach", "varich"]
    .map(k => [`house-${k}`, `SymbolHouse${cap(k)}`])),
  "house-danaan": "Danaan",
  "court-seelie": "SymbolSeelieCourt", "court-unseelie": "SymbolUnseelieCourt", "court-shadow": "Shadow", "treasure": "SymbolCTDTrasure",
  "guise-bucolic": "BucolicSymbol", "guise-maieutic": "MaieuticSymbol", "guise-oppidan": "OppidianSymbol", "guise-quixotic": "QuixoticSymbol"
};
const MASK = {
  ...Object.fromEntries(["spring", "summer", "autumn", "winter"].map(k => [`daf-court-${k}`, `DAF${cap(k)}Court.PNG`])),
  "daf-court-solstice": "DAFSolsticeCourtDAF.PNG",
  "daf-origin-changeling": "DAFChangeling.PNG", "daf-origin-firstborn": "DAFFirstborn.PNG", "daf-origin-inanimae": "DAFInanimae.PNG"
};

fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: "msedge", headless: true });
const p = await b.newPage();
const done = [];
for (const [name, rel] of [...Object.entries(COLOR).map(([n, r]) => [n, path.join(SRC, r + ".webp"), "color"]), ...Object.entries(MASK).map(([n, r]) => [n, path.join(DAF, r + ".webp"), "mask"])].map(x => [x[0], x])) {
  const [, file, mode] = rel;
  if (!fs.existsSync(file)) { console.log("НЕТ", file); continue; }
  const url = "data:image/webp;base64," + fs.readFileSync(file).toString("base64");
  const res = await p.evaluate(async ([url, mode]) => {
    const img = new Image(); img.src = url; await img.decode();
    if (mode === "mask") {
      const S = 256, pad = 6, c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d"), k = Math.min((S - 2 * pad) / img.width, (S - 2 * pad) / img.height), w = img.width * k, h = img.height * k;
      g.imageSmoothingQuality = "high"; g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      const d = g.getImageData(0, 0, S, S), px = d.data;
      // знак — тёмное; светлое и прозрачное — в прозрачность
      for (let i = 0; i < px.length; i += 4) { const l = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114; const a = Math.round((255 - l) * px[i + 3] / 255); px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = a; }
      g.putImageData(d, 0, 0);
      return { data: c.toDataURL("image/png"), cut: 0 };
    }
    // цветной: сначала белый фон вокруг знака — в прозрачность (заливка от краёв по почти белым точкам), потом уменьшение
    const W = img.width, H = img.height, src = document.createElement("canvas"); src.width = W; src.height = H;
    const sg = src.getContext("2d"); sg.drawImage(img, 0, 0);
    const d = sg.getImageData(0, 0, W, H), px = d.data, seen = new Uint8Array(W * H), stack = [];
    const white = i => px[i * 4 + 3] > 0 && px[i * 4] > 232 && px[i * 4 + 1] > 232 && px[i * 4 + 2] > 232;
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    let cut = 0;
    while (stack.length) {
      const i = stack.pop();
      if (seen[i] || !white(i)) continue;
      seen[i] = 1; px[i * 4 + 3] = 0; cut++;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
    }
    // светлая кайма по краю вырезанного фона — полупрозрачная, чтобы не было белого ореола
    for (let i = 0; i < W * H; i++) {
      if (seen[i] || px[i * 4 + 3] === 0) continue;
      const x = i % W, y = (i / W) | 0;
      const edge = (x > 0 && seen[i - 1]) || (x < W - 1 && seen[i + 1]) || (y > 0 && seen[i - W]) || (y < H - 1 && seen[i + W]);
      if (!edge) continue;
      const l = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
      if (l > 180) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * (255 - l) / 75);
    }
    sg.putImageData(d, 0, 0);
    const S = 192, k = Math.min(1, S / Math.max(W, H)), c = document.createElement("canvas");
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height);
    return { data: c.toDataURL("image/webp", 0.9), cut };
  }, [url, mode]);
  const ext = mode === "mask" ? "png" : "webp";
  fs.writeFileSync(path.join(OUT, `${name}.${ext}`), Buffer.from(res.data.split(",")[1], "base64"));
  done.push(name);
  if (res.cut > 2000) console.log(`вырезан белый фон: ${name} (${res.cut} точек)`);
}
await b.close();
fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(done.sort(), null, 0) + "\n");
console.log(`Готово: ${done.length} знаков → ${OUT}`);
