// module/apps/bloodlines.mjs
// Силы кровных линий (V20, уровни 1–5): Мельпомения, Обеа, Огам, Сангвинус, Спиритус, Танатозис, Темпорис.
// Вызывается из apps/target-powers.mjs:
//   bloodRoll  — до броска: вопросы, цена, обработка итога (силы на себя — сразу, на цель — кнопкой на карточке);
//   bloodApply — кнопка на карточке: итог на цели (владелец цели или рассказчик).
// «Правило системы» — там, где текст V20 оставляет решение рассказчику, а автоматике нужно число; такие места помечены.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { ask, notice, done, untilOf, supernatural } from "./target-powers.mjs";
import { allowAnyway } from "./rule-gate.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.BL.${k}`, d) : game.i18n.localize(`VTM20.BL.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const clockApi = async () => ({ ...(await import("./calendar.mjs")), ...(await import("./timers.mjs")) });
const roll = async o => (await import("../dice/roll.mjs")).rollPool(o);
const gmAndMe = () => [game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)];
const icon = disc => Codex.disciplineIcon(disc);
const fxData = (disc, name, desc, flags, extra = {}) => ({ name, img: icon(disc), description: `<p>${esc(desc)}</p>`, flags: { [SYSTEM_ID]: flags }, ...extra });
const addFx = async (actor, data) => (await actor.createEmbeddedDocuments("ActiveEffect", [data]))[0];
const say = (actor, ico, title, text, whisper = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), ...(whisper ? { whisper: gmAndMe() } : {}),
  content: `<div class="r-notice"><i class="fa-solid ${ico}"></i> <b>${esc(title)}</b>: ${esc(text)}</div>` });
const health = a => { const h = a.system.health ?? {}; return { bashing: h.bashing ?? 0, lethal: h.lethal ?? 0, aggravated: h.aggravated ?? 0 }; };
const dmgTotal = a => { const h = health(a); return h.bashing + h.lethal + h.aggravated; };
const dmgLabel = ty => game.i18n.localize(VTM20.damageTypes[ty]?.label ?? ty);
const marked = actor => [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);

/** Карточка «наложить» без броска: итог на чужой цели — её владелец или рассказчик. */
function applyCard(actor, link, text, label, ico = "fa-hand", more = {}) {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { targetApply: { ...link, actorUuid: actor.uuid, ...more } } },
    content: `<div class="r-notice"><i class="fa-solid ${ico}"></i> <b>${esc(link.powerName)}</b> → ${esc(link.targetName)}: ${esc(text)}
      <div class="r-card-buttons"><button type="button" data-r-action="targetApply"><i class="fa-solid fa-check"></i> ${esc(label)}</button></div></div>` });
}

/** Свою цель — сразу; чужую — карточкой. */
async function onTarget(actor, target, link, more, text, label, ico) {
  if (target === actor || target.isOwner) {
    const { applyFromCard } = await import("./target-powers.mjs");
    const msg = await applyCard(actor, link, text, label, ico, more);
    return applyFromCard(msg);
  }
  return applyCard(actor, link, text, label, ico, more);
}

/** Ансамбль Дочерей Какофонии: каждая аккомпанирующая — −1 к сложности, не ниже 3. */
async function ensemble(title) {
  const k = await ask(title, [["0", t("Solo")], ["1", t("Ens", { n: 1 })], ["2", t("Ens", { n: 2 })], ["3", t("Ens", { n: 3 })], ["4", t("Ens", { n: 4 })]]);
  return k == null ? null : Number(k);
}

/* ── Кнопки на карточках урона: Алые узоры ─────────────────────────────── */

/** Огам 2: раз за время действия — кубы урона к одной атаке ближнего боя. Возвращает число кубов (0 — нет). */
export async function woadBonus(actor, ranged) {
  if (!actor || ranged) return 0;
  const e = actor.effects.find(x => !x.disabled && Number(x.flags?.[SYSTEM_ID]?.woadDice) > 0);
  if (!e) return 0;
  const n = Number(e.flags[SYSTEM_ID].woadDice);
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: e.name, icon: "fa-solid fa-paintbrush" }, classes: ["vtm20", "r-dialog"],
    content: `<p>${esc(t("WoadAsk", { n }))}</p>`, rejectClose: false });
  if (!ok) return 0;
  await e.setFlag(SYSTEM_ID, "woadDice", 0);
  return n;
}

/** Огам 4, Знак Солнца: огонь или солнце — Выносливость (сл. 8), успех — тяжёлые вместо губительных. */
export async function sunMark(target, damageType, { fire, sun }) {
  if (damageType !== "aggravated" || !(fire || sun)) return damageType;
  const e = target.effects.find(x => !x.disabled && x.flags?.[SYSTEM_ID]?.sunMark);
  if (!e) return damageType;
  const res = await roll({ actor: target, title: e.name, pool: target.system.attributes?.stamina?.total ?? 1, difficulty: 8, kind: "check", noBotch: true });
  if ((res?.successes ?? 0) < 1) return damageType;
  await say(target, "fa-sun", e.name, t("SunOk"));
  return "lethal";
}

/* ── До броска ─────────────────────────────────────────────────────────── */

/**
 * @returns {{stop: any}|{roll: object}|undefined}  stop — вернуть из rollTargetPower (null — отмена); roll — новый бросок.
 */
export async function bloodRoll({ actor, p, tp, target, key, link, roll: base, opts, virt = null, again = null }) {
  const k = tp.kind;
  let r = { ...base };

  if (k === "virtuosa") {
    // Мельпомения 5: Незримый собеседник или Зов Сирен — на Выносливость + Исполнение слушателей;
    // 1 кровь за каждую дополнительную пятёрку после первой цели; броски и цена самой силы — как обычно
    const list = Codex.discipline("melpominee")?.powers ?? [];
    const EN = { phantom: "Phantom Speaker", siren: "Siren's Beckoning" };
    const pw = c => list.find(x => x.en === EN[c] && x.level <= 5);
    const which = await ask(p.name, [["phantom", pw("phantom")?.name ?? EN.phantom], ["siren", pw("siren")?.name ?? EN.siren]]);
    if (!which) return { stop: null };
    const crowd = marked(actor), max = (actor.system.attributes?.stamina?.total ?? 0) + (actor.system.abilities?.performance?.value ?? 0);
    let n = crowd.length;
    if (which === "siren" && !n) { ui.notifications.info(t("VirtMark")); return { stop: null }; }
    if (!n) {
      n = Number(await ask(p.name, Array.from({ length: Math.clamp(max, 1, 12) }, (_, i) => [String(i + 1), t("VirtCount", { n: i + 1, b: Math.ceil(i / 5) })])));
      if (!n) return { stop: null };
    }
    if (n > max && !(await allowAnyway(actor, t("VirtMax", { n, max })))) return { stop: null };
    const extra = Math.ceil(Math.max(0, n - 1) / 5);
    if (extra && !(await actor.spendBlood(extra, { reason: p.name }))) return { stop: null };
    const { TARGET_POWERS } = await import("./target-powers.mjs");
    return { stop: await again?.(pw(which), TARGET_POWERS[`melpominee|${EN[which]}`], { n, crowd }) };
  }

  // ── Мельпомения ──
  if (k === "phantom") {
    // 2: каждый успех — ход передачи голоса, 3+ — до конца сцены; сирена своей проекции не слышит (+1 к связанным проверкам)
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const old = actor.powerEffects.find(e => e.power === "melpominee:2");
      if (old) await actor.endPower(old.effect, { quiet: true });
      const eff = await actor.startPower("melpominee:2", { blood: 0 });
      const d = n >= 3 ? t("TillScene") : t("Turns", { n });
      if (eff) await eff.update({ name: `${p.name} · ${d}` });
      return say(actor, "fa-comment-dots", p.name, `${t("PhantomDone", { d })}${virt?.n > 1 ? ` ${t("VirtN", { n: virt.n })}` : ""}`);
    };
    return { roll: r };
  }
  if (k === "madrigal") {
    // 3: эмоция по аудитории — каждый успех пятая часть слушателей; отмеченные — слушатели в порядке отметки
    const ens = await ensemble(p.name);
    if (ens == null) return { stop: null };
    const emo = await ask(p.name, ["fear", "rage", "joy", "grief", "love", "calm", "lust"].map(e => [e, t(`Emo.${e}`)]));
    if (!emo) return { stop: null };
    r = { ...r, difficulty: Math.max(3, (r.difficulty ?? 7) - ens), note: t("MadrigalNote", { e: t(`Emo.${emo}`) }) };
    const crowd = marked(actor);
    opts.more = crowd.length ? { targetPower: { key, target: crowd[0].uuid, targetName: crowd.map(x => x.name).join(", "), powerName: p.name, actorName: actor.name,
      crowd: crowd.map(x => x.uuid), emotion: emo } } : null;
    if (!crowd.length) opts.onRolled = res => {
      const n = Math.min(5, res?.successes ?? 0);
      if (n > 0) return say(actor, "fa-music", p.name, t("MadrigalShare", { n, e: t(`Emo.${emo}`) }));
    };
    return { roll: r };
  }
  if (k === "siren") {
    // 4: продолжительная встречная; сложность — Воля цели, сопротивление — Воля цели против Привлекательности + Исполнения сирены
    const ens = await ensemble(p.name);
    if (ens == null) return { stop: null };
    const resist = (actor.system.attributes?.appearance?.total ?? 0) + (actor.system.abilities?.performance?.value ?? 0);
    r = { ...r, difficulty: Math.max(3, (r.difficulty ?? 7) - ens) };
    if (link) opts.more = { targetPower: { ...link, sirenResist: Math.clamp(resist, 2, 10) } };
    // Виртуозность: один бросок сирены на всех; сложность — самая сильная Воля среди слушателей (правило системы),
    // сопротивляется и копит успехи каждый отдельно
    if (virt?.crowd?.length > 1 && link) {
      const top = Math.max(...virt.crowd.map(x => x.system.willpower?.temporary ?? 0));
      r = { ...r, difficulty: Math.max(3, Math.clamp(top, 2, 10) - ens), note: t("SirenCrowd", { n: virt.crowd.length, w: top }) };
      opts.more = { targetPower: { ...link, targetName: virt.crowd.map(x => x.name).join(", "), crowd: virt.crowd.map(x => x.uuid), sirenResist: Math.clamp(resist, 2, 10) } };
    }
    return { roll: r };
  }

  // ── Обеа ──
  if (k === "sano") {
    // 3: без броска, ход; 1 кровь — лёгкое или тяжёлое, 2 крови — губительное; одно повреждение за применение
    const who = target ?? actor, h = health(who);
    const opts2 = [["bashing", t("SanoB")], ["lethal", t("SanoL")], ["aggravated", t("SanoA")]].filter(([ty]) => h[ty] > 0);
    if (!opts2.length) { ui.notifications.info(t("NothingToHeal", { name: who.name })); return { stop: null }; }
    const ty = opts2.length === 1 ? opts2[0][0] : await ask(p.name, opts2);
    if (!ty) return { stop: null };
    if (!(await actor.spendBlood(ty === "aggravated" ? 2 : 1, { reason: p.name }))) return { stop: null };
    const l = { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name };
    return { stop: await onTarget(actor, who, l, { sano: ty }, t("SanoText", { d: dmgLabel(ty) }), t("SanoApply"), "fa-hand-holding-medical") };
  }
  if (k === "shepherd") {
    // 4: 2 Воли, барьер радиусом 3 м до снятия; повторное применение — снять
    const old = actor.effects.find(e => e.flags?.[SYSTEM_ID]?.shepherd);
    if (old) { await old.delete(); return { stop: say(actor, "fa-shield-heart", p.name, t("ShepherdOff")) }; }
    if (!(await actor.spendWillpower(2))) return { stop: null };
    await addFx(actor, fxData("obeah", p.name, t("ShepherdDesc"), { shepherd: true, mode: "manual" }));
    return { stop: say(actor, "fa-shield-heart", p.name, t("ShepherdDesc")) };
  }
  if (k === "endwatch") {
    // 4: только смертный, умирающий или искренне желающий смерти; без цели — поглотить хранимую душу
    const souls = actor.getFlag(SYSTEM_ID, "obeahSouls") ?? [];
    if (!target) {
      if (!souls.length) { ui.notifications.info(t("EndNeedTarget")); return { stop: null }; }
      const i = await ask(p.name, souls.map((s, j) => [String(j), t("SoulPick", { name: s.name, n: s.n })]));
      if (i == null) return { stop: null };
      return { stop: await consumeSoul(actor, p.name, Number(i)) };
    }
    if (supernatural(target) && !(await allowAnyway(actor, t("EndMortal", { name: target.name })))) return { stop: null };
    if (!(await allowAnyway(actor, t("EndWilling", { name: target.name }), { yes: t("EndYes") }))) return { stop: null };
    opts.more = null;
    opts.onRolled = async res => {
      if (res?.outcome === "botch") { await actor.applyDamage(1, "aggravated"); return say(actor, "fa-ghost", p.name, t("EndBotch")); }
      const n = res?.successes ?? 0;
      if (n < 1) return say(actor, "fa-ghost", p.name, t("EndFail", { name: target.name }));
      const cap = Math.max(0, 13 - (Number(actor.system.generation) || 13));
      const now = actor.getFlag(SYSTEM_ID, "obeahSouls") ?? [];
      const how = await ask(p.name, [["eat", t("EndEat", { n })], ...(now.length < cap ? [["keep", t("EndKeep", { k: now.length + 1, cap })]] : [])]);
      if (how === "keep") {
        await actor.setFlag(SYSTEM_ID, "obeahSouls", [...now, { name: target.name, n }]);
        return say(actor, "fa-ghost", p.name, t("EndKept", { name: target.name, k: now.length + 1, cap }));
      }
      return healSoul(actor, p.name, n, target.name);
    };
    return { roll: r };
  }
  if (k === "menssana") {
    // 5: одно расстройство цели; неудача — сам Салюбри получает его до конца сцены
    const ders = target.items.filter(i => i.type === "derangement");
    const pick = await ask(p.name, [...ders.map(i => [i.id, i.name]), ["", t("MensOther")]].map(([v, l]) => [v || "-", l]));
    if (pick == null) return { stop: null };
    const der = ders.find(i => i.id === pick);
    const name = der?.name ?? t("MensUnnamed");
    opts.more = { targetPower: { ...link, derId: der?.id ?? "", derName: name } };
    opts.onRolled = async res => {
      if ((res?.successes ?? 0) > 0) return;
      await addFx(actor, fxData("obeah", t("MensBack", { name }), t("MensBackDesc", { name }), { mode: "scene", mind: key, by: actor.uuid }));
      return say(actor, "fa-brain", p.name, t("MensBackDesc", { name }));
    };
    return { roll: r };
  }

  // ── Огам ──
  if (k === "grove") {
    // 1: 1/2/3 крови — круг 3/6/12 м, ход ритуала за каждую; противники в роще −2 куба до конца сцены
    const b = Number(await ask(p.name, [["1", t("GroveSize", { b: 1, m: 3 })], ["2", t("GroveSize", { b: 2, m: 6 })], ["3", t("GroveSize", { b: 3, m: 12 })]]));
    if (!b) return { stop: null };
    const m = [0, 3, 6, 12][b];
    r = { ...r, blood: b, note: t("GroveNote", { b }) };
    opts.more = null;
    opts.onRolled = async res => {
      if (res?.outcome === "botch") {
        // духи обращают гнев на самого Лианнан: то, что досталось бы врагам, — ему (правило системы: −2 куба до конца сцены)
        await addFx(actor, fxData("ogham", t("GroveWrath"), t("GroveWrathDesc"), { mode: "scene", mind: key, by: actor.uuid, diceAll: -2 }));
        return say(actor, "fa-tree", p.name, t("GroveWrathDesc"));
      }
      if ((res?.successes ?? 0) < 1) return;
      const eff = await actor.startPower("ogham:1", { blood: 0 });
      if (eff) await eff.update({ name: `${p.name} · ⌀ ${m} м`, description: `<p>${esc(t("GroveDesc", { m }))}</p>` });
      return say(actor, "fa-tree", p.name, t("GroveDesc", { m }));
    };
    return { roll: r };
  }
  if (k === "woad") {
    // 2: узоры на сцену — успехи: меньше штрафов от ран, легче против Ротшрека, раз — кубы к урону в ближнем бою;
    // больше 4 уровней урона после нанесения — смываются
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const old = actor.powerEffects.find(e => e.power === "ogham:2");
      if (old) await actor.endPower(old.effect, { quiet: true });
      const eff = await actor.startPower("ogham:2", { blood: 0 });
      if (eff) await eff.update({ name: `${p.name} · ${n}`, description: `<p>${esc(t("WoadDesc", { n }))}</p>`,
        [`flags.${SYSTEM_ID}.woundEase`]: n, [`flags.${SYSTEM_ID}.rotDiff`]: -n, [`flags.${SYSTEM_ID}.woadDice`]: n, [`flags.${SYSTEM_ID}.woadFrom`]: dmgTotal(actor) });
      return say(actor, "fa-paintbrush", p.name, t("WoadDesc", { n }));
    };
    return { roll: r };
  }
  if (k === "curse") {
    // 3: 3 крови, имя цели кровью на коже; одно проклятие — где написано; действует, пока надпись цела
    const kind = await ask(p.name, ["body", "mind", "voice", "soul"].map(c => [c, t(`Curse.${c}`)]));
    if (!kind) return { stop: null };
    if (!(await actor.spendBlood(3, { reason: p.name }))) return { stop: null };
    return { stop: await onTarget(actor, target, link, { curse: kind, casterDmg: dmgTotal(actor) }, t(`CurseDesc.${kind}`), t("CurseApply"), "fa-signature") };
  }
  if (k === "moonsun") {
    // 4: символ — 3 крови и 15 минут, оба — 6 и 30; на себя или добровольца
    const who = target ?? actor;
    const kind = await ask(p.name, [["sun", t("MarkSun")], ["moon", t("MarkMoon")], ["both", t("MarkBoth")]]);
    if (!kind) return { stop: null };
    let phase = "";
    if (kind !== "sun") {
      phase = await ask(t("MarkMoon"), ["new", "waxing", "half", "waning", "full"].map(f => [f, t(`Phase.${f}`)]));
      if (!phase) return { stop: null };
    }
    if (!(await actor.spendBlood(kind === "both" ? 6 : 3, { reason: p.name, limit: false }))) return { stop: null };
    const l = { key, target: who.uuid, targetName: who.name, powerName: p.name, actorName: actor.name };
    return { stop: await onTarget(actor, who, l, { mark: kind, phase }, t(`MarkText.${kind}`), t("MarkApply"), "fa-moon") };
  }
  if (k === "drain") {
    // 5: поиск (сл. 8) → подключение (1 кровь, сцена знаков) → черпание раз за ход (сл. 7): 2 куба за успех, не больше глубины
    const src = actor.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.drainSrc);
    const stage = await ask(p.name, [["find", t("DrainFind")], ["link", t("DrainLink")], ...(src ? [["draw", t("DrainDraw", { left: src.flags[SYSTEM_ID].drainSrc.left })]] : [])]);
    if (!stage) return { stop: null };
    opts.more = null;
    if (stage === "find") {
      r = { ...r, blood: 0, difficulty: 8, note: t("DrainFindNote") };
      opts.onRolled = res => (res?.successes ?? 0) > 0 && say(actor, "fa-seedling", p.name, t("DrainFound", { n: res.successes }), true);
      return { roll: r };
    }
    if (stage === "link") {
      const depth = Number(await ask(t("DrainDepth"), [1, 2, 3, 4, 5].map(d => [String(d), t("DrainDepthOpt", { d, n: 10 * d })])));
      if (!depth) return { stop: null };
      if (!(await actor.spendBlood(1, { reason: p.name }))) return { stop: null };
      if (src) await src.delete();
      await addFx(actor, fxData("ogham", t("DrainSrc", { d: depth }), t("DrainSrcDesc", { d: depth, n: 10 * depth }), { mode: "scene", drainSrc: { depth, left: 10 * depth } }));
      return { stop: say(actor, "fa-seedling", p.name, t("DrainSrcDesc", { d: depth, n: 10 * depth })) };
    }
    r = { ...r, blood: 0, difficulty: 7, note: t("DrainDrawNote") };
    opts.onRolled = async res => {
      const n = res?.successes ?? 0, s = src.flags[SYSTEM_ID].drainSrc;
      if (n < 1) return;
      const dice = Math.min(2 * Math.min(n, s.depth), s.left), left = s.left - dice;
      const pool = actor.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.drainPool);
      if (pool) await pool.update({ [`flags.${SYSTEM_ID}.bonusPool`]: Number(pool.flags[SYSTEM_ID].bonusPool || 0) + dice });
      else await addFx(actor, fxData("ogham", t("DrainPool"), t("DrainPoolDesc"), { mode: "scene", mind: key, by: actor.uuid, drainPool: true, bonusPool: dice, poolNoFrenzy: true }));
      if (left > 0) { await src.update({ [`flags.${SYSTEM_ID}.drainSrc.left`]: left }); return say(actor, "fa-seedling", p.name, t("DrainGot", { n: dice, left })); }
      await src.delete();
      return say(actor, "fa-seedling", p.name, t("DrainEmpty", { n: dice }));
    };
    return { roll: r };
  }

  // ── Сангвинус ──
  if (k === "brother") {
    // 1: без броска, другой член круга; 1 кровь — лёгкое или тяжёлое; губительное — 5 крови вместе (можно за несколько ходов)
    const h = health(target);
    const o = [["bashing", t("BroB")], ["lethal", t("BroL")], ["aggravated", t("BroA", { n: Number(target.getFlag(SYSTEM_ID, "brotherPool") ?? 0) })]].filter(([ty]) => h[ty] > 0);
    if (!o.length) { ui.notifications.info(t("NothingToHeal", { name: target.name })); return { stop: null }; }
    const ty = o.length === 1 ? o[0][0] : await ask(p.name, o);
    if (!ty) return { stop: null };
    if (!(await actor.spendBlood(1, { reason: p.name }))) return { stop: null };
    return { stop: await onTarget(actor, target, link, { brother: ty }, t(ty === "aggravated" ? "BroAText" : "BroText"), t("SanoApply"), "fa-droplet") };
  }
  if (k === "walkcaine") {
    // 4: ступень поколения донора — получателю; не старше 4-го; 14-е поколение отдать не может
    const g = Number(actor.system.effectiveGeneration ?? actor.system.generation) || 13, tg = Number(target.system.effectiveGeneration ?? target.system.generation) || 13;
    if (!target.isVampire && !(await allowAnyway(actor, t("WalkKindred", { name: target.name })))) return { stop: null };
    if (g >= 14 && !(await allowAnyway(actor, t("Walk14")))) return { stop: null };
    if (tg <= 4 && !(await allowAnyway(actor, t("Walk4", { name: target.name })))) return { stop: null };
    await addFx(actor, fxData("sanguinus", t("WalkGave", { name: target.name }), t("WalkGaveDesc", { g: g + 1 }), { mode: "manual", genDrop: -1, walkTo: target.uuid }));
    return { stop: await onTarget(actor, target, link, {}, t("WalkText", { g: tg - 1 }), t("WalkApply"), "fa-shoe-prints") };
  }

  if (k === "octopod") {
    // 2: донор тратит 1 кровь за каждую одолженную конечность или наружный орган; у получателя они появляются в конце хода
    const PARTS = ["arm", "leg", "eye", "mouth", "other"];
    const got = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-hand" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><p>${esc(t("OctoAsk", { name: target.name }))}</p>${PARTS.map(c =>
        `<label class="r-field"><span>${esc(t(`OctoPart.${c}`))}</span><input type="number" name="${c}" value="0" min="0" max="8"></label>`).join("")}</div>`,
      ok: { label: t("OctoApply"), callback: (e, b) => Object.fromEntries(PARTS.map(c => [c, Math.max(0, Number(b.form.elements[c].value) || 0)])) } });
    if (!got) return { stop: null };
    const total = PARTS.reduce((s, c) => s + got[c], 0);
    if (!total) { ui.notifications.info(t("OctoNone")); return { stop: null }; }
    if (!(await actor.spendBlood(total, { reason: p.name }))) return { stop: null };
    const list = PARTS.filter(c => got[c]).map(c => `${t(`OctoPart.${c}`).toLowerCase()} — ${got[c]}`).join(", ");
    await addFx(actor, fxData("sanguinus", t("OctoGave", { name: target.name }), t("OctoGaveDesc", { list }), { mode: "manual", octoTo: target.uuid }));
    return { stop: await onTarget(actor, target, link, { octo: list }, t("OctoText", { list }), t("OctoApply"), "fa-hand") };
  }
  if (k === "entity") {
    // 5: каждый участник — 3 крови; слияние 3 хода; правит старший по крови; поколение — от младшего минус ступень за каждого другого
    const mergedIn = actor.effects.find(e => e.flags?.[SYSTEM_ID]?.entityOf);
    const leadNow = actor.powerEffects.some(e => e.power === "sanguinus:5") ? actor : mergedIn ? await foundry.utils.fromUuid(mergedIn.flags[SYSTEM_ID].entityOf) : null;
    if (leadNow) {
      const on = leadNow.powerEffects.find(e => e.power === "sanguinus:5");
      if (on && leadNow.isOwner) await leadNow.endPower(on.effect);
      // участников освобождает рассказчик (хук на снятие эффекта); без рассказчика в сети — сам игрок
      if (!on || !game.users.activeGM) await endEntity(leadNow.uuid);
      return { stop: null };
    }
    const all = [actor, ...marked(actor).filter(x => x.isVampire)];
    if (all.length < 2) { ui.notifications.info(t("EntityMark")); return { stop: null }; }
    const notMine = all.find(x => !x.isOwner);
    if (notMine) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: notMine.name })); return { stop: null }; }
    const poor = all.find(x => (x.system.blood?.value ?? 0) < 3);
    if (poor) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: poor.name })); return { stop: null }; }
    for (const x of all) if (!(await x.spendBlood(3, { reason: p.name, limit: false }))) return { stop: null };
    const gen = x => Number(x.system.generation) || 13;
    const lead = [...all].sort((a, b) => gen(a) - gen(b))[0];
    const more = all.length - 1, mg = Math.max(4, Math.max(...all.map(gen)) - more);
    const desc = t("EntityDesc", { n: all.length, k: more, g: mg, hp: 2 * more });
    const eff = await lead.startPower("sanguinus:5", { blood: 0 });
    if (eff) await eff.update({ name: `${p.name} · ${all.length}`, description: `<p>${esc(desc)}</p>`,
      [`flags.${SYSTEM_ID}.attrMod`]: { strength: more, stamina: more, perception: more }, [`flags.${SYSTEM_ID}.genDrop`]: gen(lead) - mg, [`flags.${SYSTEM_ID}.dicePhys`]: more });
    for (const x of all) if (x !== lead) await addFx(x, fxData("sanguinus", t("EntityIn", { name: lead.name }), t("EntityInDesc", { name: lead.name }),
      { mode: "scene", mind: key, by: actor.uuid, entityOf: lead.uuid }, { statuses: ["r-held"] }));
    return { stop: say(lead, "fa-circle-nodes", p.name, desc) };
  }

  // ── Спиритус ──
  if (k === "aidspirit") {
    // 1: каждый успех — куб в запас для проверок с этим предметом до конца сцены; новый запас заменяет прежний
    const items = actor.items.filter(i => ["weapon", "armor", "gear"].includes(i.type));
    const pick = items.length ? await ask(p.name, [...items.map(i => [i.id, i.name]), ["-", t("AidOther")]]) : "-";
    if (pick == null) return { stop: null };
    const what = items.find(i => i.id === pick)?.name ?? t("AidThing");
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const old = actor.effects.find(e => e.flags?.[SYSTEM_ID]?.aidItem === what);
      if (old) await old.delete();
      await addFx(actor, fxData("spiritus", t("AidName", { what }), t("AidDesc", { what, n }), { mode: "scene", mind: key, by: actor.uuid, aidItem: what, bonusPool: n }));
      return say(actor, "fa-hand-sparkles", p.name, t("AidDesc", { what, n }));
    };
    return { roll: r };
  }
  if (k === "spiritbeast") {
    // 2: срок по успехам — ход, 5 ходов, час, ночь, неделя; жетон зверя ставит рассказчик кнопкой на карточке
    opts.more = { targetPower: { key, target: actor.uuid, targetName: actor.name, powerName: p.name, actorName: actor.name } };
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const code = ["turn", "turns5", "hour", "night", "week"][Math.min(5, n) - 1];
      const api = await clockApi(), now = api.getClock(), until = ["turn", "turns5"].includes(code) ? null : untilOf(code, now, api);
      await addFx(actor, fxData("spiritus", t("BeastName", { d: t(`BeastDur.${code}`) }), t("BeastDesc"), { mode: until ? "timed" : "scene", ...(until ? { until } : {}), mind: key, by: actor.uuid }));
      return say(actor, "fa-paw", p.name, `${t(`BeastDur.${code}`)}. ${t("BeastDesc")}`);
    };
    return { roll: r };
  }
  if (k === "aspect") {
    // 3: один дар; ход плюс ход за каждый лишний успех
    const gift = await ask(p.name, ASPECTS.map(g => [g, t(`Aspect.${g}`)]));
    if (!gift) return { stop: null };
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const f = { mode: "scene", mind: key, by: actor.uuid, ...(ASPECT_FX[gift] ?? {}) };
      await addFx(actor, fxData("spiritus", `${t(`AspectName.${gift}`)} · ${t("Turns", { n })}`, t(`AspectDesc.${gift}`), f));
      return say(actor, "fa-paw", p.name, `${t(`AspectName.${gift}`)} · ${t("Turns", { n })}: ${t(`AspectDesc.${gift}`)}`);
    };
    return { roll: r };
  }
  if (k === "engling") {
    // 4: каждый успех — пункт текущей Воли (не выше постоянной); за применение гибнет один дух
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const w = actor.system.willpower, got = Math.max(0, Math.min(n, (w.permanent ?? 0) - (w.temporary ?? 0)));
      if (got) await actor.update({ "system.willpower.temporary": w.temporary + got });
      return say(actor, "fa-ghost", p.name, t("EnglingDone", { n: got }));
    };
    return { roll: r };
  }

  // ── Танатозис ──
  if (k === "wither") {
    const limb = await ask(p.name, [["arm", t("Limb.arm")], ["leg", t("Limb.leg")], ["head", t("Limb.head")]]);
    if (!limb) return { stop: null };
    opts.more = { targetPower: { ...link, limb } };
    return { roll: r };
  }

  // ── Темпорис ──
  if (k === "recur") {
    // 2: 1 минута + минута за лишний успех; по желанию 1 кровь — таблица (минута, 10 минут, час, 6 часов, сутки)
    const how = await ask(p.name, [["plain", t("RecurPlain")], ["blood", t("RecurBlood")]]);
    if (!how) return { stop: null };
    if (how === "blood" && !(await actor.spendBlood(1, { reason: p.name }))) return { stop: null };
    opts.more = { targetPower: { ...link, recurBlood: how === "blood" } };
    return { roll: r };
  }
  if (k === "leaden") {
    // 3: сложность по цели (кирпич 4, пуля 7, разъярённый гуль 9), группа одного рода +2
    const d = await ask(p.name, [["4", t("LeadD4")], ["5", "5"], ["6", "6"], ["7", t("LeadD7")], ["8", "8"], ["9", t("LeadD9")]]);
    if (!d) return { stop: null };
    const grp = await ask(p.name, [["0", t("LeadOne")], ["2", t("LeadGroup")]]);
    if (grp == null) return { stop: null };
    r = { ...r, difficulty: Math.min(10, Number(d) + Number(grp)), note: t("LeadNote") };
    opts.more = link ? { targetPower: { ...link } } : null;
    const prev = opts.onRolled;
    opts.onRolled = async res => {
      await prev?.(res);
      if (res?.outcome === "botch") {
        const s = Math.max(1, res.ones ?? 1), kf = 2 + Math.floor((s - 1) / 2);
        await addFx(actor, fxData("temporis", t("LeadName", { k: kf }), t("LeadDesc", { k: kf, n: Math.ceil(s / 2) }), { mode: "scene", mind: key, by: actor.uuid }));
        return say(actor, "fa-hourglass-half", p.name, t("LeadBotch", { k: kf }));
      }
      const n = res?.successes ?? 0;
      if (n > 0 && !link) return say(actor, "fa-hourglass-half", p.name, t("LeadDesc", { k: 2 + Math.floor((n - 1) / 2), n: Math.ceil(n / 2) }));
    };
    return { roll: r };
  }
  if (k === "norns") {
    opts.more = null;
    opts.onRolled = res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const d = n >= 6 ? t("NornsWeeks", { n: n - 5 }) : t(`NornsDur.${n}`);
      return say(actor, "fa-hourglass", p.name, t("NornsDone", { d }));
    };
    return { roll: r };
  }
  if (k === "clotho") {
    // 5: успехи — дополнительные действия каждый ход на половину Темпориса (вверх) ходов
    opts.more = null;
    opts.onRolled = async res => {
      const n = res?.successes ?? 0;
      if (n < 1) return;
      const turns = Math.ceil((actor.discipline?.("temporis") ?? 5) / 2);
      const old = actor.powerEffects.find(e => e.power === "temporis:5");
      if (old) await actor.endPower(old.effect, { quiet: true });
      const eff = await actor.startPower("temporis:5", { blood: 0 });
      if (eff) await eff.update({ name: `${p.name} · +${n} · ${t("Turns", { n: turns })}`, description: `<p>${esc(t("ClothoDesc", { n, turns }))}</p>`, [`flags.${SYSTEM_ID}.clotho`]: n });
      return say(actor, "fa-hourglass-start", p.name, t("ClothoDesc", { n, turns }));
    };
    return { roll: r };
  }
  return undefined;
}

/** Дары зверя (Спиритус 3): правка листа, где она у V20 числом. */
const ASPECTS = ["beaver", "chameleon", "hare", "falcon", "cougar", "frog", "dog", "snake", "cricket", "squirrel", "bear", "deer"];
const ASPECT_FX = {
  chameleon: { diffTraits: [["abilities.stealth", -2]] },
  hare: { fxDiff: { hearing: -2 } },
  falcon: { fxDiff: { vision: -3 } },
  cougar: { diffTraits: [["virtues.courage", -2]] },
  bear: { attrMod: { strength: 2 } },
  squirrel: { fxDiff: { climb: -2 } }
};

/** Конец бдения: успехи поглощённой души — лечение лёгких и тяжёлых (сначала тяжёлые — правило системы). */
async function healSoul(actor, power, n, name) {
  let left = n;
  for (const ty of ["lethal", "bashing"]) {
    const k = Math.min(left, health(actor)[ty]);
    if (k) { await actor.healDamage(ty, k); left -= k; }
  }
  return say(actor, "fa-ghost", power, t("EndHealed", { name, n: n - left }));
}
async function consumeSoul(actor, power, i) {
  const souls = [...(actor.getFlag(SYSTEM_ID, "obeahSouls") ?? [])], s = souls[i];
  if (!s) return null;
  souls.splice(i, 1);
  await actor.setFlag(SYSTEM_ID, "obeahSouls", souls);
  return healSoul(actor, power, s.n, s.name);
}

/* ── Кнопка на карточке ───────────────────────────────────────────────── */

export const BLOOD_APPLY = new Set(["madrigal", "siren", "sano", "menssana", "curse", "moonsun", "brother", "walkcaine", "putrefy", "wither", "necrosis", "recur", "leaden", "octopod", "spiritbeast"]);
/** Без кнопки «наложить» на карточке броска: итог — сразу на самом персонаже. */
export const BLOOD_SELF = ["phantom", "endwatch", "grove", "woad", "drain", "aidspirit", "aspect", "engling", "norns", "clotho", "shepherd"];

export async function bloodApply({ message, state, x, tp, target, n, flags, now, api }) {
  const k = tp.kind, disc = x.key.split("|")[0];
  const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const put = (name, desc, f = {}, extra = {}) => addFx(target, fxData(disc, name, desc, { ...flags, ...f }, extra));

  if (k === "madrigal") {
    // пятая часть слушателей за успех — первые по порядку отметки; заметивший внешнее влияние может потратить Волю
    const crowd = (await Promise.all((x.crowd ?? [x.target]).map(u => foundry.utils.fromUuid(u)))).filter(Boolean);
    const take = Math.min(crowd.length, Math.ceil(crowd.length * Math.min(5, n) / 5));
    await done(message, state, x);
    const hit = [];
    for (const who of crowd.slice(0, take)) {
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      await addFx(who, fxData("melpominee", t("MadrigalName", { e: t(`Emo.${x.emotion}`) }), t("MadrigalDesc", { e: t(`Emo.${x.emotion}`) }), { ...flags, mode: "scene" }));
      hit.push(who.name);
    }
    return notice(target, x.powerName, hit.length ? t("MadrigalHit", { names: hit.join(", ") }) : t("MadrigalNone"));
  }
  if (k === "siren") {
    // сопротивление — Воля против Привлекательности + Исполнения сирены; чистые успехи копятся до 5.
    // Виртуозность: каждый слушатель сопротивляется и копит успехи отдельно
    const listeners = x.crowd?.length ? (await Promise.all(x.crowd.map(u => foundry.utils.fromUuid(u)))).filter(Boolean) : [target];
    await done(message, state, x);
    for (const who of listeners) {
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      const res = await roll({ actor: who, title: t("SirenResist"), pool: who.system.willpower?.permanent ?? 0, difficulty: x.sirenResist ?? 6, kind: "check", noBotch: true });
      const net = Math.max(0, n - (res?.successes ?? 0));
      const prog = who.effects.find(e => e.flags?.[SYSTEM_ID]?.siren?.by === state.actorUuid);
      const got = (prog?.flags[SYSTEM_ID].siren.got ?? 0) + net;
      if (got < 5) {
        if (prog) await prog.update({ name: t("SirenProg", { name: x.actorName, n: got }), [`flags.${SYSTEM_ID}.siren.got`]: got });
        else await addFx(who, fxData(disc, t("SirenProg", { name: x.actorName, n: got }), t("SirenProgDesc"), { ...flags, mode: "manual", siren: { by: state.actorUuid, got } }));
        await notice(who, x.powerName, t("SirenStep", { n: net, got }));
        continue;
      }
      if (prog) await prog.delete();
      // ночь за каждый чистый успех сверх 5 (ровно 5 — одна ночь, правило системы); 20 — навсегда
      const forever = got >= 20, nights = Math.max(1, got - 5);
      const until = forever ? null : now + nights * api.MS_DAY;
      await addFx(who, fxData(disc, t("SirenName", { name: x.actorName }), forever ? t("SirenForever") : t("SirenNights", { n: nights }),
        { ...flags, mode: forever ? "manual" : "timed", ...(until ? { until } : {}) }));
      await notice(who, x.powerName, forever ? t("SirenForever") : t("SirenNights", { n: nights }));
    }
    return null;
  }
  if (k === "octopod") {
    await done(message, state, x);
    await put(t("OctoGot", { name: x.actorName }), t("OctoGotDesc", { list: x.octo }), { mode: "manual" });
    return notice(target, x.powerName, t("OctoGotDesc", { list: x.octo }));
  }
  if (k === "spiritbeast") {
    // жетон зверя местного вида — рядом с вампиром (справочник зверей, как у Зова)
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.TP.GMOnly"));
    const { animalTemplates, spawnFromTemplate } = await import("./npc-gen.mjs");
    const list = await animalTemplates();
    const pick = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t("BeastWho"))}</span><select name="k">${list.map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join("")}</select></label></div>`,
      ok: { label: t("BeastGo"), callback: (e, b) => b.form.elements.k.value } });
    if (!pick) return null;
    const tpl = list.find(a => a.key === pick);
    await done(message, state, x);
    const made = await spawnFromTemplate(tpl, { name: t("BeastToken", { name: tpl.name, who: target.name }) });
    const tok = target.getActiveTokens?.()[0];
    if (made && tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", [await made.getTokenDocument({ x: tok.document.x + canvas.grid.size, y: tok.document.y + canvas.grid.size })]);
    return notice(target, x.powerName, t("BeastCame", { name: tpl.name }));
  }
  if (k === "sano") {
    await target.healDamage(x.sano, 1);
    await done(message, state, x);
    return notice(target, x.powerName, t("SanoDone", { d: dmgLabel(x.sano) }));
  }
  if (k === "menssana") {
    await done(message, state, x);
    // врождённое расстройство Малкавиана — только подавить до конца сцены
    const mal = target.system.clan === "malkavian" && await ask(x.powerName, [["cure", t("MensCure", { name: x.derName })], ["innate", t("MensInnate")]]) === "innate";
    if (mal) {
      await put(t("MensSupp", { name: x.derName }), t("MensSuppDesc"), { mode: "scene" });
      return notice(target, x.powerName, t("MensSuppDesc"));
    }
    if (x.derId && target.items.get(x.derId)) await target.items.get(x.derId).delete();
    return notice(target, x.powerName, t("MensCured", { name: x.derName }));
  }
  if (k === "curse") {
    await done(message, state, x);
    const vamp = target.isVampire;
    const f = { mode: "manual", ogCurse: { by: state.actorUuid, from: x.casterDmg ?? 0 } };
    if (x.curse === "body") Object.assign(f, vamp ? { noBloodSpend: true } : { diffPhys: 2, woundWorse: 1 });
    if (x.curse === "mind") Object.assign(f, { curseMind: true });
    if (x.curse === "soul") Object.assign(f, { frenzyDiff: 2 });
    await put(t("CurseName", { c: t(`Curse.${x.curse}`), name: x.actorName }), `${t(`CurseDesc.${x.curse}`)} ${t("CurseResist")}`, f);
    if (x.curse === "soul" && !vamp) await notice(target, x.powerName, t("CurseFlee"));
    return notice(target, x.powerName, t(`CurseDesc.${x.curse}`));
  }
  if (k === "moonsun") {
    await done(message, state, x);
    const lines = [];
    if (x.mark !== "moon") { await put(t("SunName"), t("SunDesc"), { mode: "manual", sunMark: true }); lines.push(t("SunDesc")); }
    if (x.mark !== "sun") {
      await put(`${t("MoonName")} · ${t(`Phase.${x.phase}`)}`, `${t("MoonDesc")} ${t(`PhaseDesc.${x.phase}`)}`, { mode: "manual", frenzyDiff: 1, traitDice: MOON[x.phase] });
      lines.push(`${t("MoonDesc")} ${t(`PhaseDesc.${x.phase}`)}`);
    }
    return notice(target, x.powerName, lines.join(" "));
  }
  if (k === "brother") {
    await done(message, state, x);
    if (x.brother !== "aggravated") { await target.healDamage(x.brother, 1); return notice(target, x.powerName, t("SanoDone", { d: dmgLabel(x.brother) })); }
    const pool = Number(target.getFlag(SYSTEM_ID, "brotherPool") ?? 0) + 1;
    if (pool < 5) { await target.setFlag(SYSTEM_ID, "brotherPool", pool); return notice(target, x.powerName, t("BroPool", { n: pool })); }
    await target.setFlag(SYSTEM_ID, "brotherPool", 0);
    await target.healDamage("aggravated", 1);
    return notice(target, x.powerName, t("SanoDone", { d: dmgLabel("aggravated") }));
  }
  if (k === "walkcaine") {
    // не знающий силу получатель — Выносливость + Шестое чувство (сл. 7); неудача — ступень не принята
    const knows = (target.discipline?.("sanguinus") ?? 0) >= 4;
    if (!knows) {
      const res = await roll({ actor: target, title: t("WalkJoin"), pool: (target.system.attributes?.stamina?.total ?? 0) + (target.system.abilities?.awareness?.value ?? 0), difficulty: 7, kind: "check" });
      if ((res?.successes ?? 0) < 1) {
        await done(message, state, x);
        const gave = self?.effects.find(e => e.flags?.[SYSTEM_ID]?.walkTo === target.uuid);
        if (gave && self.isOwner) await gave.delete();
        return notice(target, x.powerName, t("WalkFail"));
      }
    }
    await done(message, state, x);
    const g = Number(target.system.effectiveGeneration ?? target.system.generation) || 13;
    await put(t("WalkGot", { name: x.actorName }), t("WalkGotDesc", { g: Math.max(4, g - 1) }), { mode: "manual", genDrop: 1 });
    return notice(target, x.powerName, t("WalkGotDesc", { g: Math.max(4, g - 1) }));
  }
  if (k === "putrefy" || k === "necrosis") {
    // Гниение: 1 тяжёлое и −1 Привлекательность (у вампира — до следующей ночи, у смертного — постоянно);
    // Некроз: тяжёлое за успех и потеря черт по таблице — до исцеления этих ран (снимается вручную)
    await done(message, state, x);
    const { postFixedDamage } = await import("../data/combat-powers.mjs");
    if (k === "putrefy") {
      const until = target.hasBlood ? untilOf("night", now, api) : null;
      await put(t("PutrefyName"), target.hasBlood ? t("PutrefyVamp") : t("PutrefyMortal"), { mode: until ? "timed" : "manual", ...(until ? { until } : {}), attrMod: { appearance: -1 } });
      await postFixedDamage(self, target, { amount: 1, type: "lethal", soakDiff: 6, title: x.powerName });
      return notice(target, x.powerName, target.hasBlood ? t("PutrefyVamp") : t("PutrefyMortal"));
    }
    const mod = NECROSIS[Math.min(5, n)];
    if (Object.keys(mod).length) await put(t("NecrosisName"), t("NecrosisDesc"), { mode: "manual", attrMod: mod });
    await postFixedDamage(self, target, { amount: n, type: "lethal", soakDiff: 6, title: x.powerName });
    return notice(target, x.powerName, t("NecrosisDone", { n }));
  }
  if (k === "wither") {
    // 1–2 успеха — 1 лёгкое (поглощается); 3+ — конечность омертвела без урона
    await done(message, state, x);
    if (n < 3) {
      const { postFixedDamage } = await import("../data/combat-powers.mjs");
      await postFixedDamage(self, target, { amount: 1, type: "bashing", soakDiff: 6, title: x.powerName });
      return notice(target, x.powerName, t("WitherHurt"));
    }
    if (x.limb === "head" && !supernatural(target)) {
      await target.toggleStatusEffect?.("dead", { active: true, overlay: true });
      return notice(target, x.powerName, t("WitherHeadMortal"));
    }
    // у смертных навсегда; у сверхъестественных — до следующей ночи (правило системы: «проявляется на следующую ночь»)
    const sup = supernatural(target), until = sup ? untilOf("night", now, api) : null;
    const head = x.limb === "head";
    await put(t(`WitherName.${x.limb}`), t(head ? "WitherHeadVamp" : `WitherDesc.${x.limb}`),
      { mode: until ? "timed" : "manual", ...(until ? { until } : {}), ...(head ? { attrMod: { perception: -2, intelligence: -2, wits: -2 }, noMindDisc: true } : {}) });
    return notice(target, x.powerName, t(head ? "WitherHeadVamp" : `WitherDesc.${x.limb}`));
  }
  if (k === "recur") {
    const min = x.recurBlood ? [1, 10, 60, 360, 1440][Math.min(5, n) - 1] : n;
    await done(message, state, x);
    await put(t("RecurName", { name: x.actorName }), t("RecurDesc", { d: t("Minutes", { n: min }) }), { mode: "timed", until: now + min * 60000 }, { statuses: ["r-held"] });
    return notice(target, x.powerName, t("RecurDesc", { d: t("Minutes", { n: min }) }));
  }
  if (k === "leaden") {
    const kf = 2 + Math.floor((n - 1) / 2), turns = Math.ceil(n / 2);
    await done(message, state, x);
    await put(t("LeadName", { k: kf }), t("LeadDesc", { k: kf, n: turns }), { mode: "scene" });
    return notice(target, x.powerName, t("LeadDesc", { k: kf, n: turns }));
  }
  return null;
}

/** Некроз: потеря черт по числу успехов (V20). */
const NECROSIS = { 0: {}, 1: {}, 2: { appearance: -1 }, 3: { appearance: -1, dexterity: -1 }, 4: { appearance: -1, dexterity: -1, strength: -1 }, 5: { appearance: -2, dexterity: -1, strength: -1 } };
/** Знак Луны: +1 куб по фазе — к проверкам с этими чертами. */
const MOON = {
  new: [["attributes.dexterity", 1], ["abilities.stealth", 1]], waxing: [["attributes.wits", 1], ["abilities.occult", 1]],
  half: [["attributes.perception", 1], ["abilities.subterfuge", 1]], waning: [["attributes.charisma", 1], ["abilities.performance", 1]],
  full: [["attributes.strength", 1], ["abilities.brawl", 1]]
};

/** Кровное единство распалось: участники свободны. */
async function endEntity(leadUuid) {
  for (const a of game.actors) for (const e of [...a.effects]) if (e.flags?.[SYSTEM_ID]?.entityOf === leadUuid && a.isOwner) await e.delete();
}

/* ── Слежение ─────────────────────────────────────────────────────────── */

let hooked = false;
/** Алые узоры смываются после 4+ уровней урона; Начертание проклятья — после 3+ уровней урона Лианнан. */
export function registerBloodlines() {
  if (hooked) return;
  hooked = true;
  // эффект Кровного единства снят с правящего (вручную или концом сцены) — освободить остальных
  Hooks.on("deleteActiveEffect", async effect => {
    if (!game.users.activeGM?.isSelf || effect.flags?.[SYSTEM_ID]?.power !== "sanguinus:5" || effect.parent?.documentName !== "Actor") return;
    await endEntity(effect.parent.uuid);
  });
  Hooks.on("updateActor", async (actor, change) => {
    // вайда и проклятия Огама слетают от ран: прочие правки персонажа (а их большинство) сюда не заходят
    if (!game.users.activeGM?.isSelf || actor.documentName !== "Actor" || !foundry.utils.hasProperty(change, "system.health")) return;
    const hurt = dmgTotal(actor);
    const woad = actor.effects.find(e => !e.disabled && e.flags?.[SYSTEM_ID]?.woadFrom != null);
    if (woad && hurt - Number(woad.flags[SYSTEM_ID].woadFrom) > 4) {
      await woad.delete();
      await say(actor, "fa-paintbrush", woad.name, t("WoadGone"));
    }
    for (const a of game.actors) for (const e of a.effects) {
      const c = e.flags?.[SYSTEM_ID]?.ogCurse;
      if (!c || !String(c.by).endsWith(`Actor.${actor.id}`) || hurt - Number(c.from ?? 0) <= 3) continue;
      await e.delete();
      await say(a, "fa-signature", e.name, t("CurseGone"));
    }
  });
}
