// module/data/codex.mjs
// Справочник системы в памяти: Дисциплины с силами, кланы, ритуалы, Пути,
// достоинства и недостатки, факты биографии, архетипы. Данные собирает
// tools/build_data.py из книг (books/Мир Тьмы), здесь — только загрузка и поиск.

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { mergeTexts } from "./text-split.mjs";
import { zuloOn } from "./zulo.mjs";
import { bogatyrOn } from "./bogatyr.mjs";
import { editionOf, baseEdition, editionOrder, editionSettings, editionOn, dupName } from "./editions.mjs";

const FILES = ["disciplines", "clans", "rituals", "paths", "merits", "merits-ghouls", "vampire-only", "backgrounds", "backgrounds-ghouls", "archetypes", "assets", "derangements", "combos", "abilities", "demon", "demon-merits", "demon-backgrounds", "demon-hof", "demon-pg", "demon-earthbound", "demon-form", "investments", "pact-templates", "hunter", "dhampir", "werewolf", "mage", "wraith", "changeling", "thaum-artifacts", "sabbat-ritae", "clan-lore", "line-lore", "dark-ages"];

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
// «Vampire: Age of the Living Gods», «Paths of Dur-An-Ki»: пути V20, которые книга даёт ассамитам своей эпохи (часть — под своими
// именами: Covenant of Enki = Neptune's Might, Echo of Nirvana = Focused Mind, Demon's Gift = Conjuring, Ailing Jackal = Father's
// Vengeance; Hand of the Magi и Life's Water — Creatio Ignis и Potestas Vitae, они и так есть). Только при настройке «Век живых богов».
const ALG_DUR_AN_KI = ["Covenant of Nergal", "The Path of the Evil Eye", "Movement of the Mind", "Weather Control", "Elemental Mastery",
  "Alchemy", "Neptune's Might", "Path of the Focused Mind", "Hands of Destruction", "Path of Conjuring", "Path of the Father's Vengeance",
  "Path of the Blood's Curse"];
const DISCIPLINE_SYMBOL_PARENT = { assamiteSorcery: "thaumaturgy", koldunism: "thaumaturgy", setiteSorcery: "serpentis", darkThaumaturgy: "daimoinon" };
const LUMINANCE = /\/markers\/|\/disciplines\/|clans\/(assamite|setite|ravnos|istinnyeBruha)\./;
const SECT_KEYS = [
  [/камарил/i, "camarilla"], [/шабаш/i, "sabbat"], [/анарх/i, "anarchs"], [/инквизи/i, "inquisition"],
  [/ересь/i, "cainiteHeresy"], [/роялист/i, "royalists"], [/аширр/i, "ashirra"], [/корол/i, "royalPower"], [/таль.?махе|tal.?mahe/i, "talMaheRa"],
  [/независим|independ/i, "independent"], [/автарх|autark/i, "autarkis"]
];

export const Codex = {
  ready: false,
  textsReady: false,
  disciplines: {}, clans: [], rituals: {}, paths: [], merits: [], backgrounds: [], archetypes: [], derangements: [], combos: [], abilities: [],
  _loading: null,
  _texts: null,

  /**
   * Загрузить один раз; повторные вызовы ждут ту же загрузку. По умолчанию — вместе с текстами Дисциплин и ритуалов
   * (окна, которые их показывают, так и вызывают). { texts: false } — только оглавление: так ждёт старт мира,
   * а тексты догружаются следом фоном (loadTexts).
   */
  async load({ texts = true } = {}) {
    if (!this.ready) {
      this._loading ??= Promise.all(FILES.map(async f => {
        const res = await fetch(`${SYSTEM_PATH}/data/${f}.json`);
        this[f] = await res.json();
      })).then(() => { this.ready = true; this._index(); return this; });
      await this._loading;
    }
    if (texts) await this.loadTexts();
    return this;
  },

  /** Тексты сил, путей, правил и ритуалов (data/<имя>-text.json, module/data/text-split.mjs) — в оглавление на месте. */
  async loadTexts() {
    if (this.textsReady) return this;
    this._texts ??= (async () => {
      await this.load({ texts: false });
      const [d, r] = await Promise.all(["disciplines", "rituals"].map(async f =>
        (await fetch(`${SYSTEM_PATH}/data/${f}-text.json`)).json()));
      mergeTexts("disciplines", this.disciplines, d);
      mergeTexts("rituals", this.rituals, r);
      this._daThaum();                    // тексты вернули прежние карточки путей Тауматургии V20 DA — снова заменить
      this.textsReady = true;
      return this;
    })();
    return this._texts;
  },

  _index() {
    // формы Фера нужны модели актёра (formData) — даём справочник без импорта, чтобы не завязывать модели на него
    if (globalThis.game) game.vtm20Codex = this;
    // общие черты «только вампирам» (data/vampire-only.json, правило системы): гулю, смертному, охотнику и дампиру не видны
    const vOnly = new Set((this["vampire-only"]?.traits ?? []).map(x => `${x.kind}:${x.name}`));
    for (const m of this.merits) if (vOnly.has(`${m.kind}:${m.name}`) && !m.clan) m.vampire = true;
    // черты гулей и ревенантов (Ghouls & Revenants) — в конце общего списка: номера прежних черт не сдвигаются
    this.merits = [...this.merits, ...(this["merits-ghouls"] ?? []).map(m => ({ ...m, ghoul: true }))];
    // черты и Дополнения демонов — своей линией (VTM20.traitLine) в самом конце, по той же причине
    this.merits = [...this.merits, ...(this["demon-merits"] ?? []).map(m => ({ ...m, line: "demon" }))];
    this.backgrounds = [...this.backgrounds, ...[...(this["demon-backgrounds"] ?? []), ...(this["demon-earthbound"]?.backgrounds ?? [])].map(b => ({ ...b, line: "demon" }))];
    // Дополнения охотника (data/hunter.json) — линией «hunter», тоже в конце
    this.backgrounds = [...this.backgrounds, ...(this.hunter?.backgrounds ?? []).map(b => ({ ...b, line: "hunter" }))];
    // дампиры (data/dhampir.json, Accursed Heirs) — свои Дополнения и черты с пометкой dhampir: только дампиру, в конце
    this.backgrounds = [...this.backgrounds, ...(this.dhampir?.backgrounds ?? []).map(b => ({ ...b, dhampir: true }))];
    // Факты гулей и ревенантов (V20 Ghouls & Revenants, стр. 121–125: Домитор, Двойная жизнь, Старший в семье, Мажордом) — только гулю
    this.backgrounds = [...this.backgrounds, ...(this["backgrounds-ghouls"] ?? []).map(b => ({ ...b, ghoul: true }))];
    this.merits = [...this.merits, ...(this.dhampir?.merits ?? []).map(m => ({ ...m, dhampir: true }))];
    // оборотни (data/werewolf.json, W20): свои Достоинства, недостатки и Факты — линией «werewolf», в конце
    this.merits = [...this.merits, ...(this.werewolf?.merits ?? []).map(m => ({ ...m, line: "werewolf" }))];
    this.backgrounds = [...this.backgrounds, ...(this.werewolf?.backgrounds ?? []).map(b => ({ ...b, line: "werewolf" }))];
    // маги (data/mage.json, M20): свои Достоинства, недостатки и Факты — линией «mage», в конце
    this.merits = [...this.merits, ...(this.mage?.merits ?? []).map(m => ({ ...m, line: "mage" }))];
    this.backgrounds = [...this.backgrounds, ...(this.mage?.backgrounds ?? []).map(b => ({ ...b, line: "mage" }))];
    // призраки (data/wraith.json, Wraith 20): свои Фоны — линией «wraith», в конце
    this.backgrounds = [...this.backgrounds, ...(this.wraith?.backgrounds ?? []).map(b => ({ ...b, line: "wraith" }))];
    // подменыши (data/changeling.json, C20): свои Достоинства, Недостатки и Фоны — линией «changeling»
    this.merits = [...this.merits, ...(this.changeling?.merits ?? []).map(m => ({ ...m, line: "changeling" }))];
    this.backgrounds = [...this.backgrounds, ...(this.changeling?.backgrounds ?? []).map(b => ({ ...b, line: "changeling" }))];
    // цены черт — числами: в части книг они записаны строкой («1»), и сумма в мастере склеивалась в «11»
    for (const m of this.merits) { m.min = Number(m.min) || 0; m.max = Number(m.max) || m.min; }
    // архетипы из Players Guide «Охотника» (Верящий, Переговорщик, Скептик) — для всех
    const arch = new Set(this.archetypes.map(a => a.name));
    this.archetypes = [...this.archetypes, ...(this.hunter?.archetypes ?? []).filter(a => !arch.has(a.name))];
    // архетипы M20 (основная книга и Book of Secrets) — тоже для всех
    const arch2 = new Set(this.archetypes.map(a => a.name));
    this.archetypes = [...this.archetypes, ...(this.mage?.archetypes ?? []).filter(a => a.regain && !arch2.has(a.name))];
    // архетипы Wraith 20 (Натура и Маска; will — когда возвращается Воля) — новые для всех
    const arch3 = new Set(this.archetypes.map(a => a.name));
    this.archetypes = [...this.archetypes, ...(this.wraith?.archetypes ?? []).filter(a => !arch3.has(a.name)).map(a => ({ name: a.name, en: a.en, regain: a.will }))];
    // Тёмные века (data/dark-ages.json, tools/dark_ages_data.py): свои кланы и линии крови V20 Dark Ages — в этой эпохе список
    // кланов берётся отсюда (Дисциплины и слабости по V20 DA); ключи общие с data/clans.json, чтобы прежние персонажи не терялись
    // повторная загрузка: свойство уже с геттером — исходный список V20 лежит в clansV20 (присваивание идёт в сеттер)
    if (!Object.getOwnPropertyDescriptor(this, "clans")?.get) this.clansV20 = this.clans;
    const v20 = Object.fromEntries(this.clansV20.map(c => [c.key, c]));
    this.clansDA = (this["dark-ages"]?.clans ?? []).map(c => ({ ...(v20[c.key] ?? {}), ...c }));
    this.clanByKeyDA = Object.fromEntries(this.clansDA.map(c => [c.key, c]));
    Object.defineProperty(this, "clans", { configurable: true, enumerable: true,
      get() { return VTM20.isDarkAges() && this.clansDA.length ? this.clansDA : this.clansV20; }, set(v) { this.clansV20 = v; } });
    this.clanByKey = v20;
    // Дисциплины, которых нет в V20 (Абомбве Бонсам — V20 Dark Ages): из того же слоя; видны по пометке эпохи (Codex.visible)
    for (const d of this["dark-ages"]?.disciplines ?? []) this.disciplines[d.key] ??= d;
    // пути Некромантии в версии V20 DA (гл. 9): у Кости, «Трупа в чудовище», Пепла, Стеклянного и Склепа силы не те, что в V20;
    // в Тёмных веках берутся эти записи (bloodPathsFor предпочитает книгу эпохи), те, что уже есть записью V20 DA, не дублируются
    const necro = this.disciplines.necromancy?.paths, pn = s => String(s ?? "").toLowerCase().replace(/[’]/g, "'").replace(/\b(path|of|the)\b/g, "").replace(/[^a-z']+/g, " ").trim();
    if (necro) for (const p of this["dark-ages"]?.necromancyPaths ?? [])
      if (!necro.some(x => this.isDarkAgesBook(x) && pn(x.en) === pn(p.en))) necro.push(p);
    this._daThaum();
    // Факты V20 Dark Ages (там же, справочник 04): имена системные, а описание в этой эпохе — из V20 DA (Домен, Слава и Статус
    // в Тёмных веках свои, Поколение от 12-го); у Фактов линий (демоны, оборотни…) описание прежнее
    const daBg = Object.fromEntries((this["dark-ages"]?.backgrounds ?? []).map(b => [b.en, b.html]));
    for (const b of this.backgrounds) {
      if (b.line || b.dhampir || !daBg[b.en]) continue;
      if (!Object.getOwnPropertyDescriptor(b, "html")?.get) {
        b.htmlV20 = b.html;
        Object.defineProperty(b, "html", { configurable: true, enumerable: true,
          get() { return VTM20.isDarkAges() && this.htmlDA ? this.htmlDA : this.htmlV20; }, set(v) { this.htmlV20 = v; } });
      }
      b.htmlDA = daBg[b.en];
    }
    // «Vampire: Age of the Living Gods» (фанатское, tools/alg_extra.py и paths_extra.py) — пометка alg по источнику:
    // видимость решает своя настройка, а не эпоха (Codex.visible)
    const isAlg = x => /Age of the Living Gods/.test(x?.source ?? "");
    for (const x of [...this.backgrounds, ...this.paths, ...this.merits, ...(this.abilities ?? []), ...this.derangements]) if (isAlg(x)) x.alg = true;
    for (const d of Object.values(this.disciplines)) {
      if (isAlg(d)) d.alg = true;
      for (const p of d.powers ?? []) if (isAlg(p) || d.alg) p.alg = true;
    }
    // Дороги и Пути V20 Dark Ages: подробности (смысл, этика, посвящение, аура — справочник V20_Dark_Ages/13, пересказ гл. 3)
    // дописываются к описанию; только записям V20 DA — у Дорог других редакций своя философия, их не смешиваем
    const roadInfo = this["dark-ages"]?.roads ?? {}, rn = s => String(s ?? "").toLowerCase().replace(/\bthe\b/g, "").replace(/[^a-z]+/g, " ").trim();
    const infoByEn = Object.fromEntries(Object.entries(roadInfo).map(([en, html]) => [rn(en), html]));
    const infoHead = game.i18n?.localize?.("VTM20.Path.DaDetails") ?? "V20 Dark Ages";
    for (const p of this.paths) {
      const info = p.source === "V20 Dark Ages" && !p.daDetails ? infoByEn[rn(p.en)] : null;
      if (info) { p.daDetails = true; p.html = `${p.html ?? ""}<h4>${infoHead}</h4>${info}`; }
    }
    this.pathByKey = Object.fromEntries(this.paths.map(p => [p.key, p]));
    this._tagEditions();
    // демоны (data/demon.json) — свой справочник: Знания не смешиваются с Дисциплинами вампиров
    const dm = this.demon ?? {};
    // Тёмные Знания Привязанных к Земле (data/demon-earthbound.json) — в конце, с пометкой dark
    this.loreByKey = Object.fromEntries(this.lores.map(l => [l.key, l]));
    this.houseByKey = Object.fromEntries((dm.houses ?? []).map(h => [h.key, h]));
    this.factionByKey = Object.fromEntries((dm.factions ?? []).map(f => [f.key, f]));
  },

  /** Демоны: Знание, Дом и фракция по ключу; все Знания и Дома. */
  lore(key) { return this.loreByKey?.[key] ?? null; },
  house(key) { return this.houseByKey?.[key] ?? null; },
  /** «Дома Падших» по Дому: история, ритуалы, реликвии (data/demon-hof.json — пересказ). */
  hof(key) { return this["demon-hof"]?.houses?.[key] ?? null; },
  /** Ритуалы Дома по Demon Players Guide (data/demon-pg.json — пересказ). */
  pgRituals(key) { return this["demon-pg"]?.rituals?.[key] ?? []; },
  faction(key) { return this.factionByKey?.[key] ?? null; },
  get lores() { return [...(this.demon?.lores ?? []), ...(this["demon-earthbound"]?.lores ?? [])]; },
  /** «Привязанные к Земле» (data/demon-earthbound.json — пересказ). */
  get earthbound() { return this["demon-earthbound"] ?? null; },
  get houses() { return this.demon?.houses ?? []; },
  get factions() { return this.demon?.factions ?? []; },

  /** Архетипы для Натуры и Маски: в Тёмных веках у вампира, гуля и смертного — список V20 Dark Ages (data/dark-ages.json). */
  archetypesFor(type) {
    const da = this["dark-ages"]?.archetypes;
    return VTM20.isDarkAges() && da?.length && ["vampire", "ghoul", "mortal"].includes(type) ? da : this.archetypes;
  },
  clan(key) { return (VTM20.isDarkAges() && this.clanByKeyDA?.[key]) || this.clanByKey?.[key] || this.clanByKeyDA?.[key] || null; },

  /** Название клана или линии по ключу (в т. ч. линий, у которых есть черты, но нет карточки клана). */
  clanName(key) { const c = this.clan(key); return c ? VTM20.label(c) : TRAIT_CLAN_NAMES[key] ?? key; },

  /** Чьи клановые черты доступны персонажу: антитрибу и ветви берут черты родительского клана. */
  traitClan(key) { return TRAIT_CLAN_PARENT[key] ?? key; },

  /**
   * Сила Дисциплины для персонажа: видна по настройкам мира и не чужая — силы Богатырей (Fingers of the Eldest, пометка bogatyr)
   * только у самого Богатыря (гуль типа bogatyr), а не альтернативой у любого вампира.
   */
  powerFor(p, ghoulType = "") { return this.visible(p) && (!p?.bogatyr || ghoulType === "bogatyr"); },
  /** Краина Колдовства (V20 Dark Ages, Tome of Secrets, The Black Hand) — не уклад и не Путь стихий. */
  isKraina(p) { return p?.proc === "da-kraina" || p?.proc === "kraina"; },
  /**
   * Правило краин V20 Dark Ages (гл. 9, Koldunic Sorcery): первая точка Колдовства — первая сила основной краины, каждая
   * следующая — следующая сила известной краины или первая сила новой. Сумма точек краин = точкам Дисциплины, отдельно за опыт
   * краины не покупаются, Гений места основной не бывает. Действует в Тёмных веках у колдуна с краиной основным путём.
   */
  krainaRule(disc, primary) { return disc === "koldunism" && VTM20.isDarkAges() && this.isKraina(primary) && !this.krainaPathsOn(); },
  /**
   * Хоумрул «Краины как пути Тауматургии» (настройка мира krainaPaths): правило V20 DA выключено — основная краина растёт вместе
   * с Колдовством, остальные краины — вторичные пути: за свободные пункты и опыт, как пути Тауматургии.
   */
  krainaPathsOn() { try { return !!game.settings.get(SYSTEM_ID, "krainaPaths"); } catch { return false; } },
  /** Запись из книги Тёмных веков (любой редакции) — по пометке эпохи или по источнику; для замены путей V20 DA при загрузке. */
  isDarkAgesBook(x) { return x?.era === "darkAges" || /Dark Ages|Libellus Sanguinis/i.test(x?.source ?? ""); },
  /**
   * Пути магии крови Дисциплины в эпохе: основа эпохи (V20 или V20 Dark Ages) и редакции, включённые в настройке «Редакции и
   * источники» (раздел «Пути магии крови»); один путь из нескольких книг — одной записью (старшая редакция).
   */
  bloodPathsFor(disc) {
    const all = this.disciplines[disc]?.paths ?? [], lent = this._lent?.[disc], da = VTM20.isDarkAges();
    // редакции и повторы решает Codex.visible (module/data/editions.mjs); пути, одолженные у другой Дисциплины по правилу
    // Тёмных веков (_daThaum: Тауматургия ассамитов и сеттитов, Садхана Данава), — только в этой эпохе
    return all.filter(x => lent?.has(x) ? da : this.visible(x));
  },

  /**
   * Семь путей Тауматургии V20 DA (гл. 10, справочник V20_Dark_Ages/10 → data/dark-ages.json): описание пути и карточки уровней
   * заменяют прежние (были обрывки и ошибка «узы крови так не возникают» у Кражи витэ — книга: приближает к узам). Имя и данные
   * броска у сил остаются. Вызывается после индекса и после загрузки текстов.
   */
  _daThaum() {
    const paths = this.disciplines.thaumaturgy?.paths ?? [];
    // Пути, общие для нескольких школ в Тёмных веках, — та же запись в списке другой Дисциплины (видна только в этой эпохе):
    // • Дур-Ан-Ки: «колдун может выбрать любой путь Тауматургии из основной книги» (Player's Guide to Low Clans, ассамиты;
    //   V20 DA: «Assamite Sorcery (Thaumaturgy)»); • Чародейство Сеттитов: первый путь обычно Potestas Tempestatum, вторые — из
    //   Откровений или «изменённая магия тремеров» (Tome of Secrets, Akhu; V20 DA: «Setite Sorcery (Thaumaturgy)»);
    // • Тауматургия: пути Садханы Данава — Нектар крови, Карма, Праапти (Dark Ages Companion, Ravnos Apocrypha: «активируются как
    //   Тауматургия»); в данных они лежат у Чародейства Сеттитов
    this._lent ??= {};
    const lend = (disc, p) => {
      const d = this.disciplines[disc];
      if (!d || !p) return;
      (this._lent[disc] ??= new Set()).add(p);
      if (!d.paths.includes(p)) d.paths.push(p);
    };
    for (const d of this["dark-ages"]?.thaumaturgyPaths ?? []) {
      const p = paths.find(x => x.en === d.en && this.isDarkAgesBook(x));
      lend("assamiteSorcery", p); lend("setiteSorcery", p);
    }
    for (const en of ["Path of Blood Nectar", "Path of Karma", "The Path of Praapti"])
      lend("thaumaturgy", this.disciplines.setiteSorcery?.paths.find(x => x.en === en));
    for (const d of this["dark-ages"]?.thaumaturgyPaths ?? []) {
      const p = paths.find(x => x.en === d.en && this.isDarkAgesBook(x));
      if (!p) continue;
      p.html = d.html;
      p.powers = d.powers.map((q, i) => ({ ...(p.powers?.[i] ?? {}), ...q, en: q.en || p.powers?.[i]?.en || "" }));
    }
  },

  /**
   * Основной путь по умолчанию (по английскому названию — русские в версиях V20 и V20 DA разные). V20: Путь Крови, Путь Склепа;
   * Тёмные века (гл. 9–10): у Тремера малый путь Creatio Ignis, у Некромантии — путь клана: Каппадокийцы — «Труп в чудовище»,
   * Джованни — Склеп, Ламии — Сумеречный сад, Нагараджа — Стеклянный, Импундулу — Кенотаф. Иначе — первый путь эпохи.
   */
  defaultBloodPath(disc, clan = "") {
    const opts = this.bloodPathsFor(disc), da = VTM20.isDarkAges();
    const necroDA = { giovanni: "Sepulchre", lamii: "Twilight Garden", nagaradzha: "Vitreous", impundulu: "Cenotaph" }[clan] ?? "Corpse in the Monster";
    // ассамитам в Тёмных веках — тоже Creatio Ignis (правило системы: книга основного пути не называет, а свои пути ассамитов
    // охраняемые — Путь Хранителей только для Хранителей)
    // сеттитам — Potestas Tempestatum (Tome of Secrets: «commonly learn … as their initial Path», в подражание Сету, богу бурь)
    const want = { thaumaturgy: da ? "Creatio Ignis" : "Path of Blood", necromancy: da ? necroDA : "Sepulchre",
      assamiteSorcery: da ? "Creatio Ignis" : "", setiteSorcery: da ? "Potestas Tempestatum" : "" }[disc];
    return (want && opts.find(p => String(p.en ?? "").toLowerCase().includes(want.toLowerCase()))) ?? opts[0] ?? null;
  },

  /** Эпоха — Тёмные века (материалы Тёмных веков вне редакций — кланы, Способности — видны только в ней). */
  darkAgesOn() {
    try { return game.settings.get(SYSTEM_ID, "era") === "darkAges"; } catch { return false; }
  },

  /**
   * Редакции записей справочника (module/data/editions.mjs): раздел (_cat), редакции (_eds) и ключ повтора (_dk).
   * Записи вне редакций (свои настройки мира, другие линейки) — без пометок, их видимость прежняя.
   * Несколько редакций у записи — когда книга эпохи её перепечатывает: силы основной книги V20 (V20 DA повторяет Дисциплины),
   * Факты V20 с текстом V20 DA, черты и Факты гулей Ghouls & Revenants (в обеих эпохах), крайны The Black Hand (решение мира).
   */
  _tagEditions() {
    const groups = new Map(), core = /^(|—|V20|V20 Core.*|Vampire: The Masquerade 20th Anniversary Edition.*|V20, основная.*|V20 Core Rulebook.*)$/;
    const daBg = new Set((this["dark-ages"]?.backgrounds ?? []).map(b => b.en));
    const tag = (x, cat, scope, extra = []) => {
      const e = editionOf(x);
      if (!e) return;
      x._cat = cat;
      x._eds = [...new Set([e, ...extra])];
      x._dk = `${cat}|${scope}|${dupName(x)}`;
      (groups.get(x._dk) ?? groups.set(x._dk, []).get(x._dk)).push(x);
    };
    for (const d of Object.values(this.disciplines)) {
      for (const p of d.powers ?? []) tag(p, "powers", d.key, editionOf(p) === "v20" && core.test(String(p.source ?? "").trim()) ? ["v20da"] : []);
      for (const p of d.paths ?? []) if (!this._lent?.[d.key]?.has(p)) tag(p, "paths", d.key, p.proc === "kraina" ? ["v20da"] : ALG_DUR_AN_KI.includes(p.en) && d.key === "assamiteSorcery" ? ["alg"] : []);
    }
    for (const [k, g] of Object.entries(this.rituals ?? {})) for (const r of g.rituals ?? []) tag(r, "rituals", k);
    for (const m of this.merits) if (!m.line) tag(m, "merits", `${m.kind}|${m.clan ?? ""}`, m.ghoul ? ["v20", "v20da"] : []);
    for (const b of this.backgrounds) if (!b.line) tag(b, "backgrounds", "", b.ghoul ? ["v20", "v20da"] : daBg.has(b.en) && editionOf(b) === "v20" ? ["v20da"] : []);
    for (const p of this.paths) tag(p, "morality", "");
    for (const x of this.derangements ?? []) tag(x, "derangements", "");
    for (const x of this.combos ?? []) tag(x, "combos", "");
    // ротэ магов (data/mage.json): M20 — основа в любой эпохе (своих Тёмных веков у магов в справочнике нет), Dead Magic — Revised
    for (const r of this.mage?.rotes ?? []) {
      r._cat = "rotes"; r._eds = /Мёртвая магия|Dead Magic/i.test(r.source ?? "") ? ["revised"] : ["v20", "v20da"]; r._dk = `rotes|${dupName(r)}`;
      (groups.get(r._dk) ?? groups.set(r._dk, []).get(r._dk)).push(r);
    }
    this._edGroups = groups;
    this._edStamp = null;
  },

  /** Видимые записи с редакциями: из каждой группы повторов — одна, из самой старшей включённой редакции. */
  _edVisible() {
    const base = baseEdition(), cfg = editionSettings(), alg = this.livingGodsOn();
    const stamp = `${base}|${alg}|${JSON.stringify(cfg)}`;
    if (stamp === this._edStamp) return this._edSet;
    const order = editionOrder(base);
    const rank = (cat, e) => e === "alg" ? (alg && base === "v20da" ? 0.5 : Infinity) : editionOn(cat, e, base, cfg) ? order.indexOf(e) : Infinity;
    const set = new Set();
    for (const list of this._edGroups?.values() ?? []) {
      let best = null, bestR = Infinity;
      for (const x of list) {
        const r = Math.min(...x._eds.map(e => rank(x._cat, e)));
        if (r < bestR) { best = x; bestR = r; }
      }
      if (best) set.add(best);
    }
    this._edStamp = stamp; this._edSet = set;
    return set;
  },

  /** Редакция записи для подписи: основа эпохи, если запись в ней есть, иначе её первая редакция; null — вне редакций. */
  editionLabelOf(x) {
    if (!x?._eds) return null;
    const base = baseEdition();
    return x._eds.includes(base) ? base : x._eds.find(e => e !== "alg") ?? null;
  },

  /** Фанатский «Vampire: Age of the Living Gods» включён настройкой мира (по умолчанию — нет). */
  livingGodsOn() {
    try { return !!game.settings.get(SYSTEM_ID, "livingGodsContent"); } catch { return false; }
  },
  /**
   * Показывать ли запись. С редакцией (_eds: силы, пути, ритуалы, черты, Факты, Пути и Дороги, психозы, комбинации) — по основе
   * эпохи и настройке «Редакции и источники», повторы — одной записью (_edVisible). Без редакции: «Век живых богов», хоумрулы
   * «форма зуло» и «Богатыри» — своими настройками; прочие материалы Тёмных веков (кланы, Способности) — в своей эпохе.
   * «elder-only» (Elysium) — пометка черт для старейшин, на видимость не влияет.
   */
  visible(x) { if (x?.alg) return this.livingGodsOn(); if (x?._eds) return this._edVisible().has(x); return !x?.era || x.era === "elder-only" || (x.era === "darkAges" && this.darkAgesOn()) || (x.era === "zulo" && zuloOn()) || (x.era === "bogatyr" && bogatyrOn()); },

  /** Ключ секты по свободному тексту (поле «Секта» на листе): «Камарилья» → camarilla. */
  sectKey(text) { return SECT_KEYS.find(([re]) => re.test(text ?? ""))?.[1] ?? ""; },

  /** Знак: { src, lum } — путь и режим маски (по яркости или по прозрачности). */
  // Путь абсолютный: в CSS-переменной url() иначе считался бы от папки стилей
  _sym(rel) { return rel ? { src: foundry.utils.getRoute(`${SYSTEM_PATH}/${rel}`), lum: LUMINANCE.test(rel) } : null; },
  /** Герб Дома падших (assets/demon/house-<ключ>.png, tools/wiki_glyphs.mjs) — маска, цвет задаёт CSS. */
  houseSymbol(key) { return key && this.houses?.some(h => h.key === key) ? this._sym(`assets/demon/house-${key}.png`) : null; },
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
    return ["camarilla", "sabbat", "anarchs", "independent", "inquisition"]
      .map(k => ({ key: k, label: game.i18n.localize(`VTM20.Sect.${k}`), sym: this._sym(s[k]) }));
  },
  discipline(key) { return this.disciplines[key] ?? null; },
  path(key) { return this.pathByKey?.[key] ?? this.pathByKey?.humanity ?? null; },

  /** Подпись Дисциплины по ключу (из данных справочника; при английском интерфейсе — английская). */
  disciplineLabel(key) { const d = this.disciplines[key]; return d ? VTM20.label(d) : key; },

  /**
   * Английское имя предмета на листе — по записи справочника (черта, факт, расстройство, ритуал); «» — своя запись.
   * Только для показа: связь предмета со справочником — по русскому имени.
   */
  enOf(item) {
    const key = `${item.type}|${item.name}`;
    this._en ??= new Map();
    if (!this._en.has(key)) {
      const byName = list => (list ?? []).find(x => x.name === item.name)?.en ?? "";
      const en = item.type === "merit" || item.type === "flaw" ? (this.merits ?? []).find(m => m.kind === item.type && m.name === item.name)?.en
        : item.type === "background" ? byName(this.backgrounds)
        : item.type === "derangement" ? byName(this.derangements)
        : item.type === "ritual" ? byName(Object.values(this.rituals ?? {}).flatMap(g => g.rituals ?? []))
        : "";
      this._en.set(key, en ?? "");
    }
    return this._en.get(key);
  },

  /** Силы Дисциплины до уровня включительно (без путей). */
  powersUpTo(key, level) {
    const d = this.disciplines[key];
    if (!d) return [];
    return d.powers.filter(p => p.level <= level && this.visible(p));
  },

  /** Путь магии крови по имени внутри Дисциплины. */
  bloodPath(disc, name) {
    return this.disciplines[disc]?.paths.find(p => p.name === name || p.aliases?.includes(name)) ?? null;
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
