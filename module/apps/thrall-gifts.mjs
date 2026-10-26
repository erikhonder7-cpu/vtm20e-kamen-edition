// module/apps/thrall-gifts.mjs
// Дары слуге падшего («Проклятые и обманутые», гл. 5; глава правил 14 «Дары»). Цена — пункты Веры слуги сверх доли
// хозяину: исцеление — 1 за недуг, Характеристики — 2 точки за 1, Способности — до 5 точек за 1, врождённая способность
// падшего — 1, черта апокалиптической формы — 1, призыв — пункт за круг, особый дар Дома — 1.
// Применение: врождённая и черта формы — 1 Воля на эпизод (поглощение тяжёлых — 2), черта высокой Муки — ещё 1 временная
// Мука хозяину; призыв — бросок Воли слуги, сл. 8, эффект по Муке хозяина; призыв высокой Муки — потом грех слуги
// (бросок Добродетели). Исцеление и дар Дома действуют всегда. Договор порван — прибавки к чертам уходят (thrallBreak).

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { rollPool } from "../dice/roll.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Gifts.${k}`, d) : game.i18n.localize(`VTM20.Gifts.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ROMAN = ["I", "II", "III", "IV", "V"];

export const GIFT_KINDS = ["innate", "form", "evocation", "house", "heal", "attr", "abil", "other"];
/** Врождённые способности падших, которые можно передать слуге (гл. 7), и их цена Волей за эпизод. */
export const INNATE = { mind: 1, fear: 1, illusion: 1, soak: 2, sense: 1 };

/** Доля Веры хозяину по строке договора у него (если видна), иначе — половина вверх. */
function shareOf(actor) {
  const th = actor.system.thrall ?? {}, master = th.master ? foundry.utils.fromUuidSync(th.master) : null;
  const row = master?.system?.thralls?.find(x => x.uuid === actor.uuid);
  return row ? row.share : Math.ceil((th.faith ?? 0) / 2);
}

/** Сколько Веры уже ушло на дары: прибавки к Характеристикам — 2 точки за пункт, к Способностям — 5, прочее — цена дара. */
export function giftsUsed(gifts = []) {
  const sum = kind => gifts.filter(g => g.kind === kind).reduce((n, g) => n + (g.dots ?? 0), 0);
  return Math.ceil(sum("attr") / 2) + Math.ceil(sum("abil") / 5)
    + gifts.filter(g => !["attr", "abil"].includes(g.kind)).reduce((n, g) => n + (g.cost ?? 0), 0);
}

/** Бюджет даров: Вера слуги минус доля хозяину. */
export function giftBudget(actor) {
  const faith = actor.system.thrall?.faith ?? 0;
  return { total: Math.max(0, faith - shareOf(actor)), used: giftsUsed(actor.system.thrall?.gifts ?? []) };
}

/** Особые дары Дома хозяина (примеры книги) — из lang/ru.json, списком. */
function houseGifts(house) {
  return foundry.utils.getProperty(game.i18n.translations, `VTM20.Gifts.HouseList.${house}`) ?? [];
}

/** Подпись дара в списке. */
function giftLabel(actor, g) {
  switch (g.kind) {
    case "attr": case "abil": return `${actor.traitLabel(g.key)} +${g.dots}`;
    case "innate": return t(`Innate.${g.key}`);
    default: return g.name;
  }
}

/** Разорванный договор: прибавки к чертам уходят, остальные дары гаснут вместе с договором. */
export async function giftsRevoke(actor) {
  const gifts = actor.system.thrall?.gifts ?? [], upd = {};
  for (const g of gifts.filter(g => ["attr", "abil"].includes(g.kind) && g.key)) {
    const cur = upd[`system.${g.key}.value`] ?? foundry.utils.getProperty(actor.system, `${g.key}.value`) ?? 0;
    upd[`system.${g.key}.value`] = Math.max(g.kind === "attr" ? 1 : 0, cur - g.dots);
  }
  upd["system.thrall.gifts"] = [];
  return actor.update(upd);
}

/** Применить дар: Воля, Мука хозяину, бросок призыва. */
export async function useGift(actor, index) {
  const g = actor.system.thrall?.gifts?.[index];
  if (!g) return null;
  const master = actor.system.thrall.master ? await fromUuid(actor.system.thrall.master) : null;
  const notice = (icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice r-type-demon is-pact"><i class="fa-solid ${icon}"></i> ${html}</div>` });
  if (g.kind === "evocation") {
    const [lore, lv] = g.key.split(":"), d = Codex.lore(lore), p = d?.powers?.find(x => x.level === Number(lv));
    const will = actor.system.willpower.permanent;
    const res = await rollPool({ actor, title: g.name, subtitle: `${t("FromMaster")}: ${d?.name ?? ""} · ${ROMAN[lv - 1] ?? lv}`,
      pool: will, difficulty: 8, kind: "thrallEvocation", effect: p?.html ?? "",
      breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: will }],
      extra: { torment: master?.system?.torment?.permanent ?? 0 } });
    // призыв высокой Муки — потом грех слуги (бросок Добродетели)
    if (res?.state?.extra?.tormentHigh && res.successes > 0) {
      await notice("fa-skull", t("EvocationHigh", { name: esc(actor.name) }));
      const { thrallSin } = await import("./torment.mjs");
      await thrallSin(actor);
    }
    return res;
  }
  if (g.kind !== "innate" && g.kind !== "form") return null;
  const cost = g.kind === "innate" ? INNATE[g.key] ?? 1 : 1;
  if (!(await actor.spendWillpower(cost))) return ui.notifications.warn(t("NoWill", { n: cost }));
  await notice("fa-gift", t("Used", { name: esc(actor.name), gift: esc(giftLabel(actor, g)), n: cost }));
  // черта высокой Муки — 1 временная Мука хозяину (падшему платит тот, кто им владеет)
  if (g.kind === "form" && g.high && master?.type === "demon") {
    if (master.isOwner) { const { gainTorment } = await import("./torment.mjs"); await gainTorment(master, 1, t("HighReason", { name: actor.name })); }
    else await notice("fa-fire", t("HighTell", { master: esc(master.name) }));
  }
  return true;
}

/** Окно даров слуги: список с применением, бюджет Веры, добавить дар. */
class ThrallGifts extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor) {
    super({ id: `r-gifts-${actor.id}`, window: { title: `${t("Title")}: ${actor.name}` } });
    this.actor = actor;
    this.kind = "innate";
    this.hook = Hooks.on("updateActor", a => { if (a === this.actor) this.render(); });
  }

  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-gifts", "r-type-mortal"],
    window: { icon: "fa-solid fa-gift", resizable: true },
    position: { width: 520, height: "auto" },
    actions: { kind: ThrallGifts.#onKind, add: ThrallGifts.#onAdd, del: ThrallGifts.#onDel, use: ThrallGifts.#onUse }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/thrall-gifts.hbs` } };

  async close(o) { Hooks.off("updateActor", this.hook); return super.close(o); }

  async _prepareContext() {
    await Codex.load();
    const a = this.actor, th = a.system.thrall ?? {}, master = th.master ? await fromUuid(th.master) : null;
    const ms = master?.type === "demon" ? master.system : null, budget = giftBudget(a);
    const gifts = (th.gifts ?? []).map((g, i) => ({ i, kind: t(`Kind.${g.kind}`), label: giftLabel(a, g), note: g.note, high: g.high,
      use: ["innate", "form", "evocation"].includes(g.kind),
      useHint: g.kind === "evocation" ? t("UseEvocation") : t("UseWill", { n: g.kind === "innate" ? INNATE[g.key] ?? 1 : 1 }) }));
    // что можно добавить: от хозяина — его Облик, Знания и Дом
    const form = ms ? Codex.lore(ms.visage)?.form : null;
    const lores = master ? master.items.filter(i => i.type === "lore").map(i => ({ d: Codex.lore(i.system.key), v: i.system.value })).filter(x => x.d) : [];
    const options = {
      innate: Object.keys(INNATE).map(k => ({ value: k, label: `${t(`Innate.${k}`)} · ${t("UseWill", { n: INNATE[k] })}` })),
      form: form ? [...form.low.map(n => ({ value: `low:${n}`, label: n })), ...form.high.map(n => ({ value: `high:${n}`, label: `${n} · ${t("HighMark")}` }))] : [],
      evocation: lores.flatMap(({ d, v }) => (d.powers ?? []).filter(p => p.level <= v).map(p => ({ value: `${d.key}:${p.level}`, label: `${d.name} ${ROMAN[p.level - 1]} — ${p.name} · ${p.level}` }))),
      house: ms ? houseGifts(ms.house).map(n => ({ value: n, label: n })) : [],
      attr: Object.keys(a.system.attributes).map(k => ({ value: `attributes.${k}`, label: a.traitLabel(`attributes.${k}`) })),
      abil: Object.keys(a.system.abilities).map(k => ({ value: `abilities.${k}`, label: a.traitLabel(`abilities.${k}`) }))
    };
    return {
      master: master?.name ?? "", noMaster: !ms, gifts, budget, over: budget.used > budget.total, editable: a.isOwner,
      kinds: GIFT_KINDS.map(k => ({ key: k, label: t(`Kind.${k}`), active: k === this.kind })), kind: this.kind,
      kindHint: t(`Hint.${this.kind}`), options: options[this.kind] ?? null,
      needsText: ["heal", "other", "house"].includes(this.kind), needsDots: ["attr", "abil"].includes(this.kind),
      maxDots: this.kind === "attr" ? 2 : 5, needsCost: this.kind === "other"
    };
  }

  static #onKind(event, target) { this.kind = target.dataset.kind; this.render(); }

  static async #onAdd() {
    const f = this.element.querySelector(".r-gifts-add"), val = n => f.querySelector(`[name=${n}]`)?.value ?? "";
    const a = this.actor, k = this.kind, pick = val("pick"), text = val("text").trim(), note = val("note").trim();
    let g = { kind: k, name: "", key: "", dots: 0, high: false, cost: 1, note };
    if (k === "innate") Object.assign(g, { key: pick, name: t(`Innate.${pick}`) });
    else if (k === "form") Object.assign(g, { name: pick.slice(pick.indexOf(":") + 1), high: pick.startsWith("high:") });
    else if (k === "evocation") {
      const [lore, lv] = pick.split(":"), p = Codex.lore(lore)?.powers?.find(x => x.level === Number(lv));
      Object.assign(g, { key: pick, name: p?.name ?? pick, cost: Number(lv) || 1 });
    }
    else if (k === "house") g.name = text || pick;
    else if (k === "heal" || k === "other") Object.assign(g, { name: text, cost: k === "other" ? Math.max(0, Number(val("cost")) || 0) : 1 });
    else if (k === "attr" || k === "abil") Object.assign(g, { key: pick, dots: Math.max(1, Math.min(k === "attr" ? 2 : 5, Number(val("dots")) || 1)), cost: 0 });
    if (!g.name && !g.key) return ui.notifications.warn(t("NeedName"));
    const gifts = [...(a.system.thrall.gifts ?? []), g], b = giftBudget(a);
    if (giftsUsed(gifts) > b.total) return ui.notifications.warn(t("Over", { used: giftsUsed(gifts), total: b.total }));
    const upd = { "system.thrall.gifts": gifts };
    // прибавка — сразу в черту (до 5)
    if (k === "attr" || k === "abil") upd[`system.${g.key}.value`] = Math.min(5, (foundry.utils.getProperty(a.system, `${g.key}.value`) ?? 0) + g.dots);
    await a.update(upd);
  }

  static async #onDel(event, target) {
    const a = this.actor, i = Number(target.dataset.index), g = a.system.thrall.gifts[i];
    const upd = { "system.thrall.gifts": a.system.thrall.gifts.filter((_, j) => j !== i) };
    if (g && (g.kind === "attr" || g.kind === "abil") && g.key)
      upd[`system.${g.key}.value`] = Math.max(g.kind === "attr" ? 1 : 0, (foundry.utils.getProperty(a.system, `${g.key}.value`) ?? 0) - g.dots);
    await a.update(upd);
  }

  static #onUse(event, target) { return useGift(this.actor, Number(target.dataset.index)); }
}

export function openThrallGifts(actor) {
  const app = foundry.applications.instances.get(`r-gifts-${actor.id}`) ?? new ThrallGifts(actor);
  return app.render({ force: true });
}
