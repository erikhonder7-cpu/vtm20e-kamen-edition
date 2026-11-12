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

/** Какие факты биографии можно складывать (имена — как в data/backgrounds.json). */
const POOLABLE = ["Домен", "Стадо", "Богатство", "Влияние", "Союзники", "Информаторы", "Подручные", "Общее убежище",
  // стая Гару (W20, гл. 3): объединяемые Факты и Тотем
  "Связи", "Судьба", "Родня", "Ресурсы", "Тотем",
  // Круг призраков (Wraith 20, Предыстория «Обиталище»: с согласия рассказчика точки складывают в общее Обиталище)
  "Обиталище"];
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
/** Тотем стаи персонажа — для карточки Гару (packId — актёр стаи: запасы тотема и запрет — на нём). */
export function totemOf(actor) {
  const c = coteriesOf(actor).find(x => x.totem);
  return c ? { pack: c.name, packId: c.actorId ?? null, totem: (Codex.werewolf?.totems ?? []).find(x => x.key === c.totem) ?? null } : null;
}

/* ── Что даёт тотем (W20, гл. 12, «Тотемы стай») ──────────────────────────
   Индивидуальные черты — каждому члену стаи: Атрибуты и Способности (+N), временная Слава при принятии тотема;
   оговорки («только для…», «раз в день») и всё прочее — текстом. Запасы стаи (Воля, Ярость, Гнозис) тратятся
   вместо своих очков и восстанавливаются в конце каждой истории. Нарушенный запрет лишает стаю всех бонусов
   до Ритуала Раскаяния. */
const ATTR_ALIAS = { "харизма": "charisma", "манипулирование": "manipulation", "стойкость": "stamina", "внешность": "appearance" };
const RENOWN_STEM = [["слав", "glory"], ["чест", "honor"], ["мудрост", "wisdom"]];
const POOL_STEM = [["вол", "willpower"], ["ярост", "rage"], ["гнозис", "gnosis"]];
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "");
const stem = (list, w) => list.find(([p]) => w.startsWith(p))?.[1] ?? null;

function totemPerks(tt) {
  const out = { attr: {}, traits: {}, renown: {}, pools: {} };
  if (!tt) return out;
  const attrs = { ...ATTR_ALIAS }, abil = {};
  for (const [k, x] of Object.entries(VTM20.attributes)) attrs[game.i18n.localize(x.label).toLowerCase()] = k;
  for (const [k, x] of Object.entries(VTM20.abilities)) abil[game.i18n.localize(x.label).toLowerCase()] = k;
  // «+2 Чести», «+1 Сила», «+2 Лидерство» — отдельной частью перечня, без оговорок после названия
  for (const [, sign, n, word] of plain(tt.individual).matchAll(/(?:^|[;,]\s*)([+−-])(\d+)\s+([А-ЯЁ][а-яё]+)(?=\s*(?:[;,.]|$))/g)) {
    const v = (sign === "+" ? 1 : -1) * Number(n), w = word.toLowerCase(), rk = stem(RENOWN_STEM, w);
    if (rk) out.renown[rk] = (out.renown[rk] ?? 0) + v;
    else if (attrs[w]) out.attr[attrs[w]] = (out.attr[attrs[w]] ?? 0) + v;
    else if (abil[w]) out.traits[`abilities.${abil[w]}`] = v;
  }
  for (const [, n, word] of plain(tt.pack).matchAll(/(\d+)\s+(Вол\S*|Ярост\S*|Гнозис\S*)/g)) {
    const k = stem(POOL_STEM, word.toLowerCase());
    if (k) out.pools[k] = Number(n);
  }
  return out;
}

/** Запасы тотема на стае: { willpower: { max, left } … }; потраченное — флаг актёра стаи. */
export function totemPools(pack) {
  const tt = (Codex.werewolf?.totems ?? []).find(x => x.key === pack?.system?.totem);
  const spent = pack?.getFlag(SYSTEM_ID, "totemSpent") ?? {};
  return Object.fromEntries(Object.entries(totemPerks(tt).pools).map(([k, max]) => [k, { max, left: Math.max(0, max - (spent[k] ?? 0)) }]));
}
export const totemBanned = pack => !!pack?.getFlag(SYSTEM_ID, "totemBan");

/** Потратить очко из запаса тотема вместо своего (член стаи или рассказчик; лист стаи должен быть доступен на запись). */
export async function spendTotemPool(pack, key, by = null) {
  if (!pack?.isOwner) { ui.notifications.warn(t("Group.TotemPoolNoAccess")); return false; }
  if (totemBanned(pack)) { ui.notifications.warn(t("Group.TotemBanned")); return false; }
  const p = totemPools(pack)[key];
  if (!p?.left) { ui.notifications.warn(t("Group.TotemPoolEmpty")); return false; }
  const spent = { ...(pack.getFlag(SYSTEM_ID, "totemSpent") ?? {}) };
  spent[key] = (spent[key] ?? 0) + 1;
  await pack.setFlag(SYSTEM_ID, "totemSpent", spent);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: by ?? pack }),
    content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-feather-pointed"></i> ${t("Group.TotemPoolSpent", { name: foundry.utils.escapeHTML(by?.name ?? pack.name), pool: t(`Group.TotemPool.${key}`), n: p.left - 1, max: p.max })}</div>` });
  return true;
}
/** Конец истории: запасы тотема снова полные. */
export const refillTotemPools = pack => pack.unsetFlag(SYSTEM_ID, "totemSpent");

/** Эффекты тотема на членах стаи: «Тотем стаи: …» с прибавками к Атрибутам (data/effects.mjs → totemAttr). */
const totemEffects = a => a.effects.filter(e => e.flags?.[SYSTEM_ID]?.totem);

/**
 * Принять тотем (рассказчик): каждому Гару стаи — временная Слава из индивидуальных черт (один раз на тотем)
 * и эффект с прибавками к Атрибутам; прежние эффекты тотема снимаются.
 */
export async function acceptTotem(pack) {
  if (!game.user.isGM) return ui.notifications.warn(t("Group.TotemGMOnly"));
  const tt = (Codex.werewolf?.totems ?? []).find(x => x.key === pack.system.totem);
  if (!tt) return;
  const perks = totemPerks(tt), mark = `${pack.id}:${tt.key}`, lines = [];
  for (const a of (pack.system.members ?? []).map(id => game.actors.get(id)).filter(x => x?.type === "werewolf")) {
    const old = totemEffects(a);
    if (old.length) await a.deleteEmbeddedDocuments("ActiveEffect", old.map(e => e.id));
    if (Object.keys(perks.attr).length) await a.createEmbeddedDocuments("ActiveEffect", [{ name: t("Group.TotemEffect", { totem: tt.name }), img: "icons/svg/aura.svg",
      disabled: totemBanned(pack), flags: { [SYSTEM_ID]: { totem: tt.key, pack: pack.id, totemAttr: perks.attr } } }]);
    const got = [];
    if (a.getFlag(SYSTEM_ID, "totemAccepted") !== mark) {
      const upd = { [`flags.${SYSTEM_ID}.totemAccepted`]: mark };
      for (const [k, v] of Object.entries(perks.renown)) {
        const r = a.system.werewolf.renown[k];
        upd[`system.werewolf.renown.${k}.temporary`] = Math.clamp(r.temporary + v, 0, 10);
        got.push(`${v > 0 ? "+" : "−"}${Math.abs(v)} ${game.i18n.localize(`VTM20.Werewolf.Renown.${k}`)}`);
      }
      await a.update(upd);
    }
    lines.push(`<li><b>${foundry.utils.escapeHTML(a.name)}</b>${got.length ? ` — ${got.join(", ")}` : ""}</li>`);
  }
  const attr = Object.entries(perks.attr).map(([k, v]) => `${game.i18n.localize(VTM20.attributes[k].label)} ${v > 0 ? "+" : "−"}${Math.abs(v)}`).join(", ");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: pack }), content: `<div class="r-notice r-type-werewolf">
    <p><i class="fa-solid fa-feather-pointed"></i> ${t("Group.TotemAccepted", { pack: foundry.utils.escapeHTML(pack.name), totem: tt.name })}</p>
    ${attr ? `<p>${t("Group.TotemAttrNote", { attr })}</p>` : ""}<ul>${lines.join("")}</ul></div>` });
}

/** Запрет тотема нарушен — стая без бонусов (эффекты выключены, запасы недоступны); Ритуал Раскаяния — снова с бонусами. */
export async function setTotemBan(pack, on) {
  if (!game.user.isGM) return ui.notifications.warn(t("Group.TotemGMOnly"));
  await pack.setFlag(SYSTEM_ID, "totemBan", !!on);
  for (const a of (pack.system.members ?? []).map(id => game.actors.get(id)).filter(Boolean)) {
    const list = totemEffects(a).filter(e => e.disabled !== !!on);
    if (list.length) await a.updateEmbeddedDocuments("ActiveEffect", list.map(e => ({ _id: e.id, disabled: !!on })));
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: pack }),
    content: `<div class="r-notice r-type-werewolf${on ? " is-warn" : ""}"><i class="fa-solid ${on ? "fa-ban" : "fa-hands-praying"}"></i> ${t(on ? "Group.TotemBanOn" : "Group.TotemBanOff", { pack: foundry.utils.escapeHTML(pack.name) })}</div>` });
}

/** Синонимы названий черт в описаниях тотемов (W20) — к ключам листа. */
const TOTEM_ALIAS = { "знание улиц": "abilities.streetwise", "загадки": "abilities.enigmas", "первобытный инстинкт": "abilities.primalUrge",
  "обращение с животными": "abilities.animalKen", "хитрость": "abilities.subterfuge", "драка": "abilities.brawl" };

/**
 * Черты тотема стаи (W20, гл. 7: «Лидерство 3», «Скрытность 3, Знание улиц 3»): точки, которые тотем даёт каждому члену стаи,
 * — прибавка к черте в броске (и личные «+2 Лидерство» из индивидуальных черт). Возвращает { [путь черты]: точки } и имя тотема;
 * при нарушенном запрете — ничего.
 */
export function totemTraits(actor) {
  const own = totemOf(actor), tt = own?.totem;
  if (!tt?.pack || totemBanned(game.actors.get(own.packId))) return null;
  const names = {};
  for (const [k, x] of Object.entries(VTM20.attributes)) names[game.i18n.localize(x.label).toLowerCase()] = `attributes.${k}`;
  for (const [k, x] of Object.entries(VTM20.abilities)) names[game.i18n.localize(x.label).toLowerCase()] = `abilities.${k}`;
  Object.assign(names, TOTEM_ALIAS);
  const traits = {};
  for (const [, name, n] of String(tt.pack).replace(/<[^>]+>/g, "").matchAll(/(?:^|[,;]\s*)([А-ЯЁа-яёA-Za-z][А-ЯЁа-яёA-Za-z ]+?)\s+(\d)(?=\s*(?:[,;.]|$))/g)) {
    const path = names[name.trim().toLowerCase()];
    if (path) traits[path] = Math.max(traits[path] ?? 0, Number(n));
  }
  for (const [path, n] of Object.entries(totemPerks(tt).traits)) traits[path] = (traits[path] ?? 0) + n;
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
        candidates: game.actors.filter(a => ["vampire", "ghoul", "mortal", "demon", "hunter", "werewolf", "mage", "wraith"].includes(a.type) && !(c.members ?? []).includes(a.id))
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
