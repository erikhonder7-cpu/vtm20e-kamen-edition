// module/apps/harrowing.mjs
// Испытание для рассказчика (Wraith 20, гл. 6, «Harrowings»): окно-конструктор. Причина и Добыча (Страсть, Оковы, сам призрак),
// «правильное решение» — записка рассказчику, бросок Эйдолона (сл. 9, раз за сессию: успех — одна деталь сцены по воле призрака),
// выход — отыгрышем или броском постоянной Воли, сл. 9 (хватит одного успеха; хороший отыгрыш может снизить сложность;
// Теневых кубиков нет); Испытание Разрушения — Воля против постоянного Ангста Тени, сл. 6. Последствия и награды — по книге:
//  • Воля кончилась: успех — Воля = 1 + Интеллект; провал — Добыча −1 (до нуля — потеряна), Воля = Интеллект, выброс в Бурю.
//  • последняя точка Страсти: успех — Страсть цела; провал — Страсть потеряна и бросок другой Страсти, сл. 5: провал — −1.
//  • Оковы погибли: успех — Оковы считаются разрешёнными; провал — стёрты.
//  • Корпус: успех — временный Корпус = Выносливости; провал — −1 постоянный (до нуля — Испытание Разрушения).
//  • «Добыча — вы сами»: провал — −1 постоянный Корпус.
//  • Разрешение: успех — +1 временный и постоянный Корпус; провал — Забвение.
// Награда: отстоял Добычу — +1 к её рейтингу; пережил Разрушение — −1…3 временного Ангста.

import { SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { t, esc, say, backgroundRating, gainAngst } from "./wraith.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
export const KINDS = { will: "fa-battery-empty", passion: "fa-heart-crack", fetter: "fa-link-slash", corpus: "fa-ghost", self: "fa-user-xmark", destruction: "fa-skull" };
const listPath = { p: "system.wraith.passions", f: "system.wraith.fetters" };

/** Шкала после потери постоянного Корпуса: лишние отметки уходят — сначала ударные, потом летальные. */
function fitHealth(h, cap) {
  const out = { bashing: h.bashing, lethal: h.lethal, aggravated: h.aggravated };
  for (const k of ["bashing", "lethal", "aggravated"]) while (out.bashing + out.lethal + out.aggravated > cap && out[k] > 0) out[k]--;
  return out;
}

export function openHarrowing(actor, kind = "will") {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  return new HarrowingApp(actor, kind).render({ force: true });
}

export class HarrowingApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-harrow", "r-type-wraith"],
    tag: "form",
    window: { icon: "fa-solid fa-dungeon" },
    position: { width: 500 },
    form: { handler: () => {}, submitOnChange: false, closeOnSubmit: false },
    actions: {
      kind: HarrowingApp.#onKind, eidolon: HarrowingApp.#onEidolon,
      solved: HarrowingApp.#onSolved, escape: HarrowingApp.#onEscape, bump: HarrowingApp.#onBump
    }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/harrowing.hbs` } };

  constructor(actor, kind = "will") {
    super({ window: { title: t("Harrow.Title", { name: actor.name }) } });
    this.actor = actor;
    const saved = actor.getFlag(SYSTEM_ID, "harrow") ?? {};
    this.v = { kind: saved.kind ?? kind, quarry: saved.quarry ?? "", second: "", answer: saved.answer ?? "", rp: 0, reward: true, relief: 1 };
  }

  get targeted() { return ["will", "passion", "fetter"].includes(this.v.kind); }

  /** Добыча на выбор: Воля — любая Страсть или Оковы; Страсть / Оковы — свой список; остальные — сам призрак. */
  quarries() {
    const w = this.actor.system.wraith, k = this.v.kind;
    const p = w.passions.map((x, i) => ({ key: `p:${i}`, label: `${t("Res.Passion")}: ${x.text || "—"} (${x.value})`, ok: !x.resolved && x.value > 0 }));
    const f = w.fetters.map((x, i) => ({ key: `f:${i}`, label: `${t("Res.Fetter")}: ${x.text || "—"} (${x.value})`, ok: !x.resolved && x.value > 0 }));
    const list = k === "will" ? [...p, ...f] : k === "passion" ? p : k === "fetter" ? f : [];
    return list.filter(x => x.ok);
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, w = a.system.wraith, qs = this.quarries();
    if (this.targeted && !qs.some(q => q.key === v.quarry)) v.quarry = qs[0]?.key ?? "";
    const eid = backgroundRating(a, "Eidolon"), destruction = v.kind === "destruction";
    const others = w.passions.map((x, i) => ({ key: `p:${i}`, label: `${x.text || "—"} (${x.value})`, ok: x.value > 0 && !x.resolved && `p:${i}` !== v.quarry }))
      .filter(x => x.ok);
    if (v.kind === "passion" && !others.some(o => o.key === v.second)) v.second = others[0]?.key ?? "";
    return {
      v, targeted: this.targeted, destruction,
      kinds: Object.entries(KINDS).map(([k, icon]) => ({ key: k, icon, label: t(`Harrow.Kind.${k}`), hint: t(`Harrow.KindHint.${k}`), active: k === v.kind })),
      quarries: qs.map(q => ({ ...q, selected: q.key === v.quarry })), noQuarry: this.targeted && !qs.length,
      others: v.kind === "passion" ? others.map(o => ({ ...o, selected: o.key === v.second })) : null,
      eidolon: eid, eidolonUsed: !!w.session.harrow, eidolonOk: eid > 0 && !w.session.harrow,
      diff: destruction ? 6 : Math.clamp(9 + v.rp, 6, 9), angst: w.shadow.angst.permanent, will: a.system.willpower.permanent,
      fate: t(`Harrow.Fate.${v.kind}`), reliefs: [1, 2, 3].map(n => ({ n, selected: n === v.relief }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.actor.toggleStatusEffect?.("r-harrowing", { active: true });
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, { quarry: f.quarry ?? this.v.quarry, second: f.second ?? this.v.second, answer: f.answer ?? this.v.answer,
        reward: !!f.reward, relief: Math.clamp(Number(f.relief) || 1, 1, 3) });
      this.#save();
      this.render();
    });
  }

  #save() { return this.actor.setFlag(SYSTEM_ID, "harrow", { kind: this.v.kind, quarry: this.v.quarry, answer: this.v.answer }); }

  static #onKind(event, target) { this.v.kind = target.dataset.key; this.v.quarry = ""; this.#save(); this.render(); }
  static #onBump(event, target) { this.v.rp = Math.clamp(this.v.rp + Number(target.dataset.d), -3, 0); this.render(); }

  /** Эйдолон (раз за сессию): рейтинг, сл. 9; Воля — автоматический успех (в окне броска). */
  static async #onEidolon() {
    const a = this.actor, n = backgroundRating(a, "Eidolon");
    if (!n || a.system.wraith.session.harrow) return;
    return RollDialog.prompt(a, { title: t("Harrow.EidolonTitle"), pool: n, difficulty: 9, lockTraits: true, extra: { wraith: { kind: "harrowEidolon" } },
      onRolled: async r => {
        await a.update({ "system.wraith.session.harrow": true });
        await say(a, "fa-sun", t("Harrow.EidolonOut", { name: esc(a.name), n: r?.successes ?? 0 }));
        this.render();
      } });
  }

  /** Решено отыгрышем — победа без броска. */
  static async #onSolved() { await this.finish(true, t("Harrow.BySolution")); }

  /** Бросок выхода: Воля, сл. 9 (Разрушение — против Ангста Тени, сл. 6). */
  static async #onEscape() {
    const a = this.actor, v = this.v;
    if (v.kind === "destruction") {
      const angst = a.system.wraith.shadow.angst.permanent;
      const sr = await new Roll(`${Math.max(1, angst)}d10`).evaluate(), sv = sr.dice[0].results.map(x => x.result);
      const shadow = Math.max(0, sv.filter(x => x >= 6).length - sv.filter(x => x === 1).length);
      return RollDialog.prompt(a, { title: t("HarrowDestruction"), trait1: "willpower.permanent", difficulty: 6, lockTraits: true,
        effect: `<p>${t("HarrowDestructionText")}</p>`, extra: { wraith: { kind: "harrowing", cause: "destruction", shadow, shadowVals: sv.join(", ") } },
        onRolled: r => this.finish((r?.successes ?? 0) > shadow, t("Harrow.ByRoll")) });
    }
    return RollDialog.prompt(a, { title: t("Harrowing"), trait1: "willpower.permanent", difficulty: Math.clamp(9 + v.rp, 6, 9), lockTraits: true,
      noWillpower: false, diffNote: v.rp ? t("Harrow.RpNote", { n: -v.rp }) : t("Harrow.NoShadowDice"),
      extra: { wraith: { kind: "harrowing", cause: v.kind, shadow: null } },
      onRolled: r => this.finish((r?.successes ?? 0) >= 1, t("Harrow.ByRoll")) });
  }

  /** Последствия, награда, сообщение; окно закрывается, записка стирается. */
  async finish(won, how) {
    const a = this.actor, v = this.v, name = esc(a.name), lines = [];
    const [lk, li] = String(v.quarry).split(":"), qi = Number(li);
    const list = lk ? foundry.utils.deepClone(foundry.utils.getProperty(a._source, listPath[lk])) : null, q = list?.[qi];
    const qName = esc(q?.text || "—"), wp = a.system.willpower, int = a.system.attributes.intelligence?.total ?? a.system.attributes.intelligence?.value ?? 1;
    const upd = {};
    let again = null;
    if (v.kind === "will") {
      upd["system.willpower.temporary"] = Math.min(wp.permanent, won ? 1 + int : int);
      if (q && won && v.reward) { q.value = Math.min(5, q.value + 1); lines.push(t("Harrow.Rewarded", { q: qName, n: q.value })); }
      if (q && !won) { q.value -= 1; lines.push(q.value > 0 ? t("Harrow.QuarryHurt", { q: qName, n: q.value }) : t("Harrow.QuarryLost", { q: qName })); if (q.value <= 0) list.splice(qi, 1); }
      lines.push(t(won ? "Harrow.WillBack" : "Harrow.WillTempest", { n: upd["system.willpower.temporary"] }));
    } else if (v.kind === "passion" && q) {
      if (won) { if (v.reward) { q.value = Math.min(5, q.value + 1); lines.push(t("Harrow.Rewarded", { q: qName, n: q.value })); } else lines.push(t("Harrow.Kept", { q: qName })); }
      else {
        lines.push(t("Harrow.QuarryLost", { q: qName }));
        const si = Number(String(v.second).split(":")[1]), s = Number.isInteger(si) && si !== qi ? list[si] : null;
        if (s) {
          const r = await new Roll(`${s.value}d10`).evaluate(), vals = r.dice[0].results.map(x => x.result);
          const hits = vals.filter(x => x >= 5).length - vals.filter(x => x === 1).length;
          if (hits <= 0) s.value = Math.max(0, s.value - 1);
          lines.push(t(hits > 0 ? "Harrow.SecondHeld" : "Harrow.SecondHurt", { q: esc(s.text || "—"), vals: vals.join(", "), n: s.value }));
        }
        list.splice(qi, 1);
      }
    } else if (v.kind === "fetter" && q) {
      if (won) { Object.assign(q, { resolved: true, orig: q.orig || q.value, value: 0 }); lines.push(t("Harrow.FetterResolved", { q: qName })); }
      else { list.splice(qi, 1); lines.push(t("Harrow.QuarryLost", { q: qName })); }
      if (!list.some(x => !x.resolved && x.value > 0)) lines.push(t("Harrow.NoFettersLeft"));
    } else if (v.kind === "corpus" || v.kind === "self" || v.kind === "destruction") {
      const wr = a.system.wraith, sta = Math.max(1, a.system.attributes.stamina?.total ?? 1);
      if (v.kind === "destruction") {
        if (won) {
          // «по точке временного и постоянного Корпуса»: постоянный +1, на шкале — одна свободная ячейка (правило системы)
          const corpus = Math.min(10, wr.corpus + 1);
          upd["system.wraith.corpus"] = corpus;
          upd["system.health"] = { bashing: 0, lethal: corpus - 1, aggravated: 0 };
          lines.push(t("Harrow.DestructionWon"));
          if (v.reward) { await gainAngst(a, -v.relief, { reason: t("Harrowing") }); lines.push(t("Harrow.Relief", { n: v.relief })); }
        } else lines.push(t("Harrow.DestructionLost"));
      } else if (won) {
        if (v.kind === "corpus") {
          const keep = Math.min(wr.corpus, sta);
          upd["system.health"] = { bashing: 0, lethal: wr.corpus - keep, aggravated: 0 };
          lines.push(t("Harrow.CorpusBack", { n: keep }));
        } else lines.push(t("Harrow.SelfWon"));
      } else {
        const corpus = Math.max(0, wr.corpus - 1);
        upd["system.wraith.corpus"] = corpus;
        upd["system.health"] = v.kind === "corpus" ? { bashing: 0, lethal: Math.max(0, corpus - Math.min(corpus, sta)), aggravated: 0 } : fitHealth(a._source.system.health, corpus);
        lines.push(t("Harrow.CorpusLoss", { n: corpus }));
        if (!corpus) again = "destruction";
      }
    }
    if (list && lk) upd[listPath[lk]] = list;
    if (Object.keys(upd).length) await a.update(upd);
    await a.unsetFlag(SYSTEM_ID, "harrow");
    await a.toggleStatusEffect?.("r-harrowing", { active: false });
    await say(a, won ? "fa-door-open" : "fa-dungeon", `<b>${t(won ? "Harrow.Won" : "Harrow.Lost", { name, kind: t(`Harrow.Kind.${v.kind}`) })}</b> <small>(${how})</small>
      ${lines.map(l => `<br>${l}`).join("")}`, won ? "" : "is-warn");
    await this.close();
    if (again) return openHarrowing(a, again);
    return won;
  }
}
