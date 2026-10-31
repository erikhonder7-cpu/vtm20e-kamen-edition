// module/apps/codex-refresh.mjs
// «Обновить из справочника»: описания сил, путей магии крови, ритуалов, достоинств и недостатков, фактов биографии и
// расстройств на листе — заново из data/*.json (Codex). Предмет, перенесённый на лист, хранит свою копию текста: она не
// меняется, когда меняется справочник (например, «Описание / Система» в 1.3–1.4). Правки рассказчика живут в той же
// копии, поэтому окно показывает, что изменится, и обновляет только отмеченное. Броски, цена, уровень и точки не трогаются.

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
      return m ? { description: (m.html ?? "") + tailOf(s.description) } : null;
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
  const rows = changes.map((c, i) => `<label class="r-check r-refresh-row"><input type="checkbox" name="c${i}" checked>
    <span><b>${esc(c.item.name)}</b> <small>${esc(typeLabel(c.item.type))}</small></span></label>`).join("");
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

/** Можно ли сверить предмет со справочником (для кнопки в листе предмета). */
export const refreshable = item => ["power", "thaumPath", "ritual", "merit", "flaw", "background", "derangement"].includes(item?.type);
