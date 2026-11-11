// module/apps/npc-build.mjs
// Сборка НПС по правилам создания своей линейки (V20, W20, Demon, Hunter, Accursed Heirs, Ghouls & Revenants…):
// роль решает, во что вложены точки, уровень силы — сколько сверху (как свободные пункты и опыт),
// подвид и выбор (клан, племя, кредо, Дом…) — какие силы доступны. Результат — черновик: данные листа, предметы и
// карточка для предпросмотра; создаётся актёр только по кнопке, ровно таким, каким его показали.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { LibraryItems } from "./library.mjs";
import { REVENANT_FAMILIES } from "../data/revenants.mjs";
import { W as WW, ownGift, createSpirit } from "./werewolf.mjs";
import { H as HH, hasOwnPath } from "./hunter.mjs";
import { M as MM } from "./mage.mjs";
import { roleOf, powerOf, ROLES, lab, subsForEra } from "./npc-roles.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);
const pick = a => a[Math.floor(Math.random() * a.length)];
const ICON = n => `systems/${SYSTEM_ID}/assets/icons/${n}.svg`;
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Случайный выбор с весами: [[значение, вес]]. */
function wpick(list) {
  const tot = list.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (!tot) return list.length ? pick(list)[0] : undefined;
  let r = Math.random() * tot;
  for (const [x, w] of list) if ((r -= Math.max(0, w)) <= 0) return x;
  return list.at(-1)[0];
}

/** Разложить n точек по ключам с весами (weight(ключ, текущее)), не выше cap; out — куда (с текущими значениями). */
function spread(keys, n, cap, weight, out) {
  let left = n, guard = 4000;
  while (left > 0 && guard--) {
    const open = keys.filter(k => (out[k] ?? 0) < cap);
    if (!open.length) break;
    const k = wpick(open.map(k => [k, weight(k, out[k] ?? 0)]));
    out[k] = (out[k] ?? 0) + 1; left--;
  }
  return out;
}

/** Выбрать до n разных элементов с весами. */
function pickN(list, n, weight = () => 1) {
  const pool = [...list], out = [];
  while (out.length < n && pool.length) { const x = wpick(pool.map(x => [x, weight(x)])); out.push(x); pool.splice(pool.indexOf(x), 1); }
  return out;
}

/** Вес по словам роли (Дары, силы, духи — по названию и тексту). */
const wordW = (role, ...texts) => role?.words && role.words.test(texts.filter(Boolean).join(" ")) ? 4 : 1;

/* ── Подвиды ────────────────────────────────────────────────────────────── */

export const KIND_GROUPS = [
  { key: "kindred", label: "Сородичи и их кровь", icon: "fa-droplet" },
  { key: "mortal", label: "Люди", icon: "fa-user" },
  { key: "garou", label: "Мир Гару", icon: "fa-paw" },
  { key: "fallen", label: "Падшие", icon: "fa-fire-flame-curved" },
  { key: "awakened", label: "Пробуждённые", icon: "fa-hat-wizard" },
  { key: "groups", label: "Группы", icon: "fa-people-group" },
  { key: "book", label: "Из книги", icon: "fa-book" }
];
export const KINDS = [
  { key: "vampire", group: "kindred", label: "Сородич", icon: "fa-droplet", actor: "vampire" },
  { key: "ghoul", group: "kindred", label: "Гуль", icon: "fa-hand-holding-droplet", actor: "ghoul" },
  { key: "revenant", group: "kindred", label: "Ревенант", icon: "fa-people-roof", actor: "ghoul" },
  { key: "dhampir", group: "kindred", label: "Дампир", icon: "fa-user-injured", actor: "ghoul" },
  { key: "mortal", group: "mortal", label: "Смертный", icon: "fa-user", actor: "mortal" },
  { key: "faithful", group: "mortal", label: "Праведник", icon: "fa-hands-praying", actor: "mortal" },
  { key: "hunter", group: "mortal", label: "Охотник", icon: "fa-crosshairs", actor: "hunter" },
  { key: "garou", group: "garou", label: "Гару", icon: "fa-paw", actor: "werewolf" },
  { key: "fera", group: "garou", label: "Фера", icon: "fa-cat", actor: "werewolf" },
  { key: "kinfolk", group: "garou", label: "Родня Гару", icon: "fa-people-group", actor: "mortal" },
  { key: "kami", group: "garou", label: "Ками", icon: "fa-leaf", actor: "mortal" },
  { key: "fomor", group: "garou", label: "Фомор", icon: "fa-biohazard", actor: "mortal" },
  { key: "spirit", group: "garou", label: "Дух", icon: "fa-wind", actor: "creature" },
  { key: "demon", group: "fallen", label: "Падший", icon: "fa-fire-flame-curved", actor: "demon" },
  { key: "earthbound", group: "fallen", label: "Привязанный к Земле", icon: "fa-gem", actor: "demon" },
  { key: "thrall", group: "fallen", label: "Слуга падшего", icon: "fa-link", actor: "mortal" },
  { key: "mage", group: "awakened", label: "Маг", icon: "fa-hat-wizard", actor: "mage" },
  { key: "technocrat", group: "awakened", label: "Технократ", icon: "fa-atom", actor: "mage" },
  { key: "nephandus", group: "awakened", label: "Нефанд", icon: "fa-skull", actor: "mage" },
  { key: "sorcerer", group: "awakened", label: "Колдун", icon: "fa-book-skull", actor: "mortal" },
  { key: "consor", group: "awakened", label: "Консор", icon: "fa-user-group", actor: "mortal" },
  { key: "group", group: "groups", label: "Группа целиком", icon: "fa-people-group", actor: null },
  { key: "book", group: "book", label: "Статблоки книги", icon: "fa-book", actor: null }
];

/**
 * Готовые группы: кто входит (подвид, роль, специализация, сдвиг силы от выбранной, выбор подвида) и какой котерией
 * их оформить. Сила группы — выбранная в окне; у лидера она выше на ступень, у рядовых — как есть или ниже.
 */
const M = (kind, role, sub = "", shift = 0, params = {}) => ({ kind, role, sub, shift, params });
export const GROUPS = [
  { key: "court", label: "Двор князя", coterie: "coterie", members: [M("vampire", "leader", "boss", 2, { sect: "camarilla" }), M("vampire", "schemer", "harpy", 1, { sect: "camarilla" }),
    M("vampire", "bodyguard", "elysium", 1, { sect: "camarilla" }), M("vampire", "detective", "", 0, { sect: "camarilla" }), M("ghoul", "servant", "butler", 0, { ghoulType: "vassal" }), M("ghoul", "bodyguard", "escort", 0, { ghoulType: "vassal" })] },
  { key: "anarchs", label: "Банда анархов", coterie: "coterie", members: [M("vampire", "leader", "gangleader", 1, { sect: "anarchs" }), M("vampire", "brute", "biker", 0, { sect: "anarchs" }),
    M("vampire", "streetrat", "punk", 0, { sect: "anarchs" }), M("vampire", "techie", "hacker", 0, { sect: "anarchs" })] },
  { key: "sabbat", label: "Стая Шабаша", coterie: "sabbat", members: [M("vampire", "leader", "preacher", 1, { sect: "sabbat" }), M("vampire", "brute", "pitfighter", 0, { sect: "sabbat" }),
    M("vampire", "assassin", "blade", 0, { sect: "sabbat" }), M("vampire", "occultist", "warlock", 0, { sect: "sabbat" }), M("vampire", "madman", "maniac", 0, { sect: "sabbat" })] },
  { key: "garou", label: "Стая Гару", coterie: "pack", members: [M("garou", "brute", "", 1, { auspice: "ahroun" }), M("garou", "artist", "", 0, { auspice: "galliard" }),
    M("garou", "lawyer", "", 0, { auspice: "philodox" }), M("garou", "seer", "shaman", 0, { auspice: "theurge" }), M("garou", "thief", "", 0, { auspice: "ragabash" })] },
  { key: "cell", label: "Ячейка охотников", coterie: "cell", members: [M("hunter", "soldier", "veteran", 1), M("hunter", "detective", "cop", 0), M("hunter", "cleric", "priest", 0), M("hunter", "techie", "hacker", 0)] },
  { key: "cult", label: "Культ падшего", coterie: "coterie", members: [M("demon", "leader", "preacher", 1), M("thrall", "cleric", "cultist", 0), M("thrall", "broker", "banker", 0),
    M("thrall", "bodyguard", "escort", 0), M("thrall", "servant", "secretary", -1)] },
  { key: "ghouls", label: "Гули одного дома", coterie: "coterie", members: [M("ghoul", "servant", "butler", 0, { ghoulType: "vassal" }), M("ghoul", "bodyguard", "", 0, { ghoulType: "vassal" }),
    M("ghoul", "broker", "", 0, { ghoulType: "vassal" }), M("ghoul", "doctor", "", -1, { ghoulType: "vassal" })] },
  { key: "pentex", label: "Фоморы Пентекса", coterie: "coterie", members: [M("fomor", "broker", "banker", 1), M("fomor", "brute", "thug", 0), M("fomor", "assassin", "hitman", 0), M("fomor", "techie", "engineer", 0)] },
  { key: "kin", label: "Семья Родни", coterie: "coterie", members: [M("garou", "leader", "", 1), M("kinfolk", "worker", "farmer", 0), M("kinfolk", "doctor", "", 0), M("kinfolk", "drifter", "", -1)] },
  { key: "police", label: "Полицейский наряд", coterie: "", members: [M("mortal", "detective", "cop", 1), M("mortal", "soldier", "guard", 0), M("mortal", "soldier", "guard", 0), M("mortal", "detective", "forensic", -1)] }
];
export const groupOf = key => GROUPS.find(g => g.key === key) ?? GROUPS[0];

/** Черновики группы: по одному на участника; сила — выбранная со сдвигом участника. */
export function buildGroup(key, power = "normal") {
  const g = groupOf(key), keys = ["mook", "normal", "seasoned", "veteran", "legend"], base = Math.max(0, keys.indexOf(power));
  return g.members.map(m => buildNpc({ kind: m.kind, role: m.role, sub: m.sub || undefined, power: keys[Math.clamp(base + m.shift, 0, 4)], params: m.params }));
}
export const kindOf = key => KINDS.find(k => k.key === key) ?? KINDS[0];

/** Роль по умолчанию у подвида — чтобы «любая роль» была правдоподобной. */
const KIND_ROLES = {
  hunter: ["soldier", "detective", "cleric", "brute", "tracker", "doctor", "scholar", "bodyguard"],
  faithful: ["cleric", "doctor", "worker", "servant", "artist"],
  thrall: ["servant", "schemer", "bodyguard", "broker", "brute", "socialite"],
  spirit: [], kami: ["seer", "beastmaster", "worker", "drifter", "doctor"], fomor: ["brute", "assassin", "streetrat", "broker", "techie", "socialite"]
};

/* ── Общая часть: характеристики, способности, Добродетели, факты биографии ── */

function core(ctx, rules) {
  const { role, sub, power } = ctx, era = game.settings.get(SYSTEM_ID, "era");
  const ugly = !!rules.ugly, attrCap = rules.attrCap ?? 5;
  // характеристики: порядок групп — по роли (иногда вторая и третья меняются), любимые — чаще
  const attrs = Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, 1]));
  const order = role ? [...role.attr] : shuffle(Object.keys(VTM20.attributeGroups));
  if (role && Math.random() < .25) [order[1], order[2]] = [order[2], order[1]];
  const aw = k => 1 + (role?.fav[k] ?? 0) * 1.6;
  const ab = power.attr ?? rules.attr;
  order.forEach((g, i) => spread(VTM20.attributeGroups[g].attributes.filter(k => !(ugly && k === "appearance")), ab[i], 5,
    (k, v) => aw(k) * (v >= 3 ? .6 : 1), attrs));
  if (power.add.attr > 0) spread(Object.keys(attrs).filter(k => !(ugly && k === "appearance")), power.add.attr, attrCap, k => aw(k) * 2, attrs);
  if (ugly) attrs.appearance = 0;
  // способности: группа с большим весом роли — первая; любимые копятся (пики, а не ровный слой)
  const type = rules.abilType ?? "";
  const groups = VTM20.abilitiesForEra(era, type);
  const abilW = k => (role?.abil[k] ?? 0) + (sub?.abil[k] ?? 0) * 1.5;
  const gOrder = Object.keys(groups).sort((a, b) => groups[b].reduce((s, k) => s + abilW(k), 0) * (.75 + Math.random() * .5)
    - groups[a].reduce((s, k) => s + abilW(k), 0) * (.75 + Math.random() * .5));
  const abils = {};
  for (const g of Object.keys(groups)) for (const k of groups[g]) abils[k] = 0;
  const bb = power.abil ?? rules.abil;
  gOrder.forEach((g, i) => spread(groups[g], bb[i], 3, (k, v) => (abilW(k) * 2 + .3) * (v ? 1.4 : 1), abils));
  if (power.add.abil > 0) spread(Object.keys(abils), power.add.abil, power.abilCap, (k, v) => (abilW(k) * 2 + .15) * (v ? 1.6 : .5), abils);
  // Добродетели: по точке и ещё rules.virt
  const virt = { conscience: 1, selfControl: 1, courage: 1 };
  if (rules.virt != null) spread(Object.keys(virt), Math.max(0, rules.virt + power.add.virt), 5, k => 1 + (role?.virt[k] ?? 0), virt);
  // факты биографии своей линии: 1–3 разных (у бывалых — больше), любимые роли — чаще
  const seen = new Set();
  const pool = Codex.backgrounds.filter(b => !b.sabbat && (!b.sect || b.sect === rules.sect) && b.en !== "Generation" && Codex.visible(b) && VTM20.backgroundAllowed(b, rules.bgType ?? "mortal")
    && (!b.dhampir || rules.dhampir) && !seen.has(b.name) && seen.add(b.name));
  const total = Math.max(0, (rules.bg ?? 5) + power.add.bg);
  const chosen = pickN(pool, Math.min(total, (total >= 4 ? 2 : 1) + Math.floor(Math.random() * 2) + (power.tier >= 3 ? 1 : 0)), b => 1 + (role?.bg[b.en] ?? 0) * 3);
  const bgs = Object.fromEntries(chosen.map(b => [b.name, 1]));
  spread(chosen.map(b => b.name), total - chosen.length, 5, k => 1 + (role?.bg[chosen.find(b => b.name === k)?.en] ?? 0), bgs);
  return { attrs, abils, virt, bgs, chosen };
}

/** Данные листа из общей части. */
function baseSystem(ctx, c, { concept, morality = true } = {}) {
  const archetypes = Codex.archetypes?.length ? Codex.archetypes : [{ name: "" }];
  const sys = {
    attributes: Object.fromEntries(Object.entries(c.attrs).map(([k, v]) => [k, { value: v }])),
    abilities: Object.fromEntries(Object.entries(c.abils).map(([k, v]) => [k, { value: v }])),
    virtues: Object.fromEntries(Object.entries(c.virt).map(([k, v]) => [k, { value: v }])),
    willpower: { permanent: Math.clamp(c.virt.courage + ctx.power.add.will, 1, 10), temporary: Math.clamp(c.virt.courage + ctx.power.add.will, 1, 10) },
    details: { concept: concept ?? ctx.concept, nature: pick(archetypes).name, demeanor: pick(archetypes).name },
    notes: ""
  };
  if (morality) sys.morality = { path: "humanity", value: Math.clamp(c.virt.conscience + c.virt.selfControl, 1, 10) };
  return sys;
}

const bgItems = c => Object.entries(c.bgs).filter(([, v]) => v > 0).map(([n, v]) => LibraryItems.background(c.chosen.find(b => b.name === n) ?? { name: n }, v));
const bgView = c => Object.entries(c.bgs).filter(([, v]) => v > 0).map(([n, v]) => ({ label: VTM20.label(c.chosen.find(b => b.name === n) ?? { name: n }), v }));

/** Дисциплины: dots точек по списку (веса роли), до cap; сверх — бонус до cap2. */
function discs(list, role, dots, cap, bonus = 0, cap2 = cap, start = {}) {
  const out = { ...start };
  const w = (k, v) => (1 + (role?.disc[k] ?? 0) * 2) * (v ? 1.5 : 1);
  spread(list, dots, cap, w, out);
  if (bonus > 0) spread(list, bonus, cap2, w, out);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
}
const discItems = d => Object.entries(d).flatMap(([k, v]) => {
  const items = [LibraryItems.discipline(k, v)];
  const firstPath = { thaumaturgy: "Путь Крови", necromancy: "Путь Склепа" }[k];
  if (firstPath) items.push({ name: firstPath, type: "thaumPath", img: Codex.disciplineIcon(k), system: { discipline: k, value: Math.min(5, v), primary: true, description: Codex.bloodPath(k, firstPath)?.html ?? "" } });
  return items;
});
const discView = d => Object.entries(d).map(([k, v]) => ({ label: Codex.disciplineLabel(k), v }));

/** Клан: главные кланы чаще, линии крови и антитрибу — реже. */
function randomClan(role) {
  const groups = Codex.clanGroups();
  const list = groups.flatMap(g => g.clans.filter(c => Codex.visible(c)).map(c => [c.key, (g.key === "clan" ? 6 : g.key === "bloodline" ? 1.2 : .7)
    * (1 + (c.disciplines ?? []).reduce((s, d) => s + (role?.disc[d] ?? 0), 0) * .25)]));
  return wpick(list);
}
function clanDisciplines(clanKey) {
  const c = Codex.clan(clanKey);
  const list = [...(c?.disciplines ?? [])];
  if (c?.choice?.length) list.push(pick(c.choice));
  return list.length ? list : ["animalism", "auspex", "celerity", "dominate", "fortitude", "obfuscate", "potence", "presence"];
}
const SECT_OF = { sabbat: /antitribu|lasombra|tzimisce|pander|^serpentsOfTheLight/i, independent: /giovanni|setite|followersOfSet|assamite|ravnos|cappadoc/i };

/* ── Сборщики подвидов ─────────────────────────────────────────────────── */

const BUILD = {
  vampire(ctx, p) {
    const clan = p.clan || randomClan(ctx.role), ugly = VTM20.uglyClans.includes(clan);
    const gen = Number(p.generation) || Math.clamp(ctx.power.gen + (Math.random() < .5 ? 1 : 0), 4, 13);
    const trait = VTM20.generationOf(gen).trait;
    // секта — до фактов биографии: сектантские факты (Статус анархов…) — только своей секты
    const sect = p.sect || (SECT_OF.sabbat.test(clan) ? "sabbat" : SECT_OF.independent.test(clan) ? wpick([["independent", 4], ["camarilla", 1], ["anarchs", 1]])
      : wpick([["camarilla", 5], ["anarchs", 2], ["sabbat", 1], ["independent", .5]]));
    const c = core(ctx, { attr: [7, 5, 3], abil: [13, 9, 5], virt: 7, bg: 5, ugly, attrCap: trait, bgType: "vampire", sect });
    const list = clanDisciplines(clan);
    // у бывалых — и Дисциплина вне клана, из любимых роли
    if (ctx.power.tier >= 3) { const extra = Object.keys(ctx.role?.disc ?? {}).filter(k => !list.includes(k) && Codex.discipline(k)); if (extra.length) list.push(pick(extra)); }
    const d = discs(list, ctx.role, 3, 3, Math.max(0, ctx.power.add.power), Math.min(5, trait));
    const pool = VTM20.generationOf(gen).pool, clanName = Codex.clanName(clan);
    const sys = { ...baseSystem(ctx, c, { concept: `${ctx.concept} · ${clanName}` }), clan, generation: gen, blood: { value: Math.max(1, Math.ceil(pool * (.4 + Math.random() * .6))) } };
    sys.details.sect = loc(`VTM20.Sect.${sect}`);
    const items = [...discItems(d), ...bgItems(c)];
    const genDots = Math.min(5, Math.max(0, 13 - gen)), genBg = Codex.backgrounds.find(b => b.en === "Generation");
    if (genDots && genBg) items.push(LibraryItems.background(genBg, genDots));
    if (/^malkavian/.test(clan)) {   // клановый изъян — неизлечимое расстройство: настоящее из справочника, при пустом справочнике — заглушка
      const dr = (Codex.derangements ?? []).length ? pick(Codex.derangements) : null;
      items.push(dr ? { ...LibraryItems.derangement(dr), system: { ...LibraryItems.derangement(dr).system, permanent: true } }
        : { name: t("Creator.MalkDerangement"), type: "derangement", img: ICON("derangement"), system: { permanent: true, description: `<p>${t("Creator.MalkDerangementHint")}</p>` } });
    }
    return { actor: "vampire", img: "vampire", system: sys, items, c, powers: discView(d), powersLabel: t("NpcGen.Disciplines"),
      traits: [[t("NpcGen.Generation"), t("GenerationN", { n: gen })], [t("Humanity"), sys.morality.value], [t("Willpower"), sys.willpower.permanent], [t("NpcGen.BloodPool"), `${sys.blood.value}/${pool}`]],
      tags: [clanName, loc(`VTM20.Sect.${sect}`)] };
  },

  ghoul(ctx, p) {
    const type = p.ghoulType || wpick([["vassal", 3], ["independent", 1]]);
    const clan = p.clan || randomClan(ctx.role);
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: 7, bg: 5, bgType: "ghoul" });
    const domGen = ctx.power.tier >= 4 ? 6 : ctx.power.tier >= 3 ? 7 : 10, cap = domGen >= 8 ? 1 : domGen === 7 ? 2 : 3;
    const list = type === "vassal" ? ["potence", ...clanDisciplines(clan)] : ["potence", "fortitude", "celerity", "auspex", "presence", "obfuscate", "dominate", "animalism"];
    const d = discs(list, ctx.role, 1, cap, Math.max(0, ctx.power.add.power), cap, { potence: 1 });
    const sys = { ...baseSystem(ctx, c), ghoulType: type, domitorClan: type === "vassal" ? Codex.clanName(clan) : "", domitorGeneration: domGen, blood: { value: 1 + Math.floor(Math.random() * 2), max: 2 } };
    return { actor: "ghoul", img: "ghoul", system: sys, items: [...discItems(d), ...bgItems(c)], c, powers: discView(d), powersLabel: t("NpcGen.Disciplines"),
      traits: [[t("Humanity"), sys.morality.value], [t("Willpower"), sys.willpower.permanent], [t("NpcGen.BloodPool"), `${sys.blood.value}/2`]],
      tags: [loc(`VTM20.GhoulType.${type}`), type === "vassal" ? Codex.clanName(clan) : ""].filter(Boolean) };
  },

  revenant(ctx, p) {
    const fam = p.family || pick(Object.keys(REVENANT_FAMILIES)), F = REVENANT_FAMILIES[fam];
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: 5, bg: 5, bgType: "ghoul" });
    const domGen = ctx.power.tier >= 4 ? 6 : ctx.power.tier >= 2 ? 7 : 13, cap = domGen >= 8 ? 1 : domGen === 7 ? 2 : 3;
    const d = discs(F.disciplines, ctx.role, F.disciplines.length, cap, Math.max(0, ctx.power.add.power), cap);
    const sys = { ...baseSystem(ctx, c, { concept: `${ctx.concept} · ${F.name}` }), ghoulType: "revenant", family: fam, domitorGeneration: domGen, blood: { value: 2, max: 2 } };
    sys.notes = `<p><strong>${F.name}</strong> (${F.en}): ${F.flaw}</p>`;
    return { actor: "ghoul", img: "ghoul", system: sys, items: [...discItems(d), ...bgItems(c)], c, powers: discView(d), powersLabel: t("NpcGen.Disciplines"),
      traits: [[t("Humanity"), sys.morality.value], [t("Willpower"), sys.willpower.permanent]], tags: [F.name, F.nick] };
  },

  dhampir(ctx, p) {
    const Dh = Codex.dhampir ?? { clans: {}, concepts: [], bloodrights: [] };
    const clan = p.clan && Dh.clans[p.clan] ? p.clan : pick(Object.keys(Dh.clans)), cc = Dh.clans[clan] ?? {};
    const concept = (Dh.concepts ?? []).find(x => x.key === p.concept) ?? pick(Dh.concepts ?? [{ key: "", name: "" }]);
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: 7, bg: 5, bgType: "ghoul", dhampir: true });
    const rights = (cc.rights ?? []).map(k => Dh.bloodrights.find(r => r.key === k)).filter(Boolean);
    const br = {};
    spread(pickN(rights.length ? rights : Dh.bloodrights.filter(r => !r.rare), 1 + (ctx.power.tier >= 3 ? 1 : 0)).map(r => r.key),
      1 + Math.floor(ctx.power.tier / 2) + (ctx.power.tier >= 3 ? 1 : 0), 5, () => 1, br);
    const d = discs(["potence", ...(Codex.clan(clan)?.disciplines ?? [])], ctx.role, 0, 1, Math.max(0, ctx.power.add.power - 1), ctx.power.tier >= 3 ? 2 : 1, { potence: 1 });
    const sys = { ...baseSystem(ctx, c, { concept: `${concept.name || ctx.concept}` }), ghoulType: "dhampir", domitor: "", blood: { value: 10, max: 10 },
      dhampir: { concept: concept.key, antecedent: "", antecedentClan: clan, bloodrights: br, rituals: [] } };
    return { actor: "ghoul", img: "ghoul", system: sys, items: [...discItems(d), ...bgItems(c)], c,
      powers: [...Object.entries(br).map(([k, v]) => ({ label: Dh.bloodrights.find(r => r.key === k)?.name ?? k, v })), ...discView(d)], powersLabel: t("NpcGen.Bloodrights"),
      traits: [[t("Humanity"), sys.morality.value], [t("Willpower"), sys.willpower.permanent]], tags: [Codex.clanName(clan), cc.nick ?? "", concept.name].filter(Boolean) };
  },

  mortal(ctx) {
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: 7, bg: 5, bgType: "mortal" });
    const sys = baseSystem(ctx, c);
    return { actor: "mortal", img: "mortal", system: sys, items: bgItems(c), c, powers: [], traits: [[t("Humanity"), sys.morality.value], [t("Willpower"), sys.willpower.permanent]], tags: [] };
  },

  faithful(ctx) {
    const d = BUILD.mortal(ctx);
    d.system.trueFaith = Math.clamp(1 + Math.floor(ctx.power.tier * .8) + (ctx.role?.key === "cleric" ? 1 : 0), 1, 5);
    d.traits.unshift([t("NpcGen.TrueFaith"), d.system.trueFaith]);
    return d;
  },

  kinfolk(ctx, p) {
    const D = WW(), d = BUILD.mortal(ctx);
    const tribe = p.tribe || pick(D.tribes).key, breed = "homid";
    const own = [...(D.kinGifts ?? []).filter(g => g.tribe === tribe), ...D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.key === tribe || x.key === breed))];
    const gifts = pickN(own, ctx.power.tier >= 3 ? 2 : ctx.power.tier >= 1 ? 1 : 0, g => wordW(ctx.role, g.name, g.text));
    const mystic = ["mystic"].includes(ctx.role?.group);
    const numina = mystic && D.numina?.length ? [{ key: pick(D.numina).key, dots: Math.clamp(1 + Math.floor(ctx.power.tier / 2), 1, 5) }] : [];
    d.system.kinfolk = { on: true, tribe, breed, gnosis: Math.min(3, (ctx.power.tier >= 2 ? 1 : 0) + (mystic ? 1 : 0)), gifts: gifts.map(g => g.key), numina, fetch: "" };
    d.powers = [...gifts.map(g => ({ label: g.name, v: g.level })), ...numina.map(n => ({ label: D.numina.find(x => x.key === n.key)?.name ?? n.key, v: n.dots }))];
    d.powersLabel = t("NpcGen.KinPowers");
    const tr = D.tribes.find(x => x.key === tribe);
    d.tags = [tr?.name ?? tribe];
    d.system.details.concept = `${ctx.concept} · ${t("NpcGen.KinOf", { tribe: tr?.name ?? tribe })}`;
    return d;
  },

  kami(ctx, p) {
    const D = WW(), d = BUILD.mortal(ctx);
    const kind = p.kami || wpick([["human", 4], ["animal", 1], ["plant", 1]]), start = D.kami?.start?.[kind] ?? { willpower: 3, gnosis: 1, rage: 0 };
    const list = (D.kami?.powers ?? []).filter(x => x.kind === "kami" || (kind === "plant" && x.kind === "immobile"));
    const powers = pickN(list, 2 + ctx.power.tier, x => wordW(ctx.role, x.name, x.text)).map(x => ({ key: x.key, n: 1 }));
    d.system.kami = { on: true, kind, geas: "", gnosis: Math.min(10, start.gnosis + ctx.power.tier), rage: start.rage, powers };
    d.system.willpower = { permanent: Math.max(start.willpower, d.system.willpower.permanent), temporary: Math.max(start.willpower, d.system.willpower.permanent) };
    d.powers = powers.map(x => ({ label: list.find(y => y.key === x.key)?.name ?? x.key }));
    d.powersLabel = t("NpcGen.KamiPowers");
    d.traits.push([t("NpcGen.Gnosis"), d.system.kami.gnosis]);
    d.tags = [loc(`VTM20.Werewolf.Kami.form.${kind}`)];
    return d;
  },

  fomor(ctx, p) {
    const D = WW(), d = BUILD.mortal(ctx), F = D.fomori ?? { breeds: [], powers: [] };
    const breed = F.breeds.find(b => b.key === p.fomor) ?? pick(F.breeds);
    const own = (breed?.powers ?? []).filter(k => !k.startsWith("~") && F.powers.some(x => x.key === k));
    const more = pickN(F.powers.filter(x => !own.includes(x.key)), 1 + ctx.power.tier, x => wordW(ctx.role, x.name, x.text)).map(x => x.key);
    const keys = [...own, ...more];
    const rage = keys.some(k => /berserk/.test(k)) ? 2 + ctx.power.tier : 0;
    d.system.fomor = { on: true, breed: breed?.key ?? "", rage, powers: keys.map(k => ({ key: k, n: 1 })) };
    if (breed?.willpower) d.system.willpower = { permanent: breed.willpower, temporary: breed.willpower };
    d.system.morality = { path: "humanity", value: Math.max(1, d.system.morality.value - 3 - ctx.power.tier) };
    d.powers = keys.map(k => ({ label: F.powers.find(x => x.key === k)?.name ?? k }));
    d.powersLabel = t("NpcGen.FomorPowers");
    d.traits = [[t("Humanity"), d.system.morality.value], [t("Willpower"), d.system.willpower.permanent], ...(rage ? [[t("NpcGen.Rage"), rage]] : [])];
    d.tags = [breed?.name ?? ""];
    return d;
  },

  thrall(ctx) {
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: 3, bg: 5, bgType: "demon" });
    const sys = baseSystem(ctx, c, { morality: false });
    sys.thrall = { master: "", faith: Math.clamp(1 + Math.floor(ctx.power.tier / 2), 1, 5), gifts: [] };
    return { actor: "mortal", img: "mortal", system: sys, items: bgItems(c), c, powers: [], traits: [[t("NpcGen.ThrallFaith"), sys.thrall.faith], [t("Willpower"), sys.willpower.permanent]], tags: [] };
  },

  hunter(ctx, p) {
    const H = HH(), creeds = H.creeds.filter(x => x.key !== "bystander");
    const creed = creeds.find(x => x.key === p.creed) ?? wpick(creeds.map(x => [x, x.virtue === ctx.role?.hunt ? 4 : 1]));
    const c = core(ctx, { attr: [6, 4, 3], abil: [11, 7, 4], virt: null, bg: 5, bgType: "hunter" });
    const hv = { mercy: 0, vision: 0, zeal: 0 };
    hv[creed.virtue] += 2;
    hv[pick(Object.keys(hv).filter(k => k !== creed.virtue))] += 1;
    spread(Object.keys(hv), Math.max(0, ctx.power.add.virt + ctx.power.tier), 10, k => k === creed.virtue ? 4 : 1, hv);
    const pathOf = virtue => hasOwnPath(creed.key) && creed.virtue === virtue ? creed.key : pick([...new Set(H.edges.filter(e => e.virtue === virtue).map(e => e.path))]);
    const edges = [];
    const take = (path, upTo) => { for (let l = 1; l <= upTo; l++) { const e = H.edges.find(x => x.path === path && x.level === l); if (e) edges.push(e); } };
    take(pathOf(creed.virtue), Math.min(hv[creed.virtue], 1 + ctx.power.tier));
    if (ctx.power.tier >= 3) { const v2 = Object.keys(hv).filter(k => k !== creed.virtue).sort((a, b) => hv[b] - hv[a])[0]; take(pathOf(v2), Math.min(hv[v2], ctx.power.tier - 1)); }
    const sys = baseSystem(ctx, c, { morality: false });
    delete sys.virtues;
    sys.willpower = { permanent: Math.clamp(3 + ctx.power.add.will, 1, 10), temporary: Math.clamp(3 + ctx.power.add.will, 1, 10) };
    sys.hunter = { creed: creed.key, ...hv, conviction: Math.min(10, (creed.conviction ?? 3) + Math.floor(ctx.power.tier / 2)), edges: edges.map(e => e.key), start: 0 };
    return { actor: "hunter", img: "hunter", system: sys, items: bgItems(c), c, powers: edges.map(e => ({ label: e.name, v: e.level })), powersLabel: t("NpcGen.Edges"),
      traits: [[t("NpcGen.Conviction"), sys.hunter.conviction], [t("Willpower"), sys.willpower.permanent],
        ...Object.entries(hv).filter(([, v]) => v).map(([k, v]) => [t(`NpcGen.HV.${k}`), v])], tags: [creed.name] };
  },

  demon(ctx, p, eb = false) {
    const houses = Codex.houses, house = houses.find(h => h.key === p.house) ?? pick(houses);
    const faction = Codex.factions.find(f => f.key === p.faction) ?? pick(Codex.factions);
    const R = eb ? { attr: [8, 6, 4], abil: [17, 12, 7], virt: 3, bg: 10, lores: 10, faith: 4 } : { attr: [7, 5, 3], abil: [13, 9, 5], virt: 3, bg: 5, lores: 3, faith: 3 };
    const c = core(ctx, { attr: R.attr, abil: R.abil, virt: R.virt, bg: R.bg, bgType: "demon", abilType: "demon" });
    const common = Codex.demon?.common ?? [];
    const loreKeys = eb ? Codex.lores.map(l => l.key) : [...(house.lores ?? []), ...common];
    const lw = k => (house.lores ?? []).includes(k) ? 3 : common.includes(k) ? 1.5 : (Codex.earthbound?.lores ?? []).some(l => l.key === k) ? 2.5 : .6;
    const lores = {};
    spread(loreKeys, R.lores, eb ? 4 : 3, (k, v) => lw(k) * (v ? 1.4 : 1), lores);
    if (ctx.power.add.power > 0) spread(loreKeys, ctx.power.add.power, 5, (k, v) => lw(k) * (v ? 1.6 : 1), lores);
    const sys = baseSystem(ctx, c, { concept: `${ctx.concept} · ${house.name}`, morality: false });
    const top2 = Object.values(c.virt).sort((a, b) => b - a).slice(0, 2).reduce((s, v) => s + v, 0) + ctx.power.add.will;
    sys.willpower = { permanent: Math.clamp(top2, 1, 10), temporary: Math.clamp(top2, 1, 10) };
    const faith = Math.min(10, R.faith + Math.max(0, ctx.power.tier - 1));
    Object.assign(sys, { house: house.key, faction: faction?.key ?? "", visage: pick(Object.keys(house.visages ?? {})) ?? "",
      faith: { permanent: faith, temporary: faith }, torment: { permanent: Math.min(10, (house.torment ?? 3) + (ctx.role?.group === "shadow" ? 1 : 0)), temporary: 0 }, apocalyptic: false });
    if (eb) Object.assign(sys, { earthbound: true, torment: { permanent: 10, temporary: 0 }, reliquary: { kind: pick(["ideal", "improvised", "natural"]), faith: 0 },
      urges: { flesh: c.virt.conscience, thought: c.virt.selfControl, emotion: c.virt.courage }, virtues: { conscience: { value: 0 }, selfControl: { value: 0 }, courage: { value: 0 } } });
    const items = [...Object.entries(lores).filter(([, v]) => v > 0).map(([k, v]) => { const l = Codex.lore(k);
      return { name: l?.name ?? k, type: "lore", img: ICON(l?.dark ? "darkLore" : "lore"), system: { key: k, value: v, description: l ? `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? t("Demon.Common")}</p>` : "" } }; }),
      ...bgItems(c)];
    return { actor: "demon", img: "demon", system: sys, items, c, powers: Object.entries(lores).filter(([, v]) => v > 0).map(([k, v]) => ({ label: Codex.lore(k)?.name ?? k, v })),
      powersLabel: t("Demon.Lores"), traits: [[t("NpcGen.Faith"), faith], [t("NpcGen.Torment"), sys.torment.permanent], [t("Willpower"), sys.willpower.permanent]],
      tags: [house.name, faction?.name ?? "", eb ? t("NpcGen.Earthbound") : ""].filter(Boolean) };
  },
  earthbound(ctx, p) { return BUILD.demon(ctx, p, true); },

  /**
   * Маг (M20, гл. 6): 7/5/3 и 13/9/5, Факты 7, Сферы 6, Воля 5, Арете 1 — и рост по силе: Арете 1, 2, 3, 5, 7; Сфер больше,
   * но ни одна не выше Арете; точка в родовой Сфере; Квинтэссенция — по Аватару; фокус — парадигма, практика, инструменты.
   * groups — из каких групп фракция (маг: Традиции и Ремёсла; технократ; Нефанд).
   */
  mage(ctx, p, groups = ["traditions", "disparates"]) {
    const D = MM(), tier = ctx.power.tier, all = (D.factions ?? []).filter(f => groups.includes(f.group));
    const f = all.find(x => x.key === p.faction) ?? wpick(all.map(x => [x, x.group === "traditions" ? 3 : 1]));
    const fallen = f.group === "nephandi";
    const c = core(ctx, { attr: [7, 5, 3], abil: [13, 9, 5], virt: null, bg: 7, bgType: "mage" });
    const will = Math.clamp((D.creation?.willpower ?? 5) + ctx.power.add.will, 1, 10);
    const arete = Math.min([1, 2, 3, 5, 7][Math.clamp(tier, 0, 4)], will);          // кубики магии — не выше Воли
    const keys = (D.spheres ?? []).map(x => x.key);
    const affinity = (f.affinity ?? []).includes(p.affinity) || (!f.affinity?.length && keys.includes(p.affinity)) ? p.affinity
      : f.affinity?.length ? f.affinity[0] : pick(keys);
    const spheres = Object.fromEntries(keys.map(k => [k, 0]));
    spheres[affinity] = 1;
    spread(keys, (D.creation?.spheres ?? 6) - 1 + tier * 3, Math.min(5, arete), (k, v) => (k === affinity ? 5 : (f.affinity ?? []).includes(k) ? 2.5 : v ? 2 : 1), spheres);
    // без Аватара (Гения) нет Квинтэссенции: если жребий его не дал — точки берутся у самого большого Факта
    const av = Codex.backgrounds.find(b => b.line === "mage" && /^(Avatar|Genius)/.test(b.en ?? ""));
    if (av && !c.bgs[av.name]) {
      const top = Object.entries(c.bgs).sort((x, y) => y[1] - x[1])[0], n = Math.clamp(tier, 1, Math.max(1, (top?.[1] ?? 1) - 1));
      if (top && top[1] > n) c.bgs[top[0]] -= n;
      c.bgs[av.name] = n; c.chosen.push(av);
    }
    const avatar = av ? c.bgs[av.name] ?? 0 : 0;
    const F = D.focus ?? {}, own = list => (list ?? []).filter(x => !!x.nephandi === fallen);
    const practice = pick(own(F.practices).length ? own(F.practices) : F.practices ?? [{ name: "" }]);
    const tools = pickN([...(fallen ? D.fallenTools ?? [] : []), ...(F.instruments ?? [])], Math.max(1, (D.creation?.instruments ?? 7) - Math.max(0, arete - 2)));
    const sys = baseSystem(ctx, c, { morality: false });
    delete sys.virtues;
    sys.willpower = { permanent: will, temporary: will };
    sys.mage = { faction: f.key, sub: f.subs?.length && Math.random() < .6 ? pick(f.subs).key : "", essence: pick(D.essences ?? [{ key: "" }]).key, affinity, arete, spheres,
      quintessence: avatar, paradox: 0, paradoxPerm: 0, paradigm: pick(own(F.paradigms).length ? own(F.paradigms) : F.paradigms ?? [{ name: "" }]).name,
      practice: practice.name, instruments: tools, resonance: "", rotes: [] };
    const tech = f.group === "technocracy", name = k => { const sp = D.spheres.find(x => x.key === k); return (tech && sp.tech?.name) || sp.name; };
    return { actor: "mage", img: "mage", system: sys, items: bgItems(c), c,
      powers: keys.filter(k => spheres[k] > 0).sort((a, b) => spheres[b] - spheres[a]).map(k => ({ label: name(k), v: spheres[k] })), powersLabel: game.i18n.localize("VTM20.Mage.Spheres"),
      traits: [[game.i18n.localize(`VTM20.Mage.${tech ? "Tech.Arete" : "Arete"}`), arete], [t("Willpower"), will], [game.i18n.localize(`VTM20.Mage.${tech ? "Tech.Quintessence" : "Quintessence"}`), avatar]],
      tags: [f.name, sys.mage.sub && f.subs.find(x => x.key === sys.mage.sub)?.name].filter(Boolean) };
  },
  /** Колдун (M20 Sorcerer): смертный с Волей 5 и нуминами — 5 точек Путей (у Пути её Способность, рейтинг не выше неё) и больше по силе. */
  sorcerer(ctx, p) {
    const d = BUILD.mortal(ctx), S = MM().sorcerer ?? { paths: [], affiliations: [] }, tier = ctx.power.tier;
    const aff = S.affiliations.find(x => x.key === p.affiliation) ?? pick(S.affiliations);
    const will = Math.clamp((S.creation?.willpower ?? 5) + ctx.power.add.will, 1, 10);
    d.system.willpower = { permanent: will, temporary: will };
    // Способность Пути — та, что у колдуна выше всех из подходящих знаний и умений
    const abil = Object.entries(d.system.abilities ?? {}).map(([k, v]) => [k, v.value ?? 0]).sort((x, y) => y[1] - x[1]);
    const best = abil[0]?.[0] ?? "occult"; if ((d.system.abilities[best]?.value ?? 0) < 2) d.system.abilities[best] = { ...(d.system.abilities[best] ?? {}), value: 2 };
    const cap = d.system.abilities[best].value, own = pickN(S.paths, 1 + (tier >= 2 ? 1 : 0) + (tier >= 4 ? 1 : 0));
    const dots = Object.fromEntries(own.map(x => [x.key, 1]));
    spread(own.map(x => x.key), Math.max(0, (S.creation?.numina ?? 5) + tier * 2 - own.length), Math.min(5, cap), () => 1, dots);
    const attr = Object.entries(d.system.attributes).filter(([k]) => ["intelligence", "wits", "charisma", "manipulation", "stamina", "perception"].includes(k)).sort((x, y) => y[1].value - x[1].value)[0][0];
    d.system.sorcerer = { on: true, affiliation: aff?.key ?? "", attr, numina: own.map(x => ({ key: x.key, dots: dots[x.key], ability: best })), rituals: [] };
    return { ...d, powers: own.map(x => ({ label: x.name, v: dots[x.key] })), powersLabel: game.i18n.localize("VTM20.Sorcerer.Paths"), tags: [...(d.tags ?? []), game.i18n.localize("VTM20.Sorcerer.title"), aff?.name].filter(Boolean) };
  },
  /** Консор (Gods & Monsters, гл. 3): спутник мага — смертный с Волей 3, ролью и стороной. */
  consor(ctx, p) {
    const d = BUILD.mortal(ctx), M = MM(), roles = M.sorcerer?.consor?.roles ?? [];
    const role = roles.find(x => x.key === p.role) ?? pick(roles), f = (M.factions ?? []).find(x => x.key === p.faction) ?? pick((M.factions ?? []).filter(x => x.group !== "nephandi"));
    d.system.consor = { on: true, kind: ctx.power.tier >= 2 ? "consor" : "acolyte", role: role?.key ?? "", faction: f?.key ?? "" };
    return { ...d, tags: [...(d.tags ?? []), game.i18n.localize("VTM20.Sorcerer.Consor"), role?.name, f?.name].filter(Boolean) };
  },
  technocrat(ctx, p) { return BUILD.mage(ctx, p, ["technocracy"]); },
  nephandus(ctx, p) { return BUILD.mage(ctx, p, ["nephandi"]); },

  garou(ctx, p) {
    const D = WW(), rank = ctx.power.rank;
    const breed = D.breeds.find(x => x.key === p.breed) ?? wpick(D.breeds.map(x => [x, x.key === "homid" ? 3 : x.key === "lupus" ? 2 : 1]));
    const AUS = { combat: "ahroun", society: "galliard", knowledge: "philodox", shadow: "ragabash", mystic: "theurge", common: "" };
    const auspice = D.auspices.find(x => x.key === p.auspice) ?? wpick(D.auspices.map(x => [x, x.key === AUS[ctx.role?.group] ? 4 : 1]));
    const tribe = D.tribes.find(x => x.key === p.tribe) ?? pick(D.tribes.filter(x => !/spiral/i.test(x.key)));
    return garouLike(ctx, { breed, auspice, tribe, rank, me: { breed: breed.key, auspice: auspice.key, tribe: tribe.key },
      start: [breed, auspice, tribe].map(x => pick(x.startGifts?.length ? x.startGifts : [""])).filter(Boolean),
      base: { rage: auspice.rage ?? 1, gnosis: breed.gnosis ?? 1, will: tribe.willpower ?? 3 }, renownBase: auspice.renown, renownNeed: D.rank?.[auspice.key]?.[rank - 1],
      werewolf: { breed: breed.key, auspice: auspice.key, tribe: tribe.key, fera: "" }, form: breed.key === "lupus" ? "lupus" : breed.key === "metis" ? "crinos" : "homid",
      metis: breed.key === "metis", tags: [breed.name, auspice.name, tribe.name] });
  },

  fera(ctx, p) {
    const D = WW(), rank = ctx.power.rank;
    const fera = (D.fera ?? []).find(b => b.key === p.fera) ?? pick(D.fera ?? []);
    const dims = (fera.dims ?? []).filter(d => d.options.length);
    const sub = Object.fromEntries(dims.map(d => [d.key, (p.sub?.[d.key] && d.options.some(o => o.key === p.sub[d.key])) ? p.sub[d.key] : pick(d.options).key]));
    const picked = dims.map(d => d.options.find(o => o.key === sub[d.key])).filter(Boolean);
    const stat = k => picked.find(o => o.stats?.[k] != null)?.stats[k] ?? fera.base?.[k];
    const lvl1 = s => D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.kind === "fera" && x.key === fera.key && (x.sub ?? "") === s)).map(g => g.key);
    const subLists = dims.filter(d => lvl1(`${d.key}:${sub[d.key]}`).length).map(d => lvl1(`${d.key}:${sub[d.key]}`));
    const start = [...Array.from({ length: Math.max(1, 3 - subLists.length) }, () => lvl1("")), ...subLists].map(l => pick(l.length ? l : [""])).filter(Boolean);
    return garouLike(ctx, { rank, me: { fera: fera.key, feraSub: sub }, start, base: { rage: stat("rage") ?? 1, gnosis: stat("gnosis") ?? 1, will: stat("will") ?? 3 },
      renownBase: null, renownNeed: [3, 7, 13, 19, 25][rank - 1],
      werewolf: { fera: fera.key, feraSub: { breed: "", aspect: "", tribe: "", faction: "", pryio: "", varna: "", ...sub } }, form: fera.forms[0]?.key ?? "homid",
      metis: sub.breed === "metis", tags: [fera.name, ...picked.map(o => o.name)] });
  },

  spirit(ctx, p) {
    const D = WW(), list = D.spirits ?? [];
    const sp = list.find(s => s.key === p.spirit) ?? wpick(list.map(s => [s, (p.spiritKind && s.kind !== p.spiritKind ? 0 : 1) * wordW(ctx.role, s.name, s.text)]));
    // особые Чары образца — «~ключ:Название»
    const charms = (sp.charms ?? []).map(k => k.startsWith("~") ? k.split(":").slice(1).join(":") : (D.charms ?? []).find(c => c.key === k)?.name ?? k);
    return { actor: "creature", spirit: sp.key, name: sp.name, system: { details: { concept: sp.name } }, items: [], c: null,
      powers: charms.map(n => ({ label: n })), powersLabel: t("NpcGen.Charms"), text: sp.text, source: sp.source,
      traits: [[t("NpcGen.Rage"), sp.rage], [t("NpcGen.Gnosis"), sp.gnosis], [t("Willpower"), sp.willpower], [t("NpcGen.Essence"), sp.essence]],
      tags: [loc(`VTM20.Werewolf.Spirit.kind.${sp.kind}`), sp.en ?? ""].filter(x => x && !x.startsWith("VTM20.")) };
  }
};

/** Гару и Фера: общая часть, Дары по Рангу (свои списки, уровень ≤ Ранга), Слава по требованию Ранга, ритуалы. */
function garouLike(ctx, o) {
  const D = WW(), { rank } = o;
  const c = core(ctx, { attr: [7, 5, 3], abil: [13, 9, 5], virt: null, bg: 5, bgType: "werewolf", abilType: "werewolf" });
  const gifts = [...new Set(o.start)];
  const own = D.gifts.filter(g => g.level <= rank && ownGift(o.me, g) && !gifts.includes(g.key));
  const more = Math.max(0, (rank - 1) * 2 + (ctx.power.tier >= 2 ? 1 : 0));
  gifts.push(...pickN(own, more, g => wordW(ctx.role, g.name, g.text) * (g.level === rank ? 1.3 : 1)).map(g => g.key));
  // Слава: база аугурии, не ниже требования Ранга; у Рагабаша и Фера — сумма, раскладка по роли
  const RN = ["glory", "honor", "wisdom"], ren = { glory: 0, honor: 0, wisdom: 0 };
  const lean = { combat: "glory", society: "honor", knowledge: "wisdom", mystic: "wisdom", shadow: "glory", common: "honor" }[ctx.role?.group] ?? pick(RN);
  if (Array.isArray(o.renownNeed)) RN.forEach((k, i) => { ren[k] = Math.max(o.renownBase?.[i] ?? 0, o.renownNeed[i] ?? 0); });
  else if (o.renownBase && rank === 1) RN.forEach((k, i) => { ren[k] = o.renownBase[i] ?? 0; });
  else spread(RN, Math.max(3, Number(o.renownNeed) || 3), 10, k => k === lean ? 3 : 1, ren);
  const up = Math.max(0, ctx.power.tier - 1);
  const rage = Math.min(10, o.base.rage + up), gnosis = Math.min(10, o.base.gnosis + up), will = Math.min(10, o.base.will + ctx.power.add.will);
  const rites = ctx.power.tier >= 2 ? pickN(D.rites.filter(r => r.level <= rank), (ctx.role?.group === "mystic" ? 2 : 1) + (ctx.power.tier >= 3 ? 1 : 0), r => wordW(ctx.role, r.name, r.text)).map(r => r.key) : [];
  const deform = o.metis && D.deformities?.length ? [pick(D.deformities).key] : [];
  const sys = baseSystem(ctx, c, { morality: false });
  delete sys.virtues;
  sys.willpower = { permanent: will, temporary: will };
  sys.werewolf = { ...o.werewolf, rank, form: o.form, gifts, rites, deformities: deform,
    renown: Object.fromEntries(RN.map(k => [k, { permanent: ren[k], temporary: 0 }])), rage: { permanent: rage, value: rage }, gnosis: { permanent: gnosis, value: gnosis } };
  if (o.breed) Object.assign(sys.werewolf, { breed: o.breed.key, auspice: o.auspice.key, tribe: o.tribe.key });
  const gname = k => D.gifts.find(g => g.key === k);
  // картинку не задаём: _preCreate ставит оборотню волка над лесом
  return { actor: "werewolf", img: null, system: sys, items: bgItems(c), c,
    powers: [...gifts.map(gname).filter(Boolean).sort((a, b) => a.level - b.level).map(g => ({ label: g.name, v: g.level })),
      ...rites.map(k => D.rites.find(r => r.key === k)).filter(Boolean).map(r => ({ label: r.name, hint: t("NpcGen.Rite") }))],
    powersLabel: t("NpcGen.Gifts"),
    traits: [[t("NpcGen.Rank"), rank], [t("NpcGen.Rage"), rage], [t("NpcGen.Gnosis"), gnosis], [t("Willpower"), will],
      [t("NpcGen.Renown"), RN.map(k => ren[k]).join(" / ")]], tags: o.tags };
}

/* ── Черновик и создание ───────────────────────────────────────────────── */

/**
 * Собрать черновик НПС.
 * @param {{kind: string, role?: string, sub?: string, power?: string, params?: object}} o
 */
export function buildNpc(o) {
  const kind = kindOf(o.kind), power = powerOf(o.power);
  let role = o.role ? roleOf(o.role) : null;
  if (!role && kind.key !== "spirit") {
    const pref = KIND_ROLES[kind.key];
    role = roleOf(pref?.length ? pick(pref) : pick(ROLES).key);
  }
  const subs = subsForEra(role, game.settings.get(SYSTEM_ID, "era"));
  const sub = role?.subs.find(s => s.key === o.sub) ?? (subs.length ? pick(subs) : null);
  const concept = sub ? lab(`Sub.${sub.key}`, sub.concept) : role ? lab(`Role.${role.key}`, role.label) : lab(`Kind.${kind.key}`, kind.label);
  const ctx = { kind: kind.key, role, sub, power, concept };
  const d = BUILD[kind.key](ctx, o.params ?? {});
  return { ...d, kind: kind.key, kindLabel: lab(`Kind.${kind.key}`, kind.label), kindIcon: kind.icon, role: role?.key ?? "",
    roleLabel: role ? lab(`Role.${role.key}`, role.label) : "", roleIcon: role?.icon ?? "", sub: sub?.key ?? "", subLabel: sub ? lab(`Sub.${sub.key}`, sub.label) : "",
    power: power.key, powerLabel: lab(`Power.${power.key}`, power.label), concept: d.system?.details?.concept ?? concept };
}

/** Карточка черновика для окна: характеристики по группам, способности по убыванию, силы, черты, факты. */
export function npcView(d) {
  const c = d.c;
  const attrs = c ? Object.entries(VTM20.attributeGroups).map(([g, x]) => ({ label: loc(x.label),
    rows: x.attributes.map(k => ({ label: loc(VTM20.attributes[k].label), v: c.attrs[k], dots: dots(c.attrs[k], 5) })) })) : [];
  const abils = c ? Object.entries(c.abils).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || loc(VTM20.abilities[a[0]].label).localeCompare(loc(VTM20.abilities[b[0]].label), "ru"))
    .map(([k, v]) => ({ label: loc(VTM20.abilities[k].label), v, dots: dots(v, 5) })) : [];
  return { attrs, abils, powers: (d.powers ?? []).map(p => ({ ...p, dots: p.v ? dots(p.v, Math.max(5, p.v)) : null })), powersLabel: d.powersLabel ?? "",
    traits: (d.traits ?? []).map(([label, value]) => ({ label, value })), bgs: c ? bgView(c).map(b => ({ ...b, dots: dots(b.v, 5) })) : [],
    nature: d.system?.details?.nature ?? "", demeanor: d.system?.details?.demeanor ?? "", tags: (d.tags ?? []).filter(Boolean), text: d.text ?? "", source: d.source ?? "" };
}
const dots = (v, max) => Array.from({ length: Math.max(max, v) }, (_, i) => i < v);

/** Создать актёра по черновику. */
export async function createNpc(d, { name, folder }) {
  if (d.spirit) {
    const a = await createSpirit(d.spirit, name);
    if (a && folder) await a.update({ folder });
    return a;
  }
  const notes = [`<p><em>${[d.kindLabel, d.roleLabel, d.subLabel, d.powerLabel].filter(Boolean).join(" · ")}</em></p>`, d.system.notes ?? ""].join("");
  const a = await Actor.create({ name, type: d.actor, folder, ...(d.img === null ? {} : { img: ICON(d.img ?? d.actor) }), system: { ...d.system, notes },
    flags: { [SYSTEM_ID]: { created: true, npc: { kind: d.kind, role: d.role, sub: d.sub, power: d.power } } } });
  if (d.items.length) await a.createEmbeddedDocuments("Item", d.items);
  return a;
}
