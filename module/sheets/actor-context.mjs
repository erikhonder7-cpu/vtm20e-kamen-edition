// module/sheets/actor-context.mjs
// Данные частей листа персонажа (шапка, черты, реестр, Дисциплины, Знания, преимущества, родословная, эффекты,
// снаряжение) и общие помощники листа. Вынесено из actor-sheet.mjs; sheet — окно листа (actor, isEditable, _open).

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { fitsLevel } from "../apps/power-choice.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS, GEAR_PRESETS } from "../data/equipment.mjs";
import { REVENANT_FAMILIES, revenantFamily } from "../data/revenants.mjs";
import { BOON_LEVELS, boonLevelLabel } from "../apps/boons.mjs";
import { clockBarData, longDate } from "../apps/calendar.mjs";
import { moneyView } from "../data/money.mjs";
import { POWER_EFFECTS, MODE_LABEL, fxKey } from "../data/effects.mjs";
import { effectTimer, readingRituals } from "../apps/timers.mjs";
import { dhampirView } from "../apps/dhampir.mjs";
import { torporView, deathOf } from "../apps/torpor.mjs";
import { ritualHTML } from "../data/ritual-text.mjs";
import { H as hunterData } from "../apps/hunter.mjs";
import { pactValue, investmentLimit } from "../apps/infernal.mjs";
import { possessionView } from "../apps/possession.mjs";
import { MERIT_MODS, describeMeritMod } from "../data/merit-mods.mjs";
import { lineUp, childrenOf, bloodCheck, actorByName } from "../data/lineage.mjs";
import { isSabbat, vinculumMeaning } from "../apps/vaulderie.mjs";
import { coteriesOf, poolValue } from "../apps/coterie.mjs";
import { bondFade } from "../apps/bonds.mjs";
import { formFeatures, mechLabel, needsPick, signed } from "../data/form.mjs";
import { ritualNeed, thrallState, thrallCap, reliquaryInfo } from "../apps/torment.mjs";

export const TextEditor = () => foundry.applications.ux.TextEditor.implementation;
export const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export const clockDate = ms => longDate(new Date(ms));

/** Описание вторичной способности из data/abilities.json — простым текстом для подсказки. */
export const abilityTip = name => {
  const x = name && (Codex.abilities ?? []).find(y => y.name.toLowerCase() === String(name).trim().toLowerCase());
  // без строки «Источник: …» — подсказка начинается с сути
  return x ? x.html.replace(/^<p><em>[\s\S]*?<\/em><\/p>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 420) : "";
};

export const dots = (value, max = 5, extra = {}) =>
  Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < value, ...extra }));

/** Ряд точек Атрибута в форме Гару: свои точки, прибавленные формой (gain, не нажимаются) и отнятые ею (loss).
 *  Ряд не длиннее предела черт: итог сверх него (Сила 7 в Криносе) показывает значок рядом. */
const formDots = (at, cap, path) => Array.from({ length: Math.max(cap, at.value) }, (_, i) => {
  const n = i + 1, own = n <= at.value;
  return own ? { n, filled: true, path, loss: n > at.total } : n <= at.total ? { n, gain: true } : { n, filled: false, path };
});
/** Значок итога Атрибута в форме: значок формы, итог; вверх — серебро, вниз — ржавчина. */
const formBadge = (s, k, at) => {
  const f = VTM20.garouForms.find(x => x.key === s.werewolf?.form);
  const d = at.total - at.value, L = game.i18n.localize(VTM20.attributes[k].label);
  return { total: at.total, icon: f?.icon ?? "fa-paw", dir: d > 0 ? "up" : d < 0 ? "down" : "same",
    tip: `${VTM20.label(f ?? {})}: ${L} ${at.value} ${at.form === "set" ? "→" : d >= 0 ? `+${d} →` : `−${-d} →`} ${at.total}` };
};

/** Состояния персонажа, которые видны на портрете: значок, оттенок портрета (cls), тревожные — красным. */
export const PORTRAIT_STATES = [
  { id: "r-frenzy", key: "frenzy", icon: "fa-face-angry", cls: "is-frenzy", hot: true },
  { id: "r-harano", key: "harano", icon: "fa-cloud-rain", cls: "is-torpor" },
  { id: "r-rotschreck", key: "rotschreck", icon: "fa-fire", cls: "is-rotschreck", hot: true },
  { id: "r-rapture", key: "rapture", icon: "fa-heart-pulse", cls: "is-frenzy", hot: true },
  { id: "r-torpor", key: "torpor", icon: "fa-bed", cls: "is-torpor" },
  { id: "r-staked", key: "staked", icon: "fa-thumbtack", cls: "is-torpor", hot: true },
  { id: "r-stunned", key: "stunned", icon: "fa-face-dizzy" },
  { id: "r-prone", key: "prone", icon: "fa-person-falling" },
  { id: "r-held", key: "held", icon: "fa-hands-bound" }
];

/** Значок строки оружия по виду: рукопашное, холодное, огнестрельное (луки и арбалеты — мишень), метательное. */
export const weaponIcon = (kind, name) => kind === "brawl" ? "fa-hand-fist" : kind === "thrown" ? "fa-location-arrow"
  : kind === "firearms" ? (/лук|арбалет|праща/i.test(name) ? "fa-bullseye" : "fa-gun") : "fa-khanda";


export function prepareHeader(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  if (ctx.isVampire) {
    ctx.clanGroups = Codex.clanGroups().map(g => ({ ...g, clans: g.clans.map(c => ({ key: c.key, name: c.name, selected: c.key === s.clan })) }));
    const clan = Codex.clan(s.clan);
    ctx.clan = clan;
    ctx.clanChoices = clan?.choice?.length ? clan.choice.map(k => ({ value: k, label: Codex.disciplineLabel(k), selected: k === s.clanChoice })) : null;
    ctx.generations = Object.keys(VTM20.generations).map(Number).sort((x, y) => x - y)
      .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.generation }));
  }
  if (ctx.isGhoul) {
    ctx.isRevenant = s.ghoulType === "revenant";
    ctx.isDhampir = s.ghoulType === "dhampir";
    ctx.families = Object.entries(REVENANT_FAMILIES).map(([k, f]) => ({ value: k, label: f.name, selected: k === s.family }));
    if (s.family && !REVENANT_FAMILIES[s.family]) ctx.families.push({ value: s.family, label: s.family, selected: true });
    ctx.domitorClans = Codex.clans.filter(c => Codex.visible(c)).map(c => ({ value: c.key, label: c.name, selected: c.key === s.domitorClan || c.name === s.domitorClan }));
    ctx.ghoulTypes = ["vassal", "independent", "revenant", "dhampir"].map(k => ({ value: k, label: t(`GhoulType.${k}`), selected: k === s.ghoulType }));
    // Дампир (Accursed Heirs): концепция и Предок-вампир с кланом — вместо домитора; слабость клана Предка
    if (ctx.isDhampir) {
      const D = Codex.dhampir ?? {}, d = s.dhampir ?? {};
      ctx.dhampirConcepts = (D.concepts ?? []).map(c => ({ value: c.key, label: c.name, selected: c.key === d.concept, tip: `${c.text} ${c.tips}` }));
      ctx.dhampirConceptTip = ctx.dhampirConcepts.find(c => c.selected)?.tip ?? "";
      ctx.antecedentClans = Codex.clans.filter(c => Codex.visible(c)).map(c => ({ value: c.key, label: c.name, selected: c.key === d.antecedentClan }));
      const clan = D.clans?.[Codex.traitClan?.(d.antecedentClan) || d.antecedentClan] ?? D.clans?.[d.antecedentClan];
      ctx.dhampirWeakness = clan?.weakness ?? "";
    }
    ctx.donorGenerations = Object.keys(VTM20.generations).map(Number).sort((x, y) => x - y)
      .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.domitorGeneration }));
  }
  if (ctx.isHunter) {
    const by = hunterData().bystander;
    ctx.creeds = [...hunterData().creeds, ...(by ? [by] : [])].map(c => ({ value: c.key, label: c.name, who: c.who, selected: c.key === s.hunter?.creed, tip: c.text }));
    ctx.creedTip = ctx.creeds.find(c => c.selected)?.tip ?? "";
  }
  if (ctx.isDemon) {
    const house = Codex.house(s.house);
    ctx.house = house;
    ctx.houses = Codex.houses.map(h => ({ value: h.key, label: h.name, selected: h.key === s.house }));   // аккадское имя — в строке над именем
    ctx.factions = Codex.factions.map(f => ({ value: f.key, label: f.name, selected: f.key === s.faction, tip: f.text }));
    ctx.visages = Object.entries(house?.visages ?? {}).map(([k, name]) => ({ value: k, label: name, lore: Codex.lore(k)?.name ?? k, selected: k === s.visage }));
    ctx.visageLore = ctx.visages.find(v => v.selected)?.lore ?? "";
  }
  // Герб на рельсе и водяной знак: клан, иначе секта; у гуля — герб клана домитора или сердце в цепях; у прочих — кокарда
  const sym = actor => actor.type === "vampire" ? Codex.clanSymbol(actor.system.clan)
    : actor.type === "ghoul" ? (Codex.clanSymbol(actor.isDhampir ? actor.system.dhampir?.antecedentClan : actor.system.domitorClan) ?? Codex._sym(Codex.assets?.sects?.ghoul)) : null;
  ctx.sigil = { sym: sym(a) ?? Codex.sectSymbol(s.details.sect), label: ctx.house?.name || a.clanLabel || s.details.sect || "", clan: a.type === "vampire" && !!Codex.clan(s.clan),
    img: VTM20.typeSigil(a.type) };
  // Состояние на портрете: раны — кровавая дымка по краям, состояния (ярость, торпор…) — оттенок и значки
  const st = a.statuses ?? new Set();
  const wound = Math.min(7, s.health?.damage ?? 0);
  ctx.portraitState = {
    wound, cls: [wound >= 7 && "is-down", ...PORTRAIT_STATES.filter(x => x.cls && st.has(x.id)).map(x => x.cls)].filter(Boolean).join(" "),
    badges: [
      ...(wound >= 7 ? [{ icon: "fa-skull-crossbones", label: t("Health.incapacitated"), hot: true }] : []),
      ...PORTRAIT_STATES.filter(x => st.has(x.id)).map(x => ({ id: x.id, icon: x.icon, label: t(`Status.${x.key}`), hot: x.hot }))
    ]
  };
  ctx.sectSym = Codex.sectSymbol(s.details.sect);
  ctx.archetypes = Codex.archetypes.map(x => x.name);
  // Способности эпох и сект (data/abilities.json) — подсказки для вторичных способностей по группам;
  // Тёмные века — с настройкой, Способности секты — персонажам этой секты
  const mySect = Codex.sectKey(s.details.sect);
  const extra = (Codex.abilities ?? []).filter(x => Codex.visible(x) && (!x.sect || x.sect === mySect));
  ctx.extraAbilities = Object.fromEntries(["talents", "skills", "knowledges"].map(g => [g, extra.filter(x => (x.group ?? "knowledges") === g).map(x => x.name)]));
  const nature = Codex.archetypes.find(x => x.name === s.details.nature);
  ctx.natureRegain = nature?.regain ?? "";
  // Дороги Тёмных веков — только при включённой настройке; уже выбранный путь не прячем
  ctx.paths = Codex.paths.filter(p => Codex.visible(p) || p.key === s.morality.path)
    .map(p => ({ key: p.key, name: p.era ? `${p.name} · ${t("Library.Filter.DarkAges")}` : p.name, selected: p.key === s.morality.path }));
  // переход с Человечности на Путь в игре (apps/path-shift.mjs) — кнопкой у вампира на Человечности
  ctx.pathShift = a.isVampire && sheet.isEditable && (s.morality.path ?? "humanity") === "humanity";
  ctx.sects = ["camarilla", "sabbat", "anarchs", "independent", "autarkis"].map(k => ({ value: t(`Sect.${k}`), label: t(`Sect.${k}`) }));
}

export function prepareTraits(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  const cap = Math.max(5, s.traitMax ?? 5);
  ctx.attributeGroups = Object.entries(VTM20.attributeGroups).map(([gk, g]) => ({
    key: gk, label: game.i18n.localize(g.label),
    list: g.attributes.map(k => {
      const at = s.attributes[k];
      return {
        key: k, label: game.i18n.localize(VTM20.attributes[k].label), value: at.value, total: at.total, boost: at.boost, ugly: !!at.ugly,
        fx: at.fxSet ? `=${at.total}` : at.fx ? `+${at.fx}` : "",
        // форма оборотня (W20): точки, что форма прибавила (призрачные) или отняла (тусклые), и значок итога
        form: at.form ? formBadge(s, k, at) : null,
        dots: at.form ? formDots(at, cap, `system.attributes.${k}.value`) : dots(at.value, cap, { path: `system.attributes.${k}.value` }), specialty: at.specialty, canSpec: at.value >= 4,
        boostable: ctx.hasBlood && VTM20.bloodBoostable.includes(k),
        xp: a.xpCost("attribute", at.value)
      };
    })
  }));
  const era = game.settings.get(SYSTEM_ID, "era");
  const abil = VTM20.abilitiesForEra(era, a.type);
  ctx.abilityGroups = Object.entries(abil).map(([gk, keys]) => ({
    key: gk, label: game.i18n.localize(VTM20.abilityGroups[gk].label),
    list: keys.map(k => {
      const ab = s.abilities[k];
      return {
        key: k, label: game.i18n.localize(VTM20.abilities[k].label), value: ab.value,
        dots: dots(ab.value, cap, { path: `system.abilities.${k}.value` }), specialty: ab.specialty,
        canSpec: VTM20.canChooseSpecialty("abilities", k, ab.value),
        xp: a.xpCost("ability", ab.value)
      };
    }),
    secondary: s.secondary.map((x, i) => ({ ...x, index: i, dots: dots(x.value, cap, { path: `system.secondary.${i}.value` }), tip: abilityTip(x.name) }))
      .filter(x => x.group === gk),
    combo: ctx.extraAbilities?.[gk]?.length ? `r-abil-${a.id}-${gk}` : ""
  }));
}

export function prepareRegistry(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  const path = Codex.path(s.morality.path);
  ctx.path = path;
  ctx.moralityDots = dots(s.morality.value, 10, { path: "system.morality.value" });
  const bm = VTM20.bearingMod(s.morality.value);
  ctx.bearing = { name: path?.bearing ?? "", mod: bm > 0 ? `+${bm}` : bm < 0 ? `${bm}` : "±0" };
  ctx.virtues = ["conscience", "selfControl", "courage"].map(slot => {
    const key = a.virtueKey(slot);
    const v = s.virtues[slot].value;
    return { slot, key, label: game.i18n.localize(VTM20.virtues[key].label), value: v, dots: dots(v, 5, { path: `system.virtues.${slot}.value` }), xp: a.xpCost("virtue", v) };
  });
  // Слуга падшего: вместо Человечности — Вера слуги, хозяин и грех по порогу Воли
  if (a.isThrall) {
    const master = s.thrall.master ? fromUuidSync(s.thrall.master) : null;
    ctx.thrallInfo = { faith: s.thrall.faith, faithDots: dots(s.thrall.faith, 5, { path: "system.thrall.faith" }),
      master: master?.name ?? "", masterUuid: master ? s.thrall.master : "",
      sin: game.i18n.localize(`VTM20.Demon.ThrallSinRow.${Math.max(1, Math.min(10, s.willpower.permanent))}`),
      gifts: (s.thrall.gifts ?? []).length };
  }
  // Привязанный: в карточке Муки — Потребности вместо Добродетелей
  if (ctx.isDemon && s.earthbound) ctx.urges = ["flesh", "thought", "emotion"].map(k => {
    const v = s.urges?.[k] ?? 1;
    return { key: k, label: game.i18n.localize(`VTM20.Demon.Urge.${k}`), tip: game.i18n.localize(`VTM20.Demon.UrgeTip.${k}`), value: v,
      dots: dots(v, 5, { path: `system.urges.${k}` }), xp: a.xpCost("urge", v) };
  });
  if (ctx.isDemon) {
    // адский двор: звание и министерство (досье на вкладке «Биография»)
    const opt = (keys, cur, k) => keys.map(v => ({ value: v, label: game.i18n.localize(`VTM20.Demon.Court.${k}.${v}`), tip: game.i18n.localize(`VTM20.Demon.Court.${k}Tip.${v}`), selected: v === cur }));
    ctx.courtRanks = opt(["subject", "knight", "lord", "highLord", "baron", "duke"], s.court?.rank, "Rank");
    ctx.courtMinistries = opt(["eagles", "aurochs", "lions", "dust", "dragons"], s.court?.ministry, "Ministry");
    ctx.courtMinistryTip = s.court?.ministry ? game.i18n.localize(`VTM20.Demon.Court.MinistryTip.${s.court.ministry}`) : "";
    ctx.courtRankTip = s.court?.rank ? game.i18n.localize(`VTM20.Demon.Court.RankTip.${s.court.rank}`) : "";
    ctx.hostMiles = (s.willpower?.permanent ?? 0) + 5;
    ctx.faithPerm = dots(s.faith.permanent, 10, { path: "system.faith.permanent" });
    ctx.faithBoxes = dots(s.faith.temporary, 10, { path: "system.faith.temporary" });
    ctx.tormentPerm = dots(s.torment.permanent, 10, { path: "system.torment.permanent" });
    ctx.tormentTemp = dots(s.torment.temporary, 10, { path: "system.torment.temporary" });
    ctx.tormentHigh = s.torment.permanent >= 7;
    ctx.faithXp = a.xpCost("faith", s.faith.permanent);
  }
  ctx.willPerm = dots(s.willpower.permanent, 10, { path: "system.willpower.permanent" });
  ctx.willTemp = dots(s.willpower.temporary, 10, { path: "system.willpower.temporary" })
    .map((d, i) => ({ ...d, locked: i >= s.willpower.permanent }));
  if (ctx.hasBlood) {
    const max = s.blood.max;
    ctx.bloodBoxes = dots(s.blood.value, max, { path: "system.blood.value" });
    ctx.bloodRows = [];
    for (let i = 0; i < ctx.bloodBoxes.length; i += 10) ctx.bloodRows.push(ctx.bloodBoxes.slice(i, i + 10));
    ctx.boosts = VTM20.bloodBoostable.map(k => ({ key: k, label: game.i18n.localize(VTM20.attributes[k].label),
      short: game.i18n.localize(VTM20.attributes[k].label).slice(0, 4) + ".", value: s.boosts[k] }));
    ctx.anyBoost = Object.values(s.boosts).some(v => v > 0);
  }
  // Шкала здоровья: штраф под клеткой (0, −1 … −5), у последней — «выбыл»; тяжесть штрафа — цветом
  const lastHurt = s.health.levels.reduce((n, l, i) => l.state && l.state !== "none" ? i : n, -1);
  ctx.health = s.health.levels.map((l, i) => ({
    ...l, label: game.i18n.localize(l.label),
    penaltyLabel: l.penalty == null ? "" : l.penalty === 0 ? "0" : `−${Math.abs(l.penalty)}`,
    out: l.penalty == null, sev: l.penalty == null ? 4 : Math.min(3, Math.abs(l.penalty ?? 0) > 2 ? 3 : Math.abs(l.penalty ?? 0)),
    current: i === lastHurt,
    mark: VTM20.damageTypes[l.state]?.mark ?? ""
  }));
  ctx.healthStatus = s.health.status === "healthy" ? t("Health.healthy") : t(`Health.${s.health.status}`);
  ctx.healthHurt = s.health.damage > 0;
  ctx.clock = clockBarData();
  ctx.woundPenalty = s.health.penalty;
  ctx.vitalsClosed = sheet._vitalsClosed;
  ctx.torpor = VTM20.torporDuration[s.morality.value];
  ctx.torporState = torporView(a);
  const dead = deathOf(a);
  ctx.death = dead ? { at: clockDate(dead.at), cause: t(`Torpor.Death.Cause.${dead.cause ?? "aggravated"}`) } : null;
  ctx.canSleep = sheet.isEditable && !ctx.torporState && !ctx.death;
  ctx.soak = { bashing: a.soakPool("bashing"), lethal: a.soakPool("lethal"), aggravated: a.soakPool("aggravated") };
  ctx.xp = s.experience;
  if (ctx.isGhoul) {
    // изъян: у ревенанта — семейный (всегда), у гуля — слабость клана домитора (после пяти кормлений от клана)
    const fam = ctx.isRevenant ? revenantFamily(s.family) : null;
    const dc = fam ? null : Codex.clan(s.domitorClan) ?? Codex.clans.find(c => c.name === s.domitorClan);
    if (fam) {
      ctx.weakness = `<p>${foundry.utils.escapeHTML(fam.flaw)}</p><p><em>${t("Revenant.FamilyDisciplines")}: ${fam.disciplines.map(k => Codex.disciplineLabel(k)).join(", ")}</em></p>`;
      ctx.weaknessTitle = `${fam.name} — «${fam.nick}»`;
      ctx.weaknessLabel = t("Revenant.FamilyFlaw");
    } else if (dc?.weakness) {
      ctx.weakness = `${dc.weakness}<p><em>${t("Revenant.ClanWeaknessGhoul")}</em></p>`;
      ctx.weaknessTitle = dc.name;
    }
    ctx.weaknessOpen = sheet._open.has("weakness");
  }
  if (ctx.isVampire) {
    const clan = Codex.clan(s.clan);
    ctx.weakness = clan?.weakness ?? "";
    ctx.weaknessTitle = clan?.name ?? "";
    ctx.weaknessOpen = sheet._open.has("weakness");
    const w = VTM20.weaknessChecks[s.clan];
    ctx.weaknessCheck = w ? t(`Weakness.${w}`) : "";
    ctx.soilClan = VTM20.soilClans.includes(s.clan);
    ctx.lightClan = VTM20.lightBane.includes(s.clan);
  }
}

export function prepareDisciplines(sheet, ctx) {
  const a = sheet.actor;
  const clanD = a.clanDisciplines;
  const items = a.items.filter(i => i.type === "discipline");
  const paths = a.items.filter(i => i.type === "thaumPath");
  const rituals = a.items.filter(i => i.type === "ritual");
  const ownPowers = a.items.filter(i => i.type === "power");
  const cap = Math.max(5, a.system.traitMax ?? 5);
  // силы, вынесенные в HUD (флаг hudPowers)
  const pins = new Set(sheet.actor.getFlag(SYSTEM_ID, "hudPowers") ?? []);
  const rollInfo = r => r && (r.trait1 || r.blood || r.willpower || r.dice) ? {
    label: r.dice ? `${r.dice}d10` : [r.trait1 && a.traitLabel(r.trait1), r.trait2 && a.traitLabel(r.trait2)].filter(Boolean).join(" + ") + (r.base ? ` (${t("Magic.BaseAttr")})` : ""),
    diff: r.difficulty || "", note: r.note ?? "", blood: r.blood ?? 0, willpower: !!r.willpower, canRoll: !!(r.trait1 || r.dice)
  } : null;
  const reading = new Set(readingRituals(a).map(e => e.flags[SYSTEM_ID].ritual));
  const mapRitual = r => ({
    id: r.id, name: r.name, en: Codex.enOf(r), level: r.system.level, roman: ROMAN[r.system.level - 1], html: ritualHTML(r.system), ritual: true, reading: reading.has(r.id),
    open: sheet._open.has(r.id),
    roll: rollInfo({ ...(r.system.roll ?? {}), trait1: r.system.roll?.trait1 || "attributes.intelligence",
      trait2: r.system.roll?.trait1 ? r.system.roll.trait2 : "abilities.occult", difficulty: r.system.roll?.difficulty || Math.min(9, 3 + r.system.level) })
  });
  const mapOwn = p => ({
    id: p.id, name: p.name, level: p.system.level, roman: ROMAN[p.system.level - 1] ?? "—", html: p.system.description,
    open: sheet._open.has(p.id), roll: rollInfo(p.system.roll)
  });
  // Путь магии крови: силы справочника до текущего уровня и записанные вручную
  const mapPath = p => {
    const k = p.system.discipline, data = Codex.discipline(k);
    const pd = Codex.bloodPath(k, p.name);
    const pi = (data?.paths ?? []).indexOf(pd);
    return {
      id: p.id, name: p.name, en: pd?.en ?? "", value: p.system.value, primary: p.system.primary,
      dots: dots(p.system.value, 5, { path: "system.value", itemId: p.id }),
      html: pd?.html ?? p.system.description ?? "",
      powers: (pd?.powers ?? []).filter(x => x.level <= p.system.value).map((x, i) => ({
        ...x, id: `${p.id}-p${i}`, roman: ROMAN[x.level - 1], open: sheet._open.has(`${p.id}-p${i}`),
        roll: rollInfo(x.roll), codexRef: `${k}|path|${pi}|${i}`, pinned: pins.has(`${k}|path|${pi}|${i}`)
      })),
      ownPowers: ownPowers.filter(o => o.system.discipline === k && o.system.path === p.name).sort((x, y) => x.system.level - y.system.level).map(mapOwn)
    };
  };
  const discKeys = new Set(items.map(i => i.system.key));
  const fxOn = new Set(a.powerEffects.map(x => x.power));
  const fxOf = (k, p) => {
    const key = fxKey(k, p), def = POWER_EFFECTS[key];
    return def ? { key, on: fxOn.has(key), icon: def.icon ?? "fa-wand-sparkles",
      tip: `${t("Fx.Toggle")} · ${t(MODE_LABEL[def.mode] ?? "Fx.Toggleable")}` } : null;
  };
  ctx.activeFx = a.powerEffects.map(x => ({ id: x.effect.id, name: x.effect.name, img: x.effect.img,
    mode: t(MODE_LABEL[x.def.mode] ?? "Fx.Toggleable"), hit: !!x.def.diff?.hit }));
  ctx.disciplines = items.map(it => {
    const k = it.system.key;
    const data = Codex.discipline(k);
    const v = it.system.value;
    const inClan = it.system.inClan || clanD.includes(k);
    const myPaths = paths.filter(p => p.system.discipline === k).sort((x, y) => (y.system.primary - x.system.primary) || x.name.localeCompare(y.name));
    const isPathed = VTM20.pathDisciplines.includes(k) || myPaths.length > 0;
    // i — номер в полном списке сил (по нему codexRef), поэтому силы Тёмных веков отсекаем после нумерации
    // На уровне несколько сил (высокие уровни, альтернативы кланбуков) — показываем выбранную в system.choices,
    // а пока не выбрана — строку «выбрать». Эффекты (fx) описаны для сил основной книги, у альтернатив их нет.
    const choices = it.system.choices ?? {};
    const vis = (data?.powers ?? []).map((p, i) => [p, i]).filter(([p]) => Codex.visible(p));
    const powers = [];
    for (let lv = 1; lv <= v; lv++) {
      const opts = vis.filter(([p]) => fitsLevel(p, lv, choices));       // и «любой из 6–9» (Guide to the Camarilla)
      const pick = opts.length > 1 ? opts.find(([p]) => p.name === choices[lv]) : opts[0];
      if (!pick) {
        if (opts.length) powers.push({ choose: true, level: lv, roman: ROMAN[lv - 1] ?? lv, count: opts.length, itemId: it.id });
        continue;
      }
      const [p, i] = pick;
      powers.push({ ...p, level: lv, id: `${it.id}-p${i}`, roman: ROMAN[lv - 1] ?? lv, open: sheet._open.has(`${it.id}-p${i}`),
        roll: rollInfo(p.roll), codexRef: `${k}|${i}`, pinned: pins.has(`${k}|${i}`), fx: fxOf(k, p),
        alts: opts.length > 1 ? opts.length : 0, itemId: it.id });
    }
    const nextOpts = vis.filter(([p]) => fitsLevel(p, v + 1, choices));
    const nextPower = nextOpts.length ? { ...nextOpts[0][0], count: nextOpts.length } : null;
    const myRituals = rituals.filter(r => r.system.discipline === k);
    return {
      id: it.id, key: k, name: data?.name ?? it.name, en: data?.en ?? "", value: v,
      icon: VTM20.disciplineIcons[k] ?? "fa-droplet", sym: Codex.disciplineSymbol(k), inClan,
      dots: dots(v, cap, { path: "system.value", itemId: it.id }),
      powers, nextPower: nextPower ? { name: nextPower.count > 1 ? t("Sheet.ChoiceOf", { n: nextPower.count }) : nextPower.name, level: nextPower.level } : null,
      ownPowers: ownPowers.filter(p => p.system.discipline === k && !p.system.path).sort((x, y) => x.system.level - y.system.level).map(mapOwn),
      physical: VTM20.physicalDisciplines[k] ? game.i18n.localize(VTM20.attributes[VTM20.physicalDisciplines[k]].label) : "",
      rules: (data?.rules ?? []).filter(r => r.title).map((r, i) => ({ ...r, id: `${it.id}-r${i}`, open: sheet._open.has(`${it.id}-r${i}`) })),
      isPathed,
      paths: myPaths.map(mapPath),
      pathChoices: VTM20.pathDisciplines.includes(k) ? (data?.paths ?? []).filter(pp => Codex.visible(pp) && !myPaths.some(m => m.name === pp.name)).map(pp => pp.name) : [],
      hasRituals: !!Codex.rituals[k]?.rituals?.some(r => Codex.visible(r)) || myRituals.length > 0,
      rituals: myRituals.sort((x, y) => x.system.level - y.system.level || x.name.localeCompare(y.name)).map(mapRitual),
      ritualChoices: (Codex.rituals[k]?.rituals ?? []).some(r => Codex.visible(r) && r.level <= v && !rituals.some(m => m.name === r.name)),
      xp: a.xpCost("discipline", v, { key: k, inClan }),
      open: sheet._open.has(it.id)
    };
  }).sort((x, y) => (y.inClan - x.inClan) || x.name.localeCompare(y.name, "ru"));
  // Пути, ритуалы и силы, чьей Дисциплины у персонажа нет, — по школам; без школы — общим списком в конце
  const orphan = [...paths, ...rituals, ...ownPowers].filter(i => !discKeys.has(i.system.discipline));
  const byKey = Map.groupBy(orphan, i => Codex.discipline(i.system.discipline) ? i.system.discipline : "");
  ctx.otherMagic = [...byKey].map(([k, list]) => ({
    key: k, name: Codex.discipline(k)?.name ?? "", sym: k ? Codex.disciplineSymbol(k) : null,
    icon: VTM20.disciplineIcons[k] ?? "fa-droplet",
    paths: list.filter(i => i.type === "thaumPath").sort((x, y) => x.name.localeCompare(y.name, "ru")).map(mapPath),
    rituals: list.filter(i => i.type === "ritual").sort((x, y) => x.system.level - y.system.level || x.name.localeCompare(y.name, "ru")).map(mapRitual),
    powers: list.filter(i => i.type === "power" && !(i.system.path && paths.some(p => p.name === i.system.path))).sort((x, y) => x.system.level - y.system.level).map(mapOwn)
  })).sort((x, y) => !x.key - !y.key || x.name.localeCompare(y.name, "ru"));
  ctx.allOpen = ctx.disciplines.length > 0 && ctx.disciplines.every(d => d.open);
  const owned = new Set(items.map(i => i.system.key));
  ctx.missingClan = clanD.filter(k => !owned.has(k)).length > 0;
  if (ctx.isGhoul) ctx.ghoulCap = a.system.disciplineMax;
  if (a.isDhampir) ctx.dhampir = dhampirView(a, dots);
}

export function prepareLores(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  const pins = new Set(a.getFlag(SYSTEM_ID, "hudPowers") ?? []);
  const own = Codex.house(s.house)?.lores ?? [];
  const rollInfo = r => r?.trait1 ? { label: [a.traitLabel(r.trait1), r.trait2 && a.traitLabel(r.trait2)].filter(Boolean).join(" + "),
    diff: r.difficulty || "", canRoll: true } : null;
  // Призывы предметами (свои или из компендия): под своим Знанием, на месте своего круга, заменяя тот же призыв справочника
  const lorePowers = a.items.filter(i => i.type === "lorePower");
  const mapOwnLore = p => ({ id: p.id, name: p.name, level: p.system.level, roman: ROMAN[p.system.level - 1] ?? "—", html: p.system.description,
    open: sheet._open.has(p.id), roll: rollInfo(p.system.roll), cls: "is-own" });
  ctx.lores = a.items.filter(i => i.type === "lore").map(it => {
    const k = it.system.key, data = Codex.lore(k), v = it.system.value;
    const mine = lorePowers.filter(p => p.system.lore === k), taken = new Set(mine.map(p => `${p.system.level}|${p.name}`));
    const powers = (data?.powers ?? []).map((p, i) => [p, i]).filter(([p]) => p.level <= v && !taken.has(`${p.level}|${p.name}`)).map(([p, i]) => ({
      ...p, id: `${it.id}-p${i}`, roman: ROMAN[p.level - 1], open: sheet._open.has(`${it.id}-p${i}`),
      roll: rollInfo(p.roll), codexRef: `lore:${k}|${i}`, pinned: pins.has(`lore:${k}|${i}`)
    }));
    const next = data?.powers?.find(p => p.level === v + 1);
    const house = data?.house ? Codex.house(data.house) : null;
    return {
      id: it.id, key: k, name: data?.name ?? it.name, en: data?.en ?? "", value: v, own: own.includes(k), common: !data?.house && !data?.dark, dark: !!data?.dark,
      houseName: data?.dark ? t("Demon.DarkLore") : house?.name ?? t("Demon.Common"), dots: dots(v, 5, { path: "system.value", itemId: it.id }),
      powers: [...powers, ...mine.map(mapOwnLore)].sort((x, y) => x.level - y.level), nextPower: next ? { name: next.name, level: next.level } : null,
      xp: a.xpCost("lore", v, { key: k }), open: sheet._open.has(it.id)
    };
  }).sort((x, y) => (y.own - x.own) || (y.common - x.common) || x.name.localeCompare(y.name, "ru"));
  ctx.allOpen = ctx.lores.length > 0 && ctx.lores.every(l => l.open);
  ctx.earthbound = !!s.earthbound;
  if (s.earthbound) {
    const R = reliquaryInfo(a);
    ctx.possession = possessionView(a);
    ctx.reliquary = { ...R, kinds: ["ideal", "improvised", "natural"].map(k => ({ value: k, label: t(`Demon.ReliquaryKind.${k}`), selected: k === R.kind })),
      hint: t(`Demon.ReliquaryHint.${R.kind}`),
      urges: ["flesh", "thought", "emotion"].map(k => ({ key: k, label: t(`Demon.Urge.${k}`), tip: t(`Demon.UrgeTip.${k}`), value: s.urges?.[k] ?? 1 })) };
  }
  // Слуги по договорам (вкладка «Преимущества»)
  ctx.thralls = (s.thralls ?? []).map((x, i) => {
    const st = thrallState(x);
    return { ...x, name: st.name, index: i, rowId: `thrall-${i}`, open: sheet._open.has(`thrall-${i}`), linked: !!st.actor, will: st.will,
      wounds: st.actor ? st.actor.system.health?.lethal ?? 0 : x.wounds, share: Math.min(x.share, thrallCap(x.faith)), cap: thrallCap(x.faith) };
  });
  ctx.thrallFaith = ctx.thralls.reduce((n, x) => n + x.share, 0);
  const have = new Set(ctx.lores.map(l => l.key));
  ctx.missingHouse = own.some(k => !have.has(k));
  // Апокалиптическая форма (гл. 7): черты Облика; при Муке 7+ — по черте высокой Муки за каждый пункт сверх 6
  const lore = Codex.lore(s.visage), form = lore?.form;
  const highN = Math.max(0, Math.min(4, s.torment.permanent - 6));
  // Ритуалы и реликвии падших — предметы на персонаже (перетащить из компендиев «Ритуалы падших», «Реликвии падших»)
  const run = a.getFlag(SYSTEM_ID, "ritualRun");
  const dname = x => x?.key ? `${Codex.lore(x.key)?.name ?? x.key} ${"•".repeat(x.level)}` : "";
  // чип Знания: короткое имя без «Знание», точки; есть ли оно у персонажа на нужном уровне
  const myLore = Object.fromEntries(a.items.filter(i => i.type === "lore").map(i => [i.system.key, i.system.value]));
  const chip = (x, primary = false) => x?.key ? { name: (Codex.lore(x.key)?.name ?? x.key), dots: "•".repeat(x.level ?? 0),
    primary, has: (myLore[x.key] ?? 0) >= (x.level ?? 0) } : null;
  ctx.demonRituals = a.items.filter(i => i.type === "demonRitual").map(it => {
    const r = it.system, live = run?.id === it.id ? run : null;
    return { id: it.id, name: it.name, chips: [chip(r.primary, true), ...(r.secondary ?? []).map(x => chip(x))].filter(Boolean),
      need: ritualNeed(r), time: r.time, limits: r.limits, cost: r.cost, html: r.description, high: r.high, variants: r.variants,
      roll: r.roll?.trait1 ? [a.traitLabel(r.roll.trait1), r.roll.trait2 && a.traitLabel(r.roll.trait2)].filter(Boolean).join(" + ") : r.rollText,
      canEffect: !!r.roll?.trait1, run: live, total: live?.total ?? 0,
      turns: [1, 2, 3, 4, 5].map(n => ({ n, done: !!live && n <= live.turn, next: (live?.turn ?? 0) + 1 === n })),
      pct: live ? Math.min(100, Math.round(live.total / Math.max(1, ritualNeed(r)) * 100)) : 0, open: sheet._open.has(it.id) };
  }).sort((x, y) => x.name.localeCompare(y.name, "ru"));
  ctx.relics = a.items.filter(i => i.type === "relic").map(it => ({ id: it.id, name: it.name, kind: game.i18n.localize(`VTM20.Relic.Kind.${it.system.kind}`),
    kindKey: it.system.kind, chips: (it.system.lores ?? []).filter(Boolean).map(k => ({ name: (Codex.lore(k)?.name ?? k) })),
    use: it.system.use, html: it.system.description, mechanics: it.system.mechanics, open: sheet._open.has(it.id) }))
    .sort((x, y) => x.name.localeCompare(y.name, "ru"));
  // механика черт по каталогу Players Guide (data/form.mjs); у «Улучшенной способности» Способность выбирает игрок
  const feats = formFeatures(a), picks = a.getFlag(SYSTEM_ID, "formPick") ?? {};
  const featOf = (high, i) => feats.find(x => x.high === high && x.index === i);
  const mech = (high, i) => { const x = featOf(high, i); return { mech: mechLabel(x?.entry?.mech, picks[x?.name]), tip: x?.entry?.text ?? "",
    pickable: needsPick(x?.entry), picked: picks[x?.name] ? a.traitLabel(`abilities.${picks[x?.name]}`) : "" }; };
  ctx.form = form ? {
    visage: Codex.house(s.house)?.visages?.[s.visage] ?? "", lore: lore.name, on: !!s.apocalyptic, highN,
    look: { img: s.formLook?.img ?? "", sizes: [0, 1, 2, 3, 4].map(v => ({ v, label: v ? String(v) : game.i18n.localize("VTM20.Demon.FormLookSizeKeep"),
      sel: (s.formLook?.size ?? 0) === v })) },
    fx: s.apocalyptic ? s.formFx : null, fxSummary: s.apocalyptic ? formSummary(s.formFx, a) : "",
    low: form.low.map((name, i) => ({ name, index: i, ...mech(false, i) })),
    // черты высокой Муки игрок выбирает сам (гл. 7): флаг formHigh — индексы в порядке выбора; действуют первые highN,
    // при падении Муки уходит выбранная последней; свободный слот — щелчок по черте
    ...(() => {
      const picked = (a.getFlag(SYSTEM_ID, "formHigh") ?? []).filter(i => i < form.high.length), active = picked.slice(0, highN);
      const scene = a.getFlag(SYSTEM_ID, "formScene") ?? [], free = highN - active.length;
      return { free, high: form.high.map((name, i) => ({ name, index: i, ...mech(true, i), on: active.includes(i), order: active.indexOf(i) + 1,
        scene: scene.includes(i) && !active.includes(i), pick: free > 0 && !active.includes(i) })) };
    })()
  } : null;
}

export function prepareAdvantages(sheet, ctx) {
  const a = sheet.actor;
  const byType = type => a.items.filter(i => i.type === type).sort((x, y) => x.name.localeCompare(y.name, "ru"));
  ctx.backgrounds = byType("background").map(i => ({
    id: i.id, name: i.name, en: Codex.enOf(i), value: i.system.value, html: i.system.description, open: sheet._open.has(i.id),
    dots: dots(i.system.value, Math.max(5, i.system.value), { path: "system.value", itemId: i.id })
  }));
  const mf = type => byType(type).map(i => ({
    id: i.id, name: i.name, en: Codex.enOf(i), cost: i.system.cost, html: i.system.description, open: sheet._open.has(i.id),
    category: game.i18n.localize(VTM20.meritCategories[i.system.category]?.label ?? "")
  }));
  ctx.merits = mf("merit");
  ctx.flaws = mf("flaw");
  ctx.meritTotal = ctx.merits.reduce((s, m) => s + m.cost, 0);
  ctx.flawTotal = ctx.flaws.reduce((s, m) => s + m.cost, 0);
  ctx.mfColumns = [
    { key: "merit", label: "VTM20.Sheet.Merits", list: ctx.merits, total: ctx.meritTotal },
    { key: "flaw", label: "VTM20.Sheet.Flaws", list: ctx.flaws, total: ctx.flawTotal }
  ];
  ctx.derangements = byType("derangement").map(i => ({ id: i.id, name: i.name, en: Codex.enOf(i), html: i.system.description, permanent: i.system.permanent, open: sheet._open.has(i.id) }));
  // Инфернализм (apps/infernal.mjs): Вложения и договоры с демонами — у всех, кроме падших; у Гару (W20 их не знает) — только если уже есть
  if (a.type !== "demon" && (a.type !== "werewolf" || byType("investment").length || (a.system.pacts ?? []).length)) {
    const f = (k, n) => game.i18n.format(`VTM20.Infernal.${k}`, { n });
    const costLine = c => [c.blood ? f("CostBlood", c.blood) : "", c.willpower ? f("CostWill", c.willpower) : "",
      c.willpowerPerm ? f("CostWillPerm", c.willpowerPerm) : ""].filter(Boolean).join(" · ");
    ctx.infernal = {
      limit: investmentLimit(a),
      investments: byType("investment").map(i => ({ id: i.id, name: i.name, html: i.system.description, open: sheet._open.has(i.id),
        rating: i.system.tier === "sabbat" ? i.system.rating : 0, cost: costLine(i.system.cost ?? {}), pact: i.system.pact, deed: i.system.deed })),
      pacts: (a.system.pacts ?? []).map((p, i) => ({ ...p, i, formLabel: game.i18n.localize(`VTM20.Infernal.Forms.${p.form}`),
        value: p.obligation || p.frequency || p.consequence ? String(pactValue(p)) : "", valueOk: pactValue(p) > 0 }))
    };
  }
  ctx.bonds = (a.system.bonds ?? []).map((b, i) => ({ ...b, index: i, dots: dots(b.rating, 3, { path: `system.bonds.${i}.rating` }),
    isRegnant: b.role === "regnant", tip: t("BondX.Tip", { n: b.drinks ?? 0, last: b.last || "—" })
      + (bondFade(a, b) != null ? ` · ${game.i18n.format("VTM20.Web.Fade", { n: bondFade(a, b) })}` : "") }));
  // узы крови: у смертных и охотников раздела нет; у Гару — только если уже записаны
  ctx.showBonds = !["mortal", "hunter"].includes(a.type) && (a.type !== "werewolf" || ctx.bonds.length > 0);
  // Винкулум — у вампиров Шабаша и у всех, у кого он уже записан
  // котерии персонажа: общие факты и свой вклад (apps/coterie.mjs)
  ctx.coteries = coteriesOf(a).map(c => ({ name: c.name, pools: Object.keys(c.pools ?? {}).map(bg => ({ bg, value: poolValue(c, bg),
    primary: bg === c.primary, mine: c.pools[bg]?.[a.id] ?? 0 })) }));
  ctx.hasVinc = a.type === "vampire" && (isSabbat(a) || (a.system.vinculi ?? []).length > 0);
  if (ctx.hasVinc)
    ctx.vinculi = (a.system.vinculi ?? []).map((v, i) => ({ ...v, index: i, meaning: vinculumMeaning(v.rating),
      dots: dots(v.rating, 10, { path: `system.vinculi.${i}.rating` }) }));
  // Престация: две колонки — кто должен мне и кому должен я
  const boons = (a.system.boons ?? []).map((b, i) => ({ ...b, index: i,
    levels: BOON_LEVELS.map(k => ({ key: k, label: boonLevelLabel(k), selected: k === b.level })) }));
  ctx.boonCols = ["owed", "owe"].map(dir => ({ dir, label: `VTM20.Boon.Dir.${dir}`, list: boons.filter(b => (b.dir === "owe" ? "owe" : "owed") === dir),
    open: boons.filter(b => b.dir === dir && !b.done).length }));
}

/** Родословная (план 6): линия сиров вверх по полям «Сир», потомки, проверка крови, братья и сёстры по сиру. */
export function prepareLineage(sheet, ctx) {
  const a = sheet.actor;
  const clan = a.clanLabel;
  const embraced = a.system.details.embraced;
  const line = lineUp(a).map(x => {
    const who = x.actor;
    return {
      gen: x.gen, name: x.name, self: !!x.self, actorId: who?.id ?? "", holderId: x.holder?.id ?? "",
      kind: x.self ? "self" : who ? "sheet" : x.written != null ? "written" : x.name ? "named" : "unknown",
      index: x.written, writtenClan: x.clan ?? "",
      clan: who?.isVampire ? who.clanLabel : clan,
      embraced: who?.system?.details?.embraced ?? x.embraced ?? "",
      byBlood: !who && !x.clan
    };
  });
  // «Вписать» у неизвестного звена пишет сира тому, кто стоит под ним (у него поле «Сир» пустое);
  // клан звена без листа — «по крови» ближайшего Сородича под ним
  let below = clan, belowKey = a.system.clan;
  // над звеном с листом «Вписать» ставит ему сира; над сиром без листа или вписанным предком — добавляет предка в лист
  for (let i = line.length - 1; i >= 0; i--) {
    const x = line[i];
    if (x.kind === "unknown") {
      const under = line[i + 1];
      x.mode = !under || ["self", "sheet"].includes(under.kind) ? "sire" : "ancestor";
      x.holderId = x.mode === "sire" ? (under?.actorId || a.id) : (x.holderId || a.id);
    }
    if (x.kind === "written" && x.writtenClan) { x.clan = x.writtenClan; below = x.clan; continue; }
    if (x.byBlood) { x.clan = below; x.clanKey = belowKey; }
    else { below = x.clan; belowKey = game.actors.get(x.actorId)?.system?.clan ?? belowKey; }
  }
  const kids = childrenOf(a).map(k => ({ id: k.id, name: k.name, gen: k.isVampire ? k.system.generation : null,
    clan: k.isVampire ? k.clanLabel : game.i18n.localize(`TYPES.Actor.${k.type}`), embraced: k.system.details?.embraced ?? "" }));
  const sire = actorByName(a.system.details.sire);
  const sibs = sire ? childrenOf(sire).filter(k => k.id !== a.id).map(k => ({ id: k.id, name: k.name, clan: k.isVampire ? k.clanLabel : "" })) : [];
  const kidGen = (a.system.generation ?? 13) + 1;
  const written = (a.system.lineage?.childer ?? []).map((k, index) => ({ ...k, index, gen: k.gen || kidGen, clan: k.clan || clan }));
  ctx.lineage = { line, kids, written, kidGen, sire: a.system.details.sire, embraced,
    gen: a.system.generation, check: bloodCheck(a), sibs, count: kids.length + written.length };
}

/** Вкладка «Эффекты»: всё, что сейчас действует на персонажа, — силы, состояния, кровь, постоянные модификаторы, черты. */
export function prepareEffects(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  const attrL = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
  const signed = n => n > 0 ? `+${n}` : `${n}`;
  const numOf = v => typeof v === "number" ? v : (String(v).startsWith("-") ? -1 : 1) * (a.discipline(String(v).replace(/^-/, "")) ?? 0);

  // Включённые силы — с расшифровкой того, что они меняют
  ctx.fxPowers = a.powerEffects.map(({ effect, def }) => {
    const lines = [];
    for (const [k, v] of Object.entries(def.attr ?? {})) lines.push(`${attrL(k)} ${signed(v)}`);
    for (const [k, v] of Object.entries(def.set ?? {})) lines.push(`${attrL(k)} = ${v}`);
    for (const [k, v] of Object.entries(def.diff ?? {})) lines.push(t("FxTab.Diff", { what: t(`FxTab.DiffKind.${k}`), n: signed(numOf(v)) }));
    if (def.claws) lines.push(t("FxTab.Claws"));
    if (def.brawlDamage) lines.push(t("FxTab.BrawlDamage", { n: def.brawlDamage }));
    if (def.biteDamage) lines.push(t("FxTab.BiteDamage", { n: def.biteDamage }));
    if (def.soakDiff) lines.push(t("FxTab.SoakDiff", { n: signed(def.soakDiff) }));
    if (def.staminaVsFangs) lines.push(t("FxTab.StaminaVsFangs"));
    if (def.venom) lines.push(t("FxTab.Venom", { n: effect.flags?.[SYSTEM_ID]?.charges ?? 1 }));
    if (def.weapon) lines.push(t("FxTab.Weapon", { name: def.weapon.name }));
    return { id: effect.id, name: effect.name, img: effect.img, kind: def.mode,
      mode: t(MODE_LABEL[def.mode] ?? "Fx.Toggleable"), lines, timer: effectTimer(effect), toDawn: def.mode === "night" };
  });
  // Ритуалы, которые сейчас читаются: остаток по часам хроники
  ctx.fxRituals = readingRituals(a).map(e => ({ id: e.id, name: e.name, img: e.img, level: ROMAN[(e.flags[SYSTEM_ID].level ?? 1) - 1],
    minutes: 5 * (e.flags[SYSTEM_ID].level ?? 1), timer: effectTimer(e) }));

  // Состояния (ярость, торпор…) и прочие эффекты на актёре
  const st = a.statuses ?? new Set();
  ctx.fxStatuses = PORTRAIT_STATES.filter(x => st.has(x.id)).map(x => ({ id: x.id, icon: x.icon, hot: x.hot,
    label: t(`Status.${x.key}`), text: t(`FxTab.StatusText.${x.key}`) }));
  // Действующие ритуалы (успешный бросок, срок из текста) — как силы, с остатком по часам хроники
  ctx.fxRitualsOn = a.effects.filter(e => e.flags?.[SYSTEM_ID]?.ritualOn).map(e => ({ id: e.id, name: e.name, img: e.img,
    mode: t(MODE_LABEL[e.flags[SYSTEM_ID].mode] ?? "Fx.Toggleable"), timer: effectTimer(e), toDawn: e.flags[SYSTEM_ID].mode === "night" }));
  ctx.fxOther = a.effects.filter(e => !e.flags?.[SYSTEM_ID]?.power && !e.flags?.[SYSTEM_ID]?.ritual && !e.flags?.[SYSTEM_ID]?.ritualOn && !(e.statuses?.size && PORTRAIT_STATES.some(x => e.statuses.has(x.id))))
    .map(e => ({ id: e.id, name: e.name, img: e.img, disabled: e.disabled }));

  // Усиление кровью
  ctx.fxBoosts = Object.entries(s.boosts ?? {}).filter(([, v]) => v > 0).map(([k, v]) => ({ label: `${attrL(k)} +${v}` }));

  // Постоянные модификаторы: раны, броня, физические Дисциплины, прочность, кровь
  const mods = [];
  if (s.health?.penalty) mods.push({ icon: "fa-heart-crack", hot: true, label: t("FxTab.Wounds"), value: signed(s.health.penalty), text: t("FxTab.WoundsText") });
  const arm = a.armor;
  if (arm.rating || arm.penalty) mods.push({ icon: "fa-shield-halved", label: t("FxTab.Armor"), value: `${arm.rating}`, text: arm.penalty ? t("FxTab.ArmorPenalty", { n: arm.penalty }) : t("FxTab.ArmorText") });
  const pot = a.discipline?.("potence") ?? 0, cel = a.discipline?.("celerity") ?? 0, fort = a.discipline?.("fortitude") ?? 0;
  if (pot) mods.push({ icon: "fa-hand-fist", label: Codex.disciplineLabel("potence"), value: `+${pot}`,
    text: a.potenceActive ? t("FxTab.PotenceAuto", { n: pot }) : t("FxTab.Potence", { n: pot }) });
  if (cel) mods.push({ icon: "fa-forward", label: Codex.disciplineLabel("celerity"), value: `+${a.physicalDisciplineBonus("dexterity")}`,
    text: a.celerityActions ? t("FxTab.CelerityActions", { n: a.celerityActions }) : t("FxTab.Celerity", { n: cel }) });
  if (fort) mods.push({ icon: "fa-shield", label: Codex.disciplineLabel("fortitude"), value: `+${fort}`, text: t("FxTab.Fortitude", { n: fort }) });
  mods.push({ icon: "fa-shield-heart", label: t("FxTab.Soak"), value: `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`, text: t("FxTab.SoakText") });
  if (ctx.hasBlood) mods.push({ icon: "fa-droplet", label: t("FxTab.PerTurn"), value: game.combat?.started ? `${sheet.document.bloodSpentThisTurn}/${s.blood.perTurn}` : `${s.blood.perTurn}`, text: t("FxTab.PerTurnText", { max: s.traitMax ?? 5 }) });
  if (ctx.bearing?.name) mods.push({ icon: "fa-scale-balanced", label: t("Sheet.Bearing"), value: ctx.bearing.mod, text: ctx.bearing.name });
  ctx.fxMods = mods;

  // Черты с механикой (data/merit-mods.mjs): что, к чему, сами или по обстоятельствам
  const have = a.items.filter(i => i.type === "merit" || i.type === "flaw");
  ctx.fxTraits = have.filter(i => MERIT_MODS[i.name]).map(i => ({ id: i.id, name: i.name, flaw: i.type === "flaw", ...describeMeritMod(i.name) }));
  ctx.fxEmpty = !ctx.fxPowers.length && !ctx.fxRituals.length && !ctx.fxRitualsOn.length && !ctx.fxStatuses.length && !ctx.fxOther.length && !ctx.fxBoosts.length;
}

export function prepareGear(sheet, ctx) {
  const a = sheet.actor, s = a.system;
  ctx.weapons = a.items.filter(i => i.type === "weapon").map(i => {
    const w = i.system;
    const kind = VTM20.weaponKinds[w.kind] ?? VTM20.weaponKinds.melee;
    const str = w.strength ? s.attributes.strength.total : 0;
    return {
      id: i.id, name: i.name, img: i.img, equipped: w.equipped,
      kindLabel: game.i18n.localize(kind.label), icon: weaponIcon(w.kind, i.name),
      pool: s.attributes[kind.attribute].total + s.abilities[kind.ability].value,
      damage: w.strength ? `${t("Attr.strength")} + ${w.damage}` : String(w.damage),
      damageDice: str + w.damage + (w.strength ? a.physicalDisciplineBonus("strength") : 0),
      damageType: game.i18n.localize(VTM20.damageTypes[w.damageType]?.short ?? ""),
      damageTypeKey: w.damageType, difficulty: w.difficulty,
      range: w.range, rate: w.rate, clip: w.clip, concealment: w.concealment
    };
  });
  ctx.armors = a.items.filter(i => i.type === "armor").map(i => ({ id: i.id, name: i.name, rating: i.system.rating, penalty: i.system.penalty, equipped: i.system.equipped }));
  ctx.money = moneyView(a);
  const res = a.items.find(i => i.type === "background" && /^ресурс/i.test(i.name));
  ctx.resources = res ? { dots: "●".repeat(res.system.value), html: (res.system.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) } : null;
  ctx.gear = a.items.filter(i => i.type === "gear").map(i => ({ id: i.id, name: i.name, img: i.img, quantity: i.system.quantity }));
  // value — номер в полном списке заготовок; снаряжение Тёмных веков — только с настройкой «Контент из Dark Ages»
  const presetGroups = list => [...new Set(list.filter(p => Codex.visible(p)).map(p => p.group))].map(g => ({
    label: g, options: list.map((p, i) => ({ value: i, label: p.name, group: p.group, show: Codex.visible(p) })).filter(p => p.group === g && p.show)
  }));
  ctx.weaponPresets = WEAPON_PRESETS.map((p, i) => ({ value: i, label: p.name, group: p.group })).filter((_, i) => Codex.visible(WEAPON_PRESETS[i]));
  ctx.weaponPresetGroups = presetGroups(WEAPON_PRESETS);
  ctx.armorPresetGroups = presetGroups(ARMOR_PRESETS);
  ctx.gearPresetGroups = presetGroups(GEAR_PRESETS);
}

/** Итог действующей формы строкой для листа. */
export function formSummary(f, a) {
  if (!f) return "";
  const out = Object.entries(f.attr).map(([k, v]) => `${a.traitLabel(`attributes.${k}`)} +${v}`);
  if (f.soak) out.push(t("Demon.FormMech.Soak", { n: f.soak }));
  if (f.init) out.push(t("Demon.FormMech.Init", { n: f.init }));
  if (f.health) out.push(t("Demon.FormMech.Health", { n: f.health }));
  if (f.noWoundPenalty) out.push(t("Demon.FormMech.NoWound"));
  for (const [k, list] of Object.entries(f.diff)) out.push(t("Demon.FormMech.Diff", { t: a.traitLabel(k in a.system.attributes ? `attributes.${k}` : `abilities.${k}`), n: signed(list.reduce((s, d) => s + d.value, 0)) }));
  for (const [k, list] of Object.entries(f.dice)) out.push(t("Demon.FormMech.Dice", { t: a.traitLabel(`abilities.${k}`), n: list.reduce((s, d) => s + d.value, 0) }));
  for (const w of f.weapons) out.push(`${w.name} (${t(w.agg ? "Demon.FormMech.WeaponAgg" : "Demon.FormMech.Weapon", { n: w.dmg >= 0 ? `+${w.dmg}` : w.dmg })})`);
  return out.join(" · ");
}
