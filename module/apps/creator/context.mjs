// module/apps/creator/context.mjs
// Мастер создания: сборка данных для шаблона (все шаги мастера).
// Примесь к VtMCreator (module/apps/creator.mjs): методы и геттеры работают с this мастера.

import { VTM20, SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { WRAITH_HINTS, MAGE_HINTS, RENOWN, THRALL_BANNED, TIERS, SECTS, STEP_HINTS, GHOUL_HINTS, DEMON_HINTS, EB_HINTS, THRALL_HINTS, HUNTER_HINTS, GAROU_HINTS, HUNTER_SLOTS, LOST_SLOTS, preview } from "./rules.mjs";
import { W as werewolfData } from "../werewolf.mjs";
import { M as mageData, mageGlyphSrc } from "../mage.mjs";
import { H as hunterData, growth as hunterGrowth } from "../hunter.mjs";
import { W as wraithData, wraithGlyphSrc } from "../wraith.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);

export class ContextCreator {
  /* ── Контекст ──────────────────────────────────────────────────────── */

  async _prepareContext() {
    await Codex.load();
    const st = this.st, rem = this.remaining(), key = this.stepKey;
    const dotRow = (kind, k, max = 5, locked = false) => {
      const b = this.base(kind, k);
      const store = kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt;
      const a = store[k] ?? 0, f = st.free[kind]?.[k] ?? 0, x = st.xp[kind]?.[k] ?? 0;
      return Array.from({ length: max }, (_, i) => ({
        n: i + 1, kind, key: k, locked,
        state: i < b ? "base" : i < b + a ? "alloc" : i < b + a + f ? "free" : i < b + a + f + x ? "xp" : "empty"
      }));
    };
    const ctx = {
      st, ui: this.ui, rem, rules: this.rules, type: this.type,
      marks: this.type === "mortal" ? this.markView() : null,
      isVampire: this.type === "vampire", isGhoul: this.type === "ghoul", isDemon: this.isDemon, isEarthbound: this.isEarthbound, isThrall: this.isThrall, isMortal: this.type === "mortal", isHunter: this.isHunter, isLost: this.isLost, isWerewolf: this.isWerewolf, discLabel: this.discLabel, bgLabel: this.bgLabel,
      typeLabel: loc(`TYPES.Actor.${this.type}`), typeSigil: VTM20.typeSigil(this.type), typeSym: this.type === "werewolf" ? { src: foundry.utils.getRoute(VTM20.typeSigil(this.type)) } : null,
      steps: this.steps.map((k, i) => ({ i, key: k, n: i + 1, label: t(`Creator.Step.${this.stepName(k)}`), active: i === this.step, done: this.stepOk(k, rem) && i !== this.step })),
      stepKey: key, stepNumber: this.step + 1, stepCount: this.steps.length,
      // у гуля свои подсказки там, где правила другие (нет Становления, Дисциплины — от домитора)
      title: t(`Creator.Step.${this.stepName(key)}`),
      hint: t(`Creator.${STEP_HINTS[key]}${this.type === "ghoul" && GHOUL_HINTS.has(key) ? "Ghoul" : this.isEarthbound && EB_HINTS.has(key) ? "Earthbound" : this.isThrall && THRALL_HINTS.has(key) ? "Thrall" : this.isLost && HUNTER_HINTS.has(key) ? "Lost" : this.isHunter && HUNTER_HINTS.has(key) ? "Hunter" : this.isWerewolf && GAROU_HINTS.has(key) ? "Garou" : this.isMage && MAGE_HINTS.has(key) ? "Mage" : this.isWraith && WRAITH_HINTS.has(key) ? "Wraith" : this.isDemon && DEMON_HINTS.has(key) ? "Demon" : key === "advantages" && !this.rules.bg ? "NoBg" : ""}`, { n: this.rules.disc, bg: this.rules.bg, virt: this.rules.virt }),
      sectRule: ["concept", "disciplines", "advantages", "freebies"].includes(key) ? this.sectRule : "",
      isFirst: this.step === 0, isLast: this.step === this.steps.length - 1,
      [`is_${key}`]: true
    };

    // Патент справа: живой предпросмотр персонажа и остатки очков по разделам
    const total = arr => arr.reduce((s, v) => s + v, 0);
    const ledger = [];
    const add = (label, left, all) => ledger.push({
      label, left, pct: all ? Math.max(0, Math.min(100, Math.round((all - left) / all * 100))) : 100,
      state: left < 0 ? "over" : left === 0 ? "done" : "open"
    });
    add(t("Sheet.Attributes"), total(Object.values(rem.attr)), total(this.rules.attr));
    add(t("Sheet.Abilities"), total(Object.values(rem.abil)), total(this.rules.abil));
    if (this.rules.disc) add(this.discLabel, rem.disc, this.rules.disc);
    add(this.bgLabel, rem.bg, this.rules.bg);
    if (this.rules.virt) add(t("Sheet.Virtues"), rem.virt, this.rules.virt);
    if (this.isWerewolf) { const slots = this.giftSlots; add(loc("VTM20.GarouCr.Gifts"), slots.filter(s => !st.ww.gifts[s.key]).length, slots.length); }
    add(t("Creator.Freebies"), rem.free, this.freeTotal);
    if (st.xpTotal) add(t("Sheet.Experience"), rem.xp, st.xpTotal);
    const gen = this.type === "vampire" ? 13 - Math.min(5, this.value("bg", "Поколение")) : null;
    ctx.patent = {
      img: this.actor.img, name: st.name, concept: st.concept, sect: st.sect, sectSym: Codex.sectSymbol(st.sect),
      clan: this.clanData?.name ?? "",
      sym: this.type === "vampire" ? Codex.clanSymbol(st.clan) : Codex.sectSymbol(st.sect),
      generation: gen, blood: gen ? VTM20.generationOf(gen).pool : null,
      morality: this.morality, willpower: this.willpower, pathName: this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name ?? "", ledger,
      torment: this.houseData?.torment ?? null, demon: this.isDemon
    };
    if (this.isDemon) Object.assign(ctx.patent, { clan: this.houseData?.name ?? "", sect: Codex.faction(st.faction)?.name ?? "", sectSym: null });
    if (this.isMage) this.magePatent(ctx);
    if (this.isWraith) this.wraithPatent(ctx);
    if (this.isWerewolf) this.garouPatent(ctx);
    const by = hunterData().bystander;
    if (this.isHunter) Object.assign(ctx.patent, { clan: this.isLost ? `${by?.name} · ${by?.who}` : this.creedData ? `${this.creedData.name} · ${this.creedData.who}` : "", sectSym: null });
    if (this.isHunter) this.hunterContext(ctx, key);   // кредо и Грани (creator/hunter.mjs)

    if (this.isDhampir) this.dhampirContext(ctx, key);

    // I. Концепция и возраст
    // Привязанному чужды архетипы человеческих надежд (Earthbound, гл. 3)
    const EB_NO = ["Бонвиван", "Опекун", "Ребёнок", "Конформист", "Щёголь", "Мученик", "Кающийся грешник", "Искатель удовольствий"];
    const RELIC_ICON = { ideal: "fa-gem", improvised: "fa-box-open", natural: "fa-mountain-sun" };
    ctx.reliquaryKinds = ["ideal", "improvised", "natural"].map(k => ({ value: k, label: t(`Demon.ReliquaryKind.${k}`), hint: t(`Demon.ReliquaryHint.${k}`).replace(/^[^:]+:\s*/, ""), icon: RELIC_ICON[k], active: (st.reliquary || "ideal") === k }));
    ctx.archetypes = this.isEarthbound ? Codex.archetypes.filter(a => !EB_NO.includes(a.name)) : Codex.archetypes;
    ctx.natureRegain = Codex.archetypes.find(a => a.name === st.nature)?.regain ?? "";
    ctx.demeanorRegain = Codex.archetypes.find(a => a.name === st.demeanor)?.regain ?? "";
    // у гуля «срок службы» вместо возраста в Крови — опыт тот же
    const tierKey = this.type === "ghoul" ? "TierGhoul" : this.isMage ? "TierMage" : "Tier";
    ctx.tiers = Object.entries(TIERS).map(([k, v]) => ({ key: k, xp: v.xp, label: t(`Creator.${tierKey}.${k}`), hint: t(`Creator.${tierKey}.${k}Hint`), active: st.tier === k }));
    ctx.tierTitle = t(this.type === "ghoul" ? "Creator.TierTitleGhoul" : this.isMage ? "Creator.TierTitleMage" : "Creator.TierTitle");
    ctx.sects = SECTS.map(s => ({ ...s, label: t(s.label), sym: Codex.sectSymbol(t(s.label)), active: st.sectKey === s.key }));

    // II. Клан
    if (this.type === "vampire") {
      ctx.clanGroupTabs = ["clan", "bloodline", "variant", "antitribu"].map(g => ({ key: g, label: t(`ClanGroup.${g}`), active: this.ui.clanGroup === g }));
      ctx.clans = Codex.clans.filter(c => c.group === this.ui.clanGroup).map(c => ({
        key: c.key, name: c.name, nickname: c.nickname, sym: Codex.clanSymbol(c.key), active: c.key === st.clan,
        disciplines: [...c.disciplines.map(k => Codex.disciplineLabel(k)), ...(c.choice?.length ? [`${c.choice.map(k => Codex.disciplineLabel(k)).join(" / ")}`] : [])].join(", ") || t("Creator.AnyDisc")
      }));
      const c = this.clanData;
      ctx.clan = c ? {
        ...c, sym: Codex.clanSymbol(c.key),
        choiceOptions: (c.choice ?? []).map(k => ({ value: k, label: Codex.disciplineLabel(k), active: k === st.clanChoice, sym: Codex.disciplineSymbol(k) })),
        discCards: (c.disciplines ?? []).map(k => ({ label: Codex.disciplineLabel(k), sym: Codex.disciplineSymbol(k) }))
      } : null;
      ctx.isVentrue = ["ventrue", "ventruAntitribu"].includes(st.clan);
      const genBg = this.value("bg", "Поколение");
      ctx.generation = 13 - Math.min(5, genBg);
      ctx.gens = [13, 12, 11, 10, 9, 8].map(g => ({ g, cost: 13 - g, active: g === ctx.generation, pool: VTM20.generationOf(g).pool, perTurn: VTM20.generationOf(g).perTurn }));
      ctx.paths = Codex.paths.filter(p => Codex.visible(p) || p.key === st.path)
        .map(p => ({ key: p.key, name: p.name, selected: p.key === st.path,
          group: p.key === "humanity" ? p.name : p.fan ? t("Library.Filter.Src.fan") : p.era ? t("Library.Filter.DarkAges") : t("Sheet.EnlightenmentPaths") }));
      ctx.pathName = ctx.paths.find(p => p.selected)?.name ?? "";
      ctx.pathInfo = this.pathData ? { bearing: this.pathData.bearing, virtues: this.pathData.virtues.map(v => loc(VTM20.virtues[v].label)).join(", ") } : null;
    }

    // II. Дом падшего: Дом, Облик (главное Знание), фракция, Небесное и Истинное имя
    if (this.isDemon) {
      const h = this.houseData;
      ctx.houses = Codex.houses.map(x => ({ key: x.key, name: x.name, akkadian: x.akkadian, torment: x.torment, active: x.key === st.house,
        lores: x.lores.map(k => Codex.lore(k)?.name ?? k).join(", ") }));
      ctx.house = h ? { ...h, visages: Object.entries(h.visages).map(([k, name]) => ({ key: k, name, lore: Codex.lore(k)?.name ?? k, active: k === st.visage,
        low: Codex.lore(k)?.form?.low ?? [] })) } : null;
      ctx.factions = Codex.factions.map(f => ({ ...f, active: f.key === st.faction }));
    }

    if (this.isMage) this.mageContext(ctx);         // II. Маг: фракция, Сущность, родовая Сфера (creator/mage.mjs)
    if (this.isWraith) this.wraithContext(ctx, key); // II. Призрак: Легион, Гильдия, Страсти, Оковы, Тень (creator/wraith.mjs)
    if (this.isWerewolf) this.garouContext(ctx);   // II. Гару и Фера: род, Дары, Слава (creator/garou.mjs)

    // III–IV. Характеристики и способности
    const prioLabels = [t("Creator.Primary"), t("Creator.Secondary"), t("Creator.Tertiary")];
    ctx.attrGroups = Object.entries(VTM20.attributeGroups).map(([g, grp]) => ({
      key: g, label: loc(grp.label), left: rem.attr[g],
      prios: prioLabels.map((l, i) => ({ i, label: l, n: this.rules.attr[i], active: i === st.attrPrio.indexOf(g) })),
      list: grp.attributes.map(k => {
        const locked = k === "appearance" && this.ugly;
        return { key: k, label: loc(VTM20.attributes[k].label), value: this.value("attr", k), locked, dots: dotRow("attr", k, 5, locked) };
      })
    }));
    const abil = VTM20.abilitiesForEra(game.settings.get(SYSTEM_ID, "era"), this.type);
    ctx.abilGroups = Object.entries(abil).map(([g, keys]) => ({
      key: g, label: loc(VTM20.abilityGroups[g].label), left: rem.abil[g],
      prios: prioLabels.map((l, i) => ({ i, label: l, n: this.rules.abil[i], active: i === st.abilPrio.indexOf(g) })),
      list: keys.map(k => ({ key: k, label: loc(VTM20.abilities[k].label), value: this.value("abil", k), dots: dotRow("abil", k) }))
    }));

    // V. Дисциплины — карточки со знаком и силами по уровню
    const allowed = this.clanDisciplines;
    const discKeys = new Set([...(allowed ?? []), ...Object.keys(st.disc), ...Object.keys(st.free.disc), ...Object.keys(st.xp.disc)]);
    if (this.type === "ghoul") discKeys.add("potence");
    ctx.discCards = [...discKeys].filter(k => this.discData(k)).map(k => {
      const d = this.discData(k), v = this.value("disc", k);
      return {
        key: k, name: d.name, en: d.en, value: v, inClan: this.isMage ? k === st.mg.affinity : this.isWraith ? k === st.wr.guild : this.inClan(k),
        sym: this.isSorcerer ? null : this.isMage ? { src: mageGlyphSrc(`sphere-${k}`) } : this.isWraith ? (VTM20.wraithDark.includes(k) ? { src: wraithGlyphSrc("arcanos-dark") } : VTM20.wraithArcanoi.includes(k) ? { src: wraithGlyphSrc(`arcanos-${k}`) } : null) : this.isDemon ? null : Codex.disciplineSymbol(k),
        guild: d.guild ?? "",
        icon: this.isSorcerer ? (d.psychic ? "fa-brain" : "fa-hand-sparkles") : this.isDemon ? (d.house ? "fa-fire-flame-curved" : "fa-book") : VTM20.disciplineIcons[k] ?? "fa-droplet", dots: dotRow("disc", k),
        powers: d.powers.filter(p => p.level <= Math.max(1, v) && p.level <= 5).map(p => ({ level: p.level, name: p.name, en: p.en, owned: p.level <= v, tip: preview(p.html, 600) })),
        pathed: VTM20.pathDisciplines.includes(k)
      };
    }).sort((a, b) => (b.inClan - a.inClan) || a.name.localeCompare(b.name, "ru"));
    ctx.anyDiscipline = allowed == null;
    // внеклановые Дисциплины: Сородич добавляет любую (точки — свободными пунктами и опытом), каитиф и гуль — как раньше
    ctx.canAddDisc = !this.isDemon && !this.isMage && !this.isSorcerer && !this.isWraith && (allowed == null || this.type === "vampire");
    for (const c of ctx.discCards) {
      c.outOfClan = this.type === "vampire" && allowed != null && !c.inClan;
      c.extra = c.key === this.extraDisc;
      c.removable = !this.isMage && !this.isSorcerer && !this.isWraith && !c.inClan && this.value("disc", c.key) <= this.base("disc", c.key);
    }
    // выбор по «Дополнительной Дисциплине» — на шаге Дисциплин и у взятого достоинства
    ctx.extraDisc = this.extraDiscMerit && this.baseClanDisciplines
      ? { value: this.st.extraDisc, name: this.st.extraDisc ? Codex.disciplineLabel(this.st.extraDisc) : "", options: this.extraDiscOptions } : null;
    ctx.inClanLabel = this.isWraith ? loc("VTM20.Wraith.HomeGuild") : this.isMage ? loc("VTM20.Mage.AffinityShort") : this.isDemon ? t("Demon.OwnHouse") : t("Sheet.InClan");
    if (this.isMage) ctx.sphereIssues = this.sphereIssues;
    if (this.isSorcerer) ctx.sphereIssues = this.sorcIssues;
    if (this.isWraith) ctx.sphereIssues = this.arcanoiIssues;
    ctx.discChoices = Object.values(Codex.disciplines).filter(d => !discKeys.has(d.key) && Codex.visible(d) && !this.bannedDisc(d.key)).map(d => ({ value: d.key, label: d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));

    // VI. Факты биографии — каталог карточек, и Добродетели
    // Earthbound: факты биографии Привязанных — только им; Привязанному нельзя связей с людьми, наставника, договоров и наследия
    const EB_BANNED = ["Contacts", "Fame", "Followers", "Mentor", "Pacts", "Legacy"];
    const ebOk = b => !b.thrall && (this.isEarthbound ? !EB_BANNED.includes(b.en) : b.source !== "Earthbound");
    // слуга: факты биографии падших без запретных и без фактов Привязанных, плюс свои (Заботливый хозяин, Приобщение)
    const bgOk = b => this.isThrall ? b.line === "demon" && b.source !== "Earthbound" && !THRALL_BANNED.includes(b.en)
      : VTM20.backgroundAllowed(b, this.type) && ebOk(b) && !(this.isLost && b.noBystander) && (!b.dhampir || this.isDhampir)
        && !(b.technocracy && this.isMage && !this.mageTech);        // Заявки и Секретное оружие — только Технократии
    // выбранный Факт держим в списке, даже если он из другой линейки или скрыт, — но одной карточкой: «Союзники» есть
    // у Сородичей, охотников и оборотней с одним именем, и выбор одного не должен показывать все три
    const bgList = Codex.backgrounds.filter(b => Codex.visible(b) && bgOk(b)), bgNames = new Set(bgList.map(b => b.name)), bgKept = new Set();
    ctx.bgCards = Codex.backgrounds.filter(b => bgList.includes(b) || (b.name in st.bg && !bgNames.has(b.name) && !bgKept.has(b.name) && bgKept.add(b.name))).map(b => {
      const on = b.name in st.bg || (st.free.bg[b.name] ?? 0) > 0;
      const bonus = this.isHunter && !this.isLost && b.en === "Patron" ? this.creedData?.patron ?? 0 : 0;   // Отшельник — Покровители 3 даром
      return { name: b.name, en: b.en, sectLabel: b.sabbat ? t("Sect.sabbat") : b.sect ? t(`Sect.${b.sect}`) : "", bonus, on, value: this.value("bg", b.name), dots: dotRow("bg", b.name),
          text: preview(b.html, 170), html: b.html, open: this.ui.open.has(`bg:${b.name}`) };
    });
    ctx.virtues = ["conscience", "selfControl", "courage"].map(slot => {
      const vk = slot === "courage" ? "courage" : this.isDemon || this.isThrall ? (slot === "selfControl" ? "conviction" : "conscience") : slot === "conscience" ? (this.altVirtues.includes("conviction") ? "conviction" : "conscience")
        : (this.altVirtues.includes("instinct") ? "instinct" : "selfControl");
      // у Привязанного в слотах Добродетелей — Потребности: Плоть, Мысль, Эмоция
      const urge = { conscience: "flesh", selfControl: "thought", courage: "emotion" }[slot];
      // у охотника в слотах — Добродетели охоты, до 10 (на старте — 3 очка)
      if (this.isLost) return { key: slot, label: hunterData().bystander?.virtues?.[LOST_SLOTS[slot]], value: this.value("virt", slot), dots: dotRow("virt", slot) };
      if (this.isHunter) return { key: slot, label: hunterData().virtues[HUNTER_SLOTS[slot]], value: this.value("virt", slot), dots: dotRow("virt", slot, 10),
        primary: this.creedData?.virtue === HUNTER_SLOTS[slot] };
      return { key: slot, label: this.isEarthbound ? t(`Demon.Urge.${urge}`) : loc(VTM20.virtues[vk].label), value: this.value("virt", slot), dots: dotRow("virt", slot) };
    });

    // VII. Достоинства и недостатки — каталог с поиском
    const q = this.ui.mfSearch.trim().toLowerCase();
    const chosen = this.ui.mfTab === "merit" ? st.merits : st.flaws;
    ctx.mfTabs = ["merit", "flaw"].map(k => ({ key: k, label: t(k === "merit" ? "Sheet.Merits" : "Sheet.Flaws"), active: this.ui.mfTab === k,
      n: (k === "merit" ? st.merits : st.flaws).length }));
    // Клановые черты и черты секты — только своего клана/секты: на своей вкладке и во «Всех»
    const myClan = this.type === "vampire" ? Codex.traitClan(st.clan) : "";
    const mySect = st.sectKey || Codex.sectKey(st.sect);
    // кому видна черта — VTM20.traitFor (то же правило, что в библиотеке); слуга берёт черты падших, кроме инфернальных
    const who = { type: this.type, dhampir: this.isDhampir, lost: this.isLost, thrall: this.isThrall, nephandi: this.isMage && this.mageFallen };
    // черты гулей (Ghouls & Revenants) — своей вкладкой «Гулевые», как клановые у вампира
    // запрет клану или линии (notClan: «Тореадорам недоступно», DA High/Low Clans) — черту не показываем
    const banned = m => !!st.clan && (m.notClan ?? []).includes(st.clan);
    const inCat = (m, cat) => !Codex.visible(m) || !VTM20.traitFor(m, who) || banned(m) ? false : cat === "clan" ? !!myClan && m.clan === myClan
      : cat === "sect" ? !m.clan && !!mySect && m.sect === mySect
      : cat === "ghoul" ? !!m.ghoul
      : cat === "all" ? (!m.clan || (!!myClan && m.clan === myClan)) && (!m.sect || (!!mySect && m.sect === mySect))
      : !m.clan && !m.sect && !m.ghoul && m.category === cat;
    const extra = ["ghoul", "sect", "clan"].filter(k => Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    if (!["all", ...Object.keys(VTM20.meritCategories), ...extra].includes(this.ui.mfCat)) this.ui.mfCat = "all";
    const catLabel = k => k === "all" ? t("Creator.All") : k === "clan" ? t("Library.Filter.Clan") : k === "ghoul" ? t("Library.Filter.GhoulTraits")
      : k === "sect" ? t("Library.Filter.SectTraits") : loc(VTM20.meritCategories[k].label);
    // только разделы, где у этой линии есть черты (у вампиров нет инфернальных, у демонов — сверхъестественных)
    // категория «clan» — та же вкладка «Клановые» (extra), второй раз не показываем
    const cats = Object.keys(VTM20.meritCategories).filter(k => k !== "clan" && Codex.merits.some(m => m.kind === this.ui.mfTab && inCat(m, k)));
    ctx.mfCats = ["all", ...cats, ...extra].map(k => ({ key: k, label: catLabel(k), active: this.ui.mfCat === k }));
    ctx.mfCards = Codex.merits.filter(m => m.kind === this.ui.mfTab && inCat(m, this.ui.mfCat)
      && (!q || m.name.toLowerCase().includes(q) || (m.en ?? "").toLowerCase().includes(q)))
      .map(m => ({ name: m.name, en: m.en, cost: m.cost,
        cat: m.clan ? Codex.clanName(m.clan) : m.sect ? t(`Sect.${m.sect}`) : m.ghoul ? t("Library.Filter.GhoulTraits") : loc(VTM20.meritCategories[m.category]?.label ?? ""),
        // откуда черта: Тёмные века — отдельной пометкой, иначе — книга
        da: m.era === "darkAges", src: m.source ?? "", srcShort: m.era === "darkAges" ? t("Library.Filter.DarkAges") : String(m.source ?? "").replace(/\s*[,(].*$/, ""),
        on: chosen.some(x => x.name === m.name), text: preview(m.html, 200),
        html: m.html, open: this.ui.open.has(`mf:${m.kind}:${m.name}`), key: `mf:${m.kind}:${m.name}` }));
    const daOf = m => Codex.merits.find(x => x.name === m.name && x.kind === m.kind)?.era === "darkAges";
    ctx.merits = st.merits.map((m, i) => ({ ...m, kind: "merit", index: i, ranged: m.max > m.min })).map(m => ({ ...m, da: daOf(m) }));
    ctx.flaws = st.flaws.map((m, i) => ({ ...m, kind: "flaw", index: i, ranged: m.max > m.min })).map(m => ({ ...m, da: daOf(m) }));
    ctx.meritPoints = this.meritPoints; ctx.flawPoints = this.flawPoints;
    ctx.traitIssues = this.traitIssues.map(c => ({ ...c, text: t(`Creator.Trait${c.key}`, c.data) }));
    ctx.flawRaw = st.flaws.reduce((s, f) => s + (Number(f.cost) || 0), 0);

    // VIII. Свободные пункты и IX. Опыт — общий список строк
    const rows = (mode) => {
      const cost = this.rules.cost;
      const scalar = kind => ["morality", "will", "rage", "gnosis", "quint", "res", "pathos", "trade"].includes(kind);
      const row = (kind, k, label, group, value) => ({
        kind, key: k, label, group, value,
        added: mode === "free" ? (scalar(kind) ? st.free[kind] ?? 0 : st.free[kind]?.[k] ?? 0)
          : (scalar(kind) ? st.xp[kind] : st.xp[kind]?.[k] ?? 0),
        price: mode === "free" ? cost[kind] : this.xpCostOf(kind, k, value, 1)
      });
      const list = [
        ...ctx.attrGroups.flatMap(g => g.list.filter(x => !x.locked).map(x => row("attr", x.key, x.label, t("Creator.Step.attributes"), x.value))),
        ...ctx.abilGroups.flatMap(g => g.list.map(x => row("abil", x.key, x.label, g.label, x.value))),
        ...(this.rules.disc ? ctx.discCards.map(x => row("disc", x.key, x.name, this.discLabel, x.value)) : []),
        ...(mode === "free" ? ctx.bgCards.filter(b => b.on).map(b => row("bg", b.name, b.name, this.bgLabel, b.value)) : []),
        // у Гару вместо Добродетелей и морали — Ярость и Гнозис (W20, гл. 3)
        ...(this.isWerewolf ? [row("rage", "", loc("VTM20.Werewolf.Rage"), t("Sheet.Other"), this.garouRage), row("gnosis", "", loc("VTM20.Werewolf.Gnosis"), t("Sheet.Other"), this.garouGnosis)] : [
        // Добродетели охоты — только охотой; при росте за опыт — и опытом
        ...(this.isMage || this.isWraith ? [] : !this.isHunter || this.isLost ? ctx.virtues.map(x => row("virt", x.key, x.label, t("Sheet.Virtues"), x.value))
          : mode === "xp" && hunterGrowth() === "xp" ? ctx.virtues.map(x => row("virt", x.key, x.label, t("Creator.HunterVirtues"), x.value)) : []),
        ...(this.isLost || this.isWraith || (this.isHunter && mode === "xp" && hunterGrowth() !== "xp") ? [] : [row("morality", "", this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name ?? t("Humanity"), t("Sheet.Other"), this.morality)])]),
        row("will", "", t("Willpower"), t("Sheet.Other"), this.willpower),
        // маг: 1 свободный пункт — 4 Квинтэссенции (M20, гл. 6)
        ...(this.isMage && mode === "free" ? [row("quint", "", loc("VTM20.MageCr.QuintRow"), t("Sheet.Other"), this.mageQuint),
          // Резонанс: первая точка даром, дальше — новая степень × 3 (Book of Secrets)
          { ...row("res", "", loc("VTM20.MageCr.ResRow"), t("Sheet.Other"), this.mageRes), price: (this.mageRes + 1) * 3 }] : []),
        // призрак: Пафос (1 пункт — 2 точки), Страсти и Оковы по строкам, торг с Тенью (гл. 4)
        ...(this.isWraith && mode === "free" ? [
          { ...row("pathos", "", loc(this.wrPath === "spectre" ? "VTM20.Wraith.Spectre.Angst" : "VTM20.Wraith.Pathos"), t("Sheet.Other"), this.wraithPathos),
            price: this.wrPath === "risen" ? loc("VTM20.WraithCr.PricePerDot") : 1 },
          // Восставший: «Дисциплины» тела — 7 за точку (гл. 11)
          ...(this.wrPath === "risen" ? ["potence", "fortitude", "celerity"].map(k => ({ ...row("rdisc", k, loc(`VTM20.Wraith.Risen.Disc.${k}`), loc("VTM20.Wraith.Risen.Title"),
            st.free.rdisc?.[k] ?? 0), added: st.free.rdisc?.[k] ?? 0, price: this.rules.cost.rdisc })) : []),
          ...st.wr.passions.map((x, i) => x.text || this.passionValue("pas", i) ? { ...row("pas", String(i), x.text || "—", loc("VTM20.Wraith.Passions"), this.passionValue("pas", i)), added: st.free.pas?.[i] ?? 0, price: this.rules.cost.pas } : null).filter(Boolean),
          ...st.wr.fetters.map((x, i) => x.text || this.passionValue("fet", i) ? { ...row("fet", String(i), x.text || "—", loc("VTM20.Wraith.Fetters"), this.passionValue("fet", i)), added: st.free.fet?.[i] ?? 0, price: this.rules.cost.fet } : null).filter(Boolean),
          ...(this.wrPath === "projector" ? [] : this.wrPath === "spectre"
            ? [{ ...row("trade", "", loc("VTM20.WraithCr.PsychePool"), loc("VTM20.Wraith.Spectre.Psyche"), this.psychePool), added: st.free.trade ?? 0, price: loc("VTM20.WraithCr.PsycheTradeHint") }]
            : [{ ...row("trade", "", loc("VTM20.WraithCr.ShadowPool"), loc("VTM20.Wraith.Shadow"), this.shadowPool), added: st.free.trade ?? 0, price: game.i18n.localize("VTM20.WraithCr.TradeHint") }])] : [])
      ];
      return [...new Set(list.map(r => r.group))].map(g => ({ label: g, rows: list.filter(r => r.group === g) }));
    };
    if (key === "freebies" || key === "xp") ctx.canAddDisc = !!this.rules.disc && !this.isDemon && !this.isMage && (this.clanDisciplines == null || this.type === "vampire");
    if (key === "freebies") {
      ctx.cost = this.rules.cost;
      ctx.freeTotal = this.freeTotal; ctx.freeSpent = this.freeSpent + this.meritPoints; ctx.freeLeft = this.freeLeft;
      ctx.freeGroups = rows("free");
    }
    if (key === "xp") {
      ctx.xpTotal = st.xpTotal; ctx.xpSpent = this.xpSpent; ctx.xpLeft = this.xpLeft;
      ctx.xpGroups = rows("xp");
    }

    // IX½. Танец с Дьяволом — договор слуги
    if (key === "pact") {
      const p = st.pact;
      ctx.pact = {
        masters: game.actors.filter(a => a.type === "demon" && a.id !== this.actor.id).map(a => ({ value: a.uuid, label: a.name, selected: a.uuid === p.master }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
        faith: this.morality, share: this.pactShare, shareMax: this.pactShareMax, points: this.giftPoints, used: this.giftUsed,
        over: this.giftUsed > this.giftPoints,
        attrs: ctx.attrGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ key: x.key, label: x.label, base: x.value, gift: p.attr[x.key] ?? 0, total: x.value + (p.attr[x.key] ?? 0) })) })),
        abils: ctx.abilGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ key: x.key, label: x.label, base: x.value, gift: p.abil[x.key] ?? 0, total: x.value + (p.abil[x.key] ?? 0) })) }))
      };
    }

    // X. Итог
    if (key === "summary") {
      ctx.summary = {
        attrs: ctx.attrGroups.map(g => ({ label: g.label, list: g.list.map(x => ({ label: x.label, value: x.value })) })),
        abils: ctx.abilGroups.map(g => ({ label: g.label, list: g.list.filter(x => x.value > 0).map(x => ({ label: x.label, value: x.value })) })),
        discs: ctx.discCards.filter(d => d.value > 0).map(d => ({ name: d.name, en: d.en, value: d.value, sym: d.sym })),
        bgs: ctx.bgCards.filter(b => b.value > 0).map(b => ({ name: b.name, en: b.en, value: b.value })),
        virtues: ctx.virtues.map(v => ({ label: v.label, value: v.value })),
        merits: st.merits, flaws: st.flaws
      };
      ctx.morality = this.morality; ctx.willpower = this.willpower;
      if (this.type === "vampire") {
        ctx.generation = 13 - Math.min(5, this.value("bg", "Поколение"));
        ctx.bloodMax = VTM20.generationOf(ctx.generation).pool;
      }
      ctx.problems = this.problems(rem);
      // Призрак: Пафос вместо морали, Страсти и Оковы вместо Добродетелей, Тень — отдельной колонкой
      if (this.isWraith) {
        const w = this.wraithWrite();
        Object.assign(ctx, { morality: this.wraithPathos, pathName: loc("VTM20.Wraith.Pathos"), virtLabel: loc("VTM20.Wraith.Passions"),
          garouLine: [ctx.patent.clan, ctx.patent.sect].filter(Boolean).join(" · ") });
        ctx.summary.virtues = w.passions.map(x => ({ label: `${x.text}${x.emotion ? ` (${x.emotion})` : ""}`, value: x.value }));
        ctx.summary.fetters = w.fetters.map(x => ({ label: x.text, value: x.value }));
        ctx.summary.shadow = [{ label: loc("VTM20.Wraith.ShadowArchetype"), value: w.shadow.archetype }, { label: loc("VTM20.Wraith.AngstPerm"), value: w.shadow.angst.permanent },
          { label: loc("VTM20.WraithCr.AngstTemp"), value: w.shadow.angst.temporary },
          ...w.shadow.darkPassions.map(x => ({ label: `${x.text}${x.emotion ? ` (${x.emotion})` : ""}`, value: x.value })),
          ...w.shadow.thorns.map(x => ({ label: (wraithData().thorns ?? []).find(t2 => t2.key === x.key)?.name ?? x.key, value: x.n }))];
      }
      ctx.clanSym = this.type === "vampire" ? Codex.clanSymbol(st.clan) : null;
      ctx.pathName = this.isMage ? loc("VTM20.Mage.Arete") : this.isDemon ? t("Demon.Faith") : this.isThrall ? t("Creator.ThrallFaith") : this.isHunter ? t("Hunter.Conviction") : this.pathData?.name;
      if (this.isHunter) ctx.summary.edges = st.edges.map(k => hunterData().edges.find(e => e.key === k)).filter(Boolean)
        .sort((a, b) => a.path.localeCompare(b.path) || a.level - b.level);
      if (this.isDemon) Object.assign(ctx, { torment: this.isEarthbound ? 10 : this.houseData?.torment ?? 3, houseName: this.houseData?.name ?? "",
        visageName: this.houseData?.visages?.[st.visage] ?? "", factionName: Codex.faction(st.faction)?.name ?? "" });
      // Привязанный: Потребности вместо Добродетелей, реликварий
      ctx.virtLabel = this.isEarthbound ? t("Demon.Urges") : this.isHunter && !this.isLost ? t("Creator.HunterVirtues") : loc("VTM20.Sheet.Virtues");
      // Маг: вместо Добродетелей — фокус и то, с чем он начинает
      if (this.isMage) {
        const g = st.mg;
        ctx.virtLabel = loc("VTM20.Mage.Focus");
        ctx.summary.virtues = [[loc("VTM20.Mage.Essence"), (mageData().essences ?? []).find(e => e.key === g.essence)?.name], [loc("VTM20.Mage.Affinity"), g.affinity && this.mageSphere(g.affinity)?.name],
          [loc("VTM20.Mage.Paradigm"), g.paradigm], [loc("VTM20.Mage.Practice"), g.practice], [loc("VTM20.Mage.Quintessence"), this.mageQuint]]
          .filter(([, v]) => v !== "" && v != null).map(([label, value]) => ({ label, value }));
        ctx.garouLine = [ctx.patent.clan, ctx.patent.sect].filter(Boolean).join(" · ");
      }
      if (this.isEarthbound) ctx.reliquaryName = t(`Demon.ReliquaryKind.${st.reliquary || "ideal"}`);
      // Гару: Ярость и Гнозис вместо морали, Дары и Слава вместо Дисциплин и Добродетелей
      if (this.isWerewolf) {
        const D = werewolfData(), w = st.ww;
        Object.assign(ctx, { morality: this.garouRage, pathName: loc("VTM20.Werewolf.Rage"), gnosis: this.garouGnosis, virtLabel: loc("VTM20.GarouCr.Renown") });
        ctx.summary.virtues = RENOWN.map(k => ({ label: loc(`VTM20.Werewolf.Renown.${k}`), value: this.garouRenown[k] }));
        ctx.summary.gifts = [...Object.values(w.gifts), ...w.extra].map(k => D.gifts.find(g => g.key === k)).filter(Boolean).map(g => ({ name: g.name, en: g.en, level: g.level }));
        ctx.garouLine = [ctx.patent.clan, ctx.patent.sect].filter(Boolean).join(" · ");
      }
    }
    ctx.footFree = rem.free; ctx.footXp = st.xpTotal ? rem.xp : null;
    return ctx;
  }
}
