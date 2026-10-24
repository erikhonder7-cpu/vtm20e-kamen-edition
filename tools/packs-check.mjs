// tools/packs-check.mjs — компендии в том виде, в каком их закоммитят (индекс git), а не на диске:
// Foundry, пока работает, переписывает файлы LevelDB в packs/, и `git commit -a` однажды унёс в релиз
// одни удаления (0.8.0 — все компендии пустые). Проверяем: CURRENT и его MANIFEST в индексе, база
// открывается и в ней есть документы. Вызывают check.mjs и release.mjs (после `git add packs`).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const FOUNDRY_APPS = [process.env.FOUNDRY_APP, "D:/Games/Foundry/Foundry Virtual Tabletop/resources/app",
  "D:/FoundryVTT-WindowsPortable-14.365/App/resources/app"].filter(Boolean);

/** classic-level из установленного Foundry; null — проверяем только состав файлов. */
function classicLevel() {
  const app = FOUNDRY_APPS.find(p => fs.existsSync(path.join(p, "node_modules", "classic-level")));
  return app ? createRequire(path.join(app, "package.json"))("classic-level").ClassicLevel : null;
}

/**
 * @param {string} root  корень системы
 * @returns {Promise<{problems: string[], counts: Record<string, number>, opened: boolean}>}
 */
export async function checkPacks(root) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
  const ClassicLevel = classicLevel();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vtm20-packs-"));
  const problems = [], counts = {};
  try {
    for (const pack of manifest.packs ?? []) {
      const dir = pack.path.replace(/\\/g, "/");
      const files = git("ls-files", "--", dir).split("\n").filter(Boolean);
      if (!files.includes(`${dir}/CURRENT`)) { problems.push(`${pack.name}: нет CURRENT в индексе git`); continue; }
      const current = git("show", `:${dir}/CURRENT`).trim();
      if (!files.includes(`${dir}/${current}`)) { problems.push(`${pack.name}: CURRENT ссылается на ${current}, а его нет в индексе git`); continue; }
      if (!files.some(f => /\.(ldb|log)$/.test(f))) { problems.push(`${pack.name}: в индексе нет файлов данных (.ldb/.log)`); continue; }
      if (!ClassicLevel) continue;
      execFileSync("git", ["checkout-index", `--prefix=${tmp.replace(/\\/g, "/")}/`, "--", ...files], { cwd: root });
      const db = new ClassicLevel(path.join(tmp, dir), { valueEncoding: "json", createIfMissing: false });
      try {
        await db.open();
        let n = 0;
        // документы верхнего уровня: «!items!id», «!journal!id»; вложенные — «!items.effects!…», папки — «!folders!…»
        for await (const key of db.keys()) if (/^![a-z]+!/i.test(key) && !key.startsWith("!folders!")) n++;
        counts[pack.name] = n;
        if (!n) problems.push(`${pack.name}: база открывается, но документов нет`);
      } catch (e) {
        problems.push(`${pack.name}: база из индекса не открывается — ${e.message}`);
      } finally {
        await db.close().catch(() => {});
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { problems, counts, opened: !!ClassicLevel };
}
