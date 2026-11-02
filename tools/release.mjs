// tools/release.mjs — релиз одной командой:  node tools/release.mjs 0.7.0 ["заголовок"] [--no-e2e]
// 0) полный e2e без провалов на этом коммите (отметка tools/.cache/e2e-ok.json от tools/e2e.mjs); --no-e2e — пропустить
// 1) Foundry не запущен (иначе компендии не пересобрать); 2) рабочая копия чистая (кроме компендиев);
// 3) версия и ссылка на архив в system.json; 4) сборка всех компендиев; 5) node tools/check.mjs;
// 6) коммит, тег, push; 7) архив системы (git archive) и релиз на GitHub через gh.
// Заметки к релизу — из tools/release-notes.md (если есть), иначе список коммитов с прошлого тега.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [version, title] = process.argv.slice(2).filter(x => !x.startsWith("--"));
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) { console.error("Укажите версию: node tools/release.mjs 0.7.0 [\"заголовок\"]"); process.exit(1); }

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
let current = "";
const done = [];   // шаг, на котором идём, и что уже сделано — для сообщения об остановке
const step = s => { current = s; console.log(`\n── ${s}`); };
// Сбой любого шага — одной строкой: где, какая команда, что уже сделано и как продолжить (а не стек execFileSync)
const stop = e => {
  const cmd = e?.spawnargs ? e.spawnargs.join(" ") : "";
  const why = String(e?.stderr || e?.message || e).trim().split("\n").filter(Boolean).slice(-3).join(" / ");
  console.error(`\n✗ Релиз остановлен на шаге «${current}»${cmd ? ` (команда: ${cmd})` : ""}: ${why}`);
  if (done.length) console.error(`  Уже сделано: ${done.join("; ")}.`);
  if (done.includes("тег отправлен")) console.error(`  Осталось выложить архив: gh release create v${version} … (или удалить тег и запустить релиз заново).`);
  else if (done.includes("коммит")) console.error("  Коммит релиза уже есть: отмените его (git reset --soft HEAD~1) и запустите релиз заново.");
  process.exit(1);
};
process.on("uncaughtException", stop);
process.on("unhandledRejection", stop);
/** Шаги, которые могут сорваться не по нашей вине (сеть, GitHub, занятые Windows файлы), — до трёх попыток с паузой 5 и 10 с. */
const retry = (what, fn) => {
  for (let i = 1; ; i++) {
    try { return fn(); } catch (e) {
      if (i >= 3) throw e;
      console.warn(`  ${what}: попытка ${i} не удалась — повтор через ${5 * i} с`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000 * i);
    }
  }
};
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
const repoUrl = manifest.url;                                  // https://github.com/<owner>/<repo>
const repo = repoUrl.replace(/^https:\/\/github\.com\//, "");

// 1. Foundry не держит компендии: свободны порт обычного запуска (30000) и проверочных (30001, 30002 — .claude/launch.json)
step("Foundry закрыт?");
const listening = port => new Promise(res => {
  const s = net.connect({ host: "127.0.0.1", port }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
});
const busy = [];
for (const port of [30000, 30001, 30002]) if (await listening(port)) busy.push(port);
if (busy.length) { console.error(`Порт ${busy.join(", ")} занят — закройте Foundry полностью (и в трее), иначе компендии не пересобрать.`); process.exit(1); }

// 2. Нет незакоммиченных правок кода (компендии Foundry переписывает сам — их сбрасываем)
step("Рабочая копия");
for (const f of fs.readdirSync(path.join(ROOT, "packs"))) for (const x of ["LOCK", "LOG", "LOG.old"]) fs.rmSync(path.join(ROOT, "packs", f, x), { force: true });
// Windows ненадолго держит файлы баз после сборки или проверок («unable to unlink … Invalid argument») — повтор
retry("сброс компендиев", () => { run("git", ["checkout", "--", "packs"]); run("git", ["clean", "-fq", "packs"]); });
const dirty = out("git", ["status", "--porcelain"]).split("\n").filter(Boolean);
if (dirty.length) { console.error("Есть незакоммиченные правки:\n" + dirty.join("\n")); process.exit(1); }
if (out("git", ["tag", "-l", `v${version}`])) { console.error(`Тег v${version} уже есть.`); process.exit(1); }
if (!process.argv.includes("--no-e2e")) {
  const f = path.join(ROOT, "tools/.cache/e2e-ok.json"), m = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  const head = out("git", ["rev-parse", "HEAD"]);
  if (!m) { console.error("Нет полного прогона e2e: запустите Foundry, node tools/e2e.mjs, закройте Foundry и повторите (или --no-e2e)."); process.exit(1); }
  if (m.head !== head || m.dirty) { console.error(`Последний полный e2e был на другом коде (${m.head.slice(0, 7)}${m.dirty ? ", с незакоммиченными правками" : ""}) — прогоните e2e на ${head.slice(0, 7)}.`); process.exit(1); }
  if (!m.ok) { console.error("Последний полный e2e не прошёл — сначала исправьте."); process.exit(1); }
  console.log(`  e2e: ${m.n} проверок прошли на ${head.slice(0, 7)}`);
}

// 3. Версия и ссылка на архив
step(`Версия ${manifest.version} → ${version}`);
let sj = fs.readFileSync(path.join(ROOT, "system.json"), "utf8");
sj = sj.replace(/"version": "[^"]*"/, `"version": "${version}"`).replace(/\/releases\/download\/v[^/]+\//, `/releases/download/v${version}/`);
fs.writeFileSync(path.join(ROOT, "system.json"), sj);

// 4–5. Компендии и проверка
step("Компендии");
run(process.execPath, ["tools/build_packs.mjs"]);
for (const f of fs.readdirSync(path.join(ROOT, "packs"))) for (const x of ["LOCK", "LOG", "LOG.old"]) fs.rmSync(path.join(ROOT, "packs", f, x), { force: true });
step("Проверка");
run(process.execPath, ["tools/check.mjs"]);

// 6. Коммит, тег, push
step("Коммит и тег");
const lastTag = out("git", ["describe", "--tags", "--abbrev=0"]);
run("git", ["add", "-A", "system.json", "packs"]);
{
  // то, что уйдёт в коммит и архив, — ещё раз из индекса: битые компендии не выпускаем
  const { checkPacks } = await import(pathToFileURL(path.join(ROOT, "tools/packs-check.mjs")).href);
  const { problems } = await checkPacks(ROOT);
  if (problems.length) { run("git", ["reset", "-q"]); console.error("Компендии в коммите битые:\n" + problems.join("\n")); process.exit(1); }
}
run("git", ["commit", "-q", "-m", `Релиз ${version}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`]);
done.push("коммит");
retry("git push", () => run("git", ["push", "-q", "origin", "HEAD"]));
done.push("коммит отправлен");
run("git", ["tag", `v${version}`]);
retry("git push тега", () => run("git", ["push", "-q", "origin", `v${version}`]));
done.push("тег отправлен");

// 7. Архив и релиз
step("Релиз на GitHub");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vtm20-release-"));
const zip = path.join(tmp, `${manifest.id}.zip`);
run("git", ["archive", "--format=zip", "-o", zip, `v${version}`, "system.json", "vtm20.mjs", "module", "templates", "styles", "lang", "assets", "data", "packs", "fonts", "lib", "README.md"]);
fs.copyFileSync(path.join(ROOT, "system.json"), path.join(tmp, "system.json"));
const notesFile = path.join(ROOT, "tools", "release-notes.md");
const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8")
  : `## ${manifest.title} ${version}\n\nМанифест: \`${repoUrl}/releases/latest/download/system.json\`\n\n`
    + out("git", ["log", "--format=- %s", `${lastTag}..v${version}`]).split("\n").filter(l => !/^- Релиз /.test(l)).join("\n");
// шапка описания — арт из docs/release.webp (в архив системы docs/ не входит)
const header = fs.existsSync(path.join(ROOT, "docs", "release.webp"))
  ? `<p align="center"><img src="${repoUrl}/raw/main/docs/release.webp" alt="VtM20 Kamen &amp; Shamil Edition" width="100%"></p>

` : "";
fs.writeFileSync(path.join(tmp, "notes.md"), header + notes);
retry("gh release create", () => run("gh", ["release", "create", `v${version}`, zip, path.join(tmp, "system.json"), "--repo", repo,
  "--title", title ? `${version} — ${title}` : version, "--notes-file", path.join(tmp, "notes.md"), "--latest"]));
console.log(`\nГотово: ${repoUrl}/releases/tag/v${version}`);
