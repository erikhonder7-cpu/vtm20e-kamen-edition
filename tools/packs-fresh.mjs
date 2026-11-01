// tools/packs-fresh.mjs — компендии собраны из текущих data/*.json: node tools/packs-fresh.mjs
// Пересобирает packs/ (tools/build_packs.mjs) и сверяет число документов с компендиями в индексе git.
// Расхождение — данные поменяли, а компендии не пересобрали (или наоборот). Запускает проверка на GitHub;
// на своей машине Foundry должен быть остановлен (build_packs пишет в packs/), после проверки — `git checkout packs`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FOUNDRY_APPS = [process.env.FOUNDRY_APP, "D:/Games/Foundry/Foundry Virtual Tabletop/resources/app",
  "D:/FoundryVTT-WindowsPortable-14.365/App/resources/app"].filter(Boolean);
const app = FOUNDRY_APPS.find(p => fs.existsSync(path.join(p, "node_modules", "classic-level")));
if (!app) { console.error("classic-level не найден: укажите FOUNDRY_APP=<…/resources/app>"); process.exit(1); }
const { ClassicLevel } = createRequire(path.join(app, "package.json"))("classic-level");

const { checkPacks } = await import(pathToFileURL(path.join(ROOT, "tools/packs-check.mjs")).href);
const { counts: committed } = await checkPacks(ROOT);

execFileSync(process.execPath, [path.join(ROOT, "tools/build_packs.mjs")], { cwd: ROOT, stdio: "inherit", env: { ...process.env, FOUNDRY_APP: app } });

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
const diff = [];
for (const pack of manifest.packs ?? []) {
  const db = new ClassicLevel(path.join(ROOT, pack.path), { valueEncoding: "json", createIfMissing: false });
  let n = 0;
  try {
    await db.open();
    for await (const key of db.keys()) if (/^![a-z]+!/i.test(key) && !key.startsWith("!folders!")) n++;
  } finally { await db.close().catch(() => {}); }
  if (n !== committed[pack.name]) diff.push(`${pack.name}: в git ${committed[pack.name] ?? "—"}, из данных ${n}`);
}
if (diff.length) {
  console.error(`✗ Компендии не совпадают с данными — пересоберите (node tools/build_packs.mjs) и закоммитьте packs/:\n  ${diff.join("\n  ")}`);
  process.exit(1);
}
console.log(`Компендии совпадают с данными: ${Object.keys(committed).length}`);
