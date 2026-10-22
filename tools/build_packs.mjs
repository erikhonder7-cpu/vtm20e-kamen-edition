// tools/build_packs.mjs
// Собирает компендиумы системы из её же данных — одна точка правды для листа,
// мастера и компендиумов:
//   equipment    — «Оружие и броня»: module/data/equipment.mjs
//   disciplines  — «Дисциплины»: data/disciplines.json (силы по уровням в описании)
//   blood-paths  — «Пути магии крови»: пути Тауматургии, Некромантии, Колдунства, чар Ассамитов
//   rituals      — «Ритуалы»: data/rituals.json
//   merits-flaws — «Достоинства и недостатки»: data/merits.json, папки по категориям
//   backgrounds  — «Факты биографии»: data/backgrounds.json
//   derangements — «Психические расстройства»: data/derangements.json
//
// Пишет LevelDB так же, как Foundry: ключи «!items!<id>» и «!folders!<id>». Идентификаторы
// стабильные (хэш), поэтому пересборка не плодит дубликатов и не ломает ссылки на предметы.
//
// Запуск из корня системы:  node tools/build_packs.mjs [имя …]
// Новый компендиум Foundry видит после перезапуска сервера (он описан в system.json);
// пересобранный старый — после перезагрузки мира.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire("D:/Games/Foundry/Foundry Virtual Tabletop/resources/app/package.json");
const { ClassicLevel } = require("classic-level");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
const data = f => JSON.parse(fs.readFileSync(path.join(ROOT, "data", `${f}.json`), "utf8"));
const { WEAPON_PRESETS, ARMOR_PRESETS } = await import(pathToFileURL(path.join(ROOT, "module/data/equipment.mjs")).href);
const ru = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/ru.json"), "utf8"));

const SYSTEM_ID = manifest.id;
const ICON = type => `systems/${SYSTEM_ID}/assets/icons/${type}.svg`;
/** Жетон Дисциплины, если он собран tools/make_discipline_icons.py. */
const DISC_ICON = key => fs.existsSync(path.join(ROOT, "assets/icons/disciplines", `${key}.svg`))
  ? `systems/${SYSTEM_ID}/assets/icons/disciplines/${key}.svg` : ICON("discipline");
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const now = Date.now();
const stats = () => ({
  compendiumSource: null, duplicateSource: null, exportSource: null,
  coreVersion: "14.367", systemId: SYSTEM_ID, systemVersion: manifest.version,
  createdTime: now, modifiedTime: now, lastModifiedBy: null
});

/** Один компендиум: папки и предметы с устойчивыми id. */
class Pack {
  constructor(name) { this.name = name; this.folders = new Map(); this.items = []; }
  id(key) { return crypto.createHash("sha1").update(`${SYSTEM_ID}:${this.name}:${key}`).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16); }
  folder(name) {
    if (!name) return null;
    if (!this.folders.has(name)) this.folders.set(name, { _id: this.id(`folder:${name}`), name, type: "Item", folder: null, sorting: "a",
      sort: (this.folders.size + 1) * 100000, color: null, description: "", flags: {}, _stats: stats() });
    return this.folders.get(name)._id;
  }
  add({ name, type, system, folder = null, key = null, img = null }) {
    this.items.push({ _id: this.id(`${type}:${key ?? `${folder}:${name}`}`), name, type, img: img ?? ICON(type), system,
      effects: [], folder: this.folder(folder), sort: (this.items.length + 1) * 1000, ownership: { default: 0 }, flags: {}, _stats: stats() });
  }
  async write() {
    const dir = path.join(ROOT, "packs", this.name);
    // Открытый компендиум держит LOCK — под работающим Foundry его не трогаем: сначала пробуем
    // открыть базу, и только если она свободна, удаляем и пишем заново
    if (fs.existsSync(dir)) {
      const probe = new ClassicLevel(dir, { valueEncoding: "json" });
      try { await probe.open(); await probe.close(); }
      catch {
        console.warn(`packs/${this.name}: открыт в Foundry — пропущен (пересоберите при остановленном сервере)`);
        return false;
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const db = new ClassicLevel(dir, { valueEncoding: "json" });
    await db.open();
    const batch = db.batch();
    for (const f of this.folders.values()) batch.put(`!folders!${f._id}`, f);
    for (const it of this.items) batch.put(`!items!${it._id}`, it);
    await batch.write();
    await db.close();
    console.log(`packs/${this.name}: ${this.items.length} предм., ${this.folders.size} папок`);
    return true;
  }
}

const sourceLine = s => s ? `<p><em>Источник: ${esc(s)}</em></p>` : "";
const rollOf = r => r ? { trait1: r.trait1 ?? "", trait2: r.trait2 ?? "", difficulty: r.difficulty ?? 0, blood: r.blood ?? 0, willpower: !!r.willpower, note: r.note ?? "" } : undefined;

const BUILDERS = {
  equipment() {
    const p = new Pack("equipment");
    for (const { name, group, source, description = "", ...system } of WEAPON_PRESETS)
      p.add({ name, type: "weapon", folder: group, system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
    for (const { name, group, source, description = "", ...system } of ARMOR_PRESETS)
      p.add({ name, type: "armor", folder: group, system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
    return p;
  },

  disciplines() {
    const p = new Pack("disciplines");
    for (const d of Object.values(data("disciplines"))) {
      const powers = (d.powers ?? []).map(x => `<li><b>${ROMAN[x.level - 1] ?? x.level}</b> · ${esc(x.name)}${x.en ? ` <em>(${esc(x.en)})</em>` : ""}</li>`).join("");
      const rules = (d.rules ?? []).map(r => r.html ?? "").join("");
      const description = `${rules}${powers ? `<h4>Силы</h4><ul>${powers}</ul>` : ""}${d.clans?.length ? `<p><em>Клановая у: ${esc([].concat(d.clans).join(", "))}</em></p>` : ""}${sourceLine(d.source)}`;
      p.add({ name: d.name, type: "discipline", key: d.key, img: DISC_ICON(d.key), system: { key: d.key, value: 1, inClan: false, source: d.en ?? "", description } });
    }
    // Комбинированные Дисциплины (Lore of the Clans и др.) — силы, привязанные к первой из нужных Дисциплин
    for (const c of data("combos")) {
      const first = c.requires?.[0] ?? {};
      const system = { discipline: first.key ?? "", path: "", level: first.level ?? 1, source: c.en ?? "", description: c.html ?? "" };
      const roll = rollOf(c.roll); if (roll) system.roll = roll;
      p.add({ name: c.name, type: "power", folder: "Комбинированные Дисциплины", key: `combo:${c.en || c.name}`, img: DISC_ICON(first.key), system });
    }
    return p;
  },

  "blood-paths"() {
    const p = new Pack("blood-paths");
    const disc = data("disciplines");
    for (const [k, d] of Object.entries(disc)) for (const path_ of d.paths ?? []) {
      const powers = (path_.powers ?? []).map(x => `<li><b>${ROMAN[x.level - 1] ?? x.level}</b> · ${esc(x.name)}</li>`).join("");
      p.add({ name: path_.name, type: "thaumPath", folder: d.name, key: `${k}:${path_.name}`, img: DISC_ICON(k),
        system: { discipline: k, value: 1, primary: false, source: path_.en ?? "", description: `${path_.html ?? ""}${powers ? `<h4>Уровни пути</h4><ul>${powers}</ul>` : ""}` } });
    }
    return p;
  },

  rituals() {
    const p = new Pack("rituals");
    const disc = data("disciplines");
    for (const [k, group] of Object.entries(data("rituals"))) for (const r of group.rituals ?? []) {
      const system = { discipline: k, level: r.level, source: r.en ?? "", description: r.html ?? "" };
      const roll = rollOf(r.roll); if (roll) system.roll = roll;
      p.add({ name: r.name, type: "ritual", folder: `${k === "obtenebration" ? "Мистика Бездны" : disc[k]?.name ?? k} — ${ROMAN[r.level - 1] ?? r.level}`, key: `${k}:${r.name}`, img: DISC_ICON(k), system });
    }
    return p;
  },

  "merits-flaws"() {
    const p = new Pack("merits-flaws");
    const cat = Object.fromEntries(Object.entries(ru.VTM20.MeritCat ?? {}).map(([k, v]) => [k, v]));
    for (const m of data("merits")) {
      const range = m.max > m.min ? `<p><em>Цена: ${m.min}–${m.max}</em></p>` : "";
      const kindLabel = m.kind === "merit" ? "Достоинства" : "Недостатки";
      p.add({ name: m.name, type: m.kind, folder: `${kindLabel} — ${cat[m.category] ?? m.category}`, key: `${m.kind}:${m.name}`,
        system: { cost: m.min || 1, category: m.category, source: m.en ?? "", description: `${m.html ?? ""}${range}` } });
    }
    return p;
  },

  backgrounds() {
    const p = new Pack("backgrounds");
    for (const b of data("backgrounds"))
      p.add({ name: b.name, type: "background", folder: b.sabbat ? "Шабаш" : null, key: b.name, system: { value: 1, source: b.en ?? "", description: b.html ?? "" } });
    return p;
  },

  derangements() {
    const p = new Pack("derangements");
    for (const d of data("derangements"))
      p.add({ name: d.name, type: "derangement", key: d.name, system: { permanent: false, source: d.en ?? "", description: `${d.html}${sourceLine("V20, гл. 5")}` } });
    return p;
  }
};

const only = process.argv.slice(2);
for (const [name, build] of Object.entries(BUILDERS)) {
  if (only.length && !only.includes(name)) continue;
  await build().write();
}
