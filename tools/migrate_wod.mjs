// tools/migrate_wod.mjs
// Перенос мира с системы «worldofdarkness» (World of Darkness 20th) на vtm20e-kamen-edition.
// Работает с КОПИЕЙ: исходный мир не изменяется.
//
//   node tools/migrate_wod.mjs <папка исходного мира> <папка нового мира> <id нового мира> "<название>"
//
// Foundry с этим миром должен быть закрыт (LevelDB открывается напрямую).
// Что переносится: персонажи (характеристики, способности со специализациями, Добродетели,
// Человечность, воля, кровь, здоровье, клан, поколение, секта, натура/маска, опыт, тексты),
// Дисциплины и пути магии крови, записанные силы и ритуалы (с пулами), достоинства,
// недостатки, факты биографии, вторичные способности, оружие и броня; предметы мира;
// полоски токенов на сценах.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const FOUNDRY = "D:/Games/Foundry/Foundry Virtual Tabletop/resources/app/package.json";
const require = createRequire(FOUNDRY);
const { ClassicLevel } = require("classic-level");

const SYSTEM_ID = "vtm20e-kamen-edition";
const SYS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SYS_VERSION = JSON.parse(fs.readFileSync(path.join(SYS_DIR, "system.json"), "utf8")).version;
const MERITS = JSON.parse(fs.readFileSync(path.join(SYS_DIR, "data/merits.json"), "utf8"));
const DISC = JSON.parse(fs.readFileSync(path.join(SYS_DIR, "data/disciplines.json"), "utf8"));
const ICON = t => `systems/${SYSTEM_ID}/assets/icons/${t}.svg`;

/* ── Таблицы соответствий ─────────────────────────────────────────────── */

const ATTRS = ["strength", "dexterity", "stamina", "charisma", "manipulation", "appearance", "perception", "intelligence", "wits"];
const ABIL_MAP = {
  alertness: "alertness", athletics: "athletics", awareness: "awareness", brawl: "brawl", empathy: "empathy",
  expression: "expression", intimidation: "intimidation", leadership: "leadership", streetwise: "streetwise",
  subterfuge: "subterfuge", animalken: "animalKen", craft: "crafts", etiquette: "etiquette", firearms: "firearms",
  larceny: "larceny", melee: "melee", performance: "performance", stealth: "stealth", survival: "survival",
  academics: "academics", finance: "finance", investigation: "investigation", law: "law", medicine: "medicine",
  occult: "occult", politics: "politics", science: "science"
};
// Способности, которых в V20 нет или которые скрыты в эпохе 1789 → вторичные (Хобби / Профессия / Квалификация)
const SECONDARY = {
  enigmas: ["Загадки", "knowledges"], art: ["Искусство", "talents"], meditation: ["Медитация", "skills"],
  cosmology: ["Космология", "knowledges"], esoterica: ["Эзотерика", "knowledges"], dodge: ["Уклонение", "talents"],
  intuition: ["Интуиция", "talents"], persuasion: ["Убеждение", "talents"], kenning: ["Чутьё", "talents"],
  primalurge: ["Первобытный инстинкт", "talents"], demolitions: ["Взрывное дело", "skills"],
  martialarts: ["Боевые искусства", "skills"], security: ["Безопасность", "skills"], bureaucracy: ["Бюрократия", "knowledges"],
  gremayre: ["Гремуар", "knowledges"], linguistics: ["Лингвистика", "knowledges"], drive: ["Вождение", "skills"],
  computer: ["Информатика", "knowledges"], technology: ["Техника", "knowledges"]
};
const CLANS = {
  toreador: "toreador", gangrel: "gangrel", ventrue: "ventrue", tremere: "tremere", lasombra: "lasombra",
  nosferatu: "nosferatu", caitiff: "caitiff", brujah: "brujah", set: "setite", followersofset: "setite",
  malkavian: "malkavian", tzimisce: "tzimisce", giovanni: "giovanni", assamite: "assamite", ravnos: "ravnos"
};
const SECTS = { camarilla: "Камарилья", anarch: "Анархи", anarchs: "Анархи", independent: "Независимые", sabbat: "Шабаш" };

const DISC_NAMES = {
  "Анимализм": "animalism", "Власть над тенью": "obtenebration", "Затмение": "obtenebration", "Доминирование": "dominate",
  "Затемнение": "obfuscate", "Сокрытие": "obfuscate", "Могущество": "potence", "Мощь": "potence", "Помешательство": "dementation",
  "Превращение": "protean", "Метаморфозы": "protean", "Присутствие": "presence", "Величие": "presence",
  "Прорицание": "auspex", "Ясновидение": "auspex", "Серпентис": "serpentis", "Стойкость": "fortitude",
  "Стремительность": "celerity", "Тауматургия": "thaumaturgy", "Некромантия": "necromancy", "Изменчивость": "vicissitude",
  "Преображение": "vicissitude", "Химерия": "chimerstry", "Фантасмагория": "chimerstry", "Смертоносность": "quietus",
  "Упокоение": "quietus", "Мистицизм Бездны": "abyssMysticism"
};
for (const d of Object.values(DISC)) DISC_NAMES[d.name] ??= d.key;

const PATH_NAMES = {
  "Движения Разума": "Мановение Мысли", "Путь Движения Разума": "Мановение Мысли", "Привлечения Огней": "Игра с Огнём",
  "Путь Мощи Нептуна": "Могущество Нептуна", "Путь Сотворения": "Путь Воплощения", "Путь Дланей Разрушения": "Длань Разрушения",
  "Путь Крови": "Путь Крови"
};
const isPathName = n => n in PATH_NAMES || /(^|\s)Путь(\s|$)/.test(n);

/* ── Помощники ────────────────────────────────────────────────────────── */

const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const newId = () => Array.from({ length: 16 }, () => ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]).join("");
const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const stripLevel = n => String(n ?? "").replace(/^\s*\d+\s+/, "").trim();
const html = (...parts) => parts.filter(p => p && String(p).replace(/<[^>]+>/g, "").trim()).join("\n");
const tail = s => String(s ?? "").split(".").pop();

function trait(k) {
  if (!k) return "";
  if (ATTRS.includes(k)) return `attributes.${k}`;
  if (ABIL_MAP[k]) return `abilities.${ABIL_MAP[k]}`;
  if (k === "willpower") return "willpower.permanent";
  if (k === "selfcontrol") return "virtues.selfControl";
  if (["conscience", "courage"].includes(k)) return `virtues.${k}`;
  return "";
}
const rollOf = s => ({
  trait1: trait(s.dice1), trait2: trait(s.dice2), difficulty: clamp(num(s.difficulty, 0), 0, 10),
  blood: s.spendblood ? 1 : 0, willpower: !!s.spendwillpower
});

const stats = old => ({ ...(old ?? {}), systemId: SYSTEM_ID, systemVersion: SYS_VERSION });

function itemDoc(base, type, system, extra = {}) {
  const img = base.img && !String(base.img).startsWith("systems/worldofdarkness") && !String(base.img).startsWith("icons/svg/") ? base.img : ICON(type);
  return {
    _id: base._id ?? newId(), name: extra.name ?? base.name, type, img, system,
    effects: [], folder: base.folder ?? null, sort: base.sort ?? 0,
    ownership: base.ownership ?? { default: 0 }, flags: base.flags ?? {}, _stats: stats(base._stats)
  };
}

/* ── Предметы ─────────────────────────────────────────────────────────── */

/**
 * Предметы одного владельца (персонажа или мира). Возвращает новые документы и
 * то, что уходит в данные актёра (вторичные способности, опыт, Верховая езда).
 */
function convertItems(list) {
  const out = [], toActor = { secondary: [], ride: null, xpGained: [], xpSpent: [] };
  const byId = Object.fromEntries(list.map(i => [i._id, i]));
  const discKey = it => DISC_NAMES[it.name.trim()] ?? null;

  for (const it of list) {
    const s = it.system ?? {}, t = s.type;
    const desc = html(s.description, s.details);
    if (it.type === "Power" && t === "wod.types.discipline") {
      const name = it.name.trim();
      if (isPathName(name)) {
        const pname = PATH_NAMES[name] ?? name;
        out.push(itemDoc(it, "thaumPath", { description: desc, source: "", discipline: "thaumaturgy", value: clamp(num(s.value), 0, 5), primary: false }, { name: pname }));
      } else {
        const key = discKey(it) ?? name;
        out.push(itemDoc(it, "discipline", { description: DISC[key] ? "" : desc, source: "", key, value: clamp(num(s.value), 0, 10), inClan: false },
          { name: DISC[key]?.name ?? name }));
      }
    } else if (it.type === "Power" && t === "wod.types.disciplinepower") {
      if (!desc) continue;                                   // пустые заглушки «3 Могущество» — силы есть в справочнике
      const parent = byId[s.parentid];
      let discipline = "", pathName = "";
      if (parent) {
        const pn = parent.name.trim();
        if (isPathName(pn)) { discipline = "thaumaturgy"; pathName = PATH_NAMES[pn] ?? pn; }
        else discipline = DISC_NAMES[pn] ?? pn;
      }
      out.push(itemDoc(it, "power", { description: desc, source: "", discipline, path: pathName, level: clamp(num(s.level), 0, 10), roll: rollOf(s) }, { name: stripLevel(it.name) }));
    } else if (it.type === "Power" && t === "wod.types.ritual") {
      const cat = String(s.category ?? "");
      const discipline = cat.includes("abyss") ? "abyssMysticism" : cat.includes("necro") ? "necromancy" : "thaumaturgy";
      out.push(itemDoc(it, "ritual", { description: desc, source: "", discipline, level: clamp(num(s.level, 1), 1, 10), roll: rollOf(s) }, { name: stripLevel(it.name) }));
    } else if (it.type === "Power") {                         // charm, power, combination
      const parent = byId[s.parentid];
      out.push(itemDoc(it, "power", { description: desc, source: "", discipline: parent ? (DISC_NAMES[parent.name.trim()] ?? "") : "", path: "", level: clamp(num(s.level), 0, 10), roll: rollOf(s) }, { name: stripLevel(it.name) }));
    } else if (it.type === "Feature") {
      const lvl = num(s.level);
      if (t === "wod.types.background") out.push(itemDoc(it, "background", { description: desc, source: "", value: clamp(lvl, 0, 10) }));
      else {
        const kind = t === "wod.types.flaw" ? "flaw" : "merit";
        const ref = MERITS.find(m => m.kind === kind && m.name.toLowerCase() === it.name.trim().toLowerCase());
        out.push(itemDoc(it, kind, { description: desc || ref?.html || "", source: ref?.en ?? "", cost: clamp(lvl, 0, 10), category: ref?.category ?? "social" }));
      }
    } else if (it.type === "Trait") {
      const name = (s.label || it.name).trim(), v = clamp(num(s.value), 0, 10);
      if (/верхов/i.test(name)) toActor.ride = { value: v, specialty: s.speciality ?? "" };
      else if (v > 0) toActor.secondary.push({ name, group: t?.includes("talent") ? "talents" : t?.includes("knowledge") ? "knowledges" : "skills", value: v, specialty: s.speciality ?? "" });
    } else if (it.type === "Experience") {
      const row = { amount: num(s.amount), reason: html(s.description).replace(/<[^>]+>/g, "") || it.name, date: "" };
      (t === "wod.types.expspent" ? toActor.xpSpent : toActor.xpGained).push(row);
    } else if (it.type === "Melee Weapon" || it.type === "Ranged Weapon") {
      const ab = s.attack?.ability || (it.type === "Ranged Weapon" ? "firearms" : "melee");
      const kind = ab === "brawl" ? "brawl" : ab === "athletics" ? "thrown" : ab === "firearms" ? "firearms" : "melee";
      const dt = String(s.damage?.type ?? "").toLowerCase();
      out.push(itemDoc(it, "weapon", {
        description: desc, source: "", kind, damage: clamp(num(s.damage?.bonus), 0, 20), strength: (s.damage?.attribute ?? "") === "strength",
        damageType: dt.startsWith("b") ? "bashing" : dt.startsWith("a") ? "aggravated" : "lethal",
        difficulty: clamp(num(s.difficulty, 6), 2, 10), range: String(s.range?.short ?? s.range ?? ""), rate: String(s.rate ?? ""),
        clip: String(s.clip ?? ""), concealment: String(s.conceal ?? ""), equipped: true
      }));
    } else if (it.type === "Armor") {
      out.push(itemDoc(it, "armor", { description: desc, source: "", rating: clamp(num(s.soak?.bashing), 0, 10), penalty: clamp(num(s.dexpenalty), 0, 10), equipped: !!s.isequipped }));
    } else {
      out.push(itemDoc(it, "gear", { description: desc, source: "", quantity: 1 }));
    }
  }
  // Основной путь Тауматургии — самый развитый
  const paths = out.filter(i => i.type === "thaumPath");
  if (paths.length) paths.reduce((a, b) => (b.system.value > a.system.value ? b : a)).system.primary = true;
  return { items: out, toActor };
}

/* ── Персонажи ────────────────────────────────────────────────────────── */

const ACTOR_TYPES = { Vampire: "vampire", Creature: "creature", Ghoul: "ghoul", Mortal: "mortal", PC: "mortal" };

function convertActor(a, items) {
  const s = a.system ?? {};
  const type = ACTOR_TYPES[a.type] ?? "mortal";
  const { items: newItems, toActor } = convertItems(items);
  const adv = s.advantages ?? {};

  const attributes = Object.fromEntries(ATTRS.map(k => [k, { value: clamp(num(s.attributes?.[k]?.value, 1), 0, 10), specialty: s.attributes?.[k]?.speciality ?? "" }]));
  const abilities = {};
  const secondary = [...toActor.secondary];
  for (const [k, v] of Object.entries(s.abilities ?? {})) {
    const val = clamp(num(v.value), 0, 10);
    if (ABIL_MAP[k]) abilities[ABIL_MAP[k]] = { value: val, specialty: v.speciality ?? "" };
    else if (val > 0) {
      const [name, group] = SECONDARY[k] ?? [v.altlabel || k, v.type === "talent" ? "talents" : v.type === "knowledge" ? "knowledges" : "skills"];
      secondary.push({ name, group, value: val, specialty: v.speciality ?? "" });
    }
  }
  if (toActor.ride) abilities.ride = toActor.ride;

  const gained = toActor.xpGained.reduce((t, r) => t + r.amount, 0);
  const spent = toActor.xpSpent.reduce((t, r) => t + r.amount, 0);
  const log = [...toActor.xpGained, ...toActor.xpSpent.map(r => ({ ...r, amount: -r.amount }))];

  const money = s.money && (s.money.carried || s.money.bank) ? `<p><strong>Деньги:</strong> при себе ${s.money.carried ?? 0}, в банке ${s.money.bank ?? 0}</p>` : "";
  const sec = (title, body) => body && String(body).replace(/<[^>]+>/g, "").trim() ? `<h3>${title}</h3>${String(body).startsWith("<") ? body : `<p>${body}</p>`}` : "";

  const system = {
    attributes, abilities, secondary,
    virtues: {
      conscience: { value: clamp(num(adv.virtues?.conscience?.permanent, 1), 0, 5) },
      selfControl: { value: clamp(num(adv.virtues?.selfcontrol?.permanent, 1), 0, 5) },
      courage: { value: clamp(num(adv.virtues?.courage?.permanent, 1), 0, 5) }
    },
    morality: { path: "humanity", value: clamp(num(adv.path?.permanent, 7), 0, 10) },
    willpower: { permanent: clamp(num(adv.willpower?.permanent, 3), 0, 10), temporary: clamp(num(adv.willpower?.temporary, 3), 0, 10) },
    health: {
      bashing: clamp(num(s.health?.damage?.bashing), 0, 7), lethal: clamp(num(s.health?.damage?.lethal), 0, 7),
      aggravated: clamp(num(s.health?.damage?.aggravated), 0, 7)
    },
    details: {
      player: s.player ?? "", chronicle: "LIBERTÉ ÉTERNELLE", concept: (s.concept ?? "").trim(),
      nature: (s.nature ?? "").trim(), demeanor: (s.demeanor ?? "").trim(), sire: s.sire ?? "",
      sect: SECTS[tail(s.sect)] ?? s.custom?.sect ?? "", haven: "", age: "", apparentAge: "", born: "", embraced: ""
    },
    experience: { total: gained, spent, log },
    biography: html(sec("Внешность", s.appearance), sec("Предыстория", s.background)),
    notes: html(sec("Заметки", s.notes), sec("Советы по отыгрышу", s.roleplaytip), sec("Расстройства", s.derangement), sec("Снаряжение", s.gear), money)
  };

  if (type === "vampire") {
    const clanKey = CLANS[tail(s.clan)] ?? "";
    Object.assign(system, {
      clan: clanKey || "caitiff", clanCustom: clanKey ? "" : (s.custom?.clan || s.bloodline || ""), clanChoice: "",
      generation: clamp(num(s.generation, 13) - num(s.generationmod), 3, 15),
      blood: { value: clamp(num(adv.bloodpool?.temporary, 10), 0, 100) },
      boosts: { strength: 0, dexterity: 0, stamina: 0 }, bonds: [], weaknessNote: s.weakness ?? ""
    });
  } else if (type === "creature") {
    const hasBlood = !!s.settings?.hasbloodpool;
    Object.assign(system, {
      kind: s.settings?.variant === "familiar" ? "Фамильяр" : "",
      blood: { value: hasBlood ? clamp(num(adv.bloodpool?.temporary), 0, 100) : 0, max: hasBlood ? clamp(num(adv.bloodpool?.max, 10), 0, 100) : 0 },
      boosts: { strength: 0, dexterity: 0, stamina: 0 }, supernatural: true
    });
  }

  // У кого есть пути, но нет самой Тауматургии — добавить её с уровнем основного пути
  const hasThaum = newItems.some(i => i.type === "discipline" && i.system.key === "thaumaturgy");
  const paths = newItems.filter(i => i.type === "thaumPath");
  if (paths.length && !hasThaum) {
    newItems.push(itemDoc({}, "discipline", { description: "", source: "", key: "thaumaturgy", value: Math.max(...paths.map(p => p.system.value)), inClan: false }, { name: "Тауматургия" }));
  }

  const proto = foundry_proto(a.prototypeToken, type);
  return {
    actor: { ...a, type, system, items: undefined, prototypeToken: proto, _stats: stats(a._stats) },
    items: newItems
  };
}

function foundry_proto(p, type) {
  if (!p) return p;
  return { ...p, bar1: { attribute: "health" }, bar2: { attribute: type === "mortal" ? "willpower" : "blood" } };
}

/* ── Работа с базами ──────────────────────────────────────────────────── */

async function readAll(dir) {
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  const rows = [];
  for await (const [k, v] of db.iterator()) rows.push([k, v]);
  return { db, rows };
}

async function migrateActors(dir, report) {
  const { db, rows } = await readAll(dir);
  const actors = rows.filter(([k]) => k.startsWith("!actors!"));
  const batch = db.batch();
  for (const [key, a] of actors) {
    const prefix = `!actors.items!${a._id}.`;
    const itemRows = rows.filter(([k]) => k.startsWith(prefix));
    const { actor, items } = convertActor(a, itemRows.map(([, v]) => v));
    for (const [k] of itemRows) batch.del(k);
    actor.items = items.map(i => i._id);
    batch.put(key, actor);
    for (const it of items) batch.put(`${prefix}${it._id}`, it);
    report.push(`${a.name} (${a.type} → ${actor.type}): предметов ${itemRows.length} → ${items.length}`);
  }
  await batch.write();
  await db.close();
}

async function migrateWorldItems(dir, report) {
  if (!fs.existsSync(dir)) return;
  const { db, rows } = await readAll(dir);
  const list = rows.filter(([k]) => k.startsWith("!items!")).map(([, v]) => v);
  const { items } = convertItems(list);
  const batch = db.batch();
  for (const [k] of rows.filter(([k]) => k.startsWith("!items!"))) batch.del(k);
  for (const it of items) batch.put(`!items!${it._id}`, it);
  await batch.write();
  await db.close();
  report.push(`Предметы мира: ${list.length} → ${items.length}`);
}

async function migrateScenes(dir, report) {
  if (!fs.existsSync(dir)) return;
  const { db, rows } = await readAll(dir);
  const batch = db.batch();
  let n = 0, d = 0;
  for (const [k, v] of rows) {
    if (k.startsWith("!scenes.tokens!")) {
      v.bar1 = { attribute: "health" };
      if (v.bar2?.attribute) v.bar2 = { attribute: "blood" };
      batch.put(k, v); n++;
    } else if (k.startsWith("!scenes.tokens.delta!")) {
      // дельта несвязанного токена хранила поля старой системы — сбрасываем к базовому актёру
      v.system = {};
      if (v.type) delete v.type;
      batch.put(k, v); d++;
    }
  }
  await batch.write();
  await db.close();
  report.push(`Токены: ${n}, сброшено дельт: ${d}`);
}

/* ── Запуск ───────────────────────────────────────────────────────────── */

const [,, src, dst, id, title] = process.argv;
if (!src || !dst || !id) { console.error("Использование: node tools/migrate_wod.mjs <src> <dst> <id> \"<title>\""); process.exit(1); }
if (fs.existsSync(dst)) { console.error(`Папка ${dst} уже существует — удалите её или выберите другую.`); process.exit(1); }
const srcManifest = JSON.parse(fs.readFileSync(path.join(src, "world.json"), "utf8"));
if (srcManifest.system !== "worldofdarkness") { console.error(`Исходный мир на системе ${srcManifest.system}, ожидалась worldofdarkness.`); process.exit(1); }

fs.cpSync(src, dst, { recursive: true });
for (const lock of ["LOCK"]) for (const sub of fs.readdirSync(path.join(dst, "data"))) {
  const f = path.join(dst, "data", sub, lock);
  if (fs.existsSync(f)) fs.rmSync(f);
}
const manifest = { ...srcManifest, id, title: title || `${srcManifest.title} (V20)`, system: SYSTEM_ID, systemVersion: SYS_VERSION, lastPlayed: undefined, playtime: 0 };
fs.writeFileSync(path.join(dst, "world.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

const report = [];
await migrateActors(path.join(dst, "data/actors"), report);
await migrateWorldItems(path.join(dst, "data/items"), report);
await migrateScenes(path.join(dst, "data/scenes"), report);
console.log(report.join("\n"));
console.log(`\nГотово: ${dst} (${manifest.title})`);
