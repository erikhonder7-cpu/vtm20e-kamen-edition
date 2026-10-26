// module/apps/cult.mjs
// Культ Привязанного (Earthbound, гл. 3 «Поклонение и Вера», «Ритуалы почитания», «Беспамятство»; Дополнения «Культ»
// и «Поклонение»).
//   · Культ — как часто проходят ритуалы поклонения: 1 — раз в месяц, 2 — дважды в месяц, 3 — раз в неделю,
//     4 — дважды в неделю, 5 — каждый день. Поклонение — сколько Веры приносит ритуал: по 2 за точку (столько сектантов).
//     Ритуал прерван — Веры нет. День и место — по договорённости игрока и рассказчика (расписание в окне).
//   · Ритуал почитания — до 2 часов за точку Поклонения; столько кубиков (не больше Веры) к ближайшему призыву —
//     тут же или пропадут (system.cult.veneration, окно броска dice/dialog.mjs).
//   · Беспамятство: каждый день без Веры (своей и в реликварии) — минус пункт временной Воли; Воля кончилась — спячка.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { getClock, shortDate } from "./calendar.mjs";
import { reliquaryInfo, worshipRitual } from "./torment.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Cult.${k}`, d) : game.i18n.localize(`VTM20.Cult.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const DAY = 86400000;
const ROLES = ["priest", "faithful", "agent", "servant"];
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

class CultWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor) {
    super({ id: `r-cult-${actor.id}`, window: { title: `${t("Title")}: ${actor.name}` } });
    this.actor = actor;
    this.hook = Hooks.on("updateActor", a => { if (a === this.actor) this.render(); });
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["vtm20", "r-dialog", "r-cult", "r-type-demon", "r-earthbound"],
    window: { icon: "fa-solid fa-place-of-worship", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: CultWindow.#onSave, submitOnChange: true, closeOnSubmit: false },
    actions: { worship: CultWindow.#onWorship, broken: CultWindow.#onBroken, venerate: CultWindow.#onVenerate,
      add: CultWindow.#onAdd, del: CultWindow.#onDel, open: CultWindow.#onOpen }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/cult.hbs` } };

  get isEarthbound() { return true; }
  async close(o) { Hooks.off("updateActor", this.hook); return super.close(o); }

  async _prepareContext() {
    const a = this.actor, s = a.system, c = s.cult ?? {}, R = reliquaryInfo(a);
    const worshipDots = R.worship / 2, faith = s.faith.temporary + R.faith;
    return {
      editable: a.isOwner, c, cultDots: R.cult, worshipDots,
      freq: t(`Freq.${Math.min(5, R.cult)}`), perRitual: R.worship, venMax: Math.min(2 * worshipDots, s.faith.permanent),
      venHours: 2 * worshipDots, faith, stasis: faith === 0, relFaith: R.faith, relMax: R.max,
      noWorship: !R.worship, noCult: !R.cult,
      members: (c.members ?? []).map((m, i) => ({ ...m, i, roles: ROLES.map(r => ({ value: r, label: t(`Role.${r}`), selected: r === m.role })) })),
      count: (c.members ?? []).length
    };
  }

  /** Расписание, место и культисты — правки полей. */
  static async #onSave(event, form, formData) {
    const d = foundry.utils.expandObject(formData.object), cur = this.actor.system.cult ?? {};
    const members = (cur.members ?? []).map((m, i) => ({ ...m, ...(d.members?.[i] ?? {}) }));
    await this.actor.update({ "system.cult.schedule": d.schedule ?? cur.schedule, "system.cult.place": d.place ?? cur.place, "system.cult.members": members });
  }

  /** Ритуал поклонения завершён: Вера в реликварий (по Поклонению), дата — в карточку. */
  static async #onWorship() {
    const date = shortDate(new Date(getClock()));
    await worshipRitual(this.actor);
    await this.actor.update({ "system.cult.last": date });
  }

  /** Ритуал прерван — Вера потеряна. */
  static async #onBroken() {
    return notice(this.actor, "fa-ban", t("Broken", { name: esc(this.actor.name) }), "is-sin");
  }

  /** Ритуал почитания: часов — до 2 за точку Поклонения; кубики к ближайшему призыву (не больше Веры). */
  static async #onVenerate() {
    const a = this.actor, R = reliquaryInfo(a), max = R.worship;
    const hours = Number(this.element.querySelector("[name=venHours]")?.value) || max;
    const dice = Math.max(0, Math.min(hours, max, a.system.faith.permanent));
    if (!dice) return ui.notifications.warn(t("NoWorship"));
    await a.update({ "system.cult.veneration": dice });
    return notice(a, "fa-hands-praying", t("Venerated", { name: esc(a.name), h: Math.min(hours, max), n: dice }));
  }

  static async #onAdd() {
    const m = [...(this.actor.system.cult?.members ?? []), { name: t("NewMember"), role: "faithful", uuid: "", note: "" }];
    await this.actor.update({ "system.cult.members": m });
  }
  static async #onDel(event, target) {
    const i = Number(target.dataset.index);
    await this.actor.update({ "system.cult.members": (this.actor.system.cult?.members ?? []).filter((_, j) => j !== i) });
  }
  static async #onOpen(event, target) { (await fromUuid(target.dataset.uuid))?.sheet?.render(true); }

  /** Культист — перетащенный персонаж: имя и ссылка. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.addEventListener("drop", async ev => {
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
      if (data?.type !== "Actor") return;
      const doc = await fromUuid(data.uuid);
      if (!doc) return;
      const m = [...(this.actor.system.cult?.members ?? []), { name: doc.name, role: "faithful", uuid: doc.uuid, note: "" }];
      await this.actor.update({ "system.cult.members": m });
    });
  }
}

export function openCult(actor) {
  const app = foundry.applications.instances.get(`r-cult-${actor.id}`) ?? new CultWindow(actor);
  return app.render({ force: true });
}

/** Беспамятство: смена суток на часах хроники — Привязанный без Веры теряет по пункту временной Воли за день. */
export function registerCult() {
  let lastDay = null;
  Hooks.on("updateSetting", s => {
    if (s.key !== `${SYSTEM_ID}.clock` || game.user !== game.users.activeGM) return;
    const day = Math.floor(getClock() / DAY);
    if (lastDay === null) { lastDay = day; return; }
    const days = day - lastDay;
    lastDay = day;
    if (days <= 0) return;
    for (const a of game.actors.filter(x => x.type === "demon" && x.system.earthbound)) {
      if (a.system.faith.temporary + (a.system.reliquary?.faith ?? 0) > 0) continue;
      const w = a.system.willpower.temporary, next = Math.max(0, w - days);
      if (next === w) continue;
      a.update({ "system.willpower.temporary": next });
      notice(a, "fa-bed", t(next === 0 ? "Stasis" : "StasisDrain", { name: esc(a.name), n: w - next, w: next }), "is-sin");
    }
  });
}
