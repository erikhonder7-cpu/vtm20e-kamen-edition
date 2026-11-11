// module/apps/werewolf/kin.mjs
// Оборотень — Родня Гару (W20 Kinfolk): Дары и нумины Родни; Ками (W20 Umbra, гл. 4) — избранники Геи.

import { RollDialog } from "../../dice/dialog.mjs";
import { VTM20 } from "../../config.mjs";
import { t, esc, W, giftOf } from "../werewolf.mjs";

export const kinGiftOf = key => (W().kinGifts ?? []).find(g => g.key === key) ?? giftOf(key);

/** Цена Дара для Родни в опыте: свой — 15, чужой — 20 (+5 за учителя-Гару — по решению рассказчика). */
export const kinCost = (k, g) => (g.groups ? g.groups.some(x => x.key === k.tribe || x.key === k.breed) : g.tribe === k.tribe) ? 15 : 20;

/** Блок «Родня Гару» на листе смертного. */
export function kinfolkInfo(actor) {
  const k = actor.system.kinfolk;
  if (!k) return null;
  const D = W();
  const gifts = k.gifts.map(kinGiftOf).filter(Boolean).map(g => ({ key: g.key, name: g.name, en: g.en, text: g.text, roll: !!g.roll,
    gnosis: /Гнозис/.test(g.text ?? "") }));
  const own = [...(D.kinGifts ?? []).filter(g => g.tribe === k.tribe), ...D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.key === k.tribe || x.key === k.breed))];
  const other = (D.kinGifts ?? []).filter(g => g.tribe !== k.tribe);
  const avail = [...own, ...other].filter(g => !k.gifts.includes(g.key))
    .map(g => ({ key: g.key, label: `${VTM20.label(g)}${g.tribe != null && g.tribe !== k.tribe && !g.groups ? ` (${D.tribes.find(t => t.key === g.tribe)?.name ?? "?"})` : ""} — ${kinCost(k, g)}`, xp: kinCost(k, g) }));
  const numina = (k.numina ?? []).map(x => ({ ...x, data: numenOf(x.key) })).filter(x => x.data).map(x => ({ key: x.key, name: x.data.name, en: x.data.en,
    kind: t(`Numen.${x.data.kind}`), pool: x.data.pool, cost: x.data.cost, text: x.data.text,
    dots: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, filled: i < x.dots })),
    levels: x.data.levels.map(l => ({ ...l, reached: l.n <= x.dots })) }));
  const numAvail = (D.numina ?? []).filter(n => !(k.numina ?? []).some(x => x.key === n.key)).map(n => ({ key: n.key, label: `${VTM20.label(n)} — ${t(`Numen.${n.kind}`)}` }));
  return { on: k.on, tribe: k.tribe, breed: k.breed, gnosis: k.gnosis,
    tribes: D.tribes.map(t => ({ key: t.key, label: VTM20.label(t), selected: t.key === k.tribe })),
    breeds: ["homid", "lupus"].map(b => ({ key: b, label: VTM20.label(D.breeds.find(x => x.key === b) ?? { name: b }), selected: b === k.breed })),
    gifts, avail, numina, numAvail };
}

export const kamiPowerOf = key => (W().kami?.powers ?? []).find(p => p.key === key) ?? null;

export const kamiCount = k => (k.powers ?? []).reduce((n, p) => n + p.n, 0);

export function kamiInfo(actor) {
  const k = actor.system.kami;
  if (!k) return null;
  const D = W().kami ?? {};
  const powers = k.powers.map(p => ({ ...p, data: kamiPowerOf(p.key) })).filter(p => p.data).map(p => ({ key: p.key, n: p.n, name: p.data.name, en: p.data.en,
    text: p.data.text, more: p.data.repeat && p.n < p.data.max, roll: !!p.data.roll, kind: t(`Kami.kind.${p.data.kind}`) }));
  // силы неподвижных — растениям и земле; повторяемые — пока не исчерпан предел покупок
  const avail = (D.powers ?? []).filter(p => (p.kind !== "immobile" || k.kind === "plant") && !k.powers.some(x => x.key === p.key))
    .map(p => ({ key: p.key, label: `${VTM20.label(p)} — ${t(`Kami.kind.${p.kind}`)}` }));
  const st = D.start?.[k.kind] ?? {};
  return { on: k.on, geas: k.geas, gnosis: k.gnosis, rage: k.rage, xp: kamiCount(k) * 3, gnosisMax: st.gnosisMax ?? 10,
    start: t("Kami.start", { wp: st.willpower ?? 3, gnosis: st.gnosis ?? 1 }), geasHint: D.geas ?? "", create: D.create ?? "", examples: D.examples ?? "",
    kinds: ["human", "animal", "plant"].map(x => ({ key: x, label: t(`Kami.form.${x}`), selected: x === k.kind })), powers, avail };
}

/** Сила Ками: новая или ещё одна покупка повторяемой; за опыт — (число сил × 3). «Берсерк» даёт 5 Ярости. */
export async function kamiAdd(actor, key, buy = false) {
  const k = actor.system.kami, p = kamiPowerOf(key);
  if (!p) return;
  const list = k.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (have && (!p.repeat || have.n >= p.max)) return;
  if (buy) {
    const cost = kamiCount(k) * 3, xp = actor.system.experience;
    if (xp.available < cost) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: xp.available }));
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: t("Kami.learned", { name: p.name }), date: new Date().toLocaleDateString(game.i18n.lang) });
    await actor.update({ "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
  if (have) have.n += 1; else list.push({ key, n: 1 });
  return actor.update({ "system.kami.powers": list, ...(key === "berserker" && k.rage < 5 ? { "system.kami.rage": 5 } : {}) });
}

/** Снять одну покупку силы (последняя — сила уходит целиком). */
export function kamiRemove(actor, key) {
  const list = actor.system.kami.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (!have) return;
  return actor.update({ "system.kami.powers": have.n > 1 ? list.map(x => x.key === key ? { ...x, n: x.n - 1 } : x) : list.filter(x => x.key !== key) });
}

/** Сила Ками: бросок, если в книге указан пул, иначе — описание в чат. */
export function kamiUse(actor, key) {
  const p = kamiPowerOf(key);
  if (!p) return;
  if (p.roll) return RollDialog.prompt(actor, { title: p.name, trait1: p.roll.trait1, trait2: p.roll.trait2, difficulty: p.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(p.name)}</b><p>${p.text}</p></div>` });
}

/** Ками-животные, растения и земля к Бреду невосприимчивы; человек — с силой «Иммунитет к Бреду». */
export const kamiDeliriumImmune = a => !!a.system.kami?.on && (a.system.kami.kind !== "human" || a.system.kami.powers.some(p => kamiPowerOf(p.key)?.name === "Иммунитет к Бреду"));

export const numenOf = key => (W().numina ?? []).find(n => n.key === key) ?? null;

export function kinAddNumen(actor, key) {
  const list = actor.system.kinfolk.numina ?? [];
  if (!numenOf(key) || list.some(x => x.key === key)) return;
  return actor.update({ "system.kinfolk.numina": [...list, { key, dots: 1 }] });
}

export const kinRemoveNumen = (actor, key) => actor.update({ "system.kinfolk.numina": actor.system.kinfolk.numina.filter(x => x.key !== key) });

/** Точки нумины; щелчок по последней закрашенной — на точку меньше (как у прочих черт). */
export function kinNumenDots(actor, key, n) {
  const list = actor.system.kinfolk.numina.map(x => ({ ...x }));
  const x = list.find(y => y.key === key);
  if (!x) return;
  x.dots = Math.clamp(x.dots === n ? n - 1 : n, 0, 5);
  return actor.update({ "system.kinfolk.numina": list });
}

/** Бросок нумины: пул из книги (чего нет у смертного — выбрать в окне); сложность Эмпатического исцеления — по уровню. */
export function kinUseNumen(actor, key) {
  const n = numenOf(key), have = actor.system.kinfolk.numina.find(x => x.key === key)?.dots ?? 0;
  if (!n) return;
  const lvl = n.levels.filter(l => l.n <= have).at(-1);
  if (!n.roll) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(n.name)}</b>${n.text}</div>` });
  return RollDialog.prompt(actor, { title: `${n.name}${have ? ` ${"•".repeat(have)}` : ""}`, trait1: n.roll.trait1 ?? "", trait2: n.roll.trait2 ?? "",
    difficulty: lvl?.difficulty || n.roll.difficulty || 6 });
}

export async function kinAddGift(actor, key, buy = false) {
  const k = actor.system.kinfolk, g = kinGiftOf(key);
  if (!g || k.gifts.includes(key)) return;
  if (buy) {
    const cost = kinCost(k, g), xp = actor.system.experience;
    if (xp.available < cost) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: xp.available }));
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: t("KinLearned", { name: g.name }), date: new Date().toLocaleDateString(game.i18n.lang) });
    await actor.update({ "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
  return actor.update({ "system.kinfolk.gifts": [...k.gifts, key] });
}

export const kinRemoveGift = (actor, key) => actor.update({ "system.kinfolk.gifts": actor.system.kinfolk.gifts.filter(x => x !== key) });

/** Дар Родни: бросок, если он указан, иначе — описание в чат. */
export function kinUseGift(actor, key) {
  const g = kinGiftOf(key);
  if (!g) return;
  if (g.roll) return RollDialog.prompt(actor, { title: g.name, trait1: g.roll.trait1, trait2: g.roll.trait2, difficulty: g.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(g.name)}</b>${g.text}</div>` });
}
