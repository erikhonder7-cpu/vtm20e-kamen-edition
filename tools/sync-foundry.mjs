// tools/sync-foundry.mjs — переложить систему из репозитория в установленный Foundry (без ссылки-junction: через неё Foundry
// у пользователя тормозил, чистая копия — плавно). Копируются те же пути, что в релизный архив (tools/release.mjs), только
// изменившиеся файлы; лишние файлы в установленной системе удаляются (robocopy /MIR — только внутри папки системы).
//   node tools/sync-foundry.mjs [--packs] [--dry]
//   --packs — и компендии (packs): только при закрытом Foundry, иначе LevelDB занят; по умолчанию packs не трогаем.
//   --dry   — показать, что изменится, ничего не копируя.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = "D:/FoundryVTT-WindowsPortable-14.365/Data/systems/vtm20e-kamen-edition";
const dry = process.argv.includes("--dry"), packs = process.argv.includes("--packs");
const DIRS = ["module", "templates", "styles", "lang", "assets", "data", "fonts", "lib", ...(packs ? ["packs"] : [])];
const FILES = ["system.json", "vtm20.mjs", "README.md"];

const dst = fs.lstatSync(DEST, { throwIfNoEntry: false });
if (!dst) { console.error(`Нет установленной системы: ${DEST}`); process.exit(1); }
if (dst.isSymbolicLink()) { console.error("Установленная система — ссылка на репозиторий; синхронизировать нечего."); process.exit(1); }
if (!fs.existsSync(path.join(DEST, "system.json"))) { console.error("В папке назначения нет system.json — не похоже на систему, останавливаюсь."); process.exit(1); }

let changed = 0;
const robo = (from, to, extra) => {
  // /MIR — зеркало внутри этой подпапки системы; /XJ — не ходить по ссылкам; /NJH /NJS /NDL /NP — короткий вывод
  const r = spawnSync("robocopy", [from, to, ...extra, "/XJ", "/R:2", "/W:1", "/NJH", "/NJS", "/NDL", "/NP", ...(dry ? ["/L"] : [])], { encoding: "utf8" });
  if (r.status >= 8) { console.error(`robocopy ${from}: ошибка ${r.status}\n${r.stdout}`); process.exit(1); }
  const lines = (r.stdout ?? "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  changed += lines.length;
  for (const l of lines.slice(0, 8)) console.log("  " + l.replace(/\s+/g, " "));
  if (lines.length > 8) console.log(`  … и ещё ${lines.length - 8}`);
};
for (const d of DIRS) { console.log(`${d}/`); robo(path.join(ROOT, d), path.join(DEST, d), ["/MIR"]); }
console.log("файлы в корне");
robo(ROOT, DEST, FILES);   // только эти файлы, без /MIR: корень системы не зеркалим
console.log(dry ? `Пробный прогон: изменений ${changed}.` : `Готово: изменений ${changed}. В Foundry — F5${packs ? "" : " (компендии не трогали; --packs при закрытом Foundry)"}.`);
