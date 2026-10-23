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
// classic-level берём из установленного Foundry: путь — из FOUNDRY_APP (папка resources/app) или из известных мест
const FOUNDRY_APPS = [process.env.FOUNDRY_APP, "D:/Games/Foundry/Foundry Virtual Tabletop/resources/app",
  "D:/FoundryVTT-WindowsPortable-14.365/App/resources/app"].filter(Boolean);
const FOUNDRY_APP = FOUNDRY_APPS.find(p => fs.existsSync(path.join(p, "node_modules", "classic-level")));
if (!FOUNDRY_APP) throw new Error(`Не найден Foundry с classic-level; укажите FOUNDRY_APP=<…/resources/app>. Проверено: ${FOUNDRY_APPS.join("; ")}`);
const require = createRequire(path.join(FOUNDRY_APP, "package.json"));
// Версия ядра в _stats — того Foundry, которым собираем: документы «из более новой версии» старое ядро не принимает
// (было жёстко 14.367 — на 14.365 все компендии падали с «core version newer than the running version»)
const FOUNDRY_PKG = JSON.parse(fs.readFileSync(path.join(FOUNDRY_APP, "package.json"), "utf8"));
const CORE_VERSION = FOUNDRY_PKG.release ? `${FOUNDRY_PKG.release.generation}.${FOUNDRY_PKG.release.build}` : FOUNDRY_PKG.version;
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
/** Материалы Тёмных веков (era = "darkAges") — в компендиях внутри папки «Тёмные века». */
const daFolder = (x, folder) => x.era === "darkAges" ? ["Тёмные века", ...(Array.isArray(folder) ? folder : [folder])] : folder;
const stats = () => ({
  compendiumSource: null, duplicateSource: null, exportSource: null,
  coreVersion: CORE_VERSION, systemId: SYSTEM_ID, systemVersion: manifest.version,
  createdTime: now, modifiedTime: now, lastModifiedBy: null
});

/** Один компендиум: папки и предметы с устойчивыми id. */
class Pack {
  constructor(name) { this.name = name; this.folders = new Map(); this.items = []; }
  id(key) { return crypto.createHash("sha1").update(`${SYSTEM_ID}:${this.name}:${key}`).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16); }
  /** Папка по имени или пути ["Родитель", "Дочерняя"] — вложенные папки создаются по цепочке. */
  folder(name) {
    if (!name) return null;
    const chain = Array.isArray(name) ? name : [name];
    let parent = null, key = "";
    for (const part of chain) {
      key = key ? `${key}/${part}` : part;
      if (!this.folders.has(key)) this.folders.set(key, { _id: this.id(`folder:${key}`), name: part, type: "Item", folder: parent, sorting: "a",
        sort: (this.folders.size + 1) * 100000, color: null, description: "", flags: {}, _stats: stats() });
      parent = this.folders.get(key)._id;
    }
    return parent;
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
    for (const { name, group, source, description = "", era, ...system } of WEAPON_PRESETS)
      p.add({ name, type: "weapon", folder: group, system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
    for (const { name, group, source, description = "", era, ...system } of ARMOR_PRESETS)
      p.add({ name, type: "armor", folder: group, system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
    return p;
  },

  disciplines() {
    const p = new Pack("disciplines");
    const all = data("disciplines");
    // Папка на Дисциплину: сама Дисциплина, затем её силы по уровням (порядок ручной — по уровню, а не по алфавиту)
    for (const d of Object.values(all).sort((a, b) => a.name.localeCompare(b.name, "ru"))) {
      const powers = (d.powers ?? []).map(x => `<li><b>${ROMAN[x.level - 1] ?? x.level}</b> · ${esc(x.name)}${x.en ? ` <em>(${esc(x.en)})</em>` : ""}</li>`).join("");
      const rules = (d.rules ?? []).map(r => r.html ?? "").join("");
      const description = `${rules}${powers ? `<h4>Силы</h4><ul>${powers}</ul>` : ""}${d.clans?.length ? `<p><em>Клановая у: ${esc([].concat(d.clans).join(", "))}</em></p>` : ""}${sourceLine(d.source)}`;
      p.add({ name: d.name, type: "discipline", folder: d.name, key: d.key, img: DISC_ICON(d.key), system: { key: d.key, value: 1, inClan: false, source: d.en ?? "", description } });
      p.folders.get(d.name).sorting = "m";
      for (const x of d.powers ?? []) {
        const system = { discipline: d.key, path: "", level: x.level, source: x.en ?? "", description: x.html ?? "" };
        const roll = rollOf(x.roll); if (roll) system.roll = roll;
        p.add({ name: x.name, type: "power", folder: x.era === "darkAges" ? [d.name, "Тёмные века"] : d.name, key: `${d.key}:${x.level}:${x.name}`, img: DISC_ICON(d.key), system });
      }
    }
    // Комбинированные Дисциплины — подпапками по первой из нужных Дисциплин («Комбинированные / Ясновидение»)
    for (const c of [...data("combos")].sort((a, b) => a.name.localeCompare(b.name, "ru"))) {
      const first = c.requires?.[0] ?? {};
      const system = { discipline: first.key ?? "", path: "", level: first.level ?? 1, source: c.en ?? "", description: c.html ?? "" };
      const roll = rollOf(c.roll); if (roll) system.roll = roll;
      const group = all[first.key]?.name ?? "Прочие";
      p.add({ name: c.name, type: "power", folder: ["Комбинированные Дисциплины", ...(c.era === "darkAges" ? ["Тёмные века"] : []), group],
        key: `combo:${c.en || c.name}`, img: DISC_ICON(first.key), system });
    }
    return p;
  },

  "blood-paths"() {
    const p = new Pack("blood-paths");
    const disc = data("disciplines");
    for (const [k, d] of Object.entries(disc)) for (const path_ of d.paths ?? []) {
      const powers = (path_.powers ?? []).map(x => `<li><b>${ROMAN[x.level - 1] ?? x.level}</b> · ${esc(x.name)}</li>`).join("");
      // Пути Тёмных веков — подпапкой внутри своей школы, а не отдельным деревом
      p.add({ name: path_.name, type: "thaumPath", folder: path_.era === "darkAges" ? [d.name, "Тёмные века"] : d.name, key: `${k}:${path_.name}`, img: DISC_ICON(k),
        system: { discipline: k, value: 1, primary: false, source: path_.en ?? "", description: `${path_.html ?? ""}${powers ? `<h4>Уровни пути</h4><ul>${powers}</ul>` : ""}` } });
    }
    return p;
  },

  rituals() {
    const p = new Pack("rituals");
    const disc = data("disciplines");
    // «Ритуалы Тауматургии / Уровень 1»; материалы Тёмных веков — «Ритуалы Тауматургии / Тёмные века / Уровень 1»
    const SCHOOL = { thaumaturgy: "Ритуалы Тауматургии", necromancy: "Ритуалы Некромантии", koldunism: "Ритуалы Колдовства",
      assamiteSorcery: "Ритуалы Чародейства Ассамитов", setiteSorcery: "Ритуалы Чародейства Сетитов",
      darkThaumaturgy: "Ритуалы Тёмной Тауматургии", obtenebration: "Ритуалы Мистики Бездны" };
    for (const [k, group] of Object.entries(data("rituals"))) {
      const school = SCHOOL[k] ?? `Ритуалы: ${disc[k]?.name ?? k}`;
      const branch = r => [school, ...(r.era === "darkAges" ? ["Тёмные века"] : [])];
      // папки уровней создаём по порядку и сортируем вручную: по алфавиту «Уровень 10» встал бы перед «Уровень 2»
      const list = [...(group.rituals ?? [])].sort((a, b) => !!a.era - !!b.era || a.level - b.level);
      for (const r of list) p.folder([...branch(r), `Уровень ${r.level}`]);
      for (const [key, f] of p.folders) if (key === school || key === `${school}/Тёмные века`) f.sorting = "m";
      for (const r of group.rituals ?? []) {
        const system = { discipline: k, level: r.level, source: r.en ?? "", description: r.html ?? "" };
        const roll = rollOf(r.roll); if (roll) system.roll = roll;
        p.add({ name: r.name, type: "ritual", folder: [...branch(r), `Уровень ${r.level}`], key: `${k}:${r.name}`, img: DISC_ICON(k), system });
      }
    }
    return p;
  },

  "merits-flaws"() {
    const p = new Pack("merits-flaws");
    const cat = Object.fromEntries(Object.entries(ru.VTM20.MeritCat ?? {}).map(([k, v]) => [k, v]));
    // Клановые черты и черты сект — только в своих папках, в общих категориях их нет
    const clanName = Object.fromEntries(data("clans").map(c => [c.key, c.name]));
    clanName.synySamuila ??= "Сыны Самуила";
    const sectName = { camarilla: "Камарилья", sabbat: "Шабаш", anarchs: "Анархи" };
    for (const m of data("merits")) {
      const range = m.max > m.min ? `<p><em>Цена: ${m.min}–${m.max}</em></p>` : "";
      const kindLabel = m.kind === "merit" ? "Достоинства" : "Недостатки";
      const folder = m.clan ? [`Клановые ${kindLabel.toLowerCase()}`, clanName[m.clan] ?? m.clan]
        : m.sect ? ["Черты сект", sectName[m.sect] ?? m.sect]
        : `${kindLabel} — ${cat[m.category] ?? m.category}`;
      p.add({ name: m.name, type: m.kind, folder: daFolder(m, folder), key: `${m.kind}:${m.name}`,
        system: { cost: m.min || 1, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", source: m.en ?? "", description: `${m.html ?? ""}${range}` } });
    }
    return p;
  },

  backgrounds() {
    const p = new Pack("backgrounds");
    for (const b of data("backgrounds"))
      p.add({ name: b.name, type: "background", folder: b.sabbat ? "Шабаш" : b.source && b.source !== "V20" ? "Из дополнений" : null, key: b.name, system: { value: 1, source: b.en ?? "", description: b.html ?? "" } });
    return p;
  },

  derangements() {
    const p = new Pack("derangements");
    // основная книга — в корне, дополнения — папкой по книге, Тёмные века — своей папкой
    for (const d of data("derangements")) {
      const extra = d.source && d.source !== "V20";
      p.add({ name: d.name, type: "derangement", key: d.name, folder: d.era === "darkAges" ? "Тёмные века" : extra ? d.source : null,
        system: { permanent: false, source: d.en ?? "", description: extra ? d.html : `${d.html}${sourceLine("V20, гл. 5")}` } });
    }
    return p;
  }
};

const only = process.argv.slice(2);
for (const [name, build] of Object.entries(BUILDERS)) {
  if (only.length && !only.includes(name)) continue;
  await build().write();
}
