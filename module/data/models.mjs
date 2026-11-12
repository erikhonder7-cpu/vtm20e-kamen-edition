// module/data/models.mjs
// Модели данных (TypeDataModel, Foundry v14). В базе — только то, что вводит
// игрок; производные величины (штраф за раны, предел крови, итоговые
// характеристики с кровью) считаются в prepareDerivedData.
//
// Правила — books/Мир Тьмы/Вампиры/_справочник/V20_Основные_правила/ (01–07).

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { effectMods } from "./effects.mjs";
import { formMods } from "./form.mjs";

const { SchemaField, NumberField, StringField, BooleanField, ArrayField, HTMLField, ObjectField } = foundry.data.fields;

/* ── Строительные блоки ─────────────────────────────────────────────────── */

const int = (initial = 0, min = 0, max = undefined) =>
  new NumberField({ required: true, integer: true, min, max, initial, nullable: false });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });

/** Характеристика: точки и специализация (обычно при 4+; исключения — файл 01). */
const traitField = (initial, max = 10) => new SchemaField({ value: int(initial, 0, max), specialty: str() });

const xpEntryField = () => new SchemaField({ amount: int(0, -999), reason: str(), date: str() });

/* ── Общая часть ───────────────────────────────────────────────────────── */

class BaseActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      attributes: new SchemaField(Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, traitField(1)]))),
      abilities: new SchemaField(Object.fromEntries(Object.keys(VTM20.abilities).map(k => [k, traitField(0)]))),
      // Хобби / Профессия / Квалификация (01)
      secondary: new ArrayField(new SchemaField({
        name: str(), group: str("talents"), value: int(1, 0, 10), specialty: str()
      })),
      virtues: new SchemaField({
        conscience:  new SchemaField({ value: int(1, 0, 5) }),   // или Решимость — по Пути
        selfControl: new SchemaField({ value: int(1, 0, 5) }),   // или Инстинкты — по Пути
        courage:     new SchemaField({ value: int(1, 0, 5) })
      }),
      morality: new SchemaField({
        path:  str("humanity"),
        value: int(7, 0, 10)
      }),
      willpower: new SchemaField({
        permanent: int(3, 0, 10),
        temporary: int(3, 0, 10)
      }),
      health: new SchemaField({
        bashing:    int(0, 0, 7),
        lethal:     int(0, 0, 7),
        aggravated: int(0, 0, 7)
      }),
      details: new SchemaField({
        player: str(), chronicle: str(), concept: str(),
        nature: str(), demeanor: str(),
        sire: str(), sect: str(), haven: str(),
        age: str(), apparentAge: str(), born: str(), embraced: str()
      }),
      // Кошелёк: монета в основной единице валюты, ассигнаты (номинал в ливрах), своя валюта
      money: new SchemaField({
        amount: new NumberField({ required: true, min: 0, initial: 0 }),
        paper: new NumberField({ required: true, min: 0, initial: 0 }),
        // ливры, су, денье — как лежат в кошельке, без самовольного размена (amount — их общая цена)
        coins: new SchemaField({ l: int(0, 0, 999999999), s: int(0, 0, 999999), d: int(0, 0, 999999) }),
        currency: str()
      }),
      experience: new SchemaField({
        total: int(0), spent: int(0),
        log: new ArrayField(xpEntryField())
      }),
      biography: new HTMLField({ required: true, blank: true, initial: "" }),
      notes: new HTMLField({ required: true, blank: true, initial: "" }),
      // Хроника персонажа: события по датам (Биография)
      timeline: new ArrayField(new SchemaField({ date: str(), text: str() })),
      // договоры с демонами (инфернализм, apps/infernal.mjs; V20 Rites of the Blood, Devil’s Due): с кем, форма сделки,
      // условия, плата и злодеяние, метка слуги демона; рейтинг по Devil’s Due — обязательство + последствие − частота
      pacts: new ArrayField(new SchemaField({ demon: str(), form: str("empowerment"), terms: str(), price: str(), deed: str(),
        thrall: new BooleanField({ initial: false }), obligation: int(0, 0, 5), frequency: int(0, 0, 5), consequence: int(0, 0, 5),
        broken: new BooleanField({ initial: false }) }))
    };
  }

  /** Есть ли у типа запас крови и Дисциплины. */
  get hasBlood() { return false; }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Итог характеристики: точки + временное усиление кровью (у вампиров и гулей).
    for (const [k, a] of Object.entries(this.attributes)) {
      a.boost = this.boosts?.[k] ?? 0;
      a.total = a.value + a.boost;
    }
    // Включённые силы Дисциплин (data/effects.mjs): Чудовищный облик +3, Шкура гадюки — Привлекательность 1…
    this.fx = effectMods(this.parent);
    for (const [k, v] of Object.entries(this.fx.attr)) if (this.attributes[k]) { this.attributes[k].total += v; this.attributes[k].fx = v; }
    for (const [k, v] of Object.entries(this.fx.set)) if (this.attributes[k]) { this.attributes[k].total = v; this.attributes[k].fxSet = true; }

    // Здоровье: губительные сверху, затем тяжёлые, лёгкие снизу (04).
    const h = this.health;
    const agg = Math.min(h.aggravated, 7);
    const let_ = Math.min(h.lethal, 7 - agg);
    const bash = Math.min(h.bashing, 7 - agg - let_);
    h.aggravated = agg; h.lethal = let_; h.bashing = bash;
    h.damage = agg + let_ + bash;
    h.max = 7;
    h.value = 7 - h.damage;
    h.levels = VTM20.healthLevels.map((lvl, i) => ({
      ...lvl, index: i,
      state: i < agg ? "aggravated" : i < agg + let_ ? "lethal" : i < h.damage ? "bashing" : "empty"
    }));
    const worst = h.damage > 0 ? VTM20.healthLevels[h.damage - 1] : null;
    h.incapacitated = h.damage >= 7;
    h.penalty = h.incapacitated ? 0 : (worst?.penalty ?? 0);
    // Доспех Терры: штрафы ран мягче на 1
    if (this.fx?.woundEase && h.penalty < 0) h.penalty = Math.min(0, h.penalty + this.fx.woundEase);
    h.status = worst?.key ?? "healthy";

    // Воля
    const w = this.willpower;
    w.temporary = Math.min(w.temporary, w.permanent);
    w.value = w.temporary; w.max = w.permanent;

    // Инициатива без броска: Ловкость + Смекалка, штраф за раны; точки Стремительности,
    // не обменянные на дополнительные действия, прибавляются (04).
    const actor = this.parent;
    const celerity = actor?.items ? Math.max(0, (actor.discipline?.("celerity") ?? 0) - (actor.celerityActions ?? 0)) : 0;
    this.initiative = this.attributes.dexterity.total + this.attributes.wits.total + h.penalty + celerity;

    this.experience.available = this.experience.total - this.experience.spent;
  }
}

/* ── Сородич ────────────────────────────────────────────────────────────── */

export class VampireData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      clan: str("brujah"),
      clanCustom: str(),
      clanChoice: str(),               // выбранная Дисциплина там, где клан даёт «одну из» (Колдуны, У-Дзао…)
      generation: int(13, 3, 15),
      // родословная, вписанная прямо в лист (bio.hbs, data/lineage.mjs): предки выше сира без листа — от деда-сира вверх;
      // потомки без листов; имя, клан словами, поколение (0 — считать по линии), когда и где обращён
      lineage: new SchemaField({
        ancestors: new ArrayField(new SchemaField({ name: str(), clan: str(), gen: int(0, 0, 15), embraced: str() })),
        childer: new ArrayField(new SchemaField({ name: str(), clan: str(), gen: int(0, 0, 15), embraced: str() })) }),
      blood: new SchemaField({ value: int(10, 0, 100) }),
      // Временное усиление физических характеристик кровью (05): до конца сцены.
      boosts: new SchemaField({ strength: int(0, 0, 10), dexterity: int(0, 0, 10), stamina: int(0, 0, 10) }),
      bonds: new ArrayField(new SchemaField({ name: str(), rating: int(1, 1, 3), role: str("regnant"), drinks: int(1, 0, 99), last: str() })),
      // Винкулум — братские узы Шабаша к членам стаи, 1–10 (module/apps/vaulderie.mjs)
      vinculi: new ArrayField(new SchemaField({ name: str(), rating: int(1, 1, 10) })),
      // Престация: кто кому должен услугу (module/apps/boons.mjs)
      boons: new ArrayField(new SchemaField({ name: str(), dir: str("owed"), level: str("minor"), note: str(), date: str(), done: new BooleanField({ initial: false }) })),
      // Изъян клана — своё уточнение (вкус Вентру, расстройство Малкавиан…).
      weaknessNote: str(),
      // Голконда (V20, гл. 5; module/apps/golconda.mjs): стадия «» | seeking | suspire | attained | failed,
      // успехи поиска учения, недели поиска, неделя последнего броска
      golconda: new SchemaField({ stage: str(""), found: int(0, 0, 20), weeks: int(0, 0, 52), week: new NumberField({ required: true, integer: true, initial: -1, nullable: false }) }),
      // Цимисхи: дней без родной земли — пулы вдвое за каждый (02)
      soilDays: int(0, 0, 10)
    };
  }

  get hasBlood() { return true; }

  prepareDerivedData() {
    super.prepareDerivedData();
    // Могущество крови (Тауматургия, Путь Крови 3): поколение ниже на время эффекта (apps/target-powers.mjs, genDrop)
    const drop = [...(this.parent?.effects ?? [])].reduce((s, e) => s + (!e.disabled && Number(e.flags?.[SYSTEM_ID]?.genDrop) || 0), 0);
    this.effectiveGeneration = Math.max(4, this.generation - drop);
    const gen = VTM20.generationOf(this.effectiveGeneration);
    this.blood.max = gen.pool;
    this.blood.perTurn = gen.perTurn;
    this.blood.value = Math.min(this.blood.value, gen.pool);
    this.traitMax = gen.trait;
    // Голконда: любой параметр — до 10 независимо от поколения (пока держатся Человечность 7+ и Совесть 4+)
    if (this.golconda?.stage === "attained" && this.morality?.path === "humanity" && this.morality.value >= 7 && (this.virtues?.conscience?.value ?? 0) >= 4) this.traitMax = 10;
    // Абсолютный предел усиления кровью — 10, обычный — предел поколения + 1 (05).
    this.boostMax = Math.min(10, gen.trait + 1);
    // Изъян: Привлекательность 0 у Носферату, Самеди, Горгулий, Предвестников Черепов (02)
    if (VTM20.uglyClans.includes(this.clan)) { this.attributes.appearance.total = 0; this.attributes.appearance.ugly = true; }
  }
}

/* ── Гуль (07) ──────────────────────────────────────────────────────────── */

export class GhoulData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      domitor: str(),
      domitorClan: str(),
      domitorGeneration: int(13, 3, 15),
      // Слуга персонажа: не считается игровым персонажем (опыт за сессию, списки игроков), получает половину
      // опыта, начисленного своему домитору (правило системы)
      retainer: new BooleanField({ initial: false }),
      ghoulType: str("vassal"),        // vassal | independent | revenant | dhampir
      family: str(),
      // Дампир (Accursed Heirs: Dhampirs): концепция, Предок-вампир и его клан, Кровные права (ключ → 1–3), ритуалы Дриримантии
      dhampir: new SchemaField({
        concept: str(), antecedent: str(), antecedentClan: str(),
        vitae: int(0, 0, 20),            // витэ вампира сверх своего запаса — дампир-гуль («Gast»)
        bloodrights: new ObjectField({ initial: {} }),
        rituals: new ArrayField(str())
      }),
      // Активный запас витэ: 1 на старте, предел 2 (растёт с возрастом).
      blood: new SchemaField({ value: int(1, 0, 20), max: int(2, 1, 20) }),
      boosts: new SchemaField({ strength: int(0, 0, 10), dexterity: int(0, 0, 10), stamina: int(0, 0, 10) }),
      bonds: new ArrayField(new SchemaField({ name: str(), rating: int(1, 1, 3), role: str("regnant"), drinks: int(1, 0, 99), last: str() })),
      boons: new ArrayField(new SchemaField({ name: str(), dir: str("owed"), level: str("minor"), note: str(), date: str(), done: new BooleanField({ initial: false }) }))
    };
  }

  get hasBlood() { return true; }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.blood.perTurn = 1;
    this.traitMax = 5;
    this.boostMax = 6;
    // Предел Дисциплин по поколению донора (07)
    const g = this.domitorGeneration;
    this.disciplineMax = g >= 8 ? 1 : g === 7 ? 2 : g === 6 ? 3 : g === 5 ? 4 : 5;
    // Дампир (Accursed Heirs): запас 10 + Древность — своя кровь, не витэ домитора; Дисциплины не выше 1 (Истечение 4+ — 2,
    // гуль-дампир — и по поколению донора), за ход — 1 пункт (Истечение 5 — 2)
    if (this.ghoulType === "dhampir") {
      const bg = en => this.parent?.items?.find(i => i.type === "background" && i.system.source === en)?.system.value ?? 0;
      const antiquity = bg("Antiquity"), effluence = bg("Effluence");
      this.blood.max = 10 + antiquity;
      this.blood.perTurn = effluence >= 5 ? 2 : 1;
      // гуль-дампир: пока есть витэ вампира — предел по поколению донора
      this.disciplineMax = Math.max(effluence >= 4 ? 2 : 1, (this.dhampir?.vitae ?? 0) > 0 ? this.disciplineMax : 1);
      this.gast = (this.dhampir?.vitae ?? 0) > 0;
    }
    this.blood.value = Math.min(this.blood.value, this.blood.max);
  }
}

/* ── Существо (фамильяр, порождение Бездны, призрак…) ───────────────────── */

export class CreatureData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str(),                                         // вид существа — свободный текст
      blood: new SchemaField({ value: int(0, 0, 100), max: int(10, 0, 100) }),
      boosts: new SchemaField({ strength: int(0, 0, 10), dexterity: int(0, 0, 10), stamina: int(0, 0, 10) }),
      // Может ли существо поглощать тяжёлые повреждения (как вампир) — решение рассказчика.
      supernatural: new BooleanField({ initial: true }),
      // Дух Умбры (W20, гл. 7): Ярость, Гнозис, Воля, Эссенция (запас «здоровья» и сил) и Чары (ключи data/werewolf.json → charms)
      spirit: new SchemaField({ on: new BooleanField({ initial: false }), rank: str("gaffling"), rage: int(3, 0, 10), gnosis: int(3, 0, 10),
        willpower: int(3, 0, 10), essence: new SchemaField({ value: int(9, 0, 100), max: int(9, 0, 100) }), charms: new ArrayField(str()),
        brood: str(), ban: str() })   // выводок и Запрет (W20 Umbra, гл. 4) — словами
    };
  }

  get hasBlood() { return this.blood.max > 0; }

  prepareDerivedData() {
    super.prepareDerivedData();
    this.blood.value = Math.min(this.blood.value, this.blood.max);
    this.blood.perTurn = 1;
    this.traitMax = 10;
    this.boostMax = 10;
  }
}

/** Дух — свой тип персонажа: данные те же, что у существа, отметка «дух» стоит всегда (лист — sheets/spirit-sheet.mjs). */
export class SpiritData extends CreatureData {
  static defineSchema() {
    const s = super.defineSchema();
    s.spirit.fields.on.initial = true;
    return s;
  }
  prepareDerivedData() { super.prepareDerivedData?.(); this.spirit.on = true; }
}

/* ── Смертный ───────────────────────────────────────────────────────────── */

export class MortalData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // Смертный как сосуд: сколько крови в нём осталось (10 у взрослого, 05).
      vessel: new SchemaField({ value: int(10, 0, 20), max: int(10, 1, 20) }),
      // Родня Гару (W20 Kinfolk): племя, порода, Гнозис (достоинство), Дары 1-го уровня; невосприимчивы к Бреду
      kinfolk: new SchemaField({ on: new BooleanField({ initial: false }), tribe: str(""), breed: str("homid"), gnosis: int(0, 0, 3), gifts: new ArrayField(str()),
        // нумины Родни (W20 Kinfolk, гл. 3): Пути ворожбы и психические феномены, 1–5 точек — ключи data/werewolf.json → numina
        numina: new ArrayField(new SchemaField({ key: str(), dots: int(1, 0, 5) })),
        // кин-фетч — UUID существа-духа, привязанного Огненным крещением (сгорает при Первой Перемене)
        fetch: str("") }),
      // Колдун (M20 Sorcerer): Объединение, Атрибут-проводник, нумины (Пути и психические феномены — ключи data/mage.json → sorcerer;
      // у Пути — её Способность), ритуалы. Консор (Gods & Monsters, гл. 3): спутник мага — вид, роль, чья сторона.
      sorcerer: new SchemaField({ on: new BooleanField({ initial: false }), affiliation: str(""), attr: str("intelligence"),
        numina: new ArrayField(new SchemaField({ key: str(), dots: int(1, 0, 5), ability: str("") })),
        rituals: new ArrayField(new SchemaField({ name: str(), path: str(), level: int(1, 1, 5), text: str() })) }),
      consor: new SchemaField({ on: new BooleanField({ initial: false }), kind: str("consor"), role: str(""), faction: str("") }),
      // Ками (W20 Umbra, гл. 4): избранник Геи — человек, животное, растение или земля; Гейс, Гнозис, Ярость (5 с «Берсерком»),
      // силы (ключи data/werewolf.json → kami.powers; n — сколько раз куплена повторяемая)
      kami: new SchemaField({ on: new BooleanField({ initial: false }), kind: str("human"), geas: str(""), gnosis: int(1, 0, 10), rage: int(0, 0, 10),
        powers: new ArrayField(new SchemaField({ key: str(), n: int(1, 1, 10) })) }),
      // фомор (W20, гл. 13; Book of the Wyrm): одержимый Бейном — порода фомори, силы (ключи data/werewolf.json → fomori.powers
      // или «~порода:Название» — особая сила породы), Ярость — с «Берсерком»
      fomor: new SchemaField({ on: new BooleanField({ initial: false }), breed: str(""), rage: int(0, 0, 10),
        powers: new ArrayField(new SchemaField({ key: str(), n: int(1, 1, 10) })) }),
      trueFaith: int(0, 0, 10),
      // охотник на падших (apps/exorcist.mjs): цель-демон, Истинное Имя, благословлённый предмет, помощники; обряд — душа
      // найдена/нет и попытки, победы и часы; на ком обряд сорван навсегда; когда читалась молитва св. Михаилу (часы хроники);
      // поиски оружия веры (сколько нужно, сколько набрано, сложность, Способность)
      exorcist: new SchemaField({ target: str(), trueName: new BooleanField({ initial: false }), talisman: int(0, 0, 5),
        helpers: new ArrayField(str()), soul: str(), soulTries: int(0, 0, 3), wins: int(0, 0, 99), hours: int(0, 0, 999),
        failed: new ArrayField(str()), michael: new NumberField({ required: true, integer: true, initial: 0 }),
        research: new ArrayField(new SchemaField({ key: str("prayer"), name: str(), need: int(10, 1, 999), got: int(0, 0, 999),
          diff: int(7, 2, 10), ability: str("investigation") })) }),
      // слуга Привязанного (apps/eb-servant.mjs): хозяин, наделения (по 15 пунктов и 3 стигмата), силы, стигматы,
      // прибавки к чертам, урезанный призыв «ключ Знания:круг»
      ebServant: new SchemaField({ master: str(), empowerments: int(0, 0, 9),
        powers: new ArrayField(new SchemaField({ key: str(), cost: int(0, 0, 20), note: str() })),
        stigmata: new ArrayField(new SchemaField({ key: str(), cost: int(0, 0, 3), note: str() })),
        boosts: new ArrayField(new SchemaField({ key: str(), dots: int(0, 0, 5) })), evocation: str() }),
      // Слуга падшего (Damned and Deceived): uuid хозяина-демона и Вера слуги 0–5; Добродетели — Совесть, Убеждённость, Мужество
      thrall: new SchemaField({ master: str(), faith: int(0, 0, 5),
        // дары хозяина (apps/thrall-gifts.mjs): вид, имя, ключ (черта, врождённая, призыв «ключ Знания:уровень»), точки прибавки,
        // черта высокой Муки, цена в Вере слуги, пояснение
        gifts: new ArrayField(new SchemaField({ kind: str("other"), name: str(), key: str(), dots: int(0, 0, 5),
          high: new BooleanField({ initial: false }), cost: int(1, 0, 10), note: str() })) })
    };
  }

  prepareDerivedData() {
    // Пути Просветления — удел Сородичей: у смертного всегда Человечность (V20)
    this.morality.path = "humanity";
    super.prepareDerivedData();
    this.traitMax = 5;
  }
}

/* ── Демон (Demon: The Fallen) ──────────────────────────────────────────── */

/**
 * Падший в теле смертного: Дом, фракция, Облик (Знание, по которому видна апокалиптическая форма), Небесное и
 * Истинное имена; Вера — сила демона (постоянная и запас), Мука — память Бездны (постоянная и временная).
 * Добродетели демона — Совесть, Убеждённость (слот selfControl) и Мужество; Человечности у демона нет.
 */
export class DemonData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      house: str(), faction: str(), visage: str(),
      names: new SchemaField({ celestial: str(), trueName: str() }),
      faith: new SchemaField({ permanent: int(3, 0, 10), temporary: int(3, 0, 10) }),
      torment: new SchemaField({ permanent: int(3, 0, 10), temporary: int(0, 0, 10) }),
      apocalyptic: new BooleanField({ initial: false }),
      // без тела-носителя (гибель или экзорцизм; apps/host.mjs) и утянут в Бездну
      hostless: new BooleanField({ initial: false }), abyss: new BooleanField({ initial: false }),
      // ритуал Зар («Спасители и истребители»): до этого часа хроники гибель тела отправляет прямо в Бездну
      zar: new NumberField({ required: true, integer: true, initial: 0 }),
      // адский двор («Город Ангелов», гл. 4; правила падших, гл. 17): чей двор, звание, министерство
      court: new SchemaField({ name: str(), rank: str(), ministry: str() }),
      // культ Привязанного (apps/cult.mjs): расписание и место ритуалов, последний ритуал, кубики почитания к призыву, культисты
      cult: new SchemaField({ schedule: str(), place: str(), last: str(), veneration: int(0, 0, 10),
        members: new ArrayField(new SchemaField({ name: str(), role: str("faithful"), uuid: str(), note: str() })) }),
      // завладение Привязанного телом поклонника (apps/possession.mjs): кто, с какого часа хроники, потрачено Веры (часов),
      // продлено часов; кем завладеть больше нельзя (провал)
      possession: new SchemaField({ name: str(), uuid: str(), start: new NumberField({ required: true, integer: true, initial: 0 }),
        spent: int(0, 0, 999), extended: int(0, 0, 999), banned: new ArrayField(str()) }),
      // журнал Муки (apps/torment.mjs): когда (реальное время и дата хроники), насколько изменилась временная и постоянная,
      // что стало, за что; последние 200 записей
      tormentLog: new ArrayField(new SchemaField({ ts: new NumberField({ required: true, integer: true, initial: 0 }), date: str(),
        temp: int(0, -10, 10), perm: int(0, -10, 10), tempAfter: int(0, 0, 10), permAfter: int(0, 0, 10), before: str(), reason: str() })),
      // жетон в форме: своя картинка и размер в клетках (0 — не менять); прежние хранит флаг жетона formSave
      formLook: new SchemaField({ img: str(), size: new NumberField({ required: true, min: 0, max: 10, initial: 0, nullable: false }) }),
      earthbound: new BooleanField({ initial: false }),  // Привязанный к Земле (Earthbound): Тёмные Знания и ритуалы без Муки, свой опыт
      // реликварий Привязанного: идеальный / импровизированный / природный; Вера в нём — сверх своей, тратится первой
      reliquary: new SchemaField({ kind: str("ideal"), faith: int(0, 0, 35) }),
      // Потребности Привязанного вместо Добродетелей: Плоть, Мысль, Эмоция (в теле или форме — прибавки к Характеристикам)
      urges: new SchemaField({ flesh: int(1, 0, 5), thought: int(1, 0, 5), emotion: int(1, 0, 5) }),
      // Слуги по договорам (гл. 9): Вера слуги 0–5, доля демону (не больше половины, вверх), Воля и раны — если у слуги нет листа
      thralls: new ArrayField(new SchemaField({
        name: str(), uuid: str(), faith: int(2, 0, 5), share: int(1, 0, 3), will: int(3, 0, 10), wounds: int(0, 0, 7),
        lost: int(0, 0, 10), terms: str(), gifts: str()
      }))
    };
  }

  prepareDerivedData() {
    this.morality.path = "humanity";
    super.prepareDerivedData();
    this.traitMax = 5;
    // Апокалиптическая форма (data/form.mjs): прибавки к Характеристикам, инициатива, без штрафов за раны
    const f = this.formFx = formMods(this.parent);
    for (const [k, v] of Object.entries(f.attr)) if (this.attributes[k]) { this.attributes[k].total += v; this.attributes[k].form = v; }
    if (f.noWoundPenalty) { this.initiative -= this.health.penalty; this.health.penalty = 0; }
    this.initiative += (f.attr.dexterity ?? 0) + (f.attr.wits ?? 0) + f.init;
  }
}

/* ── Предметы ───────────────────────────────────────────────────────────── */

class BaseItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new HTMLField({ required: true, blank: true, initial: "" }),
      source: str()
    };
  }
}

/** Дисциплина: ключ из справочника и точки. Силы берутся из Codex по уровню. */
export class DisciplineData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      key: str(),
      value: int(1, 0, 10),
      inClan: new BooleanField({ initial: false }),
      choices: new ObjectField({ initial: {} })   // уровень → имя выбранной силы, если на уровне несколько сил на выбор
    };
  }
}

/** Знание демона (Demon: The Fallen): ключ из справочника демонов и точки; призывы берутся из Codex по уровню. */
export class LoreData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), key: str(), value: int(1, 0, 5) };
  }
}

/** Путь магии крови (Тауматургия, Некромантия, Колдовство, Чародейство Ассамитов). */
export class BloodPathData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      discipline: str("thaumaturgy"),
      value: int(1, 0, 5),
      primary: new BooleanField({ initial: false })
    };
  }
}

/** Пул проверки, записанный в силе или ритуале: две черты и сложность. */
const rollField = () => new SchemaField({
  trait1: str(), trait2: str(),
  difficulty: int(0, 0, 10),          // 0 — не задана (6 или по описанию)
  blood: int(0, 0, 10),               // сколько крови стоит применение
  willpower: new BooleanField({ initial: false }),
  note: str()                         // пояснение к сложности, второму пулу или переменной цене
});

export class RitualData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      discipline: str("thaumaturgy"),
      level: int(1, 1, 10),
      roll: rollField(),
      // разделы справочника (data/ritual-text.mjs): description — «Описание», дальше компоненты, эффект, прочие разделы
      components: new HTMLField({ required: true, blank: true, initial: "" }),
      effect: new HTMLField({ required: true, blank: true, initial: "" }),
      notes: new ArrayField(new SchemaField({ title: str(), html: new HTMLField({ required: true, blank: true, initial: "" }) })),
      ref: str()                         // «Источник» справочника: книга и страница
    };
  }
}

/** Ритуал падших (Players Guide, гл. 6; «Дома Падших»): Знания Анкиды и Маду, цена, время, условия, бросок эффекта. */
export class DemonRitualData extends BaseItemData {
  static defineSchema() {
    const loreRef = () => new SchemaField({ key: str(), level: int(1, 1, 5) });
    return {
      ...super.defineSchema(),
      house: str(),                      // ключ Дома; "bastion" — ритуал бастиона, "earthbound" — Привязанных
      primary: loreRef(),
      secondary: new ArrayField(loreRef()),
      cost: int(0, 0),                   // начальная стоимость в опыте
      time: str(), limits: str(),
      roll: rollField(),                 // бросок эффекта после удачного хода ритуала
      rollText: str(),                   // бросок, как в книге («Обаяние + Лидерство», «Вера»)
      high: str(), variants: str(),      // эффект высокой Муки, варианты
      page: int(0, 0)
    };
  }
}

/** Реликвия падших: улучшенная, зачарованная, демоническая или древняя вещь; Знания мастера и система. */
// Чудо мага (M20, гл. 9; Book of Secrets): Талисман и Устройство — со своим Арете и запасом Квинтэссенции,
// Периапт — вместилище (5 Квинтэссенции за точку), Безделушка — одна функция, Фетиш — дух в предмете, Амулет — одноразовый.
export class WonderData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str("talisman"),             // talisman | device | trinket | periapt | fetish | artifact | charm | grimoire
      value: int(0, 0, 10),              // точки Факта «Чудо»
      arete: int(0, 0, 10), quintessence: int(0, 0), quintMax: int(0, 0),
      spheres: str(),                    // вложенные Сферы: «Силы 3, Разум 2»
      paradoxPerm: int(0, 0, 10),        // постоянный Парадокс, пока Чудо при владельце
      cost: int(0, 0)                    // цена Факта в очках (по книге)
    };
  }
}

export class RelicData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str("enchanted"),            // enhanced | enchanted | demonic | ancient | unique
      house: str(),
      lores: new ArrayField(str()),      // ключи Знаний, нужных для изготовления
      use: str(),                        // как пользоваться (активация)
      mechanics: str(),                  // система своими словами
      page: int(0, 0)
    };
  }
}

/** Инфернальное Вложение (V20 Rites of the Blood — 3 опыта, не больше постоянной Воли; старые — книги Шабаша, рейтинг 1–6):
 *  цена применения кровью, Волей, постоянной Волей; бросок, если есть; с кем договор и каким злодеянием скреплён. */
export class InvestmentData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tier: str("v20"),                  // v20 | sabbat
      rating: int(0, 0, 6), xp: int(3, 0, 99),
      cost: new SchemaField({ blood: int(0, 0, 10), willpower: int(0, 0, 10), willpowerPerm: int(0, 0, 10) }),
      costNote: str(),
      roll: rollField(),
      pact: str(), deed: str()
    };
  }
}

/** Записанная сила: своя или перенесённая из старой системы. Показывается в карточке Дисциплины. */
/** Призыв падшего (тип lorePower): Знание, круг, бросок; описание — эффект и высокая Мука. Как сила Дисциплины у вампиров. */
export class LorePowerData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      lore: str(),                       // ключ Знания (data/demon.json, data/demon-earthbound.json)
      level: int(1, 0, 5),
      page: int(0, 0, 999),
      roll: rollField()
    };
  }
}

export class PowerData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      discipline: str(),                 // ключ Дисциплины; пусто — «прочие силы»
      path: str(),                       // имя пути магии крови, если сила пути
      level: int(1, 0, 10),
      roll: rollField()
    };
  }
}

export class BackgroundData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), value: int(1, 0, 10) };
  }
}

export class MeritData extends BaseItemData {
  static defineSchema() {
    // clan / sect — ключ клана (data/clans.json) или секты, если черта клановая или сектантская; у общих — ""
    return { ...super.defineSchema(), cost: int(1, 0, 10), category: str("physical"), clan: str(), sect: str() };
  }
}

export class DerangementData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), permanent: new BooleanField({ initial: false }) };
  }
}

export class WeaponData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      kind: str("melee"),                       // brawl | melee | firearms | thrown
      damage: int(1, 0, 20),                    // урон: число костей или бонус к Силе
      strength: new BooleanField({ initial: true }), // урон = Сила + damage
      damageType: str("lethal"),
      difficulty: int(6, 2, 10),
      pierce: int(0, 0, 10),                    // пробитие брони: столько точек брони не учитывается (DA, Victorian Age)
      silver: new BooleanField({ initial: false }), // серебро: Гару вне породной формы — губительный без поглощения (W20, гл. 6)
      range: str(), rate: str(), clip: str(), concealment: str(),
      equipped: new BooleanField({ initial: true })
    };
  }
}

export class ArmorData extends BaseItemData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      rating: int(1, 0, 10),
      penalty: int(0, 0, 10),
      equipped: new BooleanField({ initial: true })
    };
  }
}

export class GearData extends BaseItemData {
  static defineSchema() {
    return { ...super.defineSchema(), quantity: int(1, 0) };
  }
}

/* ── Маг (Mage: The Ascension 20th Anniversary) ──────────────────────────── */

// Пробуждённый: смертное тело и сверх того — фракция, Сущность Аватара, Арете, девять Сфер (0–5, не выше Арете),
// течение внутри фракции (sub: Дом Гермеса, фракция Традиции, Методология Конвенции — ключ data/mage.json → factions[].subs),
// колесо Квинтэссенции и Парадокса (вместе не больше 20), фокус (парадигма, практика, инструменты), ротэ (apps/mage.mjs).
export class MageData extends MortalData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      mage: new SchemaField({ faction: str(""), sub: str(""), essence: str(""), affinity: str(""), arete: int(1, 0, 10),
        spheres: new SchemaField(Object.fromEntries(VTM20.mageSpheres.map(k => [k, int(0, 0, 5)]))),
        quintessence: int(0, 0, 20), paradox: int(0, 0, 20), paradoxPerm: int(0, 0, 20),
        paradigm: str(""), practice: str(""), instruments: new ArrayField(str()), resonance: str(""),
        rotes: new ArrayField(new SchemaField({ name: str(), spheres: str(), text: str(), kind: str("") })),
        // Резонанс и Синергия (Book of Secrets): подписи с «ароматом» и степенью 1–5; бонус кубиков — раз за историю
        resonances: new ArrayField(new SchemaField({ name: str(), flavor: str(""), value: int(1, 0, 5) })),
        synergy: new SchemaField({ dynamic: int(0, 0, 5), entropic: int(0, 0, 5), static: int(0, 0, 5) }), resUsed: new BooleanField({ initial: false }),
        // Безмолвие (уровень 0–6 и вид), Изъяны Парадокса, пройденный Поиск (разрешает купить точку Арете)
        // mind — до какого часа хроники маг в мире-разуме (пусто — не в нём; время до 1970 года — отрицательное)
        quiet: new SchemaField({ level: int(0, 0, 6), kind: str(""), mind: new NumberField({ required: false, integer: true, initial: null, nullable: true }) }),
        pflaws: new ArrayField(new SchemaField({ name: str(), grade: str("trivial"), text: str() })),
        seeking: new BooleanField({ initial: false }),
        // Маг-гуль (V20, гл. 9 — правила гулей): домитор и его клан, витэ вампира в теле (до 10), ступень уз крови (0–3)
        // Инфернальные пакты Падшего (Book of the Fallen): уровень 1–10 даёт столько же очков на Инвестиции; inhuman — Атрибуты, поднятые Инвестицией
        pacts: new ArrayField(new SchemaField({ level: int(1, 1, 10), patron: str(), terms: str() })), inhuman: new ObjectField({ initial: {} }),
        ghoul: new SchemaField({ on: new BooleanField({ initial: false }), domitor: str(), clan: str(), vitae: int(0, 0, 10), bond: int(0, 0, 3) }) })
    };
  }
  /** Прежняя подпись Резонанса одной строкой — в список подписей (1 точка). */
  static migrateData(src) {
    const m = src?.mage;
    if (m && typeof m.resonance === "string" && m.resonance.trim() && !m.resonances?.length) { m.resonances = [{ name: m.resonance.trim(), flavor: "", value: 1 }]; m.resonance = ""; }
    return super.migrateData(src);
  }
}

/* ── Регистрация ────────────────────────────────────────────────────────── */

/* ── Охотник (Hunter: The Reckoning) ─────────────────────────────────────── */

// Смертный, получивший Послание: всё смертное (кровь сосуда, Истинная вера, экзорцизм) и сверх того — кредо, три Добродетели
// охоты (Милосердие, Прозрение, Рвение 0–10), Убеждённость 0–10 и Грани — ключи «путь|уровень» из data/hunter.json (apps/hunter.mjs).
export class HunterData extends MortalData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      hunter: new SchemaField({ creed: str("defense"), mercy: int(0, 0, 10), vision: int(0, 0, 10), zeal: int(0, 0, 10),
        conviction: int(3, 0, 10), edges: new ArrayField(str()), start: int(0, 0, 10), fifth: str(""),
        // Players Guide, гл. 2: снятые жертвой условия Грани V; временные Добродетели (Деяния); очки роста и черты, отданные в этой истории (Жертва);
        // Грани «свыше»: сумма уровней за историю по Добродетелям, Грань сцены и её предел, запреты после неудачи и провала, риск за сцену
        fifthFree: new ArrayField(str()),
        temp: new SchemaField({ mercy: int(0, 0, 10), vision: int(0, 0, 10), zeal: int(0, 0, 10) }),
        advance: int(0, 0), sacrificed: new ArrayField(str()),
        story: new SchemaField({ mercy: int(0, 0, 10), vision: int(0, 0, 10), zeal: int(0, 0, 10) }),
        sceneEdge: str(""), sceneLevel: int(0, 0, 10), sceneBlock: new BooleanField({ initial: false }),
        sessionBlock: new BooleanField({ initial: false }), sceneRisk: new BooleanField({ initial: false }),
        // Свидетель (кредо «bystander», Players Guide, гл. 1): свои Добродетели 1–5; день, когда Добродетель уже отдана за Убеждённость
        bystander: new SchemaField({ courage: int(1, 0, 5), reason: int(1, 0, 5), selfControl: int(1, 0, 5) }), tradedOn: str("") })
    };
  }
}

/* ── Оборотень (Werewolf: The Apocalypse 20th) ──────────────────────────── */

// Гару: порода, аугурия, племя (ключи data/werewolf.json), Ранг 0–6, Слава (Слава, Честь, Мудрость — постоянная и временная),
// Ярость и Гнозис (постоянное и текущее; текущая Ярость может быть выше постоянной), форма и Дары (ключи Даров), ритуалы.
// Форма меняет итог Атрибутов (attributes.*.total; W20, гл. 6 — по листу персонажа: Манипуляция −3 в Криносе, Хиспо, Лупусе).
const renown = () => new SchemaField({ permanent: int(0, 0, 10), temporary: int(0, 0, 10) });
export class WerewolfData extends MortalData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      werewolf: new SchemaField({
        breed: str("homid"), auspice: str("ragabash"), tribe: str("boneGnawers"), rank: int(1, 0, 6),
        // Фера (W20 Changing Breeds): род («» — Гару); формы рода — data/werewolf.json → fera
        fera: str(""),
        // выбор внутри рода: порода, аспект/аугурия/путь, племя (Бастет), фракция (Ананаси), Прио (Бастет), варна (Мокол)
        feraSub: new SchemaField({ breed: str(""), aspect: str(""), tribe: str(""), faction: str(""), pryio: str(""), varna: str("") }),
        renown: new SchemaField({ glory: renown(), honor: renown(), wisdom: renown() }),
        rage: new SchemaField({ permanent: int(1, 0, 10), value: int(1, 0, 20) }),
        gnosis: new SchemaField({ permanent: int(1, 0, 10), value: int(1, 0, 10) }),
        form: str("homid"), gifts: new ArrayField(str()), rites: new ArrayField(str()),
        // фетиши (привязан ли, отверг ли владельца) и талены (сколько штук) — ключи data/werewolf.json → fetishes
        fetishes: new ArrayField(new SchemaField({ key: str(), attuned: new BooleanField({ initial: false }), rejected: new BooleanField({ initial: false }), n: int(1, 0, 20) })),
        // боевые шрамы (W20, гл. 6) — ключи data/werewolf.json → scars
        scars: new ArrayField(str()),
        // уродства метиса (W20, гл. 1; Changing Ways) — ключи data/werewolf.json → deformities
        deformities: new ArrayField(str()),
        // временный Атрибут формы вне таблицы (Дар, частичное превращение) — пока не используется
        deformity: str("")
      })
    };
  }

  /** Смена рода (Гару ↔ Фера) — в первую, человеческую форму нового рода: старый ключ формы у него не значит ничего. */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    // «~род» в списке племён на листе — переход в Фера (племя Гару остаётся прежним)
    const tribe = foundry.utils.getProperty(changes, "system.werewolf.tribe");
    if (typeof tribe === "string" && tribe.startsWith("~")) {
      foundry.utils.setProperty(changes, "system.werewolf.tribe", this.werewolf.tribe);
      foundry.utils.setProperty(changes, "system.werewolf.fera", tribe.slice(1));
    }
    const fera = foundry.utils.getProperty(changes, "system.werewolf.fera");
    if (fera === undefined || fera === this.werewolf.fera) return;
    // выбор внутри рода у нового рода свой
    if (!foundry.utils.hasProperty(changes, "system.werewolf.feraSub"))
      foundry.utils.setProperty(changes, "system.werewolf.feraSub", { breed: "", aspect: "", tribe: "", faction: "", pryio: "", varna: "" });
    if (foundry.utils.hasProperty(changes, "system.werewolf.form")) return;
    const first = fera ? globalThis.game?.vtm20Codex?.werewolf?.fera?.find(b => b.key === fera)?.forms[0]?.key : "homid";
    if (first) foundry.utils.setProperty(changes, "system.werewolf.form", first);
  }

  /** Данные формы (VTM20.garouForms — доступны при загрузке мира, до справочника; формы Фера — из справочника). */
  get formData() {
    if (this.werewolf.fera) {
      const f = globalThis.game?.vtm20Codex?.werewolf?.fera?.find(b => b.key === this.werewolf.fera)?.forms.find(f => f.key === this.werewolf.form);
      if (!f?.modsBy) return f ?? null;
      // у Бастет поправки форм — по племени, у Мокол Сухид — по варне
      const sub = this.werewolf.feraSub ?? {}, k = Object.keys(f.modsBy).find(k => { const [d, o] = k.split(":"); return sub[d] === o; });
      return k ? { ...f, ...f.modsBy[k] } : f;
    }
    return VTM20.garouForms.find(f => f.key === this.werewolf.form) ?? null;
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    // форма: поправки к итогу Атрибутов (Внешность в Криносе — 0); породная форма — без поправок
    const f = this.formData;
    for (const [k, v] of Object.entries(f?.mods ?? {})) if (this.attributes[k]) {
      this.attributes[k].form = v; this.attributes[k].total = Math.max(0, this.attributes[k].total + v);
    }
    for (const [k, v] of Object.entries(f?.set ?? {})) if (this.attributes[k]) { this.attributes[k].form = "set"; this.attributes[k].total = v; }
    // естественное оружие формы — тем же путём, что у демонов (combat.mjs, «f:N»); породная форма Хомида/Лупуса слабее к урону
    this.formFx = { attr: {}, soak: 0, init: 0, health: 0, diff: {}, dice: {}, list: [],
      weapons: Object.entries(f?.natural ?? {}).map(([k, type]) => ({ ...VTM20.garouNatural[k], key: k, type,
        name: game.i18n.localize(`VTM20.Werewolf.Natural.${k}`) })) };
    // уродства метиса с механикой (deformities[].fx): кубики поглощения (в своих формах), Внешность, укус без клыков — ударный
    const deform = globalThis.game?.vtm20Codex?.werewolf?.deformities ?? [], ap = this.attributes.appearance;
    for (const fx of this.werewolf.deformities.map(k => deform.find(d => d.key === k)?.fx).filter(Boolean)) {
      if (fx.soak && (!fx.forms || fx.forms.includes(this.werewolf.form))) this.formFx.soak += fx.soak;
      if (fx.appearance !== undefined) { ap.form = "set"; ap.total = fx.appearance; }
      if (fx.appearanceMax !== undefined) ap.total = Math.min(ap.total, fx.appearanceMax);
      if (fx.bite) for (const wpn of this.formFx.weapons) if (wpn.key === "bite") wpn.type = fx.bite;
    }
    this.werewolf.breedForm = this.werewolf.breed !== "metis" && this.werewolf.form === this.werewolf.breed;
    // кровь оборотня — 20 пунктов (V20: сильная кровь)
    this.vessel.max = 20; this.vessel.value = Math.min(this.vessel.value, 20);
    const w = this.werewolf;
    w.rage.value = Math.min(w.rage.value, 20);
    w.gnosis.value = Math.min(w.gnosis.value, w.gnosis.permanent);
    // для шкал жетона: текущая Ярость может быть выше постоянной (начало истории, W20, гл. 4)
    w.rage.max = Math.max(w.rage.permanent, w.rage.value); w.gnosis.max = w.gnosis.permanent;
    // клайв при себе — эффективный Гнозис ниже (W20, гл. 4): потеря берётся из отметки оружия
    w.gnosis.loss = (this.parent?.items ?? []).reduce((n, i) => n + (i.type === "weapon" && i.system.equipped ? Number(i.flags?.[SYSTEM_ID]?.gnosisLoss) || 0 : 0), 0);
  }
}

/* ── Призрак (Wraith: The Oblivion 20th) ────────────────────────────────── */

// Призрак (Wraith 20, гл. 4–8): Легион, фракция, Гильдия; Пафос (0–10) — топливо Арканоев; Корпус — вместо уровней здоровья
// (постоянный 10, шкала урона — health до 10 ячеек, без штрафов за раны); Арканои 0–5 (initiate — уровни, где известен
// Посвящённый уровень Гильдии; skip — где Общий уровень не взят: Посвящённый взят вместо него); Страсти и Оковы 1–5;
// Тень — архетип, Ангст (постоянный и временный, до 10), Тёмные Страсти, Шипы (ключи data/wraith.json → thorns);
// catharsis — Тень владеет Корпусом до конца сцены; state — телесное состояние (гл. 11, «Пять состояний»).
const wraithText = () => new SchemaField({ text: str(), emotion: str(), value: int(1, 0, 5) });
export class WraithData extends BaseActorData {
  static defineSchema() {
    const base = super.defineSchema();
    return {
      ...base,
      health: new SchemaField({ bashing: int(0, 0, 10), lethal: int(0, 0, 10), aggravated: int(0, 0, 10) }),
      wraith: new SchemaField({
        legion: str(""), faction: str(""), guild: str(""), death: str(""),
        pathos: new SchemaField({ value: int(5, 0, 10) }),
        corpus: int(10, 0, 10), state: str("corporeal"),
        arcanoi: new SchemaField(Object.fromEntries(VTM20.wraithArcanoi.map(k => [k, new SchemaField({ value: int(0, 0, 5),
          initiate: new ArrayField(int(1, 1, 5)), skip: new ArrayField(int(1, 1, 5)) })]))),
        passions: new ArrayField(wraithText()),
        fetters: new ArrayField(new SchemaField({ text: str(), value: int(1, 0, 5), resolved: new BooleanField({ initial: false }) })),
        shadow: new SchemaField({ archetype: str(""), guide: str(""),
          angst: new SchemaField({ permanent: int(1, 0, 10), temporary: int(0, 0, 10) }),
          darkPassions: new ArrayField(wraithText()),
          thorns: new ArrayField(new SchemaField({ key: str(), n: int(1, 1, 10), note: str() })),
          catharsis: new BooleanField({ initial: false }) }),
        // за сессию: Мемориум брошен, сколько кубиков Эйдолона потрачено (сбрасывает «Новая сессия» на листе)
        session: new SchemaField({ memoriam: new BooleanField({ initial: false }), eidolon: int(0, 0, 10) })
      })
    };
  }

  /** Список Арканоев с точками — для пулов и подписей. */
  get arcanoiList() { return VTM20.wraithArcanoi.filter(k => this.wraith.arcanoi[k].value > 0); }

  prepareDerivedData() {
    // общая часть режет шкалу до 7 уровней — сохраняем отметки Корпуса до неё
    const raw = { a: this.health.aggravated, l: this.health.lethal, b: this.health.bashing };
    super.prepareDerivedData();
    this.morality.path = "humanity";
    this.traitMax = 5;
    // Корпус (гл. 11): ячеек — постоянный Корпус; ударный, заполнивший все, — «колебание», летальный до конца — Испытание.
    // Штрафов за раны у призрака нет (у Материализованного — тоже).
    const w = this.wraith, cap = Math.max(1, w.corpus), h = this.health;
    const agg = Math.min(raw.a, cap), let_ = Math.min(raw.l, cap - agg), bash = Math.min(raw.b, cap - agg - let_);
    h.aggravated = agg; h.lethal = let_; h.bashing = bash;
    h.damage = agg + let_ + bash; h.max = cap; h.value = cap - h.damage;
    h.levels = Array.from({ length: cap }, (_, i) => ({ key: "corpus", label: "", penalty: 0, index: i,
      state: i < agg ? "aggravated" : i < agg + let_ ? "lethal" : i < h.damage ? "bashing" : "empty" }));
    h.penalty = 0;
    h.incapacitated = h.damage >= cap;
    h.status = h.damage >= cap ? (bash ? "wavering" : "harrowed") : h.damage ? "hurt" : "healthy";
    w.wavering = h.damage >= cap && bash > 0;
    w.pathos.max = 10;
    w.shadow.angst.max = 10;
    w.shadow.angst.value = w.shadow.angst.temporary;
    // Катарсис возможен, когда временный Ангст выше Воли (гл. 6)
    w.shadow.canCatharsis = w.shadow.angst.temporary > this.willpower.permanent;
    this.initiative = this.attributes.dexterity.total + this.attributes.wits.total;
  }
}

/* ── Котерия и домен — актёры-группы без черт персонажа ─────────────────── */

/**
 * Котерия (V20), стая (W20) или ячейка охотников (Hunter): участники, общие факты биографии (V20, «Общие факты
 * биографии котерии»: вклады участников, основа, потери сюжетом), тотем стаи, домен, позывной в сети охотников.
 */
export class CoterieData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: str("coterie"),                 // coterie | sabbat (стая Шабаша) | pack (стая Гару) | cell (ячейка охотников) | cabal (кабал магов)
      // Чантри кабала (M20, Факты «Чантри» и «Узел»): очки общего пула задают размах; Узел даёт Квинтэссенцию в неделю —
      // половину свободной, половину Тассом (rate — очков за точку Узла, по умолчанию 2: «индустриальная эпоха»)
      chantry: new SchemaField({ name: str(), sign: str(), points: int(0, 0, 999), node: int(0, 0, 10), rate: int(2, 1, 10),
        quint: int(0, 0, 999), tass: int(0, 0, 999), library: int(0, 0, 10), resonance: str() }),
      // «Общее убежище» (V20 Anarchs Unbound): точки общего факта — между роскошью, размером и защитой
      haven: new SchemaField({ luxury: int(0, 0, 5), size: int(0, 0, 5), security: int(0, 0, 5) }),
      members: new ArrayField(str()),       // id актёров
      primary: str(), pools: new ObjectField({ initial: {} }), lost: new ObjectField({ initial: {} }),
      totem: str(), domain: str(), net: str(),
      biography: new HTMLField({ required: true, blank: true, initial: "" }), notes: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }
}

/**
 * Домен (V20, факт «Домен»; Факты_биографии/01): охотничья территория. Точки — в размер (rating: −1 к сложности охоты
 * хозяину и гостям, +1 кровь в начале игры) и защищённость (+1 к сложности тайно проникнуть и охотиться незваным,
 * −1 к сложности найти нарушителя). Поместье (V20 Dark Ages Companion, гл. 7): процветание (−1 к Торговле),
 * тайные ходы (−1 к сложности скрываться знающим), население (домохозяйства и территория по таблице), челядь
 * (−рейтинг к сложности Управления и Лидерства), сюзерен и вассалы (объединённый домен), события домена.
 * Угодья — сложность охоты здесь; зона — место на карте города (охота в зоне знает хозяина, гостей и защищённость).
 */
export class DomainData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      owner: str(), rating: int(1, 0, 10), ground: str("business"), security: int(0, 0, 5), masquerade: int(0, 0, 5),
      prosperity: int(0, 0, 5), passages: int(0, 0, 5), populace: int(0, 0, 10), servants: int(0, 0, 5), liege: str(),
      events: new ArrayField(new SchemaField({ key: str(), note: str(), date: str() })),
      population: str(), zone: str(), holdings: str(),
      guests: new ArrayField(str()),      // кому хозяин позволил охотиться (id актёров)
      people: new ArrayField(str()),      // свои люди в домене: гули, Стадо, слуги (id актёров)
      biography: new HTMLField({ required: true, blank: true, initial: "" }), notes: new HTMLField({ required: true, blank: true, initial: "" })
    };
  }
}

export function registerDataModels() {
  Object.assign(CONFIG.Actor.dataModels, { vampire: VampireData, ghoul: GhoulData, mortal: MortalData, creature: CreatureData, spirit: SpiritData, demon: DemonData, hunter: HunterData, mage: MageData, werewolf: WerewolfData,
    wraith: WraithData, coterie: CoterieData, domain: DomainData });
  Object.assign(CONFIG.Item.dataModels, {
    discipline: DisciplineData, lore: LoreData, lorePower: LorePowerData, thaumPath: BloodPathData, ritual: RitualData, power: PowerData,
    background: BackgroundData, merit: MeritData, flaw: MeritData, derangement: DerangementData,
    weapon: WeaponData, armor: ArmorData, gear: GearData, demonRitual: DemonRitualData, relic: RelicData, investment: InvestmentData, wonder: WonderData
  });
}
