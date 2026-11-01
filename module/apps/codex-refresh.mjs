// module/apps/codex-refresh.mjs
// «Обновить из справочника»: описания сил, путей магии крови, ритуалов, достоинств и недостатков, фактов биографии и
// расстройств на листе — заново из data/*.json (Codex); у черт — ещё категория, клан, секта и английское имя. Предмет, перенесённый на лист, хранит свою копию текста: она не
// меняется, когда меняется справочник (например, «Описание / Система» в 1.3–1.4). Правки рассказчика живут в той же
// копии, поэтому окно показывает, что изменится, и обновляет только отмеченное. Броски, цена, уровень и точки не трогаются.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { ritualFields } from "../data/ritual-text.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Refresh.${k}`, d) : game.i18n.localize(`VTM20.Refresh.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const norm = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]/g, "");
const same = (a, b) => norm(a) && norm(a) === norm(b);
const plain = h => String(h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
// хвост описания из компендия («Цена: 1–3», «Ghouls & Revenants (V20)») — в справочнике его нет, сохраняем
const tailOf = h => String(h ?? "").match(/(?:<p><em>(?:Цена|Ghouls|Источник)[^<]*<\/em><\/p>)+$/)?.[0] ?? "";

/** Запись справочника для предмета на листе (или null). */
function entryOf(item) {
  const s = item.system ?? {};
  const byName = x => same(x.en, s.source) || same(x.name, item.name);
  switch (item.type) {
    case "power": {
      const d = Codex.discipline(s.discipline);
      const pools = d ? [d.powers ?? [], ...(d.paths ?? []).filter(p => !s.path || same(p.name, s.path)).map(p => p.powers ?? [])] : [];
      const hit = pools.flat().find(x => x.level === s.level && byName(x))
        ?? (Codex.combos ?? []).find(c => same(c.en, s.source) || same(c.name, item.name));
      return hit ? { description: hit.html ?? "" } : null;
    }
    case "thaumPath": {
      const p = Codex.bloodPath(s.discipline, item.name);
      return p ? { description: p.html ?? "" } : null;
    }
    case "ritual": {
      // сначала своя школа, потом остальные (анархические ритуалы переехали из Колдовства в Тауматургию)
      const groups = [Codex.rituals?.[s.discipline], ...Object.values(Codex.rituals ?? {})].filter(Boolean);
      const r = groups.flatMap(g => g.rituals ?? []).find(x => byName(x) && (!s.level || x.level === s.level));
      return r ? ritualFields(r) : null;
    }
    case "merit": case "flaw": {
      const m = Codex.merits.find(x => x.kind === item.type && byName(x));
      if (!m) return null;
      // категория (клановые черты получили свою — «Клановые»), клан, секта и английское имя; пустые в справочнике — не стираем
      const e = { description: (m.html ?? "") + tailOf(s.description), category: m.category };
      if (m.clan) e.clan = m.clan;
      if (m.sect) e.sect = m.sect;
      if (m.en) e.source = m.en;
      return e;
    }
    case "background": {
      const b = Codex.backgrounds.find(byName);
      return b ? { description: b.html ?? "" } : null;
    }
    case "derangement": {
      const x = Codex.derangements.find(byName);
      return x ? { description: x.html ?? "" } : null;
    }
  }
  return null;
}

/** Что изменится у предмета: { item, update } или null, если текст уже совпадает со справочником. */
function changeOf(item) {
  const e = entryOf(item);
  if (!e) return null;
  const update = {};
  for (const [k, v] of Object.entries(e)) {
    const cur = item.system?.[k];
    const differs = typeof v === "string" ? plain(v) !== plain(cur) : JSON.stringify(v ?? null) !== JSON.stringify(cur ?? null);
    if (differs) update[`system.${k}`] = v;
  }
  return Object.keys(update).length ? { item, update } : null;
}

/** Окно выбора: что обновить. Возвращает отмеченные изменения или null. */
async function pick(changes, title) {
  const typeLabel = type => game.i18n.localize(`TYPES.Item.${type}`);
  // что именно меняется, если не только текст: «категория: Клановые»
  const extra = c => {
    const cat = c.update["system.category"];
    const bits = [cat && `${t("Category")}: ${game.i18n.localize(VTM20.meritCategories[cat]?.label ?? cat)}`,
      (c.update["system.clan"] || c.update["system.sect"] || c.update["system.source"]) && t("Source")].filter(Boolean);
    return bits.length ? ` <small class="r-refresh-extra">· ${esc(bits.join(", "))}</small>` : "";
  };
  const rows = changes.map((c, i) => `<label class="r-check r-refresh-row"><input type="checkbox" name="c${i}" checked>
    <span><b>${esc(c.item.name)}</b> <small>${esc(typeLabel(c.item.type))}</small>${extra(c)}</span></label>`).join("");
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title, icon: "fa-solid fa-book-open-reader" }, classes: ["vtm20", "r-dialog", "r-refresh"], position: { width: 460 },
    content: `<p class="r-choice-hint">${t("Hint", { n: changes.length })}</p><div class="r-refresh-list">${rows}</div>`,
    ok: { label: t("Apply"), icon: "fa-solid fa-rotate", callback: (ev, btn) => changes.filter((_, i) => btn.form.elements[`c${i}`]?.checked) }
  }).catch(() => null);
  return res;
}

/** Обновить тексты на листе персонажа (кнопка в меню листа). */
export async function refreshActor(actor) {
  if (!actor?.isOwner) return;
  await Codex.load();
  const changes = actor.items.contents.map(changeOf).filter(Boolean);
  if (!changes.length) return ui.notifications.info(t("UpToDate"));
  const chosen = await pick(changes, t("Title", { name: actor.name }));
  if (!chosen?.length) return;
  await actor.updateEmbeddedDocuments("Item", chosen.map(c => ({ _id: c.item.id, ...c.update })));
  ui.notifications.info(t("Done", { n: chosen.length }));
}

/** Обновить один предмет (кнопка в его листе). */
export async function refreshItem(item) {
  if (!item?.isOwner) return;
  await Codex.load();
  const c = changeOf(item);
  if (!c) return ui.notifications.info(entryOf(item) ? t("ItemUpToDate") : t("NotFound"));
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("ItemTitle", { name: item.name }) },
    classes: ["vtm20", "r-dialog"], content: `<p>${t("ItemHint")}</p>` }).catch(() => false);
  if (!ok) return;
  await item.update(c.update);
  ui.notifications.info(t("Done", { n: 1 }));
}

/**
 * Старые миры (вход рассказчика после обновления системы): на листах могут быть записи со старыми текстами и категориями.
 * Раз на версию системы — окно со списком листов: обновить всё, пройти по листам (с выбором, как кнопкой листа) или позже.
 */
export async function offerWorldRefresh() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const ver = game.system.version;
  if (game.settings.get(SYSTEM_ID, "refreshChecked") === ver) return;
  await Codex.loadTexts();
  const rows = game.actors.contents.map(a => ({ a, changes: a.items.contents.map(changeOf).filter(Boolean) })).filter(r => r.changes.length);
  if (!rows.length) return game.settings.set(SYSTEM_ID, "refreshChecked", ver);
  const list = rows.map(r => `<li><b>${esc(r.a.name)}</b> — ${r.changes.length}</li>`).join("");
  const v = await foundry.applications.api.DialogV2.wait({
    window: { title: t("WorldTitle", { v: ver }), icon: "fa-solid fa-book-open-reader" }, classes: ["vtm20", "r-dialog", "r-refresh"], position: { width: 480 },
    content: `<p>${t("WorldHint", { n: rows.length })}</p><ul class="r-refresh-list">${list}</ul>`,
    buttons: [
      { action: "sheets", label: t("WorldBySheet"), icon: "fa-solid fa-list-check", default: true },
      { action: "all", label: t("WorldAll"), icon: "fa-solid fa-rotate" },
      { action: "later", label: t("WorldLater") },
      { action: "skip", label: t("WorldSkip") }
    ]
  }).catch(() => "later");
  if (v === "all") {
    for (const r of rows) await r.a.updateEmbeddedDocuments("Item", r.changes.map(c => ({ _id: c.item.id, ...c.update })));
    ui.notifications.info(t("WorldDone", { n: rows.reduce((s, r) => s + r.changes.length, 0), a: rows.length }));
  } else if (v === "sheets") {
    for (const r of rows) await refreshActor(r.a);
  }
  if (v !== "later") await game.settings.set(SYSTEM_ID, "refreshChecked", ver);
}

/** Можно ли сверить предмет со справочником (для кнопки в листе предмета). */
export const refreshable = item => ["power", "thaumPath", "ritual", "merit", "flaw", "background", "derangement"].includes(item?.type);
