// module/apps/session-panel.mjs
// Панель сессии рассказчика (план 17): одно окно — кто на какой сцене, у кого мало крови, Воли, Ярости, Гнозиса,
// Убеждённости, Веры, сколько ран; кто в торпоре, бешенстве, Харано, Ротшреке, пронзён колом. Щелчок по имени — лист,
// по сцене — сцена и жетон. Порог «мало» — четверть запаса или 1 (правило системы, только подсветка).

import { SYSTEM_PATH } from "../config.mjs";
import { torporOf } from "./torpor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const ID = "r-session-panel";
/** Персонажи хроники: люди и сверхъестественные с листом (без котерий, доменов и существ). */
const PEOPLE = ["vampire", "ghoul", "mortal", "demon", "hunter", "werewolf"];
/** Состояния на панели — по порядку тяжести. */
const STATES = ["r-torpor", "r-staked", "r-frenzy", "r-rotschreck", "r-harano", "r-rapture", "r-stunned", "r-held", "r-prone"];

export function openSessionPanel() {
  if (!game.user.isGM) { ui.notifications.warn(t("Notify.GMOnly")); return null; }
  const open = foundry.applications.instances.get(ID);
  if (open) { open.render({ force: true }); open.bringToFront?.(); return open; }
  const app = new SessionPanel();
  app.render({ force: true });
  return app;
}

/** Перерисовка при изменениях персонажей, жетонов и состояний — только если панель открыта. */
export function registerSessionPanel() {
  const redraw = foundry.utils.debounce(() => foundry.applications.instances.get(ID)?.render(), 250);
  for (const h of ["updateActor", "createToken", "deleteToken", "updateToken", "createActiveEffect", "deleteActiveEffect", "canvasReady", "updateScene"])
    Hooks.on(h, () => { if (foundry.applications.instances.get(ID)) redraw(); });
}

/** Запас: значение, предел и «мало» (не больше четверти или 1). */
function pool(key, value, max, icon) {
  if (max == null || max <= 0) return null;
  const v = Math.max(0, value ?? 0);
  return { key, label: t(`Session.Pool.${key}`), icon, value: v, max, low: v <= Math.max(1, Math.floor(max / 4)), pct: Math.round(Math.min(1, v / max) * 100) };
}

/** Где персонаж: сцены, на которых стоит его жетон (связанный или по актёру). */
function placesOf(a) {
  return game.scenes.contents.flatMap(s => s.tokens.filter(tk => tk.actorId === a.id).map(tk => ({ scene: s, token: tk })));
}

function row(a) {
  const s = a.system, places = placesOf(a), torpor = torporOf(a);
  const hurt = (s.health?.bashing ?? 0) + (s.health?.lethal ?? 0) + (s.health?.aggravated ?? 0), levels = 7 + (s.formFx?.health ?? 0);
  const pools = [
    a.system.hasBlood ? pool("blood", s.blood?.value, s.blood?.max, "fa-droplet") : null,
    pool("will", s.willpower?.temporary, s.willpower?.permanent, "fa-shield-heart"),
    a.type === "werewolf" ? pool("rage", s.werewolf?.rage?.value, s.werewolf?.rage?.permanent, "fa-fire") : null,
    a.type === "werewolf" ? pool("gnosis", s.werewolf?.gnosis?.value, s.werewolf?.gnosis?.permanent, "fa-moon") : null,
    a.type === "hunter" ? pool("conviction", s.hunter?.conviction, 10, "fa-sun") : null,
    a.type === "demon" ? pool("faith", s.faith?.temporary, s.faith?.permanent, "fa-hand-sparkles") : null
  ].filter(Boolean);
  const states = STATES.filter(id => a.statuses?.has(id) || (id === "r-torpor" && torpor))
    .map(id => ({ id, label: game.i18n.localize(CONFIG.statusEffects.find(e => e.id === id)?.name ?? id), img: CONFIG.statusEffects.find(e => e.id === id)?.img }));
  const owner = game.users.find(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  return {
    id: a.id, name: a.name, img: a.img, type: game.i18n.localize(`TYPES.Actor.${a.type}`), player: owner?.name ?? "", color: owner?.color?.css ?? "",
    places: places.map(p => ({ scene: p.scene.id, token: p.token.id, name: p.scene.navName || p.scene.name, active: p.scene.active, viewed: p.scene.isView })),
    hurt, levels, hurtPct: Math.round(Math.min(1, hurt / levels) * 100), hurtLow: hurt >= levels - 2, pools, states,
    alert: pools.some(p => p.low) || hurt >= levels - 2 || states.length > 0
  };
}

class SessionPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: ID,
    classes: ["vtm20", "r-dialog", "r-session-app"],
    window: { title: "VTM20.Session.Title", icon: "fa-solid fa-table-list", resizable: true },
    position: { width: 860, height: 560 },
    actions: { sheet: SessionPanel.#onSheet, token: SessionPanel.#onToken, filter: SessionPanel.#onFilter }
  };
  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/session-panel.hbs`, scrollable: [".r-sp-scroll"] } };

  /** Кого показывать: игроки (по умолчанию), все на сценах, только тревоги. */
  filter = "players";

  async _prepareContext() {
    const onScene = new Set(game.scenes.contents.flatMap(s => s.tokens.map(tk => tk.actorId)));
    const list = game.actors.filter(a => PEOPLE.includes(a.type) && (this.filter === "scene" ? onScene.has(a.id) : a.hasPlayerOwner));
    let rows = list.map(row);
    if (this.filter === "alert") rows = rows.filter(r => r.alert);
    rows.sort((x, y) => (y.alert - x.alert) || x.name.localeCompare(y.name, "ru"));
    // по сценам: сначала активная, затем прочие по имени; «вне сцен» — в конце
    const groups = new Map();
    for (const r of rows) {
      const key = r.places[0]?.scene ?? "";
      if (!groups.has(key)) {
        const sc = game.scenes.get(key);
        groups.set(key, { key, name: sc ? sc.navName || sc.name : t("Session.NoScene"), active: !!sc?.active, rows: [] });
      }
      groups.get(key).rows.push(r);
    }
    const scenes = [...groups.values()].sort((x, y) => (y.active - x.active) || (!x.key - !y.key) || x.name.localeCompare(y.name, "ru"));
    return {
      scenes, total: rows.length, alerts: rows.filter(r => r.alert).length,
      filters: ["players", "scene", "alert"].map(k => ({ key: k, label: t(`Session.Filter.${k}`), active: this.filter === k }))
    };
  }

  static #onSheet(event, target) { game.actors.get(target.dataset.id)?.sheet.render(true); }
  static #onFilter(event, target) { this.filter = target.dataset.filter; this.render(); }
  /** К жетону: открыть его сцену (без активации для игроков), навести камеру и выделить. */
  static async #onToken(event, target) {
    const sc = game.scenes.get(target.dataset.scene), tk = sc?.tokens.get(target.dataset.token);
    if (!sc || !tk) return;
    if (!sc.isView) await sc.view();
    for (let i = 0; i < 30 && canvas.scene?.id !== sc.id; i++) await new Promise(r => setTimeout(r, 100));
    const obj = tk.object;
    if (obj) { obj.control({ releaseOthers: true }); canvas.animatePan({ x: obj.center.x, y: obj.center.y, duration: 400 }); }
  }
}
