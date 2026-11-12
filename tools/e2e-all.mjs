// tools/e2e-all.mjs — полный прогон автотестов по частям: каждая группа (tools/e2e.mjs --group) — отдельным процессом.
// Зависшая или упавшая группа не роняет остальные; в конце — общий итог и, если все группы прошли, отметка для релиза
// (tools/.cache/e2e-ok.json, как у полного прогона одним процессом). Группы покрывают все проверки: «vampire» — всё,
// что не попало в остальные; общие проверки (вход, загрузка системы) повторяются в каждой группе и считаются один раз.
//
//   node tools/e2e-all.mjs [--groups vampire,mage] [--timeout 40] [--url …] [--user …] [--headed]
//   --groups  — только эти группы (тогда отметку для релиза не ставим); --timeout — минут на группу (по умолчанию 40).
// Foundry (preview foundry-portable, порт 30002) должна быть запущена; группы идут по очереди — рассказчик в мире один.

import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };

// группы — из самого tools/e2e.mjs (ключи GROUPS) и «vampire» — остальное
const src = fs.readFileSync(path.join(ROOT, "tools/e2e.mjs"), "utf8");
const block = /const GROUPS = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? "";
const ALL = ["vampire", ...[...block.matchAll(/^\s*([a-z]+):/gm)].map(m => m[1])];
const picked = arg("--groups", "") ? arg("--groups", "").split(",").map(s => s.trim()).filter(Boolean) : ALL;
const bad = picked.filter(g => !ALL.includes(g));
if (bad.length) { console.error(`Нет групп: ${bad.join(", ")}. Есть: ${ALL.join(", ")}`); process.exit(1); }
const FULL = picked.length === ALL.length;
const TIMEOUT = Math.max(1, Number(arg("--timeout", 40)) || 40) * 60 * 1000;
const PASS = ["--url", "--user"].flatMap(k => arg(k, null) ? [k, arg(k)] : []).concat(argv.includes("--headed") ? ["--headed"] : []);

/** Одна группа: свой процесс e2e; строки «✓ …» и «✗ …» — результаты. */
function runGroup(g) {
  return new Promise(resolve => {
    const t0 = Date.now(), lines = [];
    const p = spawn(process.execPath, [path.join(ROOT, "tools/e2e.mjs"), "--group", g, ...PASS], { cwd: ROOT });
    let buf = "";
    const eat = chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
        lines.push(line);
        if (line.startsWith("… ")) process.stdout.write(`  [${g}] ${line.slice(2)}\n`);
      }
    };
    p.stdout.on("data", d => eat(d.toString()));
    p.stderr.on("data", d => eat(d.toString()));
    const timer = setTimeout(() => { lines.push(`✗ [${g}] группа зависла — остановлена через ${TIMEOUT / 60000} мин`); p.kill(); }, TIMEOUT);
    p.on("close", code => {
      clearTimeout(timer);
      if (buf) lines.push(buf);
      const results = lines.filter(l => /^[✓✗] /.test(l)).map(l => ({ ok: l.startsWith("✓"), text: l.slice(2) }));
      if (code !== 0 && !results.some(r => !r.ok)) results.push({ ok: false, text: `[${g}] процесс завершился с кодом ${code}` });
      resolve({ g, code, results, sec: Math.round((Date.now() - t0) / 1000), errors: lines.filter(l => /^\s+\[/.test(l)).slice(0, 10) });
    });
  });
}

console.log(`Прогон по частям: ${picked.join(", ")}${FULL ? " (полный)" : ""}\n`);
const done = [];
for (const g of picked) {
  console.log(`▶ ${g}`);
  const r = await runGroup(g);
  const fail = r.results.filter(x => !x.ok);
  console.log(`${fail.length ? "✗" : "✓"} ${g}: ${r.results.length - fail.length}/${r.results.length} за ${Math.floor(r.sec / 60)} мин ${r.sec % 60} с\n`);
  done.push(r);
}

// итог: проверка считается один раз (общие — вход и загрузка — есть в каждой группе); провал в любой группе — провал
const byName = new Map();
for (const r of done) for (const x of r.results) {
  const name = x.text.replace(/ — .*$/, "");
  const prev = byName.get(name);
  byName.set(name, prev ? { ...prev, ok: prev.ok && x.ok, text: prev.ok && !x.ok ? x.text : prev.text, groups: [...prev.groups, r.g] } : { ok: x.ok, text: x.text, groups: [r.g] });
}
const failed = [...byName.values()].filter(x => !x.ok);
console.log("════════ Итог по группам");
for (const r of done) console.log(`  ${r.results.every(x => x.ok) && r.code === 0 ? "✓" : "✗"} ${r.g.padEnd(9)} ${r.results.filter(x => x.ok).length}/${r.results.length}`);
if (failed.length) {
  console.log("\nНе прошли:");
  for (const x of failed) console.log(`  ✗ ${x.text}  (${x.groups.join(", ")})`);
  for (const r of done.filter(r => r.errors.length)) { console.log(`\nОшибки в консоли — ${r.g}:`); for (const e of r.errors) console.log(e); }
}
console.log(failed.length ? `\nНе прошло: ${failed.length} из ${byName.size}.` : `\nВсё в порядке: ${byName.size} проверок.`);

// отметка для релиза — только полный набор групп на этом коммите без незакоммиченных правок кода (как в tools/e2e.mjs)
if (FULL) {
  const git = a => { try { return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } };
  const dirty = git(["status", "--porcelain", "--", ".", ":!packs"]).split("\n").filter(l => l && !l.startsWith("??")).length > 0;
  fs.mkdirSync(path.join(ROOT, "tools/.cache"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "tools/.cache/e2e-ok.json"),
    JSON.stringify({ head: git(["rev-parse", "HEAD"]), dirty, ok: !failed.length, n: byName.size, at: new Date().toISOString(), parts: done.map(r => r.g) }));
}
process.exit(failed.length ? 1 : 0);
