// module/apps/target-powers/koldun.mjs
// Колдовство Цимисхов — автоматизация после броска (план «PLAN-koldun»): лечение по успехам, слуги-существа на сцене,
// удержание водоворотом с проверкой «вырваться», проверки у цели и у всех в зоне, восприятие области, убежища в воде,
// крайны Эноха и Колодца, газ Купалы, ловушки Беловежской крайны, Тело зефира, Раздробление.
// Запись силы — `koldunism|<англ. имя>` или `…@<proc пути>` (редакция: way — уклады V20, rev — Revised, dac — классика
// Тёмных веков; core.mjs → powerKey). Наложение — кнопкой на карточке броска (apply.mjs → KOLDUN_APPLY), дальнейшие
// действия — кнопками карточек `kol…` (dice/roll.mjs → koldunCardAction). Бросок — по правилам редакции (лист, koldunPower).

import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { t, esc, done, notice, ask, selfCheck, untilOf, clockApi } from "./core.mjs";

const k = (key, d) => t(`Kol.${key}`, d);
const KHELD = "r-held";
const icon = () => Codex.disciplineIcon("koldunism");

/** Отмеченные цели (T), кроме самого колдуна. */
const marked = caster => [...(game.user.targets ?? [])].map(tk => tk.actor).filter(a => a && a !== caster);
/** Рейтинг пути (крайны) у колдуна; нет на листе — 1. */
const pathRating = (actor, name) => actor?.items?.find(i => i.type === "thaumPath" && i.system.discipline === "koldunism" && i.name === name)?.system.value ?? 1;
const caster = async state => state.actorUuid ? foundry.utils.fromUuid(state.actorUuid) : null;
const roll = async o => (await import("../../dice/roll.mjs")).rollPool({ kind: "check", ...o });

/** Карточка с кнопками `kol…`: data — что нужно кнопкам (flags.kol). */
function card(actor, iconCls, html, buttons, data, { whisperGM = false } = {}) {
  const btns = buttons.map(([act, ic, label]) => `<button type="button" data-r-action="${act}"><i class="fa-solid ${ic}"></i> ${esc(label)}</button>`).join("");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { kol: data } },
    ...(whisperGM ? { whisper: game.users.filter(u => u.isGM || actor?.testUserPermission?.(u, "OWNER")).map(u => u.id) } : {}),
    content: `<div class="r-notice r-kol-card"><i class="fa-solid ${iconCls}"></i> ${html}${btns ? `<div class="r-card-buttons">${btns}</div>` : ""}</div>` });
}

/** Эффект на персонаже (срок: scene | manual | код untilOf | { hours } ). */
async function effect(target, name, desc, flags = {}, { dur = "scene", statuses = null } = {}) {
  if (!target?.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: target?.name ?? "" })); return null; }
  const api = await clockApi(), now = api.getClock();
  const until = typeof dur === "object" ? now + dur.hours * api.MS_HOUR : ["scene", "manual"].includes(dur) ? null : untilOf(dur, now, api);
  const mode = until ? "timed" : dur === "manual" ? "manual" : "scene";
  const [e] = await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: icon(), description: `<p>${esc(desc)}</p>`,
    ...(statuses ? { statuses } : {}), flags: { [SYSTEM_ID]: { mode, ...(until ? { until } : {}), ...flags } } }]);
  return e;
}

/* ── 1. Лечение по успехам ─────────────────────────────────────────────────────────────────────────────────────── */

// Колыбель жизни / Корень (классика): успех — 2 лёгких или 1 тяжёлое, 2 успеха — 1 губительное; предел — меньшее из крови и
// успехов; лёгкие — ход, тяжёлые — минута, губительные — час. Понт Эвксинский: успех — 1 лёгкое или тяжёлое, 5 — 1 губительное
// (день покоя под водой за каждое). Корень (Revised): Воля, броска нет; ход под землёй за уровень, губительное — ещё 1 кровь.
const HEAL = {
  cradle: { b: 0.5, l: 1, a: 2, cap: "blood", time: ["Kol.TimeTurn", "Kol.TimeMinute", "Kol.TimeHour"] },
  pontos: { b: 1, l: 1, a: 5, cap: "succ", time: ["Kol.TimeTurn", "Kol.TimeTurn", "Kol.TimeDay"] },
  rev: { b: 0, l: 0, a: 0, cap: "none", time: ["Kol.TimeTurn", "Kol.TimeTurn", "Kol.TimeTurn"] }
};

/** Окно лечения: сколько уровней каждого типа исцелить; цена в успехах и (для Колыбели) вложенной крови. */
async function healDialog(title, target, mode, n, casterActor) {
  const h = target.system.health ?? {}, H = HEAL[mode];
  const have = { b: h.bashing ?? 0, l: h.lethal ?? 0, a: h.aggravated ?? 0 };
  if (!have.b && !have.l && !have.a) { ui.notifications.info(k("NoWounds", { name: target.name })); return null; }
  const blood = casterActor?.system.blood?.value ?? 0;
  const lead = mode === "rev" ? k("HealRev") : mode === "pontos" ? k("HealPontos", { n }) : k("HealCradle", { n, blood: blood + 1 });
  const field = (key, label) => `<label class="r-field"><span>${esc(label)} <small>(${have[key]})</small></span><input type="number" name="${key}" min="0" max="${have[key]}" value="0"></label>`;
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title, icon: "fa-solid fa-seedling" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><p class="r-hint">${esc(lead)}</p>${field("b", k("Bashing"))}${field("l", k("Lethal"))}${field("a", k("Aggravated"))}</div>`,
    ok: { label: k("Heal"), icon: "fa-solid fa-seedling", callback: (e, b) => Object.fromEntries(["b", "l", "a"].map(x => [x, Math.clamp(Number(b.form.elements[x].value) || 0, 0, have[x])])) } });
  if (!res) return null;
  // цена: успехи (и кровь) на выбранное
  const units = Math.ceil(res.b * H.b) + res.l * H.l + res.a * H.a;
  if (mode === "cradle") {
    // вложено: 1 кровь броска + сколько нужно ещё; предел — успехи
    if (units > n) { ui.notifications.warn(k("HealOver", { n, need: units })); return null; }
    const extra = Math.max(0, units - 1);
    if (extra && !(await casterActor.spendBlood(extra, { reason: title, limit: false }))) return null;
  } else if (mode === "pontos" && units > n) { ui.notifications.warn(k("HealOver", { n, need: units })); return null; }
  else if (mode === "rev" && res.a) {
    // губительное — пункт крови исцеляемого за уровень (если он способен)
    if (target.hasBlood && !(await target.spendBlood(res.a, { reason: title, limit: false }))) return null;
  }
  return res;
}

async function applyHeal(target, res, mode, title) {
  const h = target.system.health;
  await target.update({ "system.health.bashing": h.bashing - res.b, "system.health.lethal": h.lethal - res.l, "system.health.aggravated": h.aggravated - res.a });
  const T = HEAL[mode].time, parts = [];
  if (res.b) parts.push(k("HealedB", { n: res.b, time: t(T[0], { n: res.b }) }));
  if (res.l) parts.push(k("HealedL", { n: res.l, time: t(T[1], { n: res.l }) }));
  if (res.a) parts.push(k("HealedA", { n: res.a, time: t(T[2], { n: res.a }) }));
  return notice(target, title, parts.join("; "));
}

async function onHeal({ message, state, x, tp, target, n }) {
  const c = await caster(state);
  const res = await healDialog(x.powerName, target, tp.heal, n, c);
  if (!res) return null;
  await done(message, state, x);
  return applyHeal(target, res, tp.heal, x.powerName);
}

/** Корень жизненной силы (Revised): броска нет — 1 Воля и сразу лечение. */
async function rollHealRev(ctx) {
  const { actor, p, target } = ctx;
  if (ctx.tp.heal !== "rev") return;
  const who = target ?? actor;
  if (!(await actor.spendWillpower(1))) return { stop: null };
  const res = await healDialog(p.name, who, "rev", 0, actor);
  if (!res) return { stop: null };
  return { stop: await applyHeal(who, res, "rev", p.name) };
}

/* ── 2. Слуги — существа на сцене ─────────────────────────────────────────────────────────────────────────────── */

// spec(колдун, черноморский?) → { attrs, abilities, soak, health, note }; count — меньшее из вложенной крови и успехов
// (Водяные миньоны Revised — по успехам); кровь: 1 уже взята броском (Мраморное море), у Слуг — изливается сверх броска.
const MINIONS = {
  deep: { name: "Kol.DeepName", blood: "extra", spec: c => { const w = c.system.attributes.wits?.total ?? 2;
    return { attrs: { strength: w, dexterity: w, stamina: w, charisma: 1, manipulation: 1, appearance: 1, perception: 1, intelligence: 1, wits: 1 }, abilities: { stealth: w }, note: k("DeepNote") }; } },
  deepClassic: { name: "Kol.DeepClassicName", blood: "extra", spec: c => { const w = c.system.attributes.wits?.total ?? 2;
    return { attrs: { strength: w, dexterity: w, stamina: w, charisma: 1, manipulation: 1, appearance: 1, perception: 1, intelligence: 1, wits: 1 }, abilities: { stealth: w },
      note: k("DeepClassicNote", { hp: c.system.willpower?.permanent ?? 3 }) }; } },
  watery: { name: "Kol.WateryName", blood: "none", spec: () => ({ attrs: { strength: 2, dexterity: 2, stamina: 2, perception: 2, intelligence: 1, wits: 2 }, abilities: { brawl: 2 }, note: k("WateryNote") }) },
  marmora: { name: "Kol.MarmoraName", blood: "total", black: true, spec: (c, black) => ({
    attrs: { strength: black ? 5 : 4, dexterity: 3, stamina: black ? 5 : 4, charisma: 1, manipulation: 1, appearance: 0, perception: 3, intelligence: black ? 2 : 1, wits: black ? 3 : 2 },
    abilities: { athletics: 2, brawl: 4, intimidation: 3, survival: 3 }, willpower: 3, note: k("MarmoraNote") }) }
};

async function onMinions({ message, state, x, tp, target, n }) {
  if (!game.user.isGM) return ui.notifications.warn(k("GMOnly"));
  const c = target, M = MINIONS[tp.minions];
  let count = n, black = false;
  if (M.blood !== "none") {
    // сколько крови вложено: не больше успехов; «extra» — изливается сверх броска, «total» — вместе с кровью броска
    const max = M.blood === "extra" ? Math.min(n, c.system.blood?.value ?? 0) : Math.min(n, (c.system.blood?.value ?? 0) + 1);
    if (max < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: c.name }));
    const opts = Array.from({ length: max }, (_, i) => [String(i + 1), k("MinionsBlood", { n: i + 1 })]);
    const v = await ask(x.powerName, opts);
    if (!v) return null;
    count = Number(v);
    const spend = M.blood === "extra" ? count : count - 1;
    if (spend && !(await c.spendBlood(spend, { reason: x.powerName, limit: false }))) return null;
  }
  if (M.black) black = (await ask(x.powerName, [["0", k("MarmoraUsual")], ["1", k("MarmoraBlack")]])) === "1";
  await done(message, state, x);
  const s = M.spec(c, black), name = t(M.name);
  const tok = c.getActiveTokens?.()[0], made = [];
  for (let i = 0; i < count; i++) {
    made.push(await Actor.create({ name: `${name} ${i + 1} (${c.name})`, type: "creature", img: `systems/${SYSTEM_ID}/assets/icons/creature.svg`,
      flags: { [SYSTEM_ID]: { summoned: c.uuid } },
      system: { kind: name, supernatural: true, blood: { max: 0, value: 0 }, notes: `<p>${esc(s.note)}</p>`,
        ...(s.willpower ? { willpower: { permanent: s.willpower, temporary: s.willpower } } : {}),
        attributes: Object.fromEntries(Object.entries(s.attrs).map(([a, v]) => [a, { value: Math.clamp(v, 0, 10) }])),
        abilities: Object.fromEntries(Object.entries(s.abilities).map(([a, v]) => [a, { value: Math.clamp(v, 0, 10) }])) } }));
  }
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", await Promise.all(made.filter(Boolean).map((a, i) =>
    a.getTokenDocument({ x: tok.document.x + ((i % 4) - 1) * canvas.grid.size, y: tok.document.y + (1 + Math.floor(i / 4)) * canvas.grid.size }))));
  return notice(c, x.powerName, k("MinionsDone", { n: count, name, note: s.note }));
}

/* ── 3. Удержание с проверкой «вырваться» ──────────────────────────────────────────────────────────────────────── */

// Роковая пучина и приливы: Сила водоворота 15 + 5 за каждый успех сверх первого; выход — Сила + Выживание против Силы
// водоворота, сложность обеих 8 (Revised: Мощь — добавочные успехи). Смертный тонет, вампир заперт до конца сцены.
async function hold(c, victims, { power, strength, potence = false, extra = "" }) {
  const out = [];
  for (const v of victims) {
    if (!v.isOwner && !game.user.isGM) continue;
    await effect(v, k("HoldName", { power }), k("HoldDesc", { s: strength }) + (extra ? ` ${extra}` : ""), { kolHold: { strength, potence, by: c?.uuid ?? "" } },
      { dur: "scene", statuses: [KHELD] });
    await card(v, "fa-water", k("HoldCard", { name: esc(v.name), power: esc(power), s: strength }), [["kolEscape", "fa-person-swimming", k("Escape")]],
      { kind: "escape", target: v.uuid, strength, potence, power });
    out.push(v.name);
  }
  return out;
}

async function onHold({ message, state, x, tp, target, n }) {
  const c = target, victims = marked(c);
  if (!victims.length) return ui.notifications.warn(k("MarkZone"));
  const strength = tp.hold.base + tp.hold.step * Math.max(0, n - 1);
  await done(message, state, x);
  const names = await hold(c, victims, { power: x.powerName, strength, potence: !!tp.hold.potence });
  return notice(c, x.powerName, k("HoldDone", { s: strength, names: names.join(", "), r: tp.hold.radius ? tp.hold.radius(n) : "" }));
}

/** Понт Аксинский: успехи — по опасностям (водоворот Силой колдуна, +1 к множителю, скалы, туман, ветер, холод). */
async function onAxeinos({ message, state, x, tp, target, n }) {
  const c = target, list = [["vortex", k("AxVortex")], ["mult", k("AxMult")], ["rocks", k("AxRocks")], ["fog", k("AxFog")], ["wind", k("AxWind")], ["cold", k("AxCold")]];
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-water" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><p class="r-hint">${esc(k("AxLead", { n }))}</p>${list.map(([key, l]) =>
      `<label class="r-field"><span>${esc(l)}</span><input type="number" name="${key}" min="0" max="${n}" value="0"></label>`).join("")}</div>`,
    ok: { label: t("SelfApply"), callback: (e, b) => Object.fromEntries(list.map(([key]) => [key, Math.max(0, Number(b.form.elements[key].value) || 0)])) } });
  if (!res) return null;
  const used = Object.values(res).reduce((s, v) => s + v, 0);
  if (used > n) return ui.notifications.warn(k("AxOver", { n }));
  await done(message, state, x);
  const str = c.system.attributes.strength?.total ?? 1, lines = [];
  if (res.vortex) {
    const strength = str * (1 + res.mult);
    const victims = marked(c);
    const names = victims.length ? await hold(c, victims, { power: x.powerName, strength }) : [];
    lines.push(k("AxVortexLine", { s: strength, names: names.join(", ") || "—" }));
  }
  if (res.rocks) lines.push(k("AxRocksLine", { n: res.rocks }));
  if (res.fog) lines.push(k("AxFogLine"));
  if (res.wind) lines.push(k("AxWindLine"));
  if (res.cold) lines.push(k("AxColdLine"));
  return notice(c, x.powerName, `${lines.join(" ")} ${k("AxScene")}`);
}

/* ── 4. Проверка у цели ────────────────────────────────────────────────────────────────────────────────────────── */

/** Оскорбления Кривды: у цели — проверка Самоконтроля против бешенства, сложность 5 + успехи (макс. 9). */
async function onFrenzyCheck({ message, state, x, target, n }) {
  await done(message, state, x);
  const diff = Math.min(9, 5 + n);
  if (!target.isVampire) return notice(target, x.powerName, k("KrivdaMortal"));
  await selfCheck(target, "frenzy", diff, k("KrivdaCheck", { name: target.name, d: diff }));
  return notice(target, x.powerName, k("KrivdaSent", { d: diff }));
}

/* ── 5. Восприятие области ─────────────────────────────────────────────────────────────────────────────────────── */

// Путь Духа и Гений места: радиус — по уровню (в имени силы: «… — 15 м»); срок — сцены (Rites, Revised, Гений) или часы
// (классика) по успехам. Трон Буребисты: радиус по успехам, до конца сцены.
const THRONE = ["46 м", "91 м", "457 м", "1,6 км", "4,8 км"];

async function onSense({ message, state, x, tp, target, n }) {
  const radius = tp.sense === "throne" ? THRONE[Math.min(n, 5) - 1] : (x.powerName.split(" — ")[1] ?? "");
  const lvl = Number(state.extra?.power?.level) || 1;
  const dur = tp.sense === "hours" ? { hours: n } : tp.sense === "throne" ? "scene" : "manual";
  const len = tp.sense === "hours" ? k("SenseHours", { n }) : tp.sense === "throne" ? k("SenseScene") : k("SenseScenes", { n });
  const desc = k(tp.sense === "throne" ? "ThroneDesc" : "SenseDesc", { r: radius, lvl, len });
  await done(message, state, x);
  await effect(target, k("SenseName", { power: x.powerName.split(" — ")[0], r: radius }), desc, { kolSense: radius }, { dur });
  return notice(target, x.powerName, desc);
}

/* ── 6. Убежища в воде ─────────────────────────────────────────────────────────────────────────────────────────── */

// Как Слияние с землёй: солнце не вредит (hazard.mjs → sunSafe); найти — Восприятие + Бдительность, сл. 8.
async function onHaven({ message, state, x, tp, target, n }) {
  if (n < (tp.need ?? 1)) return ui.notifications.warn(k("HavenNeed", { n: tp.need }));
  await done(message, state, x);
  const desc = k(tp.grave ? "GraveDesc" : "HavenDesc", { n });
  await effect(target, k("HavenName", { power: x.powerName }), desc, { sunSafe: true, kolHaven: true }, { dur: "manual" });
  return notice(target, x.powerName, desc);
}

/* ── 7. Крайны Эноха и Колодца ─────────────────────────────────────────────────────────────────────────────────── */

// Зона: радиус r × успехи, ходов — по успехам. check: у каждого в зоне — Воля (сл. по правилу), провал — fail; end — цена колдуну
// по окончании силы (кнопка). Покров забвения: солнце по укрытым — лёгкое (hazard.mjs → sunBashing).
const ZONES = {
  shroud: { r: 2, check: null, end: "skin", shelter: true },
  cloak: { r: 3, check: { diff: "kraina", fail: "deathVision" }, end: "eyes", casterNote: "CloakSelf" },
  pond: { r: 5, check: { diff: "kraina", fail: "permWill", every: true }, end: "pond", casterNote: "PondSelf" },
  wrath: { r: 7, check: { diff: 8, fail: "harrowing", every: true }, end: null, casterNote: "WrathSelf" },
  void: { r: 8, check: { diff: 9, fail: "void" }, end: "void", casterNote: "VoidSelf" }
};

async function onZone({ message, state, x, tp, target, n }) {
  const c = target, Z = ZONES[tp.zone], victims = marked(c);
  const kraina = pathRating(c, "Крайна Эноха");
  const diff = Z.check ? Math.min(9, Z.check.diff === "kraina" ? kraina + n : Z.check.diff) : 0;
  await done(message, state, x);
  if (Z.casterNote) await effect(c, x.powerName, k(Z.casterNote, { n }), { kolZone: tp.zone }, { dur: "scene" });
  if (Z.shelter) for (const v of [c, ...victims]) if (v.isOwner) await effect(v, k("ShroudName"), k("ShroudDesc"), { sunBashing: true }, { dur: "scene" });
  if (Z.check) for (const v of victims) await card(v, "fa-ghost", k("ZoneCheck", { name: esc(v.name), power: esc(x.powerName), d: diff, every: Z.check.every ? k("EveryTurn") : "" }),
    [["kolCheck", "fa-dice-d10", k("RollWill")]], { kind: "check", target: v.uuid, diff, fail: Z.check.fail, power: x.powerName, n }, { whisperGM: true });
  if (Z.end) await card(c, "fa-skull", k("ZoneEnd", { power: esc(x.powerName) }), [["kolEnd", "fa-hourglass-end", k("EndPower")]], { kind: "end", target: c.uuid, end: Z.end, n, power: x.powerName });
  return notice(c, x.powerName, k(Z.check ? "ZoneDone" : "ZoneDoneFree", { r: Z.r * n, turns: n, d: diff, names: victims.map(v => v.name).join(", ") || "—" }));
}

/** Эгида Алигьери: успехи — к сложности инфернальных воздействий на колдуна и кубами к сопротивлению им, до конца сцены. */
async function onAegis({ message, state, x, target, n }) {
  await done(message, state, x);
  const desc = k("AegisDesc", { n });
  await effect(target, x.powerName, desc, { kolAegis: n }, { dur: "scene" });
  return notice(target, x.powerName, desc);
}

/** Призыв Детей: продолжительная проверка; нужно успехов — сложность демона (предел — по рейтингу крайны). */
async function rollCall(ctx) {
  const { actor, p } = ctx;
  if (ctx.tp.kind !== "kcall") return;
  const max = 4 + pathRating(actor, "Крайна Колодца");
  const opts = [5, 6, 7, 8, 9].filter(d => d <= max).map(d => [String(d), k(`Demon${d}`)]);
  const d = Number(await ask(p.name, opts));
  if (!d) return { stop: null };
  ctx.opts.contest = "extended";
  ctx.opts.need = d;
  ctx.roll = { ...ctx.roll, note: [ctx.roll.note, k("CallNote", { n: d })].filter(Boolean).join(" · ") };
}

async function onCall({ message, state, x, target }) {
  const need = state.extra?.extended?.need ?? state.need ?? 0;
  await done(message, state, x);
  return notice(target, x.powerName, k("CallDone", { n: need || "?" }));
}

/** Изгнание воинства ада: очищение по успехам; демон или инферналист — сопротивление 1 Волей (кнопка у цели). */
async function onHeave({ message, state, x, target, n }) {
  const c = await caster(state);
  await done(message, state, x);
  const level = n >= 4 ? "Heave4" : n === 3 ? "Heave3" : "Heave1";
  if (target && target !== c) await card(target, "fa-hand-sparkles", k("HeaveCard", { name: esc(target.name), d: c?.system.willpower?.permanent ?? 6 }),
    [["kolResist", "fa-shield", k("Resist")]], { kind: "resist", target: target.uuid, diff: c?.system.willpower?.permanent ?? 6, power: x.powerName }, { whisperGM: true });
  return notice(target ?? c, x.powerName, k(level));
}

/** Жатва Колодца: шесть цепей держат демона; цель рвёт по цепи за ход, колдун раз в ход требует Истинное имя. */
async function onReap({ message, state, x, target }) {
  const c = await caster(state);
  await done(message, state, x);
  await effect(target, k("ChainsName", { n: 6 }), k("ChainsDesc"), { kolChains: 6 }, { dur: "manual", statuses: [KHELD] });
  return card(target, "fa-link", k("ChainsCard", { name: esc(target.name), n: 6 }),
    [["kolChain", "fa-link-slash", k("BreakChain")], ["kolName", "fa-signature", k("DemandName")]],
    { kind: "chains", target: target.uuid, caster: c?.uuid ?? "", left: 6, diff: c?.system.willpower?.permanent ?? 6, power: x.powerName });
}

/* ── 8. Прочие ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Выдох Купалы: выбросов — не больше вложенной крови, раз в ход в течение ходов по успехам; огонь рядом — взрыв. */
async function onGas({ message, state, x, target, n }) {
  const c = target, max = Math.min(10, (c.system.blood?.value ?? 0) + 1);
  const v = Number(await ask(x.powerName, Array.from({ length: max }, (_, i) => [String(i + 1), k("GasBlood", { n: i + 1 })])));
  if (!v) return null;
  if (v > 1 && !(await c.spendBlood(v - 1, { reason: x.powerName, limit: false }))) return null;
  await done(message, state, x);
  const left = Math.min(v, n);
  return card(c, "fa-wind", k("GasCard", { power: esc(x.powerName), n: left, turns: n }),
    [["kolGas", "fa-burst", k("Erupt")], ["kolBoom", "fa-fire", k("Explode")]], { kind: "gas", caster: c.uuid, left, power: x.powerName });
}

/** Пальцы Беловежи: растение-ловушка — захват 6 кубами, каждый ход +1 (до 10); схватило — 1 лёгкое за ход. */
async function onPlant({ message, state, x, target }) {
  await done(message, state, x);
  return card(target, "fa-seedling", k("PlantCard", { power: esc(x.powerName) }), [["kolGrab", "fa-hand", k("Grab", { n: 6 })]],
    { kind: "grab", caster: target.uuid, pool: 6, power: x.powerName });
}

/** Сила-заметка: эффект с описанием по успехам (Нарушение границ, Тупик Грондры, Белая башня, Тело зефира). */
async function onNote({ message, state, x, tp, target, n }) {
  const c = await caster(state);
  const victims = tp.onMarked ? marked(c) : [target];
  if (tp.onMarked && !victims.length) return ui.notifications.warn(k("MarkZone"));
  await done(message, state, x);
  const desc = k(tp.note, { n, floors: n + 1, h: 5 * (n + 1) });
  for (const v of victims) await effect(v, x.powerName, desc, tp.flags ?? {}, { dur: tp.dur ?? "scene" });
  return notice(victims[0], x.powerName, desc);
}

/** Раздробление: предмет бросает поглощение (3/5/7 кубов, сл. 5) трижды; меньше 5 успехов всего — разрушен. */
async function onShatter({ message, state, x, target }) {
  const pool = Number(await ask(x.powerName, [["3", k("ShatterSmall")], ["5", k("ShatterMid")], ["7", k("ShatterBig")]]));
  if (!pool) return null;
  await done(message, state, x);
  let sum = 0;
  const rolls = [];
  for (let i = 0; i < 3; i++) {
    const r = await new Roll(`${pool}d10`).evaluate();
    const vals = r.dice[0].results.map(z => z.result), s = Math.max(0, vals.filter(z => z >= 5).length - vals.filter(z => z === 1).length);
    sum += s; rolls.push(`[${vals.join(", ")}] ${s}`);
  }
  return notice(target, x.powerName, k(sum >= 5 ? "ShatterHeld" : "ShatterBroke", { s: sum, rolls: rolls.join("; ") }));
}

/* ── Таблица сил ───────────────────────────────────────────────────────────────────────────────────────────────── */

const HEAL_L = "Kol.HealApply", SUMMON_L = "SummonApply", HOLD_L = "Kol.HoldApply", SELF_L = "SelfApply";
export const KOLDUN_POWERS = {
  // 1. лечение
  "koldunism|Root of Vitality@way": { kind: "kheal", heal: "cradle", allowSelf: true, label: HEAL_L },
  "koldunism|Root of Vitality@dac": { kind: "kheal", heal: "cradle", allowSelf: true, label: HEAL_L },
  "koldunism|Root of Vitality@rev": { kind: "kheal", heal: "rev", allowSelf: true, label: HEAL_L },
  "koldunism|Pontos Euxeinos": { kind: "kheal", heal: "pontos", self: true, label: HEAL_L },
  // 2. слуги
  "koldunism|Minions of the Deep@way": { kind: "kminions", minions: "deep", self: true, label: SUMMON_L },
  "koldunism|Minions of the Deep@dac": { kind: "kminions", minions: "deepClassic", self: true, label: SUMMON_L },
  "koldunism|Watery Minions": { kind: "kminions", minions: "watery", self: true, label: SUMMON_L },
  "koldunism|Minions of Deep Marmora": { kind: "kminions", minions: "marmora", self: true, label: SUMMON_L },
  // 3. удержание
  "koldunism|Doom Tide@way": { kind: "khold", self: true, hold: { base: 15, step: 5 }, label: HOLD_L },
  "koldunism|Doom Tide@dac": { kind: "khold", self: true, hold: { base: 15, step: 5 }, label: HOLD_L },
  "koldunism|Doom Tides": { kind: "khold", self: true, hold: { base: 15, step: 5, potence: true }, label: HOLD_L },
  "koldunism|Pontos Axeinos": { kind: "kaxeinos", self: true, label: SELF_L },
  // 4. проверка у цели
  "koldunism|The Insults of Krivda": { kind: "kfrenzy", needTarget: true, label: "Kol.KrivdaApply" },
  "koldunism|Winds of Guilt": { kind: "cond", needTarget: true, fx: { note: "KGuilt" }, dur: ["scene", "night", "week", "2weeks", "month"] },
  // 5. восприятие области
  "koldunism|The Way of the Spirit": { kind: "ksense", sense: "scenes", self: true, label: SELF_L },
  "koldunism|Way of Spirit@rev": { kind: "ksense", sense: "scenes", self: true, label: SELF_L },
  "koldunism|Way of Spirit@dac": { kind: "ksense", sense: "hours", self: true, label: SELF_L },
  "koldunism|Genius Loci": { kind: "ksense", sense: "scenes", self: true, label: SELF_L },
  "koldunism|Burebista’s Throne": { kind: "ksense", sense: "throne", self: true, label: SELF_L },
  // 6. убежища в воде
  "koldunism|Watery Haven": { kind: "khaven", need: 2, self: true, label: SELF_L },
  "koldunism|Watery Solace": { kind: "khaven", need: 2, self: true, label: SELF_L },
  "koldunism|Grave of the Marea Neagra": { kind: "khaven", need: 1, grave: true, self: true, label: SELF_L },
  // 7. крайны Эноха и Колодца
  "koldunism|Shroud of Oblivion": { kind: "kzone", zone: "shroud", self: true, label: SELF_L },
  "koldunism|Spectral Cloak": { kind: "kzone", zone: "cloak", self: true, label: SELF_L },
  "koldunism|Pond of Malevolent Dread": { kind: "kzone", zone: "pond", self: true, label: SELF_L },
  "koldunism|Wrath of the Tempest": { kind: "kzone", zone: "wrath", self: true, label: SELF_L },
  "koldunism|Hunger of the Void": { kind: "kzone", zone: "void", self: true, label: SELF_L },
  "koldunism|Aegis Alighieri": { kind: "kaegis", self: true, label: SELF_L },
  "koldunism|Call the Children": { kind: "kcall", self: true, label: "Kol.CallApply" },
  "koldunism|Heave the Host of Hell": { kind: "kheave", allowSelf: true, label: "Kol.HeaveApply" },
  "koldunism|Reap the Well": { kind: "kreap", needTarget: true, label: "Kol.ReapApply" },
  // 8. прочие
  "koldunism|Kupala’s Exhalation": { kind: "kgas", self: true, label: SELF_L },
  "koldunism|Domain Breach": { kind: "knote", note: "BreachDesc", dur: "night", self: true, label: SELF_L },
  "koldunism|Fingers of Białowieża": { kind: "kplant", self: true, label: SELF_L },
  "koldunism|Grondrska’s Impasse": { kind: "knote", note: "ImpasseDesc", dur: "night", onMarked: true, self: true, label: "Kol.ImpasseApply" },
  "koldunism|The White Tower": { kind: "knote", note: "TowerDesc", dur: "manual", self: true, label: SELF_L },
  "koldunism|Body of Zephyr": { kind: "knote", note: "ZephyrDesc", dur: "manual", flags: { zephyr: true }, self: true, label: SELF_L },
  "koldunism|Shatter": { kind: "kshatter", self: true, label: "Kol.ShatterApply" }
};

export const KOLDUN_APPLY = { kheal: onHeal, kminions: onMinions, khold: onHold, kaxeinos: onAxeinos, kfrenzy: onFrenzyCheck, ksense: onSense, khaven: onHaven,
  kzone: onZone, kaegis: onAegis, kcall: onCall, kheave: onHeave, kreap: onReap, kgas: onGas, kplant: onPlant, knote: onNote, kshatter: onShatter };

export const KOLDUN_ROLL = { kheal: rollHealRev, kcall: rollCall };

/* ── Кнопки карточек ───────────────────────────────────────────────────────────────────────────────────────────── */

/** Обновить данные карточки (и подпись в ней) — если сообщение своё. */
async function updateCard(message, data, html) {
  if (!message.isOwner) return;
  const content = html ? String(message.content).replace(/(<i class="fa-solid [^"]+"><\/i> )[\s\S]*?(<div class="r-card-buttons">)/, `$1${html}$2`) : message.content;
  return message.update({ content, [`flags.${SYSTEM_ID}.kol`]: data });
}

const dropButtons = message => message.isOwner && message.update({ content: String(message.content).replace(/<div class="r-card-buttons">[\s\S]*?<\/div>/, "") });

export async function koldunCardAction(message, action) {
  const d = message.getFlag(SYSTEM_ID, "kol");
  if (!d) return;
  const who = d.target ? await foundry.utils.fromUuid(d.target) : null;
  const c = d.caster ? await foundry.utils.fromUuid(d.caster) : null;
  const own = a => a && (a.isOwner || game.user.isGM);

  // вырваться из водоворота: Сила + Выживание (сл. 8) против Силы водоворота (сл. 8); Мощь (Revised) — добавочные успехи
  if (action === "kolEscape") {
    if (!own(who)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who?.name ?? "" }));
    const a = who.system.attributes, pot = d.potence ? (who.discipline?.("potence") ?? 0) : 0;
    const me = await roll({ actor: who, title: k("Escape"), subtitle: d.power, pool: (a.strength?.total ?? 1) + (who.system.abilities?.survival?.value ?? 0), difficulty: 8 });
    const vx = await roll({ actor: who, title: k("VortexRoll", { s: d.strength }), subtitle: d.power, pool: Math.min(40, d.strength), difficulty: 8 });
    if (!me || !vx) return;
    const mine = (me.successes ?? 0) + pot, theirs = vx.successes ?? 0;
    if (mine > theirs) {
      const e = who.effects.find(x => x.flags?.[SYSTEM_ID]?.kolHold);
      if (e) await e.delete();
      await dropButtons(message);
      return notice(who, d.power, k("Escaped", { a: mine, b: theirs }));
    }
    return notice(who, d.power, k(who.isVampire || who.type === "creature" ? "StillHeld" : "Drowning", { a: mine, b: theirs }));
  }

  // проверка Воли у существа в зоне (крайна Эноха)
  if (action === "kolCheck") {
    if (!own(who)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who?.name ?? "" }));
    const r = await roll({ actor: who, title: k("RollWill"), subtitle: d.power, pool: who.system.willpower?.permanent ?? 1, difficulty: d.diff });
    if (!r || (r.successes ?? 0) > 0 && r.outcome !== "botch") return r && notice(who, d.power, k("Withstood"));
    if (d.fail === "permWill") {
      const w = who.system.willpower, perm = Math.max(0, (w?.permanent ?? 1) - 1);
      await who.update({ "system.willpower.permanent": perm, "system.willpower.temporary": Math.min(w?.temporary ?? 0, perm) });
      return notice(who, d.power, k("LostPermWill", { n: perm }));
    }
    const what = { deathVision: k("FailDeathVision", { n: d.n }), harrowing: k("FailHarrowing"), "void": k("FailVoid") }[d.fail] ?? "";
    await effect(who, d.power, what, { kolFail: d.fail }, { dur: d.fail === "deathVision" ? "manual" : "scene" });
    return notice(who, d.power, what);
  }

  // цена колдуну по окончании силы
  if (action === "kolEnd") {
    if (!own(who)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who?.name ?? "" }));
    await dropButtons(message);
    const z = who.effects.find(x => x.flags?.[SYSTEM_ID]?.kolZone);
    if (z) await z.delete();
    for (const e of who.effects.filter(x => x.flags?.[SYSTEM_ID]?.sunBashing)) await e.delete();
    if (d.end === "pond") {
      await who.applyDamage(2, "lethal");
      const lose = Math.ceil(d.n / 2);
      if (who.hasBlood) await who.update({ "system.blood.value": Math.max(0, (who.system.blood?.value ?? 0) - lose) });
      return notice(who, d.power, k("EndPond", { b: lose }));
    }
    if (d.end === "void") { await who.applyDamage(2, "aggravated"); return notice(who, d.power, k("EndVoid")); }
    return notice(who, d.power, k(d.end === "eyes" ? "EndEyes" : "EndSkin"));
  }

  // демон или инферналист сопротивляется изгнанию: 1 Воля и Воля (сл. — постоянная Воля колдуна)
  if (action === "kolResist") {
    if (!own(who)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who?.name ?? "" }));
    if (!(await who.spendWillpower(1))) return;
    const r = await roll({ actor: who, title: k("Resist"), subtitle: d.power, pool: who.system.willpower?.permanent ?? 1, difficulty: Math.clamp(d.diff, 2, 10) });
    if (!r) return;
    await dropButtons(message);
    return notice(who, d.power, k((r.successes ?? 0) > 0 && r.outcome !== "botch" ? "ResistOk" : "Banished"));
  }

  // цепи Жатвы: цель рвёт одну (1 Воля, Воля против постоянной Воли колдуна); колдун требует имя (Интеллект + Запугивание, сл. — Воля цели)
  if (action === "kolChain") {
    if (!own(who)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who?.name ?? "" }));
    if (!(await who.spendWillpower(1))) return;
    const r = await roll({ actor: who, title: k("BreakChain"), subtitle: d.power, pool: who.system.willpower?.permanent ?? 1, difficulty: Math.clamp(d.diff, 2, 10) });
    if (!r || !((r.successes ?? 0) > 0 && r.outcome !== "botch")) return r && notice(who, d.power, k("ChainHolds", { n: d.left }));
    const left = d.left - 1, e = who.effects.find(x => x.flags?.[SYSTEM_ID]?.kolChains);
    if (left <= 0) { if (e) await e.delete(); await dropButtons(message); return notice(who, d.power, k("ChainsFree")); }
    if (e) await e.update({ name: k("ChainsName", { n: left }), [`flags.${SYSTEM_ID}.kolChains`]: left });
    await updateCard(message, { ...d, left }, k("ChainsCard", { name: esc(who.name), n: left }));
    return notice(who, d.power, k("ChainBroken", { n: left }));
  }
  if (action === "kolName") {
    if (!own(c)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: c?.name ?? "" }));
    const diff = Math.clamp(who?.system.willpower?.temporary ?? 6, 2, 10);
    const r = await roll({ actor: c, title: k("DemandName"), subtitle: d.power, pool: (c.system.attributes.intelligence?.total ?? 1) + (c.system.abilities?.intimidation?.value ?? 0), difficulty: diff });
    if (!r) return;
    return notice(c, d.power, k((r.successes ?? 0) > 0 && r.outcome !== "botch" ? "NameGiven" : "NameKept", { name: who?.name ?? "" }));
  }

  // Выдох Купалы: выброс — эффект «Гостеприимства Пьетросу» на отмеченных; взрыв — 5 кубов летального (вампирам губительного)
  if (action === "kolGas" || action === "kolBoom") {
    if (!own(c)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: c?.name ?? "" }));
    const hit = marked(c);
    if (!hit.length) return ui.notifications.warn(k("MarkZone"));
    if (action === "kolBoom") {
      const { rollDamage } = await import("../../dice/roll.mjs");
      for (const v of hit) await rollDamage({ actor: c, pool: 5, damageType: v.isVampire ? "aggravated" : "lethal", title: k("Explode"), target: v.uuid, supernatural: true });
      return dropButtons(message);
    }
    if (d.left < 1) return ui.notifications.warn(k("GasEmpty"));
    for (const v of hit) await effect(v, d.power, t("PathNote.KGale"), {}, { dur: "scene" });
    const left = d.left - 1;
    await updateCard(message, { ...d, left }, k("GasCard", { power: esc(d.power), n: left, turns: "—" }));
    return notice(c, d.power, k("GasErupted", { names: hit.map(v => v.name).join(", "), n: left }));
  }

  // растение-ловушка: захват пулом (6, +1 за ход до 10)
  if (action === "kolGrab") {
    const hit = marked(c);
    const r = await roll({ actor: c, title: k("Grab", { n: d.pool }), subtitle: d.power, pool: d.pool, difficulty: 6 });
    if (!r) return;
    const pool = Math.min(10, d.pool + 1);
    await updateCard(message, { ...d, pool }, null);
    if (message.isOwner) await message.update({ content: String(message.content).replace(/(data-r-action="kolGrab"[^>]*>[\s\S]*?<\/i> )[^<]*/, `$1${esc(k("Grab", { n: pool }))}`) });
    if ((r.successes ?? 0) < 1 || r.outcome === "botch") return notice(c, d.power, k("GrabMiss"));
    for (const v of hit) if (v.isOwner) await effect(v, d.power, k("GrabDesc"), { dot: { type: "bashing", soak: true } }, { dur: "scene", statuses: [KHELD] });
    return notice(c, d.power, k("GrabHit", { names: hit.map(v => v.name).join(", ") || "—" }));
  }
}
