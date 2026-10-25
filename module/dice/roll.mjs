// module/dice/roll.mjs
// Броски V20 (V20_Основные_правила/03, 04):
//   · пул d10 против сложности 2–10 (по умолчанию 6); «10» — всегда успех;
//   · каждая «1» отменяет один успех; провал — ни одного успеха на костях и хотя бы одна «1»;
//   · специализация: каждая «10» даёт 2 успеха;
//   · 1 пункт воли — автоматический успех, который единицы не отменяют (провала уже не будет);
//   · сложность выше 10 не поднимается — каждый лишний пункт требует ещё одного успеха.
//
// Кости — настоящие Roll'ы Foundry (Dice So Nice их покажет), итог считаем сами.

import { VTM20, SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { combatPowerOf, combatPowerLabel } from "../data/combat-powers.mjs";
import { themeClass } from "../ui/themes.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

const DIE_APPEARANCE = {
  colorset: "custom", foreground: "#1d2333", background: "#efe3c8", outline: "#5b4a2f", edge: "#b9a37a",
  texture: "paper", material: "plastic", font: "Prata"
};

/* ── Подсчёт ──────────────────────────────────────────────────────────── */

/**
 * @param {number[]} values
 * @param {object} o { difficulty, specialty, willpower, extraNeeded }
 */
export function evaluate(values, { difficulty = 6, specialty = false, willpower = false, extraNeeded = 0, noBotch = false, auto = 0 } = {}) {
  const diff = Math.clamp(difficulty, 2, 10);
  const hits = values.filter(v => v >= diff).length;
  const tens = values.filter(v => v === 10).length;
  const ones = values.filter(v => v === 1).length;
  const raw = hits + (specialty ? tens : 0);
  const dice = Math.max(0, raw - ones);
  const successes = dice + (willpower ? 1 : 0) + (auto || 0);
  const net = Math.max(0, successes - extraNeeded);
  let outcome;
  if (net > 0) outcome = "success";
  else if (!noBotch && hits === 0 && ones > 0 && !willpower && !auto) outcome = "botch";
  else outcome = "failure";
  const degree = outcome === "success" ? VTM20.successDegrees[Math.min(net, 5)] : null;
  return { successes: net, raw, ones, hits, tens, outcome, degree, difficulty: diff };
}

/**
 * Шансы проверки по тем же правилам, что evaluate(): единицы отменяют успехи, со специализацией 10 — два успеха,
 * успех воли и автоуспехи не отменяются; провал — ни одного успеха на кубах и хотя бы одна единица.
 * @returns {{success:number, failure:number, botch:number, mean:number}|null} доли 0…1 и среднее число успехов
 */
export function odds({ pool = 0, difficulty = 6, specialty = false, willpower = false, auto = 0, noBotch = false } = {}) {
  const diff = Math.clamp(difficulty, 2, 10);
  const n = Math.max(0, Math.min(40, Math.floor(pool)));
  const sure = (willpower ? 1 : 0) + (auto || 0);
  if (!n) return { success: sure ? 1 : 0, failure: sure ? 0 : 1, botch: 0, mean: sure };
  const pOne = .1, pTen = .1, pHit = (10 - diff) / 10, pMiss = 1 - pOne - pTen - pHit;   // 10 — всегда успех
  const tenVal = specialty ? 2 : 1;
  // состояние: «успехи на кубах|единицы|был ли хоть один успех»
  let st = new Map([["0|0|0", 1]]);
  for (let i = 0; i < n; i++) {
    const next = new Map();
    const add = (k, p) => next.set(k, (next.get(k) ?? 0) + p);
    for (const [k, p] of st) {
      const [r, o, h] = k.split("|").map(Number);
      add(`${r}|${o + 1}|${h}`, p * pOne);
      if (pMiss > 0) add(`${r}|${o}|${h}`, p * pMiss);
      if (pHit > 0) add(`${r + 1}|${o}|1`, p * pHit);
      add(`${r + tenVal}|${o}|1`, p * pTen);
    }
    st = next;
  }
  const out = { success: 0, failure: 0, botch: 0, mean: 0 };
  for (const [k, p] of st) {
    const [r, o, h] = k.split("|").map(Number);
    const net = Math.max(0, r - o) + sure;
    out.mean += p * net;
    if (net > 0) out.success += p;
    else if (!noBotch && !h && o > 0 && !sure) out.botch += p;
    else out.failure += p;
  }
  return out;
}

/** Шансы для шаблона: проценты и среднее с одним знаком. */
export function chancesView(o) {
  const pct = x => Math.round(x * 100);
  return { success: pct(o.success), failure: pct(o.failure), botch: pct(o.botch),
    mean: o.mean.toLocaleString(game.i18n.lang, { maximumFractionDigits: 1 }) };
}

function dieView(v, diff, specialty) {
  const cls = [];
  if (v === 1) cls.push("is-one");
  else if (v >= diff) cls.push("is-hit");
  else cls.push("is-miss");
  if (v === 10) cls.push("is-ten");
  if (v === 10 && specialty) cls.push("is-double");
  return { value: v, cls: cls.join(" ") };
}

/* ── Основной бросок ──────────────────────────────────────────────────── */

/**
 * Бросить пул и опубликовать карточку.
 * @param {object} o
 * @param {Actor} [o.actor]
 * @param {string} o.title
 * @param {string} [o.subtitle]
 * @param {number} o.pool          костей (уже со всеми модификаторами)
 * @param {number} [o.difficulty]
 * @param {boolean} [o.specialty]
 * @param {boolean} [o.willpower]  потратить волю (списывается здесь)
 * @param {Array<{label:string,value:number}>} [o.breakdown]
 * @param {string} [o.kind]        check | attack | damage | soak | frenzy | rotschreck | virtue | initiative
 * @param {object} [o.extra]       данные для кнопок карточки (оружие, урон…)
 * @param {boolean} [o.noBotch]    урон и прочность не проваливаются (04)
 * @param {number} [o.auto]        автоматические успехи (Мощь за кровь, Дисциплины/06)
 * @param {string} [o.messageMode]
 */
export async function rollPool(o) {
  let diff = Math.floor(o.difficulty ?? VTM20.defaultDifficulty);
  const extraNeeded = Math.max(0, diff - 10);
  diff = Math.clamp(diff, 2, 10);
  const pool = Math.max(0, Math.floor(o.pool ?? 0));

  if (o.willpower && o.actor) {
    if (!(await o.actor.spendWillpower(1))) o.willpower = false;
  }

  const rolls = [];
  let values = [];
  if (pool > 0) {
    const r = await new Roll(`${pool}d10`).evaluate();
    r.dice[0].options.appearance = DIE_APPEARANCE;
    values = r.dice[0].results.map(x => x.result);
    rolls.push(r);
  }

  const state = {
    title: o.title ?? t("Roll.Title"), subtitle: o.subtitle ?? "", values, pool,
    difficulty: diff, extraNeeded, specialty: !!o.specialty, specialtyName: o.specialtyName ?? "",
    willpower: !!o.willpower, breakdown: o.breakdown ?? [], kind: o.kind ?? "check",
    noBotch: !!o.noBotch, auto: Math.max(0, o.auto ?? 0), actorUuid: o.actor?.uuid ?? null, extra: o.extra ?? {}, notes: o.notes ?? [],
    effect: o.effect ?? ""
  };
  // Призыв демона (Demon: The Fallen, гл. 7): отдельная кость Муки — выше постоянной Муки обычный эффект, иначе высокой Муки
  if (state.extra?.torment != null) {
    const r = await new Roll("1d10").evaluate();
    r.dice[0].options.appearance = DIE_APPEARANCE;
    rolls.push(r);
    const die = r.total, high = die <= state.extra.torment;
    state.extra = { ...state.extra, tormentDie: die, tormentHigh: high };
  }
  const result = evaluate(values, state);
  // Продолжительное действие (03): успехи копятся до цели; провал срывает работу
  const ext = state.extra?.extended;
  if (ext) {
    ext.botched = result.outcome === "botch";
    ext.total = ext.botched ? 0 : (ext.prev ?? 0) + result.successes;
    ext.step = (ext.step ?? 0) + 1;
    ext.done = !ext.botched && ext.total >= ext.need;
  }
  const content = await renderCard(state, o.actor);
  const data = ChatMessage.applyMode({
    content, rolls,
    speaker: ChatMessage.getSpeaker({ actor: o.actor }),
    flags: { [SYSTEM_ID]: { roll: state } }
  }, o.messageMode ?? game.settings.get("core", "messageMode"));
  const message = await ChatMessage.create(data);
  // Проваленная ярость или Ротшрек — состояние на токене (05)
  if (o.actor && ["frenzy", "rotschreck"].includes(state.kind) && result.successes === 0)
    await o.actor.toggleStatusEffect?.(`r-${state.kind}`, { active: true });
  return { ...result, message, state };
}

/** Подписи исхода и подсказки по виду броска. */
function outcomeView(state, ev) {
  const k = state.kind;
  if (k === "damage") return { css: "is-damage", icon: "fa-burst", label: t("Roll.DamageResult", { n: ev.successes }) };
  if (k === "soak") return { css: "is-soak", icon: "fa-shield-halved", label: t("Roll.SoakResult", { n: ev.successes }) };
  if (ev.outcome === "botch") return { css: "is-botch", icon: "fa-skull", label: t("Outcome.botch") };
  if (ev.outcome === "failure") return { css: "is-failure", icon: "fa-xmark", label: t("Outcome.failure") };
  return { css: `is-success is-${ev.degree}`, icon: "fa-check", label: t(`Degree.${ev.degree}`) };
}

function hintFor(state, ev) {
  const k = state.kind;
  if (k === "frenzy" || k === "rotschreck") {
    if (ev.outcome === "botch") return t(`Roll.${k}.botch`);
    if (ev.successes >= 5) return t(`Roll.${k}.resisted`);
    if (ev.successes > 0) return t(`Roll.${k}.partial`, { n: ev.successes });
    return t(`Roll.${k}.failed`);
  }
  if (k === "degeneration") {
    if (ev.outcome === "botch") return t("Roll.degeneration.botch");
    return ev.successes > 0 ? t("Roll.degeneration.kept") : t("Roll.degeneration.lost");
  }
  if (k === "attack" && ev.outcome === "success") {
    if (state.extra?.targetName) return t("Combat.AwaitDefense", { name: state.extra.targetName, n: ev.successes });
    return t("Roll.AttackHint", { n: Math.max(0, ev.successes - 1) });
  }
  if (k === "attack" && ev.outcome === "botch") return t("Roll.AttackBotch");
  if (k === "defense") return ev.outcome === "botch" ? t("Combat.DefenseBotch") : t("Combat.DefenseHint", { n: ev.successes });
  if (k === "hunt") return t(`Hunt.Result.${ev.outcome}`);
  if (k === "weakness") return ev.successes > 0 ? t("Roll.weakness.resisted") : t("Roll.weakness.failed");
  // Сопротивление узам крови (05): успехов нужно больше, чем раз вассал пил кровь сюзерена
  if (k === "bond") {
    const need = state.extra?.bondNeed ?? 1;
    if (ev.outcome === "botch") return t("BondX.ResistBotch");
    return ev.successes >= need ? t("BondX.ResistOk", { n: ev.successes, need }) : t("BondX.ResistFail", { n: ev.successes, need });
  }
  // Мука падшего (Demon: The Fallen, гл. 6): грех — Добродетель против сл. 8; доброе дело — Добродетель против костей Муки
  if (k === "names") return ev.successes >= 3 ? t("Demon.Names3") : ev.successes === 2 ? t("Demon.Names2") : ev.successes === 1 ? t("Demon.Names1") : t("Demon.Names0");
  if (k === "exorcism") return ev.successes > 0 ? t("Demon.ExorcismHeld") : t("Demon.ExorcismLost");
  if (k === "form") return ev.outcome === "botch" ? t("Demon.FormBotch") : ev.successes > 0 ? t("Demon.FormRolled") : t("Demon.FormFailed");
  if (k === "sin") return ev.successes > 0 ? t("Demon.SinResisted") : t("Demon.SinFell");
  if (k === "harvest") return ev.successes > (state.extra?.opposed?.successes ?? 0) ? t("Demon.HarvestWon") : t("Demon.HarvestLost");
  if (k === "kindness") {
    const o = state.extra?.opposed?.successes ?? 0;
    return ev.successes > o ? t("Demon.KindWon") : ev.successes < o ? t("Demon.KindLost") : t("Demon.KindTie");
  }
  if (k === "magic" || k === "ritual") {
    if (ev.outcome === "botch") return t(`Magic.${k}.botch`);
    if (ev.outcome === "failure") return t(`Magic.${k}.failed`);
    return t(`Magic.${k}.success`, { n: ev.successes });
  }
  return "";
}

export async function renderCard(state, actor = null) {
  const ev = evaluate(state.values, state);
  actor ??= state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const oc = outcomeView(state, ev);
  const extra = state.extra ?? {};
  return foundry.applications.handlebars.renderTemplate(`${SYSTEM_PATH}/templates/chat/roll-card.hbs`, {
    ...state,
    actorName: actor?.name ?? "", actorImg: actor?.img ?? "",
    dice: state.values.map(v => dieView(v, state.difficulty, state.specialty)),
    successes: ev.successes, outcome: oc, ev,
    showDifficulty: !["initiative"].includes(state.kind),
    hint: hintFor(state, ev),
    // атака на цель ждёт её защиты — урон кидают из карточки итога
    canDamage: state.kind === "attack" && ev.outcome === "success" && extra.damagePool != null && !extra.target,
    damageDice: extra.damagePool != null ? extra.damagePool + Math.max(0, ev.successes - 1) : 0,
    damageType: extra.damageType ? game.i18n.localize(VTM20.damageTypes[extra.damageType]?.label ?? "") : "",
    canApply: state.kind === "damage" && ev.successes > 0,
    canFeed: state.kind === "hunt" && ev.outcome === "success",
    canFrenzy: state.kind === "hunt" && !!extra.hungry,
    canLoseWill: ["magic", "ritual"].includes(state.kind) && ev.outcome === "botch" && !extra.willLost,
    powerHit: ev.outcome === "success" ? combatPowerLabel(combatPowerOf(extra.power), extra.power, ev.successes) : "",
    atavism: state.kind === "frenzy" && ev.successes < 5 && state.extra?.atavism,
    canSoak: state.kind === "damage" && ev.successes > 0,
    extended: extra.extended ? { ...extra.extended, pct: Math.min(100, Math.round((extra.extended.total / Math.max(1, extra.extended.need)) * 100)) } : null,
    contest: ["resisted", "teamwork"].includes(extra.contest) ? extra.contest : null,
    typeClass: themeClass(actor),
    torment: extra.tormentDie ? { die: extra.tormentDie, n: extra.torment, high: !!extra.tormentHigh, chosen: !!extra.tormentChosen } : null,
    opposed: extra.opposed ? { label: extra.opposed.label, successes: extra.opposed.successes, dice: extra.opposed.values.map(v => dieView(v, 6, false)) } : null
  });
}

/* ── Специальные броски ──────────────────────────────────────────────── */

/** Урон по оружию (04): пул = урон + лишние успехи атаки, сложность 6, не проваливается. */
export function rollDamage({ actor, pool, damageType = "bashing", title, aggravatedFangs = false, target = null, pierce = 0, bullet = false, head = false, notes = [], auto = 0, soakDiff = null }) {
  const bd = auto ? [{ label: t("Roll.PotenceAuto"), value: auto }] : [];
  return rollPool({
    actor, title: title ?? t("Roll.Damage"), subtitle: game.i18n.localize(VTM20.damageTypes[damageType].label),
    pool: Math.max(auto ? 0 : 1, pool), difficulty: 6, kind: "damage", noBotch: true, notes, auto, breakdown: bd,
    extra: { damageType, fangs: aggravatedFangs, damage: true, target, pierce, bullet, head, soakDiff }
  });
}

/**
 * Прочность и применение урона к актёру: бросок прочности, вычет, у вампира
 * лёгкие после прочности делятся пополам с округлением вниз (04).
 */
export async function soakAndApply(target, amount, damageType, { soak = true, fangs = false, pierce = 0, bullet = false, head = false, difficulty = null, armor = true, messageMode } = {}) {
  let left = amount, soaked = 0;
  // Пули и болты по вампиру — лёгкие повреждения, кроме выстрела в голову (04)
  if (bullet && target.isVampire && !head && damageType === "lethal") {
    damageType = "bashing";
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<div class="r-notice"><i class="fa-solid fa-gun"></i> ${t("Combat.BulletBashing")}</div>` });
  }
  // Смертному огонь, клыки и когти наносят тяжёлые повреждения, а не губительные (04)
  const tough = target.isVampire || (target.type === "creature" && target.system.supernatural);
  if (damageType === "aggravated" && !tough) {
    damageType = "lethal";
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<div class="r-notice"><i class="fa-solid fa-person"></i> ${t("Combat.MortalAggravated")}</div>` });
  }
  if (soak) {
    const pool = target.soakPool(damageType, { fangs, pierce, armor });
    if (pool > 0) {
      const res = await rollPool({
        actor: target, title: t("Roll.Soak"), subtitle: game.i18n.localize(VTM20.damageTypes[damageType].label),
        pool, difficulty: (difficulty ?? 6) + (target.system.fx?.soakDiff ?? 0), kind: "soak", noBotch: true, messageMode,
        breakdown: [{ label: t("Roll.Incoming"), value: amount }]
      });
      soaked = res.successes;
    }
    left = Math.max(0, amount - soaked);
  }
  if (damageType === "bashing" && target.isVampire) left = Math.floor(left / 2);
  // ошеломление: повреждений больше Выносливости (у сверхъестественных — +2)
  const stunAt = target.system.attributes.stamina.total + (target.hasBlood ? 2 : 0);
  if (left > 0) await target.applyDamage(left, damageType);
  else ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<div class="r-notice"><i class="fa-solid fa-shield"></i> ${t("Notify.NoDamage")}</div>` });
  if (left > stunAt) {
    ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-star"></i> ${t("Notify.Stunned")}</div>` });
    await target.toggleStatusEffect?.("r-stunned", { active: true });
  }
  return left;
}

/* ── Кнопки карточек ─────────────────────────────────────────────────── */

export function onChatCardClick(event) {
  const btn = event.target.closest("[data-r-action]");
  if (!btn) return;
  const li = btn.closest("[data-message-id]");
  const message = game.messages.get(li?.dataset.messageId);
  if (!message) return;
  event.preventDefault();
  const combatAction = btn.dataset.rAction;
  if (combatAction === "fixedDamage") return import("../data/combat-powers.mjs").then(m => m.applyFixedDamage(message));
  if (combatAction === "defend" || combatAction === "combatDamage") {
    return import("../combat/combat.mjs").then(m => combatAction === "defend" ? m.defendCard(message, btn.dataset.method) : m.rollLinkedDamage(message));
  }
  if (combatAction === "virtueCheck") return import("./virtue-checks.mjs").then(m => m.rollFromPrompt(message));
  if (["extend", "resist", "assist"].includes(combatAction)) {
    return import("./contests.mjs").then(m => combatAction === "extend" ? m.continueExtended(message)
      : m.respond(message, combatAction === "resist" ? "resisted" : "teamwork"));
  }
  const state = message.getFlag(SYSTEM_ID, "roll");
  if (!state) return;
  const action = btn.dataset.rAction;
  if (action === "damage") return onDamage(message, state);
  if (action === "apply") return onApply(state, { soak: btn.dataset.soak === "1" });
  if (action === "huntFrenzy") return foundry.utils.fromUuid(state.actorUuid).then(a => a?.isOwner && import("./virtue-checks.mjs").then(m => m.rollVirtueCheck(a, "frenzy")));
  if (action === "feed") return foundry.utils.fromUuid(state.actorUuid).then(a => import("../apps/night.mjs").then(m => m.feedAfterHunt(a, { animal: state.extra?.method === "animals" })));
  if (action === "loseWill") return onLoseWill(message, state, btn.dataset.permanent === "1");
  if (action === "chooseHigh") return import("../apps/torment.mjs").then(m => m.chooseHighTorment(message, state));
  if (action === "powerHit") return import("../data/combat-powers.mjs").then(m => m.powerHit(message, state, evaluate(state.values, state)));
}

/** Провал чародейства (V20, гл. 4: «потеря Воли или даже точки Воли»): списать временную или постоянную Волю по решению рассказчика. */
async function onLoseWill(message, state, permanent) {
  const actor = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  if (!actor?.isOwner) return ui.notifications.warn(t("Notify.NotOwner", { name: actor?.name ?? "" }));
  const w = actor.system.willpower;
  if (permanent) await actor.update({ "system.willpower.permanent": Math.max(0, w.permanent - 1), "system.willpower.temporary": Math.min(w.temporary, Math.max(0, w.permanent - 1)) });
  else if (!(await actor.spendWillpower(1))) return;
  await message.setFlag(SYSTEM_ID, "roll", { ...state, extra: { ...(state.extra ?? {}), willLost: true } });
  await message.update({ content: await renderCard({ ...state, extra: { ...(state.extra ?? {}), willLost: true } }, actor) });
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-star"></i> ${t(permanent ? "Magic.LostWillPermanent" : "Magic.LostWill", { name: actor.name })}</div>` });
}

async function onDamage(message, state) {
  const actor = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const ev = evaluate(state.values, state);
  const pool = (state.extra.damagePool ?? 0) + Math.max(0, ev.successes - 1);
  const x = state.extra;
  return rollDamage({ actor, pool, damageType: x.damageType ?? "bashing", title: x.weaponName || t("Roll.Damage"), aggravatedFangs: x.fangs,
    pierce: x.pierce ?? 0, bullet: !!x.bullet, head: !!x.head, auto: x.damageAuto ?? 0 });
}

async function onApply(state, { soak }) {
  const ev = evaluate(state.values, state);
  const x = state.extra ?? {};
  // урон по атаке с целью идёт этой цели; иначе — выбранным или выделенным токенам
  const linked = x.target ? await foundry.utils.fromUuid(x.target) : null;
  const targets = linked ? [linked] : [...game.user.targets].map(tk => tk.actor).filter(Boolean);
  const list = targets.length ? targets : canvas.tokens?.controlled.map(tk => tk.actor).filter(Boolean) ?? [];
  if (!list.length) { ui.notifications.warn(t("Notify.NoTarget")); return; }
  for (const a of list) {
    if (!a.isOwner) { ui.notifications.warn(t("Notify.NotOwner", { name: a.name })); continue; }
    await soakAndApply(a, ev.successes, x.damageType ?? "bashing", { soak, fangs: x.fangs, pierce: x.pierce ?? 0, bullet: !!x.bullet, head: !!x.head, difficulty: x.soakDiff ?? null });
  }
}
