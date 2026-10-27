// tools/fx_extract.mjs — забрать из купленных паков (JB2A Patreon, Boss Loot BLFX, PSFX) только анимации и звуки,
// перечисленные в module/data/fx-map.mjs, и положить их в данные Foundry: <Data>/<куда>/anim/<тема>.webm, sound/<тема>.ogg,
// manifest.json — какие темы есть. Файлы паков в репозиторий не попадают (лицензии запрещают их распространять).
//
//   node tools/fx_extract.mjs "D:/АНИМАЦИИ" "D:/FoundryVTT/Data" [assets/vtm20-fx]
//
// Папка паков — та, где лежат jb2a_patreon, blfx-assets-pack и «PSFX All …» (как они распакованы из архивов).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [src, data, sub = "assets/vtm20-fx"] = process.argv.slice(2);
if (!src || !data) {
  console.log('Использование: node tools/fx_extract.mjs "<папка с паками>" "<папка Data Foundry>" [assets/vtm20-fx]');
  process.exit(1);
}
const { FX_THEMES } = await import(pathToFileURL(path.join(ROOT, "module/data/fx-map.mjs")).href);
const out = path.join(data, sub);
fs.mkdirSync(path.join(out, "anim"), { recursive: true });
fs.mkdirSync(path.join(out, "sound"), { recursive: true });

const themes = {}, missing = [];
let bytes = 0;
for (const [key, t] of Object.entries(FX_THEMES)) {
  themes[key] = {};
  for (const [kind, rel, ext] of [["anim", t.anim, "webm"], ["sound", t.sound, "ogg"]]) {
    if (!rel) continue;
    const from = path.join(src, rel);
    if (!fs.existsSync(from)) { missing.push(`${key}: ${rel}`); continue; }
    const to = path.join(out, kind, `${key}.${ext}`);
    fs.copyFileSync(from, to);
    bytes += fs.statSync(to).size;
    themes[key][kind] = true;
  }
}
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ themes, made: new Date().toISOString() }, null, 1));
const n = Object.values(themes).reduce((s, x) => s + Object.keys(x).length, 0);
console.log(`Скопировано файлов: ${n}, ${(bytes / 1e6).toFixed(1)} МБ → ${out}`);
if (missing.length) console.log(`Не найдено (${missing.length}):\n  ${missing.join("\n  ")}`);
