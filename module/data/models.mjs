// module/data/models.mjs
// Модели данных (TypeDataModel, Foundry v14). В базе — только то, что вводит
// игрок; производные величины (штраф за раны, предел крови, итоговые
// характеристики с кровью) считаются в prepareDerivedData.
//
// Правила — books/Мир Тьмы/Вампиры/_справочник/V20_Основные_правила/ (01–07).

import { VTM20 } from "../config.mjs";
import { effectMods } from "./effects.mjs";
import { formMods } from "./form.mjs";

const { SchemaField, NumberField, StringField, BooleanField, ArrayField, HTMLField, ObjectField } = foundry.data.fields;

/* ── Строительные блоки ─────────────────────────────────────────────────── */

const int = (initial = 0, min = 0, max = undefined) =>
  new NumberField({ required: true, integer: true, min, max, initial, nullable: false });
const str = (initial = "") => new StringField({ required: true, blank: true, initial });

/** Характеристика: точки и специализация (при 4+, файл 01). */
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
        currency: str()
      }),
      experience: new SchemaField({
        total: int(0), spent: int(0),
        log: new ArrayField(xpEntryField())
      }),
      biography: new HTMLField({ required: true, blank: true, initial: "" }),
      notes: new HTMLField({ required: true, blank: true, initial: "" }),
      // Хроника персонажа: события по датам (Биография)
      timeline: new ArrayField(new SchemaField({ date: str(), text: str() }))
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
      // Цимисхи: дней без родной земли — пулы вдвое за каждый (02)
      soilDays: int(0, 0, 10)
    };
  }

  get hasBlood() { return true; }

  prepareDerivedData() {
    super.prepareDerivedData();
    const gen = VTM20.generationOf(this.generation);
    this.blood.max = gen.pool;
    this.blood.perTurn = gen.perTurn;
    this.blood.value = Math.min(this.blood.value, gen.pool);
    this.traitMax = gen.trait;
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
      ghoulType: str("vassal"),        // vassal | independent | revenant
      family: str(),
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
    this.blood.value = Math.min(this.blood.value, this.blood.max);
    this.blood.perTurn = 1;
    this.traitMax = 5;
    this.boostMax = 6;
    // Предел Дисциплин по поколению донора (07)
    const g = this.domitorGeneration;
    this.disciplineMax = g >= 8 ? 1 : g === 7 ? 2 : g === 6 ? 3 : g === 5 ? 4 : 5;
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
      supernatural: new BooleanField({ initial: true })
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

/* ── Смертный ───────────────────────────────────────────────────────────── */

export class MortalData extends BaseActorData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // Смертный как сосуд: сколько крови в нём осталось (10 у взрослого, 05).
      vessel: new SchemaField({ value: int(10, 0, 20), max: int(10, 1, 20) }),
      trueFaith: int(0, 0, 10),
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
  willpower: new BooleanField({ initial: false })
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

/* ── Регистрация ────────────────────────────────────────────────────────── */

export function registerDataModels() {
  Object.assign(CONFIG.Actor.dataModels, { vampire: VampireData, ghoul: GhoulData, mortal: MortalData, creature: CreatureData, demon: DemonData });
  Object.assign(CONFIG.Item.dataModels, {
    discipline: DisciplineData, lore: LoreData, lorePower: LorePowerData, thaumPath: BloodPathData, ritual: RitualData, power: PowerData,
    background: BackgroundData, merit: MeritData, flaw: MeritData, derangement: DerangementData,
    weapon: WeaponData, armor: ArmorData, gear: GearData, demonRitual: DemonRitualData, relic: RelicData
  });
}
