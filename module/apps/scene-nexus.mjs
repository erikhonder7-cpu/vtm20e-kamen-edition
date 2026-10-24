// module/apps/scene-nexus.mjs
// Нексус сцен — окно переходов по городу (порт из vtm5e-kamen-edition).
//
// Заменяет верхнюю панель сцен Foundry: вместо ленты вкладок — галерея карточек,
// разложенных по районам и подгруппам. Игрок выбирает свой токен и щёлкает по
// карточке — токен переносится на ту сцену.
//
// ПОЧЕМУ ПЕРЕНОС ДЕЛАЕТ РАССКАЗЧИК. Создавать токены в Foundry вправе только
// мастер: даже полное владение сценой этого игроку не даёт, сервер отклонит.
// Поэтому игрок пишет запрос во флаг СВОЕГО документа User, а активный ГМ
// выполняет перенос по хуку updateUser. Флаг надёжнее сырого сокета: это
// обычная синхронизация документа.

import {
  NEXUS_SCOPE, SCENE_FLAG, sceneGroups, getGroup, sceneNexus,
  createGroup, renameGroup, setGroupColor, deleteGroup, moveGroup,
  addSceneToGroup, removeSceneFromGroup,
  createSubgroup, renameSubgroup, deleteSubgroup, assignSceneToSub, unassignScene
} from "../constants/scene-nexus.mjs";
import { SYSTEM_PATH } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const L = k => game.i18n.localize(`VTM20.Nexus.${k}`);

/* ── Перенос токенов ──────────────────────────────────────────────────── */

function notifyRequester(requester, kind, text) {
  if (!requester || requester.id === game.user.id) {
    ui.notifications?.[kind === "error" ? "error" : kind === "info" ? "info" : "warn"](text);
    return;
  }
  try {
    game.users.get(requester.id)?.setFlag(NEXUS_SCOPE, "nexusGoto", { msg: { kind, text }, ts: Date.now() });
  } catch (e) { /* игрок отключился — некому сообщать */ }
}

/**
 * Выполнить перенос. Зовётся у ГМа: либо он сам нажал, либо пришёл запрос игрока.
 * @param {{fromSceneId:string, toSceneId:string, tokenIds:string[]}} data
 * @param {User} requester
 */
export async function execSceneTeleport(data, requester) {
  try {
    const from = game.scenes.get(data.fromSceneId);
    const to = game.scenes.get(data.toSceneId);
    if (!from || !to || from.id === to.id) return;

    const nx = sceneNexus(to);
    if (!requester.isGM && !nx.open) {
      notifyRequester(requester, "warn", game.i18n.format("VTM20.Nexus.Closed", { name: to.name }));
      return;
    }

    const grid = to.grid?.size || 100;
    const base = (nx.entry && Number.isFinite(nx.entry.x))
      ? { x: nx.entry.x, y: nx.entry.y }
      : { x: Math.round((Number(to.width) || grid * 20) / 2), y: Math.round((Number(to.height) || grid * 20) / 2) };

    const news = [], dels = [];
    let i = 0, missing = 0;
    for (const tid of (Array.isArray(data.tokenIds) ? data.tokenIds : [])) {
      const tok = from.tokens.get(tid);
      if (!tok) { missing++; continue; }
      const obj = tok.toObject();
      delete obj._id;
      obj.x = base.x + (i % 4) * grid;               // котерию ставим сеткой 4×N
      obj.y = base.y + Math.floor(i / 4) * grid;
      news.push(obj); dels.push(tid); i++;
    }
    if (!news.length) {
      notifyRequester(requester, "warn", L(missing ? "TokenMissing" : "NoTokens"));
      return;
    }

    const created = await to.createEmbeddedDocuments("Token", news);
    await from.deleteEmbeddedDocuments("Token", dels);

    if (!requester.isGM && !to.testUserPermission(requester, "OBSERVER")) {
      try { await to.update({ [`ownership.${requester.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }); }
      catch (e) { console.warn("VTM20 | Нексус: не удалось выдать право просмотра", e); }
    }

    ui.notifications?.info(game.i18n.format("VTM20.Nexus.Moved", { n: created.length, name: to.name, user: requester.name }));

    if (requester.id === game.user.id) { try { await to.view(); } catch (e) {} }
    else {
      try { await game.users.get(requester.id)?.setFlag(NEXUS_SCOPE, "nexusGoto", { toSceneId: to.id, ts: Date.now() }); }
      catch (e) {}
    }
  } catch (e) {
    console.error("VTM20 | Нексус: перенос", e);
    notifyRequester(requester, "error", `${L("MoveError")} — ${e?.message || e}`);
  }
}

/* ── Окно ─────────────────────────────────────────────────────────────── */

export class SceneNexus extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-scene-nexus",
    classes: ["vtm20", "r-nexus"],
    window: { title: "VTM20.Nexus.Title", icon: "fa-solid fa-diagram-project", resizable: true, contentClasses: ["r-nx-content"] },
    position: { width: 920, height: 740 },
    actions: {
      jump: SceneNexus.#onJump,
      peek: SceneNexus.#onPeek,
      collapse: SceneNexus.#onCollapse,
      addGroup: SceneNexus.#onAddGroup,
      renameGroup: SceneNexus.#onRenameGroup,
      moveGroup: SceneNexus.#onMoveGroup,
      deleteGroup: SceneNexus.#onDeleteGroup,
      addSub: SceneNexus.#onAddSub,
      renameSub: SceneNexus.#onRenameSub,
      deleteSub: SceneNexus.#onDeleteSub,
      unassign: SceneNexus.#onUnassign,
      toggleOpen: SceneNexus.#onToggleOpen,
      viewScene: SceneNexus.#onViewScene,
      activateScene: SceneNexus.#onActivateScene,
      removeScene: SceneNexus.#onRemoveScene,
      setEntry: SceneNexus.#onSetEntry,
      filter: SceneNexus.#onFilter,
      view: SceneNexus.#onView
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/apps/nexus.hbs`, templates: [`${SYSTEM_PATH}/templates/apps/nexus-card.hbs`], scrollable: [".r-nx-body"] }
  };

  constructor(...args) {
    super(...args);
    this._collapsed = this._loadCollapsed();   // свёрнутые группы помним между сессиями
    this._q = ""; this._filt = "all";             // поиск и фильтр (Н3) — на время окна
    try { this._view = localStorage.getItem("r-nexus-view") || "grid"; } catch (e) { this._view = "grid"; }
  }
  _loadCollapsed() {
    try { return JSON.parse(localStorage.getItem("r-nexus-collapsed") || "{}") || {}; }
    catch (e) { return {}; }
  }
  _saveCollapsed() {
    try { localStorage.setItem("r-nexus-collapsed", JSON.stringify(this._collapsed)); } catch (e) {}
  }

  /* ── Контекст ────────────────────────────────────────────────────────── */

  async _prepareContext() {
    const isGM = game.user.isGM;
    const curId = canvas?.scene?.id || game.scenes?.current?.id || "";
    const activeId = game.scenes?.active?.id || "";
    const controlled = canvas?.tokens?.controlled || [];

    // Кто где (Н2): персонажи игроков, стоящие на сцене, — их лица; игрок, который смотрит сцену без своего
    // персонажа на ней, — аватаром. Цвет обводки — цвет игрока.
    const initials = n => (n || "?").trim().slice(0, 2).toUpperCase();
    const ownerOf = a => game.users.find(u => !u.isGM && a.testUserPermission?.(u, "OWNER"));
    const presenceOf = sc => {
      const out = [], seen = new Set();
      for (const t of sc.tokens ?? []) {
        const a = t.actor;
        if (!a?.hasPlayerOwner || seen.has(a.id) || (t.hidden && !isGM)) continue;
        seen.add(a.id);
        out.push({ name: a.name, img: a.img || t.texture?.src || "", initials: initials(a.name), color: String(ownerOf(a)?.color || "#8d9bb8") });
      }
      for (const u of game.users) {
        if (!u.active || u.isGM || u.viewedScene !== sc.id || (u.character && seen.has(u.character.id))) continue;
        out.push({ name: u.name, img: u.avatar || "", initials: initials(u.name), color: String(u.color || "#a3121b") });
      }
      return out;
    };

    const folderPath = sc => {
      let f = sc.folder, guard = 0; const parts = [];
      while (f && guard++ < 12) { parts.unshift(f.name); f = f.folder; }
      return parts.join(" / ");
    };
    const addableByFolder = inIds => {
      const buckets = new Map();
      for (const s of game.scenes) {
        if (inIds.has(s.id)) continue;
        const label = folderPath(s) || L("NoFolder");
        if (!buckets.has(label)) buckets.set(label, []);
        buckets.get(label).push({ id: s.id, name: s.name });
      }
      return [...buckets.entries()]
        .sort((a, b) => (a[0].startsWith("—") ? 1 : b[0].startsWith("—") ? -1 : a[0].localeCompare(b[0], game.i18n.lang)))
        .map(([label, scenes]) => ({ label, scenes: scenes.sort((x, y) => x.name.localeCompare(y.name, game.i18n.lang)) }));
    };

    const card = (id, groupId, subId) => {
      const sc = game.scenes.get(id); if (!sc) return null;
      const nx = sceneNexus(sc);
      if (!isGM && !nx.open) return null;
      const here = presenceOf(sc);
      const name = nx.label || sc.name;
      return {
        id: sc.id, name, groupId, subId: subId || "", search: name.toLowerCase(),
        players: here.slice(0, 5), more: Math.max(0, here.length - 5),
        thumb: sc.thumb || sc.firstLevel?.background?.src || "",
        isCurrent: sc.id === curId, isActive: sc.id === activeId,
        open: nx.open, hasEntry: !!nx.entry, hasPlayers: here.length > 0
      };
    };

    const groups = [];
    for (const g of sceneGroups().slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const inIds = new Set(g.sceneIds || []);
      const subs = Array.isArray(g.subgroups) ? g.subgroups : [];
      const subSceneIds = new Set(subs.flatMap(s => s.sceneIds || []));
      let count = 0;

      const subgroups = subs.map(sub => {
        const cards = (sub.sceneIds || []).map(id => card(id, g.id, sub.id)).filter(Boolean);
        count += cards.length;
        return {
          id: sub.id, name: sub.name, key: `${g.id}:${sub.id}`,
          cards, hasCards: cards.length > 0, count: cards.length,
          collapsed: !!this._collapsed[`${g.id}:${sub.id}`]
        };
      }).filter(s => isGM || s.hasCards);

      const looseCards = (g.sceneIds || [])
        .filter(id => !subSceneIds.has(id))
        .map(id => card(id, g.id, "")).filter(Boolean);
      count += looseCards.length;

      if (!isGM && count === 0) continue;

      const looseAddable = isGM
        ? (g.sceneIds || []).filter(id => !subSceneIds.has(id))
          .map(id => game.scenes.get(id)).filter(Boolean)
          .map(s => ({ id: s.id, name: s.name }))
          .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
        : [];

      groups.push({
        id: g.id, name: g.name, color: g.color || "#a3121b", search: String(g.name || "").toLowerCase(),
        collapsed: !!this._collapsed[g.id],
        subgroups, hasSubgroups: subgroups.length > 0,
        looseCards, hasLoose: looseCards.length > 0, count,
        addable: isGM ? addableByFolder(inIds) : [],
        looseAddable, hasLooseAddable: looseAddable.length > 0
      });
    }

    return {
      isGM,
      groups, hasGroups: groups.length > 0,
      selCount: controlled.length, hasSel: controlled.length > 0,
      selText: controlled.map(t => t.name).join(", "),
      curName: canvas?.scene?.name || L("NoScene"),
      filters: ["all", ...(isGM ? ["open"] : []), "here"].map(k => ({ key: k, label: L(`Filter.${k}`), active: this._filt === k })),
      q: this._q, listView: this._view === "list"
    };
  }

  /* ── Отрисовка: селекты, цвет, подсказки ──────────────────────────────── */

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const el = this.element;
    // Поиск (Н3) — без перерисовки, фокус не теряется
    el.addEventListener("input", ev => {
      if (!ev.target.matches(".r-nx-search input")) return;
      this._q = ev.target.value; this._applyFilter();
    });
    // Перетаскивание сцен между районами и подгруппами (Н5, только ведущий)
    if (!game.user.isGM) return;
    el.addEventListener("dragstart", ev => {
      const card = ev.target.closest?.(".r-nx-card[draggable=true]");
      if (!card) return;
      ev.dataTransfer.setData("text/plain", JSON.stringify({ nexus: true, sceneId: card.dataset.sceneId, group: card.dataset.group, sub: card.dataset.sub }));
      ev.dataTransfer.effectAllowed = "move";
      el.classList.add("is-dragging");
    });
    el.addEventListener("dragend", () => { el.classList.remove("is-dragging"); el.querySelectorAll(".is-drop").forEach(x => x.classList.remove("is-drop")); });
    const zoneOf = ev => ev.target.closest?.(".r-nx-sub, .r-nx-group");
    el.addEventListener("dragover", ev => {
      const z = zoneOf(ev); if (!z) return;
      ev.preventDefault();
      el.querySelectorAll(".is-drop").forEach(x => x !== z && x.classList.remove("is-drop"));
      z.classList.add("is-drop");
    });
    el.addEventListener("drop", async ev => {
      const z = zoneOf(ev); if (!z) return;
      ev.preventDefault();
      let d; try { d = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch (e) { return; }
      if (!d?.nexus) return;
      const group = z.closest(".r-nx-group")?.dataset.group, sub = z.matches(".r-nx-sub") ? z.dataset.sub : "";
      if (!group || (group === d.group && sub === d.sub)) return;
      if (group !== d.group) { await addSceneToGroup(group, d.sceneId); await removeSceneFromGroup(d.group, d.sceneId); }
      if (sub) await assignSceneToSub(group, sub, d.sceneId);
      else if (group === d.group) await unassignScene(group, d.sceneId);
      this.render();
    });
  }

  /** Поиск и фильтр по уже нарисованным карточкам; пустые районы и подгруппы прячутся. */
  _applyFilter() {
    const el = this.element; if (!el) return;
    const q = this._q.trim().toLowerCase(), f = this._filt, on = !!q || f !== "all";
    for (const c of el.querySelectorAll(".r-nx-card")) {
      const g = c.closest(".r-nx-group");
      const hit = (!q || c.dataset.search.includes(q) || (g?.dataset.search ?? "").includes(q))
        && (f !== "open" || c.dataset.open === "1") && (f !== "here" || c.dataset.here === "1");
      c.hidden = !hit;
    }
    for (const box of el.querySelectorAll(".r-nx-sub, .r-nx-group"))
      box.classList.toggle("is-filtered-out", on && !box.querySelector(".r-nx-card:not([hidden])"));
    el.querySelector(".r-nx-body")?.classList.toggle("is-filtering", on);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    this._applyFilter();
    if (!game.user.isGM) return;
    this._syncPerms();

    el.querySelectorAll("[data-gcolor]").forEach(inp => inp.addEventListener("change", async e => {
      await setGroupColor(inp.dataset.gcolor, e.target.value); this.render();
    }));
    el.querySelectorAll("[data-gaddscene]").forEach(sel => sel.addEventListener("change", async e => {
      if (!e.target.value) return;
      await addSceneToGroup(sel.dataset.gaddscene, e.target.value); this.render();
    }));
    el.querySelectorAll("[data-subaddscene]").forEach(sel => sel.addEventListener("change", async e => {
      if (!e.target.value) return;
      await assignSceneToSub(sel.dataset.subaddscene, sel.dataset.sub, e.target.value); this.render();
    }));
    // Подсказка мастеру: кто стоит на сцене.
    el.querySelectorAll(".r-nx-card").forEach(card => {
      const sc = game.scenes.get(card.dataset.sceneId);
      if (!sc) return;
      card.addEventListener("mouseenter", () => {
        try { const c = this._tokenTip(sc); game.tooltip.activate(card, { content: c, html: c, cssClass: "r-nx-tip-tt" }); } catch (e) {}
      });
      card.addEventListener("mouseleave", () => { try { game.tooltip.deactivate(); } catch (e) {} });
    });
  }

  _tokenTip(sc) {
    const toks = sc.tokens?.contents || [];
    const wrap = document.createElement("div");
    wrap.className = "r-nx-tip";
    if (!toks.length) { wrap.innerHTML = `<div class="r-nx-tip-empty">${L("NoTokensOnScene")}</div>`; return wrap; }
    const CAP = 24;
    const rows = toks.slice(0, CAP).map(t => {
      const img = t.texture?.src || t.actor?.img || "";
      const ic = img ? `<img src="${esc(img)}" loading="lazy">` : `<span class="r-nx-tip-noimg">◈</span>`;
      return `<div class="r-nx-tip-tok${t.hidden ? " hidden" : ""}">${ic}<span>${esc(t.name || t.actor?.name || "—")}</span></div>`;
    }).join("");
    const more = toks.length > CAP ? `<div class="r-nx-tip-more">…+${toks.length - CAP}</div>` : "";
    wrap.innerHTML = `<div class="r-nx-tip-head">${L("Tokens")} · ${toks.length}</div><div class="r-nx-tip-grid">${rows}${more}</div>`;
    return wrap;
  }

  /** Разовая синхронизация прав уже открытых переходов. */
  async _syncPerms() {
    if (!game.user.isGM || this._synced) return;
    this._synced = true;
    const LV = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const ups = [];
    for (const g of sceneGroups()) for (const id of (g.sceneIds || [])) {
      const sc = game.scenes.get(id);
      if (sc && sceneNexus(sc).open && (sc.ownership?.default ?? 0) < LV.OBSERVER)
        ups.push(sc.update({ "ownership.default": LV.OBSERVER, navigation: false }));
    }
    if (ups.length) { await Promise.all(ups); this.render(); }
  }

  /* ── Переход ─────────────────────────────────────────────────────────── */

  async requestTeleport(sceneId) {
    const controlled = canvas?.tokens?.controlled || [];
    const from = canvas?.scene;
    const to = game.scenes.get(sceneId);
    if (!to || !from) return;
    if (to.id === from.id) { ui.notifications?.info(L("AlreadyHere")); return; }
    if (!controlled.length) { ui.notifications?.warn(L("SelectToken")); return; }
    if (!game.user.isGM && !sceneNexus(to).open) { ui.notifications?.warn(L("ClosedByGM")); return; }

    const payload = { fromSceneId: from.id, toSceneId: to.id, tokenIds: controlled.map(t => t.id) };
    if (game.user.isGM) { await execSceneTeleport(payload, game.user); return; }
    if (!game.users.activeGM) { ui.notifications?.error(L("NoGM")); return; }
    await game.user.setFlag(NEXUS_SCOPE, "nexusReq", { ...payload, ts: Date.now() });
    ui.notifications?.info(game.i18n.format("VTM20.Nexus.Moving", { name: to.name }));
  }

  peekScene(sceneId) {
    const sc = game.scenes.get(sceneId); if (!sc) return;
    if (canvas?.scene?.id === sc.id) { ui.notifications?.info(L("AlreadyViewing")); return; }
    if (!game.user.isGM && !sc.testUserPermission(game.user, "OBSERVER")) { ui.notifications?.warn(L("NoAccess")); return; }
    try { sc.view(); } catch (e) { ui.notifications?.error(L("ViewError")); }
  }

  /* ── Действия ────────────────────────────────────────────────────────── */

  static #onFilter(event, target) { this._filt = target.dataset.key; this.render(); }
  static #onView() {
    this._view = this._view === "list" ? "grid" : "list";
    try { localStorage.setItem("r-nexus-view", this._view); } catch (e) {}
    this.render();
  }
  static #onJump(event, target) {
    if (event.target.closest("[data-card-tool]")) return;
    this.requestTeleport(target.dataset.sceneId);
  }
  static #onPeek(event, target) { event.stopPropagation(); this.peekScene(target.dataset.sceneId); }
  static #onCollapse(event, target) {
    event.stopPropagation();
    const id = target.dataset.key;
    this._collapsed[id] = !this._collapsed[id]; this._saveCollapsed(); this.render();
  }
  static async #onAddGroup() { await createGroup(L("NewGroup")); this.render(); }
  static #onRenameGroup(event, target) {
    const id = target.dataset.group; const g = getGroup(id); if (!g) return;
    this._prompt(L("GroupName"), g.name, async v => { await renameGroup(id, v); this.render(); });
  }
  static async #onMoveGroup(event, target) { await moveGroup(target.dataset.group, Number(target.dataset.dir) || 1); this.render(); }
  static async #onDeleteGroup(event, target) {
    const g = getGroup(target.dataset.group); if (!g) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      classes: ["vtm20", "r-dialog"], window: { title: L("DeleteGroup") },
      content: `<p>${game.i18n.format("VTM20.Nexus.DeleteGroupConfirm", { name: esc(g.name) })}</p>`, rejectClose: false
    });
    if (ok) { await deleteGroup(target.dataset.group); this.render(); }
  }
  static #onAddSub(event, target) {
    const gid = target.dataset.group;
    this._prompt(L("SubName"), L("NewSub"), async v => { await createSubgroup(gid, v); this.render(); });
  }
  static #onRenameSub(event, target) {
    const gid = target.dataset.group, sid = target.dataset.sub;
    const sub = getGroup(gid)?.subgroups?.find(s => s.id === sid);
    this._prompt(L("SubName"), sub?.name || "", async v => { await renameSubgroup(gid, sid, v); this.render(); });
  }
  static async #onDeleteSub(event, target) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      classes: ["vtm20", "r-dialog"], window: { title: L("DeleteSub") },
      content: `<p>${L("DeleteSubConfirm")}</p>`, rejectClose: false
    });
    if (ok) { await deleteSubgroup(target.dataset.group, target.dataset.sub); this.render(); }
  }
  static async #onUnassign(event, target) { event.stopPropagation(); await unassignScene(target.dataset.group, target.dataset.sceneId); this.render(); }
  static async #onToggleOpen(event, target) {
    event.stopPropagation();
    const sc = game.scenes.get(target.dataset.sceneId); if (!sc) return;
    const open = !sceneNexus(sc).open;
    const LV = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const upd = { [`flags.${NEXUS_SCOPE}.${SCENE_FLAG}.open`]: open };
    if (open) { upd["ownership.default"] = LV.OBSERVER; upd["navigation"] = false; }
    else upd["ownership.default"] = LV.NONE;
    await sc.update(upd);
    this.render();
  }
  static #onViewScene(event, target) { event.stopPropagation(); game.scenes.get(target.dataset.sceneId)?.view(); }
  static #onActivateScene(event, target) { event.stopPropagation(); game.scenes.get(target.dataset.sceneId)?.activate(); }
  static async #onRemoveScene(event, target) { event.stopPropagation(); await removeSceneFromGroup(target.dataset.group, target.dataset.sceneId); this.render(); }
  static async #onSetEntry(event, target) {
    event.stopPropagation();
    const sc = game.scenes.get(target.dataset.sceneId); if (!sc) return;
    if (canvas?.scene?.id !== sc.id) { ui.notifications?.warn(L("EntryOpenScene")); return; }
    const tok = (canvas?.tokens?.controlled || [])[0];
    if (!tok) { ui.notifications?.warn(L("EntrySelectToken")); return; }
    await sc.update({ [`flags.${NEXUS_SCOPE}.${SCENE_FLAG}.entry`]: { x: tok.document.x, y: tok.document.y } });
    ui.notifications?.info(game.i18n.format("VTM20.Nexus.EntrySet", { name: sc.name }));
    this.render();
  }

  async _prompt(title, value, cb) {
    const res = await foundry.applications.api.DialogV2.wait({
      classes: ["vtm20", "r-dialog"],
      window: { title },
      position: { width: 380 },
      content: `<div class="r-field"><label>${esc(title)}</label><input type="text" name="txt" value="${esc(value || "")}" autofocus></div>`,
      buttons: [
        { action: "ok", label: game.i18n.localize("VTM20.Common.Done"), default: true, callback: (ev, btn) => btn.form.elements.txt.value.trim() },
        { action: "cancel", label: game.i18n.localize("VTM20.Common.Cancel") }
      ],
      rejectClose: false
    });
    if (res && res !== "cancel") cb(res);
  }
}

export function openSceneNexus() {
  const app = foundry.applications.instances.get("r-scene-nexus");
  if (app) { app.render({ force: true }); app.bringToFront?.(); return app; }
  const nx = new SceneNexus(); nx.render({ force: true }); return nx;
}
export function refreshSceneNexus() {
  const app = foundry.applications.instances.get("r-scene-nexus");
  if (app?.rendered) app.render();
}
