// module/data/codex.mjs
// Справочник системы в памяти: Дисциплины с силами, кланы, ритуалы, Пути,
// достоинства и недостатки, факты биографии, архетипы. Данные собирает
// tools/build_data.py из книг (books/Мир Тьмы), здесь — только загрузка и поиск.

import { SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";

const FILES = ["disciplines", "clans", "rituals", "paths", "merits", "backgrounds", "archetypes", "assets", "derangements", "combos"];

/** Чей герб показывать линии крови, ветви или антитрибу, если своего нет. */
const CLAN_SYMBOL_PARENT = {
  bruhaAntitribu: "brujah", ventruAntitribu: "ventrue", tremerAntitribu: "tremere", telyaveli: "tremere",
  toreadorAntitribu: "toreador", malkavianeAntitribu: "malkavian", malkavianeDominatory: "malkavian",
  nosferatuAntitribu: "nosferatu", lasombraAntitribu: "lasombra", angelisAter: "lasombra",
  gorodskieGangrely: "gangrelAntitribu", dikieGangrely: "gangrelAntitribu", moreplavateli: "gangrel", anda: "gangrel", noyady: "gangrel",
  kolduny: "tzimisce", staryyKlanTsimishov: "tzimisce", viziriAssamitov: "assamite", charodeiAssamitov: "assamite",
  assamityAntitribu: "assamite", tlatsik: "setite", zmeiSveta: "setite", voinySeta: "setite", daytya: "setite",
  brahmany: "ravnos", ravnosAntitribu: "ravnos", pandery: "caitiff", lamii: "kappadokiytsy",
  predvestnikiCherepov: "kappadokiytsy", nagaradzha: "kappadokiytsy", samedi: "kappadokiytsy", giovanni: "kappadokiytsy",
  synySamuila: "kappadokiytsy",
  angraMaynyu: "baali", kiasidy: "lasombra", gorguli: "tremere", uDzao: "salyubri"
};
/** Белые знаки на чёрном (кружочки, знаки Дисциплин) режем маской по яркости, силуэты — по прозрачности. */
/** Клановые черты (data/merits.json, поле clan) антитрибу и ветвей — от родительского клана. */
const TRAIT_CLAN_PARENT = {
  bruhaAntitribu: "brujah", ventruAntitribu: "ventrue", tremerAntitribu: "tremere", toreadorAntitribu: "toreador",
  malkavianeAntitribu: "malkavian", malkavianeDominatory: "malkavian", nosferatuAntitribu: "nosferatu",
  lasombraAntitribu: "lasombra", angelisAter: "lasombra", gorodskieGangrely: "gangrel", dikieGangrely: "gangrel",
  assamityAntitribu: "assamite", viziriAssamitov: "assamite", charodeiAssamitov: "assamite",
  zmeiSveta: "setite", voinySeta: "setite", tlatsik: "setite", daytya: "setite",
  ravnosAntitribu: "ravnos", brahmany: "ravnos", salyubriAntitribu: "salyubri", pandery: "caitiff",
  kolduny: "tzimisce", staryyKlanTsimishov: "tzimisce"
};
/** Линии с клановыми чертами, но без карточки в data/clans.json. */
const TRAIT_CLAN_NAMES = { synySamuila: "Сыны Самуила" };
/** Своего знака у Дисциплины нет — берём родственный. */
const DISCIPLINE_SYMBOL_PARENT = { assamiteSorcery: "thaumaturgy", koldunism: "thaumaturgy", setiteSorcery: "serpentis", darkThaumaturgy: "daimoinon" };
const LUMINANCE = /\/markers\/|\/disciplines\/|clans\/(assamite|setite|ravnos|istinnyeBruha)\./;
const SECT_KEYS = [
  [/камарил/i, "camarilla"], [/шабаш/i, "sabbat"], [/анарх/i, "anarchs"], [/инквизи/i, "inquisition"],
  [/ересь/i, "cainiteHeresy"], [/роялист/i, "royalists"], [/аширр/i, "ashirra"], [/корол/i, "royalPower"], [/таль.?махе|tal.?mahe/i, "talMaheRa"]
];

export const Codex = {
  ready: false,
  disciplines: {}, clans: [], rituals: {}, paths: [], merits: [], backgrounds: [], archetypes: [], derangements: [], combos: [],
  _loading: null,

  /** Загрузить один раз; повторные вызовы ждут ту же загрузку. */
  async load() {
    if (this.ready) return this;
    this._loading ??= Promise.all(FILES.map(async f => {
      const res = await fetch(`${SYSTEM_PATH}/data/${f}.json`);
      this[f] = await res.json();
    })).then(() => { this.ready = true; this._index(); return this; });
    return this._loading;
  },

  _index() {
    this.clanByKey = Object.fromEntries(this.clans.map(c => [c.key, c]));
    this.pathByKey = Object.fromEntries(this.paths.map(p => [p.key, p]));
  },

  clan(key) { return this.clanByKey?.[key] ?? null; },

  /** Название клана или линии по ключу (в т. ч. линий, у которых есть черты, но нет карточки клана). */
  clanName(key) { return this.clan(key)?.name ?? TRAIT_CLAN_NAMES[key] ?? key; },

  /** Чьи клановые черты доступны персонажу: антитрибу и ветви берут черты родительского клана. */
  traitClan(key) { return TRAIT_CLAN_PARENT[key] ?? key; },

  /** Включён ли контент Тёмных веков (настройка мира «Контент из Dark Ages»). */
  darkAgesOn() {
    try { return !!game.settings.get(SYSTEM_ID, "darkAgesContent"); } catch { return false; }
  },

  /** Показывать ли запись (путь, ритуал, черту): материалы Тёмных веков — только при включённой настройке. */
  visible(x) { return !x?.era || (x.era === "darkAges" && this.darkAgesOn()); },

  /** Ключ секты по свободному тексту (поле «Секта» на листе): «Камарилья» → camarilla. */
  sectKey(text) { return SECT_KEYS.find(([re]) => re.test(text ?? ""))?.[1] ?? ""; },

  /** Знак: { src, lum } — путь и режим маски (по яркости или по прозрачности). */
  // Путь абсолютный: в CSS-переменной url() иначе считался бы от папки стилей
  _sym(rel) { return rel ? { src: foundry.utils.getRoute(`${SYSTEM_PATH}/${rel}`), lum: LUMINANCE.test(rel) } : null; },
  clanSymbol(key) {
    const c = this.assets?.clans ?? {};
    return this._sym(c[key] ?? c[CLAN_SYMBOL_PARENT[key]]);
  },
  /** Жетон Дисциплины для предмета (tools/make_discipline_icons.py); без знака — общий. */
  disciplineIcon(key) {
    const d = this.assets?.disciplines ?? {};
    return d[key] || d[DISCIPLINE_SYMBOL_PARENT[key]]
      ? `${SYSTEM_PATH}/assets/icons/disciplines/${key}.svg`
      : `${SYSTEM_PATH}/assets/icons/discipline.svg`;
  },
  disciplineSymbol(key) {
    const d = this.assets?.disciplines ?? {};
    return this._sym(d[key] ?? d[DISCIPLINE_SYMBOL_PARENT[key]]);
  },
  sectSymbol(text) {
    const hit = SECT_KEYS.find(([re]) => re.test(text ?? ""));
    return hit ? this._sym(this.assets?.sects?.[hit[1]]) : null;
  },
  sectList() {
    const s = this.assets?.sects ?? {};
    return [["camarilla", "Камарилья"], ["sabbat", "Шабаш"], ["anarchs", "Анархи"], ["independent", "Независимые"], ["inquisition", "Инквизиция"]]
      .map(([k, label]) => ({ key: k, label, sym: this._sym(s[k]) }));
  },
  discipline(key) { return this.disciplines[key] ?? null; },
  path(key) { return this.pathByKey?.[key] ?? this.pathByKey?.humanity ?? null; },

  /** Подпись Дисциплины по ключу (из данных справочника). */
  disciplineLabel(key) { return this.disciplines[key]?.name ?? key; },

  /** Силы Дисциплины до уровня включительно (без путей). */
  powersUpTo(key, level) {
    const d = this.disciplines[key];
    if (!d) return [];
    return d.powers.filter(p => p.level <= level);
  },

  /** Путь магии крови по имени внутри Дисциплины. */
  bloodPath(disc, name) {
    return this.disciplines[disc]?.paths.find(p => p.name === name) ?? null;
  },

  /** Кланы по группам для выпадающего списка. */
  clanGroups() {
    const order = ["clan", "bloodline", "variant", "antitribu"];
    return order.map(g => ({
      key: g, label: game.i18n.localize(`VTM20.ClanGroup.${g}`),
      clans: this.clans.filter(c => c.group === g)
    }));
  }
};
