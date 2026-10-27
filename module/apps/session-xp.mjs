// module/apps/session-xp.mjs
// Раздача опыта после сессии (план 1): одно окно рассказчика на всех персонажей игроков.
// Критерии V20 (гл. 6, «Опыт»): за ночь — был на игре, учился, отыгрыш, героизм; в конце истории —
// успех, опасность, мудрость. «Своё» — плюс или минус сколько угодно, свои правила — отдельными столбцами.
// Каждому — строка в журнал опыта листа с датой хроники; итог — карточкой в чат; раздачи — в настройке мира.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { getClock, nightNumber, nightNote, longDate, shortDate, republicanDate } from "./calendar.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Критерии книги: за каждую ночь и в конце истории (по 1 опыту). */
const NIGHT = ["present", "learned", "acting", "heroism"];
const STORY = ["success", "danger", "wisdom"];

/** Персонажи игроков: Сородичи, гули и смертные, у которых есть владелец-игрок. */
function players() {
  return game.actors.filter(a => a.hasPlayerOwner && ["vampire", "ghoul", "mortal", "demon", "hunter"].includes(a.type))
    .sort((x, y) => x.name.localeCompare(y.name, "ru"));
}

export function openSessionXp() {
  if (!game.user.isGM) { ui.notifications.warn(t("Notify.GMOnly")); return null; }
  const open = foundry.applications.instances.get("r-session-xp");
  if (open) { open.render({ force: true }); open.bringToFront?.(); return open; }
  return new SessionXp().render({ force: true });
}

/** Раздачи прошлых ночей (новые сверху). */
export function registerSessionXp() {
  game.settings.register(SYSTEM_ID, "xpSessions", { scope: "world", config: false, type: Array, default: [] });
}

class SessionXp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-session-xp",
    classes: ["vtm20", "r-dialog", "r-sxp-app"],
    window: { title: "VTM20.SessionXp.Title", icon: "fa-solid fa-star", resizable: true },
    position: { width: 1080, height: 620 },
    actions: {
      allPresent: SessionXp.#onAllPresent, story: SessionXp.#onStory, custom: SessionXp.#onCustom,
      dropRule: SessionXp.#onDropRule, bump: SessionXp.#onBump, grant: SessionXp.#onGrant
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/session-xp.hbs`, scrollable: [".r-sxp-scroll"] } };

  /** Отметки по персонажам: { id: { present, learned, …, custom: { ruleId: bool }, extra } }. */
  marks = {};
  /** В конце истории открываются её критерии. */
  story = false;
  /** Свои правила этой раздачи: [{ id, label }]. */
  rules = [];
  /** Запись в журнал — пока рассказчик её не правил, подставляется ночь и заметка календаря. */
  label = null;

  #mark(id) {
    return this.marks[id] ??= { present: true, learned: false, acting: false, heroism: false, success: false, danger: false, wisdom: false, custom: {}, extra: 0 };
  }

  /** Итог персонажа: не был на игре — ноль. */
  #total(m) {
    if (!m.present) return 0;
    const keys = [...NIGHT, ...(this.story ? STORY : [])];
    return keys.filter(k => m[k]).length + this.rules.filter(r => m.custom[r.id]).length + m.extra;
  }

  #defaultLabel(ms = getClock()) {
    const n = nightNumber(ms), note = nightNote(ms);
    return note ? t("SessionXp.LabelNote", { n, note }) : t("SessionXp.Label", { n });
  }

  async _prepareContext() {
    const ms = getClock(), d = new Date(ms);
    const crit = [...NIGHT.map(k => ({ key: k, label: t(`SessionXp.C.${k}`), sub: "+1", night: true })),
      ...STORY.map(k => ({ key: k, label: t(`SessionXp.C.${k}`), sub: t("SessionXp.StoryCol"), story: true, off: !this.story }))];
    const rows = players().map(a => {
      const m = this.#mark(a.id), total = this.#total(m);
      return {
        id: a.id, name: a.name, img: a.img, clan: a.isVampire ? a.clanLabel : game.i18n.localize(`TYPES.Actor.${a.type}`),
        absent: !m.present, total, extra: m.extra,
        cells: [...crit.map(c => ({ key: c.key, on: !!m[c.key], off: c.off || (!m.present && c.key !== "present"), story: c.story })),
          ...this.rules.map(r => ({ key: r.id, custom: true, on: !!m.custom[r.id], off: !m.present }))]
      };
    });
    const sum = rows.reduce((n, r) => n + r.total, 0), present = rows.filter(r => !r.absent).length;
    const history = (game.settings.get(SYSTEM_ID, "xpSessions") ?? []).slice(0, 12).map(s => {
      const list = s.awards ?? [], same = list.length > 1 && list.every(x => x.amount === list[0].amount);
      return { n: s.n, label: s.label, story: s.story,
        who: same ? t("SessionXp.Everyone", { n: list[0].amount }) : list.map(x => `${x.name} ${x.amount}`).join(" · ") };
    });
    return {
      crit, rules: this.rules, rows, sum, story: this.story, history,
      present, count: rows.length, night: nightNumber(ms),
      label: this.label ?? this.#defaultLabel(ms),
      when: [longDate(d), republicanDate(ms)].filter(Boolean).join(" · "),
      who: t("SessionXp.Who", { n: present, of: rows.length })
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Галочки и запись в журнал — делегированием на корне окна (корень не пересоздаётся при перерисовке)
    this.element.addEventListener("change", ev => {
      const box = ev.target.closest("input[data-crit]");
      if (box) {
        const m = this.#mark(box.dataset.actor);
        if (box.dataset.custom) m.custom[box.dataset.crit] = box.checked; else m[box.dataset.crit] = box.checked;
        this.render();
        return;
      }
      if (ev.target.matches("input[name=label]")) this.label = ev.target.value;
    });
    this.hook = Hooks.on("updateActor", a => { if (a.hasPlayerOwner) this.render(); });
  }

  async close(options) {
    Hooks.off("updateActor", this.hook);
    return super.close(options);
  }

  static #onAllPresent() {
    for (const a of players()) this.#mark(a.id).present = true;
    this.render();
  }

  static #onStory() { this.story = !this.story; this.render(); }

  /** Своё правило — новый столбец галочек (по 1 опыту). */
  static async #onCustom() {
    const label = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("SessionXp.CustomTitle"), icon: "fa-solid fa-plus" },
      classes: ["vtm20", "r-dialog"],
      content: `<div class="r-form"><label class="r-field"><span>${t("SessionXp.CustomName")}</span><input type="text" name="label" autofocus></label></div>`,
      ok: { label: t("SessionXp.CustomAdd"), callback: (e, b) => b.form.elements.label.value.trim() },
      rejectClose: false
    });
    if (!label) return;
    this.rules.push({ id: foundry.utils.randomID(6), label });
    this.render();
  }

  static #onDropRule(event, target) {
    this.rules = this.rules.filter(r => r.id !== target.dataset.rule);
    this.render();
  }

  /** «Своё» у строки: плюс или минус по единице. */
  static #onBump(event, target) {
    const m = this.#mark(target.dataset.actor);
    m.extra += Number(target.dataset.step) || 0;
    this.render();
  }

  /** Начислить: строка в журнал опыта каждого, карточка в чат, запись раздачи в настройку мира. */
  static async #onGrant() {
    const label = (this.element.querySelector("input[name=label]")?.value ?? "").trim() || this.#defaultLabel();
    const ms = getClock(), n = nightNumber(ms);
    const date = t("SessionXp.Date", { date: shortDate(new Date(ms)), n });
    const awards = [];
    for (const a of players()) {
      const m = this.#mark(a.id), amount = this.#total(m);
      if (!amount) continue;
      const why = [...NIGHT, ...(this.story ? STORY : [])].filter(k => m[k]).map(k => t(`SessionXp.C.${k}`))
        .concat(this.rules.filter(r => m.custom[r.id]).map(r => r.label))
        .concat(m.extra ? [`${t("SessionXp.Extra")} ${m.extra > 0 ? "+" : ""}${m.extra}`] : []);
      const x = a._source.system.experience, log = foundry.utils.deepClone(x.log);
      log.unshift({ amount, reason: `${label}${why.length ? ` (${why.join(", ")})` : ""}`, date });
      await a.update({ "system.experience.log": log, "system.experience.total": Math.max(0, x.total + amount) });
      awards.push({ id: a.id, name: a.name, amount });
    }
    if (!awards.length) { ui.notifications.warn(t("SessionXp.NothingToGrant")); return; }
    const list = game.settings.get(SYSTEM_ID, "xpSessions") ?? [];
    await game.settings.set(SYSTEM_ID, "xpSessions", [{ n, label, story: this.story, date, awards }, ...list].slice(0, 200));
    await ChatMessage.create({
      speaker: { alias: t("SessionXp.Title") },
      content: `<div class="r-notice r-sxp-card"><i class="fa-solid fa-star"></i> <b>${esc(label)}</b><ul>${awards.map(x =>
        `<li><b>${esc(x.name)}</b> +${x.amount}</li>`).join("")}</ul></div>`
    });
    ui.notifications.info(t("SessionXp.Granted", { n: awards.reduce((s, x) => s + x.amount, 0) }));
    // следующая раздача — с чистого листа: все были, остальное снято
    this.marks = {}; this.story = false; this.rules = []; this.label = null;
    this.render();
  }
}
