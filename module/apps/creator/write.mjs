// module/apps/creator/write.mjs
// Мастер создания — запись персонажа разом в конце: черты, предметы, линейки; договор слуги — строкой в листе хозяина.

import { VTM20, SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { traitIcon, backgroundIcon } from "../../data/icons.mjs";
import { RENOWN, LOST_SLOTS, EXTRA_DISC_MERIT } from "../creator/rules.mjs";
import { sacrificeOn as hunterSacrificeOn } from "../hunter.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

export class WriteCreator {
  async write() {
    const a = this.actor, st = this.st;
    const sys = {
      attributes: Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, { value: this.value("attr", k), specialty: a.system.attributes[k].specialty }])),
      abilities: Object.fromEntries(Object.keys(VTM20.abilities).map(k => [k, { value: this.value("abil", k), specialty: a.system.abilities[k].specialty }])),
      virtues: Object.fromEntries(["conscience", "selfControl", "courage"].map(k => [k, { value: this.value("virt", k) }])),
      morality: { path: st.path, value: this.morality },
      willpower: { permanent: this.willpower, temporary: this.willpower },
      experience: {
        total: st.xpTotal, spent: this.xpSpent,
        log: st.xpTotal ? [{ amount: st.xpTotal, reason: t("Creator.XpStart"), date: "" },
          ...(this.xpSpent ? [{ amount: -this.xpSpent, reason: t("Creator.XpCreation"), date: "" }] : [])] : []
      },
      details: { ...a.system.details, concept: st.concept, nature: st.nature, demeanor: st.demeanor, sire: st.sire, sect: st.sect }
    };
    if (this.type === "vampire") {
      const gen = 13 - Math.min(5, this.value("bg", "Поколение"));
      const max = VTM20.generationOf(gen).pool;
      Object.assign(sys, { clan: st.clan, clanChoice: st.clanChoice, weaknessNote: st.weaknessNote, generation: gen,
        blood: { value: Math.min(max, st.blood ?? Math.ceil(max / 2)) } });
    }
    if (this.type === "ghoul") Object.assign(sys, { domitor: st.domitor, blood: { value: 1, max: a.system.blood.max } });
    // дампир: своя кровь — полный запас (10 + Древность пересчитает лист), концепция, Предок, Кровные права
    if (this.isDhampir) Object.assign(sys, { domitor: "", blood: { value: 10 + this.value("bg", Codex.backgrounds.find(b => b.en === "Antiquity")?.name ?? ""), max: 10 },
      dhampir: { concept: st.dhConcept, antecedent: st.antecedent, antecedentClan: st.antecedentClan, bloodrights: { ...st.bloodrights },
        rituals: [...(a.system.dhampir?.rituals ?? [])] } });
    // Слуга: Вера слуги и хозяин; Человечность не трогаем (грех слуги — по его Воле); дары-прибавки — сразу в черты
    if (this.isThrall) {
      delete sys.morality;
      for (const [k, n] of Object.entries(st.pact.attr)) sys.attributes[k].value = Math.min(5, sys.attributes[k].value + n);
      for (const [k, n] of Object.entries(st.pact.abil)) sys.abilities[k].value = Math.min(5, sys.abilities[k].value + n);
      const boosts = (kind, store) => Object.entries(store).filter(([, n]) => n > 0)
        .map(([k, n]) => ({ kind, name: "", key: `${kind === "attr" ? "attributes" : "abilities"}.${k}`, dots: n, high: false, cost: 0, note: "" }));
      sys.thrall = { master: st.pact.master, faith: this.morality, gifts: [...boosts("attr", st.pact.attr), ...boosts("abil", st.pact.abil)] };
    }
    // особый смертный: отметка Родни, Ками или фомора с выбранным
    if (this.type === "mortal" && !this.isThrall) {
      const W = Codex.werewolf ?? {}, m = st.mark;
      // колдун и консор (M20 Sorcerer; Gods & Monsters): отметка; нумины колдун берёт на листе
      const sorcOld = a.system.toObject?.().sorcerer ?? {};
      sys.sorcerer = m === "sorcerer" ? this.sorcWrite(sorcOld) : { ...sorcOld, on: false };
      sys.consor = { ...(a.system.toObject?.().consor ?? {}), on: m === "consor" };
      sys.kinfolk = { ...(a.system.kinfolk ?? {}), on: m === "kinfolk", ...(m === "kinfolk" ? { tribe: st.markTribe || W.tribes?.[0]?.key || "", breed: "homid" } : {}) };
      const ks = W.kami?.start?.[st.kamiKind] ?? { gnosis: 1, rage: 0, willpower: 3 };
      sys.kami = { ...(a.system.kami ?? {}), on: m === "kami", ...(m === "kami" ? { kind: st.kamiKind, geas: st.kamiGeas, gnosis: ks.gnosis, rage: ks.rage,
        powers: st.kamiPowers.map(key => ({ key, n: 1 })) } : {}) };
      const fb = (W.fomori?.breeds ?? []).find(b => b.key === st.fomorBreed);
      const own = (fb?.powers ?? []).filter(k => !k.startsWith("~") && (W.fomori?.powers ?? []).some(x => x.key === k));
      sys.fomor = { ...(a.system.fomor ?? {}), on: m === "fomor", ...(m === "fomor" ? { breed: st.fomorBreed, rage: 0,
        powers: [...new Set([...own, ...st.fomorPowers])].map(key => ({ key, n: 1 })) } : {}) };
      if (m === "fomor" && fb?.willpower) sys.willpower = { permanent: Math.max(sys.willpower.permanent, fb.willpower), temporary: Math.max(sys.willpower.permanent, fb.willpower) };
      if (m === "kami") sys.willpower = { permanent: Math.max(sys.willpower.permanent, ks.willpower), temporary: Math.max(sys.willpower.permanent, ks.willpower) };
    }
    // Охотник: кредо, Добродетели охоты, Убеждённость, Грани; Человечности и Добродетелей V20 нет
    if (this.isHunter) {
      delete sys.morality; delete sys.virtues;
      // начальная Убеждённость, купленная опытом, — постоянная; свободные пункты — только текущая шкала
      sys.hunter = this.isLost
        ? { creed: "bystander", mercy: 0, vision: 0, zeal: 0, conviction: 10, edges: [],
            bystander: Object.fromEntries(Object.entries(LOST_SLOTS).map(([slot, k]) => [k, this.value("virt", slot)])) }
        : { creed: st.creed, mercy: this.hunterVirtue("mercy"), vision: this.hunterVirtue("vision"), zeal: this.hunterVirtue("zeal"),
            conviction: this.morality, edges: [...st.edges], start: st.xp.morality ? (this.creedData?.conviction ?? 3) + st.xp.morality : 0 };
    }
    // Маг: фракция, Сущность, родовая Сфера, Арете, Сферы, фокус; Квинтэссенция — по Аватару; Человечности и Добродетелей нет
    if (this.isMage) {
      delete sys.morality; delete sys.virtues;
      const g = st.mg;
      sys.mage = { ...(a.system.toObject?.().mage ?? {}), faction: g.faction, essence: g.essence, affinity: g.affinity, arete: this.morality,
        spheres: Object.fromEntries(VTM20.mageSpheres.map(k => [k, this.value("disc", k)])),
        sub: (this.mageFaction?.subs ?? []).some(x => x.key === g.sub) ? g.sub : "",
        quintessence: this.mageQuint, paradox: 0, resonances: g.resName ? [{ name: g.resName, flavor: "", value: this.mageRes }] : [], paradigm: g.paradigm, practice: g.practice };
    }
    // Гару и Фера: порода, аугурия, племя (или род с выбором внутри), Ранг 1, форма рождения, Ярость, Гнозис, Дары, Слава, уродство
    if (this.isWerewolf) {
      delete sys.morality; delete sys.virtues;
      const w = st.ww, f = this.feraData, r = this.garouRenown;
      sys.werewolf = { ...(a.system.toObject?.().werewolf ?? {}),
        breed: w.breed, auspice: w.auspice, tribe: w.tribe, rank: 1, fera: w.fera,
        feraSub: { breed: "", aspect: "", tribe: "", faction: "", pryio: "", varna: "", ...w.sub },
        form: f ? f.forms[0]?.key ?? "homid" : w.breed === "lupus" ? "lupus" : w.breed === "metis" ? "crinos" : "homid",
        rage: { permanent: this.garouRage, value: this.garouRage }, gnosis: { permanent: this.garouGnosis, value: this.garouGnosis },
        gifts: [...Object.values(w.gifts), ...w.extra].filter(Boolean),
        deformities: this.isMetis && w.deform ? [w.deform] : [],
        renown: Object.fromEntries(RENOWN.map(k => [k, { permanent: r[k], temporary: 0 }])) };
    }
    // Подменыш: кит, ступень, двор, Наследия, Искусства и Царства, Гламур, Банальность; Человечности и Добродетелей нет
    if (this.isChangeling) {
      delete sys.morality; delete sys.virtues;
      sys.changeling = this.clWrite(a.system.toObject?.().changeling ?? {});
    }
    // Призрак: Легион, Гильдия, Пафос, Корпус 10, Арканои, Страсти, Оковы, Тень; Человечности и Добродетелей нет
    if (this.isWraith) {
      delete sys.morality; delete sys.virtues;
      sys.wraith = this.wraithWrite(a.system.toObject?.().wraith ?? {});
      sys.health = { bashing: 0, lethal: 0, aggravated: 0 };
    }
    if (this.isDemon) {
      delete sys.morality;
      Object.assign(sys, { house: st.house, visage: st.visage, faction: st.faction, names: { ...st.names },
        faith: { permanent: this.morality, temporary: this.morality },
        torment: { permanent: this.houseData?.torment ?? 3, temporary: 0 }, apocalyptic: false });
      // Привязанный: Мука 10, Добродетелей нет — их точки стали Потребностями
      if (this.isEarthbound) Object.assign(sys, { earthbound: true, torment: { permanent: 10, temporary: 0 }, reliquary: { kind: st.reliquary || "ideal", faith: 0 },
        urges: { flesh: this.value("virt", "conscience"), thought: this.value("virt", "selfControl"), emotion: this.value("virt", "courage") },
        virtues: { conscience: { value: 0 }, selfControl: { value: 0 }, courage: { value: 0 } } });
    }
    // Кровные права — словарь: снятые в мастере права убрать отдельно (обычное обновление словарь только дополняет)
    const goneRights = this.isDhampir ? Object.keys(a.system.dhampir?.bloodrights ?? {}).filter(k => !(k in st.bloodrights)) : [];
    if (goneRights.length) await a.update(Object.fromEntries(goneRights.map(k => [`system.dhampir.bloodrights.-=${k}`, null])));
    await a.update({ name: st.name, system: sys });

    const kill = a.items.filter(i => ["discipline", "thaumPath", "lore", "background", "merit", "flaw"].includes(i.type)).map(i => i.id);
    if (kill.length) await a.deleteEmbeddedDocuments("Item", kill);
    const icon = n => `systems/${SYSTEM_ID}/assets/icons/${n}.svg`;
    const items = [];
    const discKeys = new Set([...(this.clanDisciplines ?? []), ...Object.keys(st.disc), ...Object.keys(st.free.disc), ...Object.keys(st.xp.disc)]);
    if (this.type === "ghoul") discKeys.add("potence");
    for (const k of discKeys) {
      if (this.isMage || this.isWraith || this.isChangeling) continue;   // Сферы, Арканои, Искусства — числа на листе       // Сферы мага и Арканои призрака — числа на листе, не предметы
      if (this.isDemon) {                               // Знания падшего — предметами «Знание» со справочным ключом
        const l = Codex.lore(k), v = this.value("disc", k);
        if (l && v > 0) items.push({ name: l.name, type: "lore", img: icon(l.dark ? "darkLore" : "lore"),
          system: { key: k, value: v, description: `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? t("Demon.Common")}</p>` } });
        continue;
      }
      const v = this.value("disc", k), d = Codex.discipline(k);
      if (!d || (v <= 0 && !this.inClan(k))) continue;
      // Дисциплина по «Дополнительной Дисциплине» — с ручной отметкой «клановая» (цена опыта ×5 и на листе)
      items.push({ name: d.name, type: "discipline", img: Codex.disciplineIcon(k), system: { key: k, value: v, inClan: k === this.extraDisc } });
      const firstPath = { thaumaturgy: "Путь Крови", necromancy: "Путь Склепа" }[k];
      if (firstPath && v > 0) items.push({ name: firstPath, type: "thaumPath", img: Codex.disciplineIcon(k),
        system: { discipline: k, value: Math.min(5, v), primary: true, description: Codex.bloodPath(k, firstPath)?.html ?? "" } });
    }
    const bgLine = this.isThrall ? "demon" : VTM20.traitLine(this.type);       // слуга — факты биографии из книги падших
    const bgDone = new Set();                           // одноимённые (охотничий и анархов «Арсенал») — один раз, своя линия первой
    const bgList = Codex.backgrounds.filter(b => (!b.dhampir || this.isDhampir) && ((b.line ?? "") === bgLine || (this.isHunter && VTM20.backgroundAllowed(b, "hunter"))) && !(this.isLost && b.noBystander))
      .sort((x, y) => ((y.line ?? "") === bgLine) - ((x.line ?? "") === bgLine));
    for (const b of bgList) {   // одноимённые у демонов — своя линия
      if (bgDone.has(b.name)) continue;
      bgDone.add(b.name);
      // Отшельник (Hunter Players Guide, с. 19): Покровители 3 даром, купленные точки — сверху (4-я и 5-я — как 1-я и 2-я)
      const free = this.isHunter && !this.isLost && b.en === "Patron" ? this.creedData?.patron ?? 0 : 0;
      const v = Math.min(5, this.value("bg", b.name) + free);
      if (v > 0) items.push({ name: b.name, type: "background", img: backgroundIcon(b.en) ?? icon("background"), system: { value: v, description: b.html, source: b.en } });
    }
    for (const m of st.merits) {
      // у «Дополнительной Дисциплины» в описании — какая Дисциплина выбрана
      const chosen = m.en === EXTRA_DISC_MERIT && this.extraDisc ? `<p><b>${t("Creator.ExtraDiscChosen", { name: Codex.disciplineLabel(this.extraDisc) })}</b></p>` : "";
      items.push({ name: m.name, type: "merit", img: traitIcon(m.category), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: chosen + m.html, source: m.en } });
    }
    for (const m of st.flaws) items.push({ name: m.name, type: "flaw", img: traitIcon(m.category, true), system: { cost: m.cost, category: m.category, clan: m.clan ?? "", sect: m.sect ?? "", description: m.html, source: m.en } });
    // опытный охотник: по психозу за каждую точку Добродетели от 7 (при Жертве — от 9); какие — игрок выбирает в библиотеке
    if (this.isHunter && !this.isLost) {
      const from = hunterSacrificeOn() ? 9 : 7, n = ["mercy", "vision", "zeal"].reduce((s, v) => s + Math.max(0, this.hunterVirtue(v) - from + 1), 0);
      for (let i = 0; i < n; i++) items.push({ name: t("Creator.HunterMadnessName", { n: i + 1 }), type: "derangement", img: icon("derangement"),
        system: { permanent: true, description: `<p>${t("Creator.HunterMadnessHint")}</p>` } });
    }
    if (this.type === "vampire" && /^malkavian/.test(st.clan) && !a.items.some(i => i.type === "derangement")) {
      items.push({ name: t("Creator.MalkDerangement"), type: "derangement", img: icon("derangement"), system: { permanent: true, description: `<p>${t("Creator.MalkDerangementHint")}</p>` } });
    }
    await a.createEmbeddedDocuments("Item", items);
    await a.setFlag(SYSTEM_ID, "created", true);
    if (this.isThrall) await this.writePact();
    ui.notifications.info(t("Creator.Done", { name: st.name }));
  }

  /** Договор слуги — строкой в листе хозяина (system.thralls): Вера, доля, Воля, условия и дары. */
  async writePact() {
    const a = this.actor, p = this.st.pact;
    const master = p.master ? await fromUuid(p.master) : null;
    if (!master || master.type !== "demon") return;
    if (!master.isOwner) { ui.notifications.warn(t("Creator.PactNoAccess", { name: master.name })); return; }
    const boosts = [...Object.entries(p.attr).map(([k, n]) => `${loc(VTM20.attributes[k].label)} +${n}`),
      ...Object.entries(p.abil).map(([k, n]) => `${loc(VTM20.abilities[k].label)} +${n}`)].join(", ");
    const row = { name: a.name, uuid: a.uuid, faith: this.morality, share: Math.min(3, this.pactShare), will: this.willpower, wounds: 0, lost: 0,
      terms: p.terms, gifts: [p.gifts, boosts].filter(Boolean).join(" · ") };
    await master.update({ "system.thralls": [...master.system.thralls.filter(x => x.uuid !== a.uuid), row] });
  }
}
