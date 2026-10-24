// tools/release.mjs — релиз одной командой:  node tools/release.mjs 0.7.0 ["заголовок"]
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
const [version, title] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) { console.error("Укажите версию: node tools/release.mjs 0.7.0 [\"заголовок\"]"); process.exit(1); }

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, stdio: opts.quiet ? "pipe" : "inherit", encoding: "utf8", ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }).trim();
const step = s => console.log(`\n── ${s}`);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
const repoUrl = manifest.url;                                  // https://github.com/<owner>/<repo>
const repo = repoUrl.replace(/^https:\/\/github\.com\//, "");

// 1. Foundry не держит компендии (порт 30000 свободен)
step("Foundry закрыт?");
const busy = await new Promise(res => {
  const s = net.connect({ host: "127.0.0.1", port: 30000 }, () => { s.destroy(); res(true); });
  s.on("error", () => res(false));
});
if (busy) { console.error("Порт 30000 занят — закройте Foundry полностью (и в трее), иначе компендии не пересобрать."); process.exit(1); }

// 2. Нет незакоммиченных правок кода (компендии Foundry переписывает сам — их сбрасываем)
step("Рабочая копия");
for (const f of fs.readdirSync(path.join(ROOT, "packs"))) for (const x of ["LOCK", "LOG", "LOG.old"]) fs.rmSync(path.join(ROOT, "packs", f, x), { force: true });
run("git", ["checkout", "--", "packs"]); run("git", ["clean", "-fq", "packs"]);
const dirty = out("git", ["status", "--porcelain"]).split("\n").filter(Boolean);
if (dirty.length) { console.error("Есть незакоммиченные правки:\n" + dirty.join("\n")); process.exit(1); }
if (out("git", ["tag", "-l", `v${version}`])) { console.error(`Тег v${version} уже есть.`); process.exit(1); }

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
run("git", ["push", "-q", "origin", "HEAD"]);
run("git", ["tag", `v${version}`]);
run("git", ["push", "-q", "origin", `v${version}`]);

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
fs.writeFileSync(path.join(tmp, "notes.md"), notes);
run("gh", ["release", "create", `v${version}`, zip, path.join(tmp, "system.json"), "--repo", repo,
  "--title", title ? `${version} — ${title}` : version, "--notes-file", path.join(tmp, "notes.md"), "--latest"]);
console.log(`\nГотово: ${repoUrl}/releases/tag/v${version}`);
