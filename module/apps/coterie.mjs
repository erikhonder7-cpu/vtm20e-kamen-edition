// module/apps/coterie.mjs
// Общие факты биографии котерии (V20, «Общие факты биографии котерии», справочник: Факты_биографии/01):
//   · скидываться можно на Союзников, Информаторов, Домен, Стадо, Влияние, Богатство, Подручных
//     (и «Общее убежище» Anarchs Unbound — оно для этого и сделано);
//   · одна основа: ни один общий факт не выше неё; основа упала сюжетом — остальные снижаются до неё,
//     восстановлена — восстанавливаются (не выше вложенного);
//   · выйти можно в любой момент, но вернётся на 1 точку меньше;
//   · пользуются все вложившиеся; предел выше 5 допустим (рекомендуется до 10).
// Вклад переносит точки с листа участника в общий факт. Котерия — актёр типа «coterie» (свой лист: участники, домен,
// тотем, сеть охотников); старые котерии из настройки мира «coteries» читаются по-прежнему и при запуске переносятся в актёров.
// Чем пользуются правила: охота берёт Стадо и Домен котерии, если они больше своих; доход от Богатства
// котерии делится между участниками (apps/income.mjs).

import { Codex } from "../data/codex.mjs";
import { SYSTEM_ID, SYSTEM_PATH, VTM20 } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const uid = () => foundry.utils.randomID(8);

/** Какие факты биографии можно складывать (имена — как в data/backgrounds.json). */
export const POOLABLE = ["Домен", "Стадо", "Богатство", "Влияние", "Союзники", "Информаторы", "Подручные", "Общее убежище",
  // стая Гару (W20, гл. 3): объединяемые Факты и Тотем
  "Связи", "Судьба", "Родня", "Ресурсы", "Тотем"];
const MAX = 10;

export function registerCoterie() {
  // котерия-актёр изменилась — окно общих фактов и листы участников перерисовать
  const redraw = a => {
    if (a?.type !== "coterie") return;
    foundry.applications.instances.get("r-coterie")?.render();
    for (const id of a.system?.members ?? []) game.actors.get(id)?.sheet?.rendered && game.actors.get(id).sheet.render();
  };
  for (const h of ["createActor", "updateActor", "deleteActor"]) Hooks.on(h, redraw);
  // перенос старых котерий (настройка мира) в актёров — один раз, у активного ведущего
  Hooks.once("ready", async () => {
    if (!game.users.activeGM?.isSelf) return;
    const old = foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "coteries") ?? []);
    if (!old.length || game.settings.get(SYSTEM_ID, "coteriesMoved")) return;
    for (const c of old) await Actor.create({ name: c.name || t("Coterie.Title"), type: "coterie", system: { kind: c.totem ? "pack" : "coterie",
      members: c.members ?? [], primary: c.primary ?? "", pools: c.pools ?? {}, lost: c.lost ?? {}, totem: c.totem ?? "" } });
    await game.settings.set(SYSTEM_ID, "coteries", []);
    await game.settings.set(SYSTEM_ID, "coteriesMoved", true);
  });
  game.settings.register(SYSTEM_ID, "coteriesMoved", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(SYSTEM_ID, "coteries", {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => {
      foundry.applications.instances.get("r-coterie")?.render();
      for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor" && app.rendered) app.render();
    }
  });
}

/** Котерия-актёр в общем виде (как запись из настройки). */
export const coterieFromActor = a => ({ id: a.id, actorId: a.id, name: a.name, kind: a.system.kind, members: [...(a.system.members ?? [])], primary: a.system.primary ?? "",
  pools: foundry.utils.deepClone(a.system.pools ?? {}), lost: foundry.utils.deepClone(a.system.lost ?? {}), totem: a.system.totem ?? "", domain: a.system.domain ?? "" });
const legacy = () => foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "coteries") ?? []);
const read = () => [...(game.actors?.filter(a => a.type === "coterie").map(coterieFromActor) ?? []), ...legacy()];
/** Сохранить: котерии-актёры — в актёров (удалённые ключи — через «-=»), старые — в настройку; пропавшие из списка — удалить. */
async function save(list) {
  for (const a of game.actors.filter(x => x.type === "coterie" && !list.some(c => c.actorId === x.id))) await a.delete();
  for (const c of list.filter(c => c.actorId)) {
    const a = game.actors.get(c.actorId);
    if (!a) continue;
    const upd = { name: c.name, "system.members": c.members ?? [], "system.primary": c.primary ?? "", "system.totem": c.totem ?? "" };
    for (const field of ["pools", "lost"]) {
      const was = a.system[field] ?? {}, now = c[field] ?? {};
      for (const k of Object.keys(was)) {
        if (!(k in now)) { upd[`system.${field}.-=${k}`] = null; continue; }
        if (field === "pools") for (const id of Object.keys(was[k] ?? {})) if (!(id in (now[k] ?? {}))) upd[`system.pools.${k}.-=${id}`] = null;
      }
      for (const [k, v] of Object.entries(now)) {
        if (field === "pools") for (const [id, n] of Object.entries(v ?? {})) upd[`system.pools.${k}.${id}`] = n;
        else upd[`system.lost.${k}`] = v;
        if (field === "pools" && !Object.keys(v ?? {}).length && !(k in was)) upd[`system.pools.${k}`] = {};
      }
    }
    await a.update(upd);
  }
  const rest = list.filter(c => !c.actorId);
  if (JSON.stringify(rest) !== JSON.stringify(legacy())) await game.settings.set(SYSTEM_ID, "coteries", rest);
}

/**
 * Тотем стаи (W20, гл. 12): у котерии с Гару — выбор тотема, его цена против общего Факта «Тотем»,
 * бонусы каждому и стае, запрет. Данные — data/werewolf.json → totems.
 */
function packTotem(c, members) {
  if (!members.some(a => a.type === "werewolf")) return { pack: false };
  const all = Codex.werewolf?.totems ?? [], tot = all.find(x => x.key === c.totem) ?? null, pool = c.pools?.["Тотем"] ? poolValue(c, "Тотем") : 0;
  return { pack: true, totem: tot, totemPool: pool, totemShort: tot ? Math.max(0, tot.cost - pool) : 0,
    totems: all.map(x => ({ key: x.key, label: `${x.name} (${x.cat}, ${x.cost})`, selected: x.key === c.totem })) };
}
/** Тотем стаи персонажа — для карточки Гару. */
export function totemOf(actor) {
  const c = coteriesOf(actor).find(x => x.totem);
  return c ? { pack: c.name, totem: (Codex.werewolf?.totems ?? []).find(x => x.key === c.totem) ?? null } : null;
}

/** Синонимы названий черт в описаниях тотемов (W20) — к ключам листа. */
const TOTEM_ALIAS = { "знание улиц": "abilities.streetwise", "загадки": "abilities.enigmas", "первобытный инстинкт": "abilities.primalUrge",
  "обращение с животными": "abilities.animalKen", "хитрость": "abilities.subterfuge", "драка": "abilities.brawl" };

/**
 * Черты тотема стаи (W20, гл. 7: «Лидерство 3», «Скрытность 3, Знание улиц 3»): точки, которые тотем даёт каждому члену стаи,
 * — прибавка к черте в броске. Возвращает { [путь черты]: точки } и имя тотема.
 */
export function totemTraits(actor) {
  const tt = totemOf(actor)?.totem;
  if (!tt?.pack) return null;
  const names = {};
  for (const [k, x] of Object.entries(VTM20.attributes)) names[game.i18n.localize(x.label).toLowerCase()] = `attributes.${k}`;
  for (const [k, x] of Object.entries(VTM20.abilities)) names[game.i18n.localize(x.label).toLowerCase()] = `abilities.${k}`;
  Object.assign(names, TOTEM_ALIAS);
  const traits = {};
  for (const [, name, n] of String(tt.pack).replace(/<[^>]+>/g, "").matchAll(/(?:^|[,;]\s*)([А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z ]+?)\s+(\d)(?=\s*(?:[,;.]|$))/g)) {
    const path = names[name.trim().toLowerCase()];
    if (path) traits[path] = Math.max(traits[path] ?? 0, Number(n));
  }
  return Object.keys(traits).length ? { name: tt.name, traits } : null;
}

/** Сколько вложено в общий факт. */
const vested = (c, bg) => Object.values(c.pools?.[bg] ?? {}).reduce((s, n) => s + (n || 0), 0);

/**
 * Действующее значение общего факта: вложенное минус потерянное сюжетом; не основа — не выше основы.
 * @returns {number}
 */
export function poolValue(c, bg) {
  const own = Math.max(0, vested(c, bg) - (c.lost?.[bg] ?? 0));
  if (!c.primary || bg === c.primary) return own;
  return Math.min(own, poolValue(c, c.primary));
}

/** Котерии, где состоит персонаж. */
export const coteriesOf = actor => read().filter(c => (c.members ?? []).includes(actor?.id));

/** Наибольшее значение общего факта среди котерий персонажа (для охоты и дохода). */
export function coterieBg(actor, bg) {
  return Math.max(0, ...coteriesOf(actor).filter(c => bg in (c.pools ?? {})).map(c => poolValue(c, bg)));
}

/** Точки факта биографии на листе (предмет «background»); ставит — создаёт, если не было. */
const bgItem = (actor, bg) => actor.items.find(i => i.type === "background" && i.name.toLowerCase() === bg.toLowerCase());
async function setSheetBg(actor, bg, value) {
  const it = bgItem(actor, bg);
  if (it) return value > 0 ? it.update({ "system.value": value }) : it.delete();
  if (value > 0) return actor.createEmbeddedDocuments("Item", [{ name: bg, type: "background", system: { value } }]);
}

export function openCoterie(actor = null, id = null) {
  const open = foundry.applications.instances.get("r-coterie");
  const app = open ?? new CoterieWindow();
  const mine = actor && coteriesOf(actor)[0];
  if (id) app.current = id;
  else if (mine) app.current = mine.id;
  app.render({ force: true });
  return app;
}

class CoterieWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-coterie",
    classes: ["vtm20", "r-dialog", "r-court-app", "r-cot-app"],
    window: { title: "VTM20.Coterie.Title", icon: "fa-solid fa-people-roof", resizable: true },
    position: { width: 980, height: 640 },
    actions: {
      pick: CoterieWindow.#onPick, create: CoterieWindow.#onCreate, rename: CoterieWindow.#onRename, remove: CoterieWindow.#onRemove,
      addMember: CoterieWindow.#onAddMember, dropMember: CoterieWindow.#onDropMember, addPool: CoterieWindow.#onAddPool,
      dropPool: CoterieWindow.#onDropPool, primary: CoterieWindow.#onPrimary, give: CoterieWindow.#onGive, take: CoterieWindow.#onTake,
      lose: CoterieWindow.#onLose, restore: CoterieWindow.#onRestore, sheet: CoterieWindow.#onSheet, totem: CoterieWindow.#onTotem
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/coterie.hbs` } };

  current = null;

  /** Котерии, видимые пользователю: ведущему — все, игроку — где состоят его персонажи. */
  #visible() {
    const all = read();
    return game.user.isGM ? all : all.filter(c => (c.members ?? []).some(id => game.actors.get(id)?.isOwner));
  }

  async _prepareContext() {
    const list = this.#visible(), gm = game.user.isGM;
    if (!list.some(c => c.id === this.current)) this.current = list[0]?.id ?? null;
    const c = list.find(x => x.id === this.current);
    let cot = null;
    if (c) {
      const members = (c.members ?? []).map(id => game.actors.get(id)).filter(Boolean);
      const primaryValue = c.primary ? poolValue(c, c.primary) : 0;
      cot = {
        id: c.id, name: c.name,
        members: members.map(a => ({ id: a.id, name: a.name, img: a.img, owner: a.isOwner })),
        pools: Object.keys(c.pools ?? {}).map(bg => {
          const v = poolValue(c, bg), raw = Math.max(0, vested(c, bg) - (c.lost?.[bg] ?? 0));
          return {
            bg, value: v, primary: bg === c.primary, capped: bg !== c.primary && raw > v, lost: c.lost?.[bg] ?? 0,
            dots: Array.from({ length: MAX }, (_, i) => ({ on: i < v })),
            shares: members.map(a => ({ id: a.id, name: a.name, n: c.pools[bg]?.[a.id] ?? 0, sheet: bgItem(a, bg)?.system.value ?? 0 }))
          };
        }),
        canAdd: POOLABLE.filter(bg => !(bg in (c.pools ?? {}))),
        candidates: game.actors.filter(a => ["vampire", "ghoul", "mortal", "demon", "hunter", "werewolf"].includes(a.type) && !(c.members ?? []).includes(a.id))
          .sort((x, y) => (y.hasPlayerOwner - x.hasPlayerOwner) || x.name.localeCompare(y.name, "ru")).map(a => ({ id: a.id, name: a.name })),
        primaryValue, ...packTotem(c, members)
      };
    }
    return {
      gm, cot,
      cats: list.map(x => ({ id: x.id, name: x.name, active: x.id === this.current, n: (x.members ?? []).length })),
      empty: !list.length
    };
  }

  /** Изменить текущую котерию и сохранить. */
  static async #onTotem(event, target) {
    const key = target.closest(".r-cot-totem")?.querySelector("select")?.value ?? "";
    return this.#edit(c => { c.totem = key; });
  }

  async #edit(fn) {
    if (!game.user.isGM) return ui.notifications.warn(t("Coterie.GMOnly"));
    const all = read(), c = all.find(x => x.id === this.current);
    if (!c) return;
    c.pools ??= {}; c.lost ??= {}; c.members ??= [];
    if ((await fn(c)) === false) return;
    await save(all);
  }

  static #onPick(event, target) { this.current = target.dataset.id; this.render(); }
  static #onSheet(event, target) { game.actors.get(target.dataset.actorId)?.sheet.render(true); }

  static async #onCreate() {
    if (!game.user.isGM) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Coterie.New") }, classes: ["vtm20", "r-dialog"],
      content: `<label class="r-field"><span>${t("Coterie.Name")}</span><input type="text" name="name" autofocus></label>`,
      ok: { label: t("Coterie.Create"), callback: (e, b) => b.form.elements.name.value.trim() }, rejectClose: false
    });
    if (!name) return;
    const a = await Actor.create({ name, type: "coterie" });
    this.current = a.id;
    this.render();
  }

  static async #onRename(event, target) { await this.#edit(c => { c.name = target.value.trim() || c.name; }); }

  static async #onRemove() {
    if (!game.user.isGM) return;
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Coterie.Remove") }, content: `<p>${t("Coterie.RemoveHint")}</p>`, rejectClose: false });
    if (!ok) return;
    await save(read().filter(x => x.id !== this.current));
  }

  static async #onAddMember() {
    const id = this.element.querySelector("select[name=cot-member]")?.value;
    if (id) await this.#edit(c => { if (!c.members.includes(id)) c.members.push(id); });
  }

  /** Участник уходит: его вклады возвращаются на лист с потерей точки (как при выходе). */
  static async #onDropMember(event, target) {
    const id = target.dataset.actorId, a = game.actors.get(id);
    await this.#edit(async c => {
      for (const bg of Object.keys(c.pools)) if (c.pools[bg][id]) await CoterieWindow.#withdraw(c, bg, a ?? null, id);
      c.members = c.members.filter(x => x !== id);
    });
  }

  static async #onAddPool() {
    const bg = this.element.querySelector("select[name=cot-pool]")?.value;
    if (bg) await this.#edit(c => { c.pools[bg] ??= {}; if (!c.primary) c.primary = bg; });
  }

  /** Убрать общий факт: все вклады возвращаются с потерей точки. */
  static async #onDropPool(event, target) {
    const bg = target.dataset.bg;
    await this.#edit(async c => {
      for (const id of Object.keys(c.pools[bg] ?? {})) await CoterieWindow.#withdraw(c, bg, game.actors.get(id) ?? null, id);
      delete c.pools[bg]; delete c.lost[bg];
      if (c.primary === bg) c.primary = Object.keys(c.pools)[0] ?? "";
    });
  }

  static async #onPrimary(event, target) { await this.#edit(c => { c.primary = target.dataset.bg; }); }

  /** Вклад: 1 точка с листа участника в общий факт. */
  static async #onGive(event, target) {
    const { bg, actorId } = target.dataset, a = game.actors.get(actorId);
    await this.#edit(async c => {
      const have = bgItem(a, bg)?.system.value ?? 0;
      if (have < 1) { ui.notifications.warn(t("Coterie.NoDots", { name: a.name, bg })); return false; }
      if (vested(c, bg) >= MAX) { ui.notifications.warn(t("Coterie.Max", { n: MAX })); return false; }
      await setSheetBg(a, bg, have - 1);
      c.pools[bg][actorId] = (c.pools[bg][actorId] ?? 0) + 1;
    });
  }

  /** Выход из общего факта: вклад возвращается на лист на 1 точку меньше. */
  static async #onTake(event, target) {
    const { bg, actorId } = target.dataset;
    await this.#edit(c => CoterieWindow.#withdraw(c, bg, game.actors.get(actorId) ?? null, actorId));
  }

  static async #withdraw(c, bg, actor, id) {
    const n = c.pools[bg]?.[id] ?? 0;
    if (!n) return;
    delete c.pools[bg][id];
    if (actor) await setSheetBg(actor, bg, (bgItem(actor, bg)?.system.value ?? 0) + n - 1);
    ChatMessage.create({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : { alias: c.name },
      whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
      content: `<div class="r-notice"><i class="fa-solid fa-people-roof"></i> ${t("Coterie.Left", { name: actor?.name ?? "?", bg, n, back: Math.max(0, n - 1), cot: c.name })}</div>` });
  }

  /** Сюжет отнял точку (поджог, разгром) — у основы это тянет вниз и остальные. */
  static async #onLose(event, target) { const bg = target.dataset.bg; await this.#edit(c => { if (poolValue(c, bg) > 0) c.lost[bg] = (c.lost[bg] ?? 0) + 1; }); }
  static async #onRestore(event, target) { const bg = target.dataset.bg; await this.#edit(c => { if (c.lost[bg]) c.lost[bg] -= 1; }); }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // имя котерии правится прямо в заголовке
    this.element.addEventListener("change", ev => { if (ev.target.matches("input[name=cot-name]")) CoterieWindow.#onRename.call(this, ev, ev.target); });
    // персонажа можно перетащить из каталога
    this.element.addEventListener("dragover", ev => ev.preventDefault());
    this.element.addEventListener("drop", async ev => {
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      if (data?.type !== "Actor") return;
      const a = await fromUuid(data.uuid);
      if (a) await this.#edit(c => { if (!c.members.includes(a.id)) c.members.push(a.id); });
    });
  }
}
