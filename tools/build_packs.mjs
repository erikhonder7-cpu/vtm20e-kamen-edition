// tools/build_packs.mjs
// Собирает компендиумы системы из её же данных — одна точка правды для листа,
// мастера и компендиумов:
//   equipment    — «Оружие и броня»: module/data/equipment.mjs
//   disciplines  — «Дисциплины»: data/disciplines.json (силы по уровням в описании)
//   blood-paths  — «Пути магии крови»: пути Тауматургии, Некромантии, Колдунства, чар Ассамитов
//   rituals      — «Ритуалы»: data/rituals.json
//   merits-flaws — «Достоинства и недостатки»: data/merits.json, папки по категориям
//   ghoul-merits — «Достоинства и недостатки гулей и ревенантов»: data/merits-ghouls.json (Ghouls & Revenants)
//   backgrounds  — «Факты биографии»: data/backgrounds.json
//   derangements — «Психические расстройства»: data/derangements.json
//   demon-*      — Demon: The Fallen: Знания и Дома (data/demon.json), черты (data/demon-merits.json), Дополнения (data/demon-backgrounds.json)
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
const { weaponIcon, armorIcon, traitIcon, backgroundIcon } = await import(pathToFileURL(path.join(ROOT, "module/data/icons.mjs")).href);
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

/** Один компендиум: папки и предметы (или журналы — docType "JournalEntry") с устойчивыми id. */
class Pack {
  constructor(name, docType = "Item") { this.name = name; this.docType = docType; this.folders = new Map(); this.items = []; }
  id(key) { return crypto.createHash("sha1").update(`${SYSTEM_ID}:${this.name}:${key}`).digest("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 16); }
  /** Папка по имени или пути ["Родитель", "Дочерняя"] — вложенные папки создаются по цепочке. */
  folder(name) {
    if (!name) return null;
    const chain = Array.isArray(name) ? name : [name];
    let parent = null, key = "";
    for (const part of chain) {
      key = key ? `${key}/${part}` : part;
      if (!this.folders.has(key)) this.folders.set(key, { _id: this.id(`folder:${key}`), name: part, type: this.docType, folder: parent, sorting: "a",
        sort: (this.folders.size + 1) * 100000, color: null, description: "", flags: {}, _stats: stats() });
      parent = this.folders.get(key)._id;
    }
    return parent;
  }
  add({ name, type, system, folder = null, key = null, img = null }) {
    this.items.push({ _id: this.id(`${type}:${key ?? `${folder}:${name}`}`), name, type, img: img ?? ICON(type), system,
      effects: [], folder: this.folder(folder), sort: (this.items.length + 1) * 1000, ownership: { default: 0 }, flags: {}, _stats: stats() });
  }
  /** Журнал из одной текстовой страницы (компендиум JournalEntry). */
  addEntry({ name, html, folder = null, key }) {
    const _id = this.id(`journal:${key}`), pageId = this.id(`page:${key}`);
    this.items.push({ _id, name, folder: this.folder(folder), sort: (this.items.length + 1) * 1000, ownership: { default: 0 }, flags: {}, _stats: stats(),
      categories: [], pages: [{ _id: pageId, name, type: "text", title: { show: false, level: 1 }, text: { content: html, format: 1, markdown: "" },
        image: {}, video: { controls: true, volume: 0.5 }, src: null, system: {}, category: null, sort: 100000,
        ownership: { default: -1 }, flags: {}, _stats: stats() }] });
  }
  /** Журнал с несколькими страницами (справочник правил): pages — [{ name, html }]. */
  addBook({ name, pages, folder = null, key }) {
    const _id = this.id(`journal:${key}`);
    this.items.push({ _id, name, folder: this.folder(folder), sort: (this.items.length + 1) * 1000, ownership: { default: 0 }, flags: {}, _stats: stats(),
      categories: [], pages: pages.map((pg, i) => ({ _id: this.id(`page:${key}:${i}`), name: pg.name, type: "text",
        title: { show: true, level: 1 }, text: { content: pg.html, format: 1, markdown: "" },
        image: {}, video: { controls: true, volume: 0.5 }, src: null, system: {}, category: null, sort: (i + 1) * 1000,
        ownership: { default: -1 }, flags: {}, _stats: stats() })) });
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
    for (const it of this.items) {
      if (this.docType !== "JournalEntry") { batch.put(`!items!${it._id}`, it); continue; }
      // журнал: в самой записи — id страниц, страницы — отдельными ключами (как хранит Foundry)
      batch.put(`!journal!${it._id}`, { ...it, pages: it.pages.map(p => p._id) });
      for (const p of it.pages) batch.put(`!journal.pages!${it._id}.${p._id}`, p);
    }
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
      p.add({ name, type: "weapon", folder: group, img: weaponIcon(name, system.kind), system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
    for (const { name, group, source, description = "", era, ...system } of ARMOR_PRESETS)
      p.add({ name, type: "armor", folder: group, img: armorIcon(system.rating), system: { ...system, source: source ?? "", description: description + sourceLine(source) } });
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
      p.add({ name: m.name, type: m.kind, folder: daFolder(m, folder), key: `${m.kind}:${m.name}`, img: traitIcon(m.category, m.kind === "flaw"),
        system: { cost: m.min || 1, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", source: m.en ?? "", description: `${m.html ?? ""}${range}` } });
    }
    return p;
  },

  "ghoul-merits"() {
    const p = new Pack("ghoul-merits");
    const cat = ru.VTM20.MeritCat ?? {};
    for (const m of data("merits-ghouls")) {
      const range = m.max > m.min ? `<p><em>Цена: ${m.cost}</em></p>` : "";
      const folder = `${m.kind === "merit" ? "Достоинства" : "Недостатки"} — ${cat[m.category] ?? m.category}`;
      p.add({ name: m.name, type: m.kind, folder, key: `ghoul:${m.kind}:${m.name}`, img: traitIcon(m.category, m.kind === "flaw"),
        system: { cost: m.min || 1, category: m.category, clan: "", sect: "", source: m.en ?? "", description: `${m.html ?? ""}${range}<p><em>Ghouls &amp; Revenants (V20)</em></p>` } });
    }
    return p;
  },

  backgrounds() {
    const p = new Pack("backgrounds");
    for (const b of data("backgrounds"))
      p.add({ name: b.name, type: "background", folder: b.fan ? "Век живых богов (фанатское)" : b.sabbat ? "Шабаш" : b.source && b.source !== "V20" ? "Из дополнений" : null, key: b.name, img: backgroundIcon(b.en) ?? undefined, system: { value: 1, source: b.en ?? "", description: b.html ?? "" } });
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
  },

  // Пути Просветления и Дороги (data/paths.json) — журналы: шапка, иерархия грехов, описание.
  // Папки: основная книга; дополнения; Тёмные века — Дорога с путями своей папкой, остальные Дороги в корне эпохи.
  "enlightenment-paths"() {
    const p = new Pack("enlightenment-paths", "JournalEntry");
    const VIRTUE = { conscience: "Совесть", conviction: "Убеждённость", selfControl: "Самоконтроль", instinct: "Инстинкты" };
    const paths = data("paths");
    const roadsWithPaths = new Set(paths.map(x => x.road).filter(Boolean));
    for (const x of paths) {
      const da = x.era === "darkAges";
      const folder = x.fan ? "Век живых богов (фанатское)" : !da ? (x.source ? "Пути из дополнений" : "Человечность и Пути (V20)")
        : x.road ? ["Тёмные века", x.road] : roadsWithPaths.has(x.name) ? ["Тёмные века", x.name] : "Тёмные века";
      const meta = [`<strong>Добродетели:</strong> ${x.virtues.map(v => VIRTUE[v] ?? v).join(" и ")}`,
        x.bearing && `<strong>Аура:</strong> ${esc(x.bearing)}`, x.followers && `<strong>Последователи:</strong> ${esc(x.followers)}`,
        `Источник: ${esc(x.source || "V20")}`].filter(Boolean).join(" · ");
      const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
      const rows = [...x.hierarchy].sort((a, b) => b.rating - a.rating).map(h => `<tr><td>${h.rating}</td><td>${esc(cap(h.sin))}</td></tr>`).join("");
      // «Прежнее название: …» — сразу под шапкой, а не после таблицы
      const aka = (x.html ?? "").match(/^<p><em>Прежнее название:.*?<\/em><\/p>/)?.[0] ?? "";
      const body = (x.html ?? "").slice(aka.length).replace(/^<p><em>Источник:.*?<\/em><\/p>/, "");
      const html = `<p class="r-ritual-meta">${meta}</p>${aka}${x.en ? `<p><em>${esc(x.en)}</em></p>` : ""}`
        + (x.road ? `<p><em>Путь ${esc(x.road.replace(/^Дорога/, "Дороги"))}: грехи, не указанные для пути, — как у Дороги.</em></p>` : "")
        + `<h3>Иерархия грехов</h3><table><thead><tr><th>Рейтинг</th><th>Грех</th></tr></thead><tbody>${rows}</tbody></table>${body}`;
      p.addEntry({ name: x.name, html, folder, key: x.key });
    }
    // Дорога — первой в своей папке
    for (const it of p.items) if (roadsWithPaths.has(it.name)) it.sort = 0;
    return p;
  }
};

BUILDERS.rules = function () {
  const p = new Pack("rules", "JournalEntry");
  for (const ch of data("rules")) p.addBook({ name: ch.name, pages: ch.pages, key: `rules:${ch.key}` });
  // глава 8 — справочник Ghouls & Revenants (data/rules-ghouls.json): отдельным файлом, чтобы build_data.py его не перезаписал
  for (const ch of data("rules-ghouls")) p.addBook({ name: ch.name, pages: ch.pages, key: `rules:${ch.key}` });
  return p;
};

// ── Demon: The Fallen — свои компендии (папка «Demon: The Fallen» в system.json), данные — data/demon.json ──
const ROMAN_LV = ["I", "II", "III", "IV", "V"];
/** Знания демонов: по папкам Домов (общие — отдельно); в описании — призывы по кругам и черты апокалиптической формы. */
BUILDERS["demon-lores"] = function () {
  const p = new Pack("demon-lores", "Item");
  const dm = data("demon");
  const houseName = Object.fromEntries(dm.houses.map(h => [h.key, h.name]));
  const A = { ...ru.VTM20.Attr, ...ru.VTM20.Abil };
  const pool = r => r?.trait1 ? `${A[r.trait1.split(".")[1]] ?? r.trait1} + ${A[r.trait2.split(".")[1]] ?? r.trait2}, сл. ${r.difficulty || 6}` : "по книге";
  const eb = data("demon-earthbound");
  for (const l of [...dm.lores, ...eb.lores]) {
    const rows = l.powers.map(x => `<tr><td>${ROMAN_LV[x.level - 1]}</td><td>${esc(x.name)}</td><td>${esc(pool(x.roll))}</td><td>с. ${x.page}</td></tr>`).join("");
    const form = l.form ? `<h3>Апокалиптическая форма</h3><p><strong>При низкой Муке:</strong> ${l.form.low.map(esc).join(", ")}.</p>`
      + `<p><strong>При высокой Муке</strong> (с 7-й Муки — по одной за точку): ${l.form.high.map(esc).join(", ")}.</p>` : "";
    const description = l.dark
      ? `<p><em>${esc(l.en)} · Earthbound.</em></p><p>${esc(l.text)}</p><p><strong>${esc(eb.darkNote)}</strong></p>`
        + `<h3>Призывы</h3><table><thead><tr><th>Круг</th><th>Призыв</th><th>Бросок</th></tr></thead><tbody>`
        + l.powers.map(x => `<tr><td>${ROMAN_LV[x.level - 1]}</td><td>${esc(x.name)}</td><td>${esc(pool(x.roll))}</td></tr>`).join("") + `</tbody></table>`
        + l.powers.map(x => `<h3>${ROMAN_LV[x.level - 1]}. ${esc(x.name)}</h3>${x.html}`).join("")
      : `<p><em>${esc(l.en)} · Demon: The Fallen, с. ${l.page}.</em></p><h3>Призывы</h3>`
      + `<table><thead><tr><th>Круг</th><th>Призыв</th><th>Бросок</th><th>Книга</th></tr></thead><tbody>${rows}</tbody></table>${form}`;
    // папка Знания внутри папки Дома: само Знание, затем его призывы — предметы «Призыв» (тип lorePower, порядок по кругу)
    const folder = [l.dark ? "Привязанные к Земле" : l.house ? houseName[l.house] : "Общие Знания", l.name];
    p.add({ name: l.name, type: "lore", folder, key: `lore:${l.key}`, img: ICON("discipline"),
      system: { key: l.key, value: 1, source: l.en, description } });
    p.folders.get(folder.join("/")).sorting = "m";
    for (const x of l.powers) {
      const system = { lore: l.key, level: x.level, page: x.page ?? 0, source: l.dark ? "Earthbound" : "Demon: The Fallen", description: x.html ?? "" };
      const roll = rollOf(x.roll); if (roll) system.roll = roll;
      p.add({ name: x.name, type: "lorePower", folder, key: `evocation:${l.key}:${x.level}`, img: ICON("discipline"), system });
    }
  }
  return p;
};
/** Дома и фракции падших — журналы: Дом (Облики, Знания, стартовая Мука), фракция. */
BUILDERS["demon-houses"] = function () {
  const p = new Pack("demon-houses", "JournalEntry");
  const dm = data("demon");
  const loreName = Object.fromEntries(dm.lores.map(l => [l.key, l.name]));
  const hof = data("demon-hof").houses;
  for (const h of dm.houses) {
    const vis =Object.entries(h.visages).map(([k, v]) => `<li><strong>${esc(v)}</strong> — ${esc(loreName[k] ?? k)}</li>`).join("");
    const html = `<p><em>${esc(h.akkadian)} · ${esc(h.en)}</em></p><p>${esc(h.text)}</p>`
      + `<p><strong>Начальная Мука:</strong> ${h.torment}. <strong>Знания Дома:</strong> ${h.lores.map(k => esc(loreName[k] ?? k)).join(", ")}; общие — Знание Основания и Знание Человечества.</p>`
      + `<h3>Облики (апокалиптическая форма по главному Знанию)</h3><ul>${vis}</ul>`
      // история Дома по «Домам Падших» — пересказ (data/demon-hof.json)
      + (hof[h.key]?.sections ?? []).map(s => `<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join("");
    p.addEntry({ name: h.name, html, folder: "Дома", key: `house:${h.key}` });
  }
  for (const f of dm.factions) p.addEntry({ name: f.name, html: `<p>${esc(f.text)}</p>`, folder: "Фракции", key: `faction:${f.key}` });
  return p;
};

/** Ритуалы и реликвии падших — пересказ: «Дома Падших» (data/demon-hof.json) и Demon Players Guide (data/demon-pg.json). */
const HOF = "Houses of the Fallen", PG = "Demon Players Guide", EB = "Earthbound";
const dots = n => "•".repeat(n);
function hofHouses() {
  const dm = data("demon"), hof = data("demon-hof").houses;
  const loreName = Object.fromEntries(dm.lores.map(l => [l.key, l.name]));
  return { dm, hof, lore: ([k, n]) => `${esc(loreName[k] ?? k)} ${dots(n)}`, loreName };
}
/** Бросок из описания («Обаяние + Лидерство») — ключи черт; что не узнано (Вера, Воля), остаётся строкой rollText. */
function parseRoll(text) {
  const names = {};
  for (const [k, v] of Object.entries(ru.VTM20.Attr ?? {})) names[String(v).toLowerCase()] = `attributes.${k}`;
  for (const [k, v] of Object.entries(ru.VTM20.Abil ?? {})) names[String(v).toLowerCase()] = `abilities.${k}`;
  // названия Demon: The Fallen, которых нет в листе V20 (Уклонение — Атлетика, как уворот в V20)
  Object.assign(names, { "осведомлённость": "abilities.awareness", "осведомленность": "abilities.awareness", "уклонение": "abilities.athletics", "атлетизм": "abilities.athletics", "наука": "abilities.science" });
  const raw = String(text ?? ""), diff = Number(/сл\.\s*(\d+)/.exec(raw)?.[1] ?? 0);
  const head = raw.split(/;| — | против |\(/)[0];
  const parts = head.split("+").map(x => x.trim().toLowerCase()).filter(Boolean);
  const keys = parts.map(x => names[x]).filter(Boolean);
  return keys.length === parts.length && keys.length ? { trait1: keys[0], trait2: keys[1] ?? "", difficulty: diff } : { trait1: "", trait2: "", difficulty: diff };
}
const loreRef = ([key, level]) => ({ key, level });
/** Ритуалы падших предметами (тип demonRitual): папки по Домам, бастионы — отдельно. */
BUILDERS["demon-rituals"] = function () {
  const p = new Pack("demon-rituals", "Item");
  const { dm, hof } = hofHouses();
  const pg = data("demon-pg").rituals;
  const add = (r, src, house, folder, key) => p.add({ name: r.name, type: "demonRitual", folder, key, img: ICON("ritual"),
    system: { house, primary: loreRef(r.primary), secondary: r.secondary.map(loreRef), cost: r.cost ?? 0, time: r.time ?? "", limits: r.limits ?? "",
      roll: parseRoll(r.roll), rollText: r.roll ?? "", high: r.high ?? "", variants: r.variants ?? "", page: r.page ?? 0, source: src,
      description: `<p>${esc(r.text)}</p>` } });
  for (const h of dm.houses) {
    for (const r of hof[h.key]?.rituals ?? []) add(r, HOF, h.key, h.name, `ritual:${h.key}:${r.name}`);
    for (const r of pg[h.key] ?? []) add(r, PG, h.key, h.name, `ritual:pg:${h.key}:${r.name}`);
  }
  for (const r of pg.bastions ?? []) add(r, PG, "bastion", "Бастионы", `ritual:pg:bastion:${r.name}`);
  const eb = data("demon-earthbound");
  for (const r of eb.rituals) add({ ...r, text: `${r.text} ${eb.ritualNote}` }, EB, "earthbound", "Привязанные к Земле", `ritual:eb:${r.name}`);
  return p;
};
/** Реликвии падших предметами (тип relic): реликвии Домов («Дома Падших») и «Арсенал Бездны» Players Guide. */
BUILDERS["demon-relics"] = function () {
  const p = new Pack("demon-relics", "Item");
  const { dm, hof } = hofHouses();
  const add = (r, src, kind, house, folder, key) => p.add({ name: r.name, type: "relic", folder, key, img: ICON("gear"),
    system: { kind, house, lores: r.lores ?? [], use: r.use ?? "", mechanics: r.system ?? "", page: r.page ?? 0, source: src, description: `<p>${esc(r.text)}</p>` } });
  for (const h of dm.houses)
    for (const r of hof[h.key]?.relics ?? []) add(r, HOF, r.kind === "craft" ? "demonic" : "unique", h.key, h.name, `relic:${h.key}:${r.name}`);
  // «Арсенал Бездны»: улучшенные и зачарованные предметы — шаблоны для любого падшего; древние чудеса
  const TYPE = { enhanced: "Улучшенные предметы", enchanted: "Зачарованные предметы", ancient: "Позабытые чудеса" };
  for (const r of data("demon-pg").relics) add(r, PG, r.type, "", TYPE[r.type], `relic:pg:${r.name}`);
  // артефакты Привязанных к Земле (Earthbound, гл. 4)
  const eb = data("demon-earthbound");
  for (const r of eb.relics) add({ ...r, system: `${r.system} ${eb.relicNote}` }, EB, r.type, "earthbound", "Привязанные к Земле", `relic:eb:${r.name}`);
  return p;
};

/** Правила падших (Demon: The Fallen, гл. 6, 7, 9; Earthbound) — своими словами: data/demon-rules.json. */
BUILDERS["demon-rules"] = function () {
  const p = new Pack("demon-rules", "JournalEntry");
  for (const ch of [...data("demon-rules"), data("demon-earthbound").rules]) {
    const pages = ch.key === "pg-form" ? [...ch.pages, ...formCatalogPages()] : ch.pages;
    p.addBook({ name: ch.name, pages, key: `demon-rules:${ch.key}` });
  }
  return p;
};
/** Каталог способностей апокалиптической формы (data/demon-form.json) — страницы главы «Апокалиптическая форма». */
function formCatalogPages() {
  const f = data("demon-form"), dm = data("demon");
  const A = { ...ru.VTM20.Attr, ...ru.VTM20.Abil };
  const li = a => `<li><strong>${esc(a.name)}</strong> — ${a.cost}${a.high ? ", только высокая Мука" : ""}<br>${esc(a.text)}</li>`;
  const pages = [{ name: "Общие способности", html: `<p>Доступны любому Дому.</p><ul>${f.common.map(li).join("")}</ul>` }];
  for (const h of dm.houses) {
    const H = f.houses[h.key];
    if (!H) continue;
    const r = H.rule;
    pages.push({ name: h.name, html: `<ul>${H.abilities.map(li).join("")}</ul>`
      + `<h3>Правило Дома (свободная форма)</h3><p><strong>Атрибуты:</strong> ${r.attrs.map(k => esc(A[k] ?? k)).join(", ")}. <strong>Способности:</strong> ${r.abilities.map(k => esc(A[k] ?? k)).join(", ")}.</p>`
      + `<ul>${r.special.map(s => `<li><strong>${esc(s.name)}</strong> — ${esc(s.text)}</li>`).join("")}</ul>` });
  }
  return pages;
}
/** Достоинства и недостатки падших (Demon Players Guide): папки «Достоинства — Инфернальные» и т. п. */
BUILDERS["demon-merits"] = function () {
  const p = new Pack("demon-merits");
  const cat = ru.VTM20.MeritCat ?? {};
  for (const m of data("demon-merits")) {
    const range = m.max > m.min ? `<p><em>Цена: ${m.cost}</em></p>` : "";
    const folder = `${m.kind === "merit" ? "Достоинства" : "Недостатки"} — ${cat[m.category] ?? m.category}`;
    p.add({ name: m.name, type: m.kind, folder, key: `demon:${m.kind}:${m.name}`, img: traitIcon(m.category, m.kind === "flaw"),
      system: { cost: m.min || 1, category: m.category, clan: "", sect: "", source: m.source, description: `${m.html}${range}<p><em>${m.source}, с. ${m.page}</em></p>` } });
  }
  return p;
};
/** Дополнения падших (Demon: The Fallen, гл. 6). */
BUILDERS["demon-backgrounds"] = function () {
  const p = new Pack("demon-backgrounds");
  for (const b of data("demon-backgrounds"))
    p.add({ name: b.name, type: "background", key: `demon:bg:${b.name}`, img: backgroundIcon(b.en) ?? undefined,
      system: { value: 1, source: b.en, description: `${b.html}<p><em>${b.source}, с. ${b.page}</em></p>` } });
  for (const b of data("demon-earthbound").backgrounds)
    p.add({ name: b.name, type: "background", folder: "Привязанные к Земле", key: `demon:bg:eb:${b.name}`, img: backgroundIcon(b.en) ?? undefined,
      system: { value: 1, source: b.en, description: `${b.html}<p><em>Earthbound</em></p>` } });
  return p;
};

const only = process.argv.slice(2);
for (const [name, build] of Object.entries(BUILDERS)) {
  if (only.length && !only.includes(name)) continue;
  await build().write();
}
