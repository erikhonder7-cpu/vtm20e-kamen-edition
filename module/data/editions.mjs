// module/data/editions.mjs
// Редакции «Вампира» и что из них видно в мире. Основа эпохи — её редакция: в V20 (и «Революции») — V20 с дополнениями,
// в Тёмных веках — V20 Dark Ages с Tome of Secrets и Companion. Остальные редакции включаются в настройке мира
// «Редакции и источники» по разделам (силы Дисциплин, пути магии крови, ритуалы, черты, Факты, Пути и Дороги, психозы,
// комбинированные Дисциплины). Одна и та же запись из нескольких книг видна один раз — из самой «старшей» включённой редакции
// (порядок EDITION_ORDER): так V20 и Тёмные века не перемешиваются, а старые редакции добавляют только то, чего нет в основе.
//
// Редакция записи — по книге (поле source, при пустом — edition). Записи со своей настройкой мира (фанатский «Век живых богов»,
// хоумрулы «форма зуло» и «Богатыри»), черты и Факты дампиров (своя линия) и записи других линеек (охотники, оборотни, маги,
// демоны) сюда не входят. Исключение — ротэ магов: M20 — основа любой эпохи, ротэ Dead Magic (Revised, 2003) — колонка Revised.
// У остальных линеек в справочнике одна редакция (W20, C20, Wraith 20, Hunter: The Reckoning, Demon: The Fallen).

import { SYSTEM_ID } from "../config.mjs";

/** Редакции: ключ → подпись (VTM20.Editions.<ключ>). */
export const EDITIONS = ["v20", "v20da", "revised", "classic", "da", "fan"];
/** Разделы справочника, где редакции включаются по отдельности. */
export const EDITION_CATS = ["powers", "paths", "rituals", "merits", "backgrounds", "morality", "derangements", "combos", "rotes"];

/**
 * Книги по редакциям. Порядок проверки важен: сначала фанатское, затем старые Тёмные века (у части записей в источнике стоит
 * «V20 Dark Ages: Player's Guide to High Clans» — это книга 2002 года), затем V20 Dark Ages, V20, Revised, 1–2-я редакции.
 */
const RULES = [
  ["fan", /Storytellers Vault|фанат|OWbN|Хоумрул|homebrew|Samedi/i],
  ["da", /Player.?s Guide to (the )?(High|Low) Clans|Players Guide to High Clans|Libellus Sanguinis|House of Tremere|Road of Heaven|Road of Humanity|Right of Princes|Storytellers Companion|(^|[^0-9 ])Dark Ages Companion|Dark Ages Companion \(1998\)|Clanbook: (Cappadocian|Salubri|Baali)|Dark Ages Clanbook|Dark Ages: Vampire|Vampire: The Dark Ages(?! 20)|Dark Ages \(классика\)|^Dark Ages$/],
  ["v20da", /V20 Dark Ages|Tome of Secrets|Dark Ages 20th|DAV20|V20 DA\b/],
  ["v20", /^V20\b|\(V20\)|V20 Core|20th Anniversary|Rites of the Blood|Lore of the (Clans|Bloodlines)|Ghouls (&|and) Revenants|Anarchs Unbound|V20 The Black Hand|Dread Names|Beckett|Hunters Hunted II|перечни ритуалов/],
  ["revised", /Revised|(?<!Player.?s )Guide to the (Camarilla|Sabbat|Anarchs)|Blood Magic|Blood Sacrifice|Sins of the Blood|Time of Thin Blood|Caine.s Chosen|Players Guide \(2003\)|Laws of the Night|^Gehenna|Victorian Age|Mexico City by Night|New York by Night|Hunter Book|Hunter: The Reckoning/],
  ["classic", /2nd|Second Edition|First Edition|\b199[0-7]\b|Chicago by Night|Milwaukee|Dirty Secrets|Anarch Cookbook|Bloody Hearts|Dark Colony|Giovanni Chronicles|Elysium|Player.?s Guide|Players Guide|Storytellers Handbook to the Sabbat|Clanbook|Hunters Hunted/]
];

/**
 * Редакция записи по её книге; null — запись вне редакций (своя настройка мира: «Век живых богов», «форма зуло», «Богатыри»).
 * Пустой источник и «—» — основная книга V20 (в данных так записаны силы и пути основной книги).
 */
export function editionOf(x) {
  if (!x || x.alg || x.era === "zulo" || x.era === "bogatyr" || x.dhampir) return null;
  if (x.fan) return "fan";
  const src = String(x.source ?? "").trim(), ed = String(x.edition ?? "").trim();
  for (const s of [src, ed]) {
    if (!s || s === "—") continue;
    const hit = RULES.find(([, re]) => re.test(s));
    if (hit) return x.era === "darkAges" && !["da", "v20da", "fan"].includes(hit[0]) ? "da" : hit[0];
  }
  return x.era === "darkAges" ? "da" : "v20";
}

/** Основа эпохи: Тёмные века — V20 Dark Ages, иначе V20. */
export const baseEdition = () => {
  try { return game.settings.get(SYSTEM_ID, "era") === "darkAges" ? "v20da" : "v20"; } catch { return "v20"; }
};

/** Старшинство редакций (кто остаётся из повторов): своя основа, другая основа, затем старые редакции эпохи и фанатское. */
export const editionOrder = base => base === "v20da"
  ? ["v20da", "da", "v20", "revised", "classic", "fan"]
  : ["v20", "v20da", "revised", "classic", "da", "fan"];

/** Настройка «Редакции и источники»: { раздел: { редакция: true } } — включённые сверх основы. */
export function editionSettings() {
  try { return game.settings.get(SYSTEM_ID, "editions") ?? {}; } catch { return {}; }
}

/** Включена ли редакция в разделе (основа эпохи — всегда). */
export function editionOn(cat, ed, base = baseEdition(), cfg = editionSettings()) {
  return ed === base || !!cfg?.[cat]?.[ed];
}

/** Ключ повтора: английское имя без скобок, артиклей и знаков (при пустом — русское). */
export const dupName = x => {
  const en = String(x?.en ?? "").toLowerCase().replace(/[’`]/g, "'").replace(/\(.*?\)/g, "").replace(/\b13th\b/g, "thirteenth")
    .replace(/\b(the|of|path|a|an)\b/g, "").replace(/[^a-z]/g, "");
  return en || String(x?.name ?? "").toLowerCase().replace(/ё/g, "е").replace(/\(.*?\)/g, "").replace(/[^а-яa-z]/g, "");
};
