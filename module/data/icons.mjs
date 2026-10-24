// module/data/icons.mjs
// Картинки предметов — свои значки системы (assets/icons/*.svg). Без глобалов Foundry на уровне модуля:
// его используют и в игре (библиотека, мастер, заготовки снаряжения), и при сборке компендиев (tools/build_packs.mjs).
// В 0.6.0 предметам ставились картинки из библиотеки Foundry (icons/…) — restoreSystemIcons() возвращает свои.

const SYS = "systems/vtm20e-kamen-edition/assets/icons";
const own = type => `${SYS}/${type}.svg`;

export const weaponIcon = () => own("weapon");
export const armorIcon = () => own("armor");
export const traitIcon = (category, flaw = false) => own(flaw ? "flaw" : "merit");
export const backgroundIcon = () => own("background");

/** Свои значки, на которые ссылается модуль (tools/check.mjs проверяет, что файлы есть). */
export const OWN_ICON_FILES = ["weapon", "armor", "merit", "flaw", "background"].map(t => `assets/icons/${t}.svg`);

/** Картинки Foundry, которые ставила 0.6.0 (по ним restoreSystemIcons находит, что заменить). */
const LEGACY_PREFIXES = ["icons/weapons/", "icons/equipment/chest/", "icons/magic/control/", "icons/magic/perception/",
  "icons/skills/social/", "icons/skills/melee/", "icons/commodities/currency/", "icons/sundries/documents/",
  "icons/sundries/books/", "icons/environment/people/"];
const TYPES = { weapon: "weapon", armor: "armor", merit: "merit", flaw: "flaw", background: "background" };

/**
 * Вернуть свои значки предметам мира и персонажей, которым 0.6.0 поставила картинки Foundry.
 * Вызывается у рассказчика при загрузке мира; ничего не делает, если таких предметов нет.
 */
export async function restoreSystemIcons() {
  const stale = it => TYPES[it.type] && LEGACY_PREFIXES.some(p => String(it.img ?? "").startsWith(p));
  const fix = it => ({ _id: it.id, img: own(TYPES[it.type]) });
  let n = 0;
  const world = game.items.filter(stale);
  if (world.length) { await Item.updateDocuments(world.map(fix)); n += world.length; }
  for (const a of game.actors) {
    const list = a.items.filter(stale);
    if (list.length) { await a.updateEmbeddedDocuments("Item", list.map(fix)); n += list.length; }
  }
  // Компендиумы системы, собранные с картинками Foundry, — поправить через Foundry (открытые файлы сборка не трогает)
  for (const pack of game.packs.filter(p => p.metadata.packageType === "system" && p.metadata.packageName === "vtm20e-kamen-edition" && p.documentName === "Item")) {
    try {
      const docs = (await pack.getDocuments()).filter(stale);
      if (!docs.length) continue;
      const wasLocked = pack.locked;
      if (wasLocked) await pack.configure({ locked: false });
      await Item.updateDocuments(docs.map(fix), { pack: pack.collection });
      if (wasLocked) await pack.configure({ locked: true });
      n += docs.length;
    } catch (e) { console.warn(`VTM20 | Не удалось вернуть значки в ${pack.collection}`, e); }
  }
  if (n) console.log(`VTM20 | возвращены свои значки предметов: ${n}`);
  return n;
}
