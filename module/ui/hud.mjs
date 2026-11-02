// module/ui/hud.mjs
// HUD «Герб» вместо панели макросов: персонаж игрока или выделенный токен — квадратный портрет с лентой имени,
// слева крыло «Жизнь и Воля», справа — запасы своего вида (кровь каплями и путь; Ярость и Гнозис; Вера и Мука;
// Убеждённость; Эссенция духа), над портретом — вкладки и дуга печатей: бой (оружие, естественное оружие формы,
// приёмы, защиты), кровь (трата, Мощь, Стремительность, лечение, охота), форма и Ярость Гару, силы (вынесенные
// с листа, облик падшего, второе зрение), прочее. В бою — монеты брони и инициативы. Цвет — по виду (rh-t-*).

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { openAttack, openDefense, weaponsOf, pendingAttacks, defendFromHud } from "../combat/combat.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openHunt } from "../apps/night.mjs";
import { rollPowerRef, powerByRef } from "../sheets/actor-sheet.mjs";
import { effectTimer } from "../apps/timers.mjs";
import { W as werewolfData, feraOf, changeForm, rageActions, regenerate, stepSideways, frenzyCheck } from "../apps/werewolf.mjs";
import { H as hunterData, secondSight } from "../apps/hunter.mjs";
import { assumeForm } from "../apps/torment.mjs";

const ID = "r-hud";
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
let frame = null;

/** Чей HUD: выделенный свой токен, иначе персонаж игрока. */
function hudActor() {
  const tok = canvas?.tokens?.controlled?.[0];
  if (tok?.actor?.isOwner) return tok.actor;
  return game.user.character ?? null;
}

const enabled = () => game.settings.get(SYSTEM_ID, "hud");

function mount() {
  let el = document.getElementById(ID);
  if (el) return el;
  const bottom = document.getElementById("ui-bottom") ?? document.body;
  el = document.createElement("section");
  el.id = ID;
  el.className = "vtm20 r-hud";
  const hotbar = document.getElementById("hotbar");
  if (hotbar?.parentElement === bottom) bottom.insertBefore(el, hotbar); else bottom.appendChild(el);
  el.addEventListener("click", onClick);
  el.addEventListener("contextmenu", ev => {
    const w = ev.target.closest("[data-weapon]");
    if (!w) return;
    ev.preventDefault();
    hudActor()?.items.get(w.dataset.weapon)?.sheet.render(true);
  });
  return el;
}

/** Значок оружия по названию (у предметов один общий значок); иначе — по виду оружия. */
const WEAPON_GLYPHS = [
  [/лук|арбалет/i, "fa-bow-arrow"], [/коса/i, "fa-scythe"], [/серп/i, "fa-sickle"],
  [/нож|кинжал|стилет|бритв|скальпел/i, "fa-dagger"], [/меч|сабл|шпаг|рапир|клинок|палаш|катан/i, "fa-sword"],
  [/топор|секир|алебард|тесак/i, "fa-axe"], [/молот|кувалд/i, "fa-hammer-war"], [/бит[аы]/i, "fa-baseball-bat"],
  [/булав|дубин|палиц|кистен|моргенштерн/i, "fa-mace"], [/посох|шест|копь|пика|трост/i, "fa-staff"],
  [/пистол|револьвер|ружь|мушкет|винтов|карабин|автомат|пулем|дробов|обрез/i, "fa-gun"], [/кастет|кулак/i, "fa-hand-back-fist"]
];
function weaponGlyph(w) {
  return WEAPON_GLYPHS.find(([re]) => re.test(w.name ?? ""))?.[1]
    ?? { brawl: "fa-hand-back-fist", melee: "fa-khanda", firearms: "fa-gun", thrown: "fa-bullseye" }[w.kind] ?? "fa-khanda";
}

/** Вид персонажа для HUD: свой набор запасов, действий и цвета (styles/r-hud.css, rh-t-*). */
function kindOf(a) {
  if (a.type === "ghoul" && a.system.ghoulType === "dhampir") return "dhampir";
  if (a.type === "creature" && a.system.spirit?.on) return "spirit";
  return a.type;
}

/** Вторая строка таблички: клан и поколение, племя и аугурия с Рангом, Дом и Облик, кредо… */
function subtitleOf(a, kind) {
  const s = a.system, typeName = game.i18n.localize(`TYPES.Actor.${a.type}`), lbl = x => x ? VTM20.label(x) : "";
  switch (kind) {
    case "vampire": return [Codex.clan(s.clan)?.name ?? typeName, game.i18n.format("VTM20.GenerationN", { n: s.generation })].filter(Boolean).join(" · ");
    case "dhampir": return [t("Hud.Kind.dhampir"), Codex.clan(Codex.traitClan(s.dhampir?.antecedentClan))?.name ?? ""].filter(Boolean).join(" · ");
    case "werewolf": {
      const D = werewolfData(), w = s.werewolf, fera = feraOf(a);
      const who = fera ? lbl(fera) : lbl(D.tribes.find(x => x.key === w.tribe));
      return [who, fera ? "" : lbl(D.auspices.find(x => x.key === w.auspice)), t("Hud.Rank", { n: w.rank })].filter(Boolean).join(" · ");
    }
    case "demon": { const h = Codex.house(s.house); return [h?.name ?? typeName, h?.visages?.[s.visage] ?? ""].filter(Boolean).join(" · "); }
    case "hunter": { const c = hunterData().creeds.find(x => x.key === s.hunter?.creed); return c ? `${c.name} · ${c.who}` : typeName; }
    case "mortal": return s.kinfolk?.on ? t("Hud.Kind.kinfolk") : s.kami?.on ? t("Hud.Kind.kami") : s.fomor?.on ? t("Hud.Kind.fomor") : typeName;
    case "spirit": return [t("Hud.Kind.spirit"), s.kind].filter(Boolean).join(" · ");
    default: return s.kind || typeName;
  }
}

/* ── «Герб»: квадратный портрет в центре, крылья-знамёна по бокам (слева Жизнь и Воля, справа запасы вида),
   над ним — вкладки и дуга печатей-действий; броня и инициатива — монетами на плечах портрета, только в бою ── */

let tab = "fight";   // открытая вкладка печатей (для всех персонажей одна — переключение не сбрасывается при смене токена)

/** Точки и клетки — как на листе: n из max, вид заливки классом. */
const dots = (n, max, fill = "") => Array.from({ length: max }, (_, i) => `<i class="d${i < n ? ` on ${fill}` : ""}"></i>`).join("");
const boxes = (n, max, fill = "") => Array.from({ length: max }, (_, i) => `<i class="b${i < n ? ` on ${fill}` : ""}"></i>`).join("");
const DROP = "M12 2C12 2 4 12 4 18a8 8 0 0 0 16 0C20 12 12 2 12 2z";
/** Капля залита на p процентов снизу (неполная — при запасе больше 20, где капля стоит несколько пунктов). */
const drop = p => `<svg class="dr" viewBox="0 0 24 30" aria-hidden="true"><defs><linearGradient id="rh-bf-${p}" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#7d161c"/><stop offset="${p}%" stop-color="#c4474c"/><stop offset="${p}%" stop-color="#c4474c" stop-opacity="0"/></linearGradient></defs>
  <path d="${DROP}" fill="url(#rh-bf-${p})" stroke="${p > 0 ? "#c4474c" : "rgba(196,71,76,.45)"}" stroke-width="2"/></svg>`;
const row = html => `<span class="rh-row">${html}</span>`;

/** Строка крыла: подпись (с пометками ниже), шкалы, число. */
const line = (label, rows, num, { notes = [], tip = "", act = "" } = {}) => `<span class="rh-lbl"${tip ? ` data-tooltip="${esc(tip)}"` : ""}>${esc(label)}${notes.map(n => `<small>${esc(n)}</small>`).join("")}</span>
  <${act ? `a data-act="${act}"` : "span"} class="rh-scales"${tip ? ` data-tooltip="${esc(tip)}"` : ""}>${rows.map(row).join("")}</${act ? "a" : "span"}><b class="rh-num">${num}</b>`;

/** Кровь: до 20 — капля на пункт рядами по 10, больше — 10 капель, каждая стоит запас ÷ 10 (неполная залита частично). */
function bloodLine(a) {
  const b = a.system.blood, perTurn = b.perTurn ?? 1, spent = a.bloodSpentThisTurn ?? 0, inFight = !!game.combat?.started;
  const tip = inFight ? t("Hud.BloodTipTurn", { n: perTurn, spent }) : t("Hud.BloodTip", { n: perTurn });
  let rows;
  const notes = [t("Hud.PerTurn", { n: perTurn })];
  if (b.max <= 20) {
    rows = [];
    for (let s = 0; s < b.max; s += 10) rows.push(Array.from({ length: Math.min(10, b.max - s) }, (_, i) => drop(s + i < b.value ? 100 : 0)).join(""));
  } else {
    const per = Math.ceil(b.max / 10);
    rows = [Array.from({ length: 10 }, (_, i) => drop(Math.round(Math.clamp((b.value - i * per) / per, 0, 1) * 100))).join("")];
    notes.push(t("Hud.DropIs", { n: per }));
  }
  return line(t("Hud.Blood"), rows, `${b.value}<small>/${b.max}</small>`, { notes, tip, act: "spend" });
}

/** Левое крыло: Жизнь (клетки листа с отметками урона, штраф — в подсказке) и Воля. */
function leftWing(s) {
  const last = s.health.levels.reduce((n, l, i) => l.state && l.state !== "empty" && l.state !== "none" ? i : n, -1);
  const cells = s.health.levels.map((l, i) => `<i class="hb is-${l.state}${i === last ? " is-current" : ""}${i === s.health.levels.length - 1 ? " is-last" : ""}" data-tooltip="${esc(game.i18n.localize(l.label))}">${l.state === "empty" || l.state === "none" ? "" : VTM20.damageTypes[l.state]?.mark ?? ""}</i>`).join("");
  const note = s.health.damage ? `${game.i18n.localize(`VTM20.Health.${s.health.status}`)}${s.health.penalty ? ` ${s.health.penalty}` : ""}` : t("Health.healthy");
  const w = s.willpower;
  return `<span class="rh-lbl">${esc(t("Sheet.Health"))}</span><span class="rh-scales"><span class="rh-row is-health">${cells}</span></span><b class="rh-num rh-wound ${s.health.damage ? "is-hurt" : ""}">${esc(note)}</b>
    ${line(t("Willpower"), [dots(w.permanent, 10, "bone"), boxes(w.temporary, w.permanent)], `${w.temporary}<small>/${w.permanent}</small>`)}`;
}

/** Правое крыло: запасы своего вида — кровь и путь, Ярость и Гнозис, Вера и Мука, Убеждённость, Эссенция духа… */
function rightWing(a, kind) {
  const s = a.system, out = [];
  const moral = () => s.morality && out.push(line(Codex.path(s.morality.path)?.name ?? t("Humanity"), [dots(s.morality.value, 10)], s.morality.value));
  if (a.hasBlood) { out.push(bloodLine(a)); moral(); }
  else if (kind === "werewolf") {
    const w = s.werewolf;
    out.push(line(t("Werewolf.Rage"), [dots(w.rage.permanent, 10, "rage"), boxes(w.rage.value, 10, "rage")], `${w.rage.value}<small>/${w.rage.permanent}</small>`, { tip: t("Hud.RageTip") }));
    out.push(line(t("Werewolf.Gnosis"), [dots(w.gnosis.permanent, 10, "gnosis"), boxes(w.gnosis.value, w.gnosis.permanent, "gnosis")], `${w.gnosis.value}<small>/${w.gnosis.permanent}</small>`, { tip: t("Hud.GnosisTip") }));
  } else if (kind === "demon") {
    out.push(line(t("Demon.Faith"), [dots(s.faith?.permanent ?? 0, 10, "gold"), boxes(s.faith?.temporary ?? 0, 10, "gold")], `${s.faith?.temporary ?? 0}<small>/${s.faith?.permanent ?? 0}</small>`));
    out.push(line(t("Demon.Torment"), [dots(s.torment?.permanent ?? 0, 10), boxes(s.torment?.temporary ?? 0, 10, "torment")], s.torment?.permanent ?? 0, { tip: t("Hud.TormentTip", { n: s.torment?.temporary ?? 0 }) }));
  } else if (kind === "hunter") {
    out.push(line(t("Hunter.Conviction"), [dots(s.hunter?.conviction ?? 0, 10, "amber")], s.hunter?.conviction ?? 0)); moral();
  } else if (kind === "spirit") {
    const sp = s.spirit, e = sp.essence;
    out.push(line(t("Hud.Essence"), [boxes(Math.round(e.value / Math.max(1, e.max) * 10), 10, "gnosis")], `${e.value}<small>/${e.max}</small>`, { tip: t("Hud.EssenceTip") }));
    out.push(line(t("Werewolf.Rage"), [dots(sp.rage, 10, "rage")], sp.rage), line(t("Werewolf.Gnosis"), [dots(sp.gnosis, 10, "gnosis")], sp.gnosis));
  } else {
    moral();
    if (s.kinfolk?.on && s.kinfolk.gnosis) out.push(line(t("Werewolf.Gnosis"), [dots(s.kinfolk.gnosis, 10, "gnosis")], s.kinfolk.gnosis));
    if (s.kami?.on) out.push(line(t("Werewolf.Gnosis"), [dots(s.kami.gnosis, 10, "gnosis")], s.kami.gnosis));
    const rage = s.kami?.on ? s.kami.rage : s.fomor?.on ? s.fomor.rage : 0;
    if (rage) out.push(line(t("Werewolf.Rage"), [dots(rage, 10, "rage")], rage));
  }
  return out.join("");
}

/** Печать действия: круглая кнопка со значком (или картинкой), подпись, точки уровня; on — включено, man — приём. */
function seal(act, icon, label, { tip = "", on = false, man = false, img = "", lvl = 0, attrs = "", badge = "" } = {}) {
  return `<a class="rh-seal${on ? " is-on" : ""}${man ? " is-man" : ""}" data-act="${act}" ${attrs} data-tooltip="${esc(tip || label)}" aria-label="${esc(tip || label)}">
    <span class="rh-knob">${img ? `<img src="${esc(img)}" alt="">` : `<i class="fa-solid ${icon}"></i>`}${badge ? `<b>${badge}</b>` : ""}</span>
    <span class="rh-seal-l">${esc(label)}</span>${lvl ? `<span class="rh-lvl">${dots(lvl, 5)}</span>` : ""}</a>`;
}

/** Вкладки и их печати по виду персонажа. */
function tabsOf(a, kind) {
  const s = a.system, vamp = a.isVampire, tabs = [];
  // Бой: оружие, естественное оружие формы, приёмы (с естественным оружием — под «…»), защиты
  const weapons = weaponsOf(a).slice(0, 3).map(w => seal("attack", weaponGlyph(w), w.name, { attrs: `data-weapon="${w.id}"`,
    tip: `${w.name} · ${w.label} · ${game.i18n.localize(VTM20.damageTypes[w.damageType]?.label ?? "")}` }));
  const natural = (s.formFx?.weapons ?? []).map((w, i) => seal("natural", w.icon ?? (/укус|клык|bite/i.test(w.name) ? "fa-tooth" : "fa-paw"), w.name,
    { attrs: `data-n="${i}"`, tip: `${w.name} · ${game.i18n.localize(VTM20.damageTypes[w.type]?.label ?? "")}` }));
  const man = (k, icon) => seal("maneuver", icon, t(`Combat.M.${k}`), { man: true, attrs: `data-man="${k}"`, tip: [t(`Combat.M.${k}`), t(`Combat.MNote.${k}`)].filter(Boolean).join(" — ") });
  const maneuvers = natural.length ? [] : [man("punch", "fa-hand-fist"), ...(s.fx?.claws ? [man("claws", "fa-paw")] : []), vamp ? man("bite", "fa-tooth") : man("clinch", "fa-people-pulling")];
  tabs.push({ key: "fight", label: t("Hud.Tab.fight"), seals: [...weapons, ...natural, ...maneuvers, seal("attack", "fa-ellipsis", t("Hud.More"), { man: true, tip: t("Hud.AttackTip") }),
    seal("dodge", "fa-person-running", t("Hud.Dodge"), { tip: t("Combat.Defense.dodge") }), seal("block", "fa-shield-halved", t("Hud.Block"), { tip: t("Combat.Defense.block") }),
    seal("parry", "fa-khanda", t("Hud.Parry"), { tip: t("Combat.Defense.parry") })] });
  if (a.hasBlood) {
    // Мощь за кровь и дополнительные действия Стремительности — на этот ход (Дисциплины/06, 14)
    const pot = a.discipline("potence"), cel = a.discipline("celerity"), b = [seal("spend", "fa-droplet", t("Hud.Spend"), { tip: t("Hud.BloodTip", { n: s.blood.perTurn ?? 1 }) })];
    if (pot) b.push(seal("potence", "fa-hand-fist", Codex.disciplineLabel("potence"), { on: a.potenceActive, tip: t(a.potenceActive ? "Hud.PotenceOnTip" : "Hud.PotenceTip", { n: pot }) }));
    if (cel) b.push(seal("celerity", "fa-forward", Codex.disciplineLabel("celerity"), { on: !!a.celerityActions, badge: a.celerityActions || "", tip: t("Hud.CelerityTip", { n: cel, used: a.celerityActions }) }));
    b.push(seal("heal", "fa-hand-holding-droplet", t("Hud.Heal"), { tip: t("Sheet.HealHint") }), seal("hunt", "fa-moon", t("Hunt.Button")));
    tabs.push({ key: "blood", label: t("Hud.Tab.blood"), seals: b });
  }
  if (kind === "werewolf") {
    const w = s.werewolf, fera = feraOf(a), list = fera ? fera.forms.map(f => ({ ...f, icon: "fa-paw" })) : VTM20.garouForms;
    tabs.push({ key: "form", label: t("Hud.Form"), seals: list.map(f => seal(f.key === w.form ? "noop" : "form", f.icon ?? "fa-paw", VTM20.label(f),
      { on: f.key === w.form, attrs: `data-form="${f.key}"`, tip: f.key === w.form ? t("Hud.FormNow") : VTM20.label(f) })) });
    tabs.push({ key: "rage", label: t("Werewolf.Rage"), seals: [seal("wwActions", "fa-forward-fast", t("Werewolf.Actions"), { tip: t("Werewolf.ActionsHint") }),
      seal("wwRegen", "fa-heart-pulse", t("Werewolf.Regen"), { tip: t("Werewolf.RegenHint") }), seal("wwStep", "fa-circle-half-stroke", t("Werewolf.StepSideways"), { tip: t("Werewolf.StepHint") }),
      seal("wwFrenzy", "fa-face-angry", t("Werewolf.Frenzy"), { tip: t("Werewolf.FrenzyHint") })] });
  }
  // Силы: вынесенные булавкой с листа (знак Дисциплины и уровень точками), силы на время, свои силы вида и «Все» — вкладка сил на листе
  const powers = (a.getFlag(SYSTEM_ID, "hudPowers") ?? []).map(ref => {
    const x = powerByRef(ref);
    return x ? seal("power", "", x.p.name, { attrs: `data-ref="${esc(ref)}"`, img: foundry.utils.getRoute(Codex.disciplineIcon(x.disc)), lvl: x.p.level,
      tip: `${x.p.name} · ${x.pathName || x.d.name} ${x.p.level}` }) : "";
  }).filter(Boolean);
  const own = kind === "demon" ? [seal("apocalyptic", "fa-dragon", t("Hud.Visage"), { on: !!s.apocalyptic, tip: t(s.apocalyptic ? "Hud.ApocOn" : "Hud.ApocOff") })]
    : kind === "hunter" ? [seal("sight", "fa-eye", t("Hud.Sight"), { tip: t("Hud.SightTip") })] : [];
  const fx = (a.powerEffects ?? []).map(x => {
    const tm = effectTimer(x.effect), tip = tm ? `${x.effect.name} · ${t(x.def.mode === "night" ? "Timer.ToDawn" : "Timer.Left")} ${tm.left}` : x.effect.name;
    return `<span class="rh-seal is-fx" data-tooltip="${esc(tip)}" ${tm ? `data-fx-start="${tm.start}" data-fx-until="${tm.until}"` : ""}><span class="rh-knob"><img src="${esc(x.effect.img)}" alt="">${tm ? `<i class="rh-fx-bar" style="width:${tm.pctW}%"></i>` : ""}</span><span class="rh-seal-l">${esc(x.effect.name)}</span></span>`;
  });
  tabs.push({ key: "powers", label: t("Hud.Powers"), seals: [...own, ...powers, ...fx, seal("allPowers", "fa-book-open", t("Hud.AllPowers"), { man: true, tip: t("Hud.AllPowersTip") })] });
  tabs.push({ key: "other", label: t("Hud.Tab.other"), seals: [seal("roll", "fa-dice-d10", t("Hud.Roll"), { tip: t("Hud.RollTip") }),
    seal("initRoll", "fa-bolt", t("Hud.InitShortCap"), { tip: t("Hud.InitTip") }), seal("hazard", "fa-fire-flame-curved", t("Hud.Hazard"), { tip: t("Hazard.Title") }),
    seal("sheet", "fa-book", t("Hud.Sheet"), { tip: t("Hud.SheetTip") })] });
  return tabs;
}

/** Печати встают дугой над портретом: средние выше, крайние ниже. */
const arc = list => { const mid = (list.length - 1) / 2;
  return list.map((h, i) => h.replace(/^<(a|span) class="rh-seal/, `<$1 style="--arc:${Math.round(mid ? ((i - mid) / mid) ** 2 * 12 : 0)}px" class="rh-seal`)).join(""); };

export function renderHud() {
  if (!enabled()) return;
  const el = mount();
  document.body.classList.add("r-hud-on");
  const a = hudActor();
  el.className = "vtm20 r-hud";
  if (!a) {
    el.innerHTML = `<p class="rh-empty"><i class="fa-solid fa-user-slash"></i> ${esc(t(game.user.isGM ? "Hud.PickToken" : "Hud.NoCharacter"))}</p>`;
    fitHud(); return;
  }
  const s = a.system, kind = kindOf(a);
  el.classList.add(`rh-t-${kind}`);
  const tabs = tabsOf(a, kind), cur = tabs.find(x => x.key === tab) ?? tabs[0];

  // бой: броня и инициатива — монетами на плечах портрета; вне боя их нет (инициатива — печатью во вкладке «Прочее»)
  const combatant = game.combat?.combatants?.find(c => c.actor?.id === a.id);
  const myTurn = !!(combatant && game.combat?.started && game.combat.combatant === combatant);
  const inFight = !!game.combat && (!!combatant || game.combat.started);
  const arm = a.armor, soak = `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`;
  const coin = (cls, act, num, cap, tip) => `<${act ? `a data-act="${act}"` : "span"} class="rh-coin ${cls}" data-tooltip="${esc(tip)}"><b>${num}</b><span>${esc(cap)}</span></${act ? "a" : "span"}>`;
  const coins = !inFight ? "" : coin("is-armor", "", arm.rating, t("Hud.ArmorCap"), `${arm.rating ? t("Hud.ArmorTip", { r: arm.rating, p: arm.penalty }) : t("Hud.NoArmor")} · ${t("Sheet.SoakHint")}: ${soak}`)
    + (combatant ? (combatant.initiative == null ? coin("is-init", "init", `<i class="fa-solid fa-dice-d10"></i>`, t("Hud.InitShort"), t("Hud.Init"))
      : coin(`is-init${myTurn ? " is-turn" : ""}`, "", Math.floor(combatant.initiative), myTurn ? t("Hud.YourTurn") : t("Hud.InitShort"), t("Sheet.Initiative")))
      : coin("is-init", "join", `<i class="fa-solid fa-swords"></i>`, t("Hud.Join"), t("Hud.Join")));

  // атаки, ждущие защиты этого персонажа — красной полосой над вкладками
  const pend = pendingAttacks(a), last = pend.at(-1)?.getFlag(SYSTEM_ID, "combat");
  const alarm = last ? `<a class="rh-alarm" data-act="defendPending" data-tooltip="${esc(t("Hud.DefendTip", { a: last.attackerName, w: last.weaponName, n: last.successes }))}">
      <i class="fa-solid fa-triangle-exclamation"></i><span>${esc(t("Hud.UnderAttack", { name: last.attackerName }))}</span>${pend.length > 1 ? `<b>×${pend.length}</b>` : ""}</a>` : "";
  // состояния (торпор, бешенство, Харано…) — значками на портрете
  const states = ["r-torpor", "r-staked", "r-frenzy", "r-rotschreck", "r-harano", "r-rapture"].filter(id => a.statuses?.has(id))
    .map(id => CONFIG.statusEffects.find(e => e.id === id)).filter(Boolean)
    .map(e => `<img src="${esc(e.img)}" data-tooltip="${esc(game.i18n.localize(e.name))}" alt="">`).join("");
  const wing = side => `<svg class="rh-banner" viewBox="0 0 340 76" preserveAspectRatio="none" aria-hidden="true"${side === "right" ? ` style="transform:scaleX(-1)"` : ""}>
      <polygon points="0,0 340,0 340,76 0,76 22,38"/><polyline points="340,5 9,5 28,38 9,71 340,71"/></svg>`;
  el.innerHTML = `
    ${alarm}
    <nav class="rh-tabs">${tabs.map((x, i) => `${i ? `<i class="rh-sep">◆</i>` : ""}<a class="${x === cur ? "on" : ""}" data-act="tab" data-tab="${x.key}">${esc(x.label)}</a>`).join("")}</nav>
    <div class="rh-seals">${arc(cur.seals)}</div>
    <div class="rh-crest${myTurn ? " is-turn" : ""}">
      <div class="rh-wing is-left">${wing("left")}<div class="rh-grid">${leftWing(s)}</div></div>
      <div class="rh-wing is-right">${wing("right")}<div class="rh-grid">${rightWing(a, kind)}</div></div>
      <a class="rh-frame" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}"><img src="${esc(a.img)}" alt="">${states ? `<span class="rh-states">${states}</span>` : ""}</a>
      ${coins}
      <a class="rh-ribbon" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}"><b>${esc(a.name)}</b><small>${esc(subtitleOf(a, kind))}</small></a>
    </div>`;
  el.classList.toggle("is-turn", myTurn);
  fitHud();
}

async function onClick(ev) {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  ev.preventDefault();
  const a = hudActor();
  if (!a) return;
  switch (el.dataset.act) {
    case "sheet": return a.sheet.render(true);
    case "tab": tab = el.dataset.tab; return renderHud();
    case "noop": return;
    // все силы — вкладка сил на листе (Дисциплины, Дары, Знания, Грани)
    case "allPowers": await a.sheet.render(true); return a.sheet.changeTab?.("disciplines", "primary");
    case "attack": return openAttack(a, { weapon: el.dataset.weapon ?? null });
    case "maneuver": return openAttack(a, { maneuver: el.dataset.man });
    case "natural": return openAttack(a, { natural: Number(el.dataset.n) });
    // Гару: форма, действия за Ярость, регенерация, шаг в сторону, бешенство (W20, гл. 6–7)
    case "form": return changeForm(a, el.dataset.form);
    case "wwActions": return rageActions(a);
    case "wwRegen": return regenerate(a);
    case "wwStep": return stepSideways(a);
    case "wwFrenzy": return frenzyCheck(a);
    // падший: апокалиптическая форма; охотник: второе зрение
    case "apocalyptic": return assumeForm(a);
    case "sight": return secondSight(a);
    case "roll": return RollDialog.prompt(a, {});
    case "dodge": case "block": case "parry": return openDefense(a, el.dataset.act);
    case "spend": return a.spendBlood(1, { reason: t("Notify.ReasonManual") });
    case "heal": return a.bloodHeal(null);
    case "potence": return a.potenceActive ? null : a.activatePotence();
    case "celerity": {
      const max = Math.min(a.discipline("celerity"), a.celerityActions + (a.system.blood?.value ?? 0));
      if (max <= a.celerityActions) return ui.notifications.warn(t("Notify.NoBlood", { name: a.name }));
      const opts = Array.from({ length: max - a.celerityActions }, (_, i) => a.celerityActions + i + 1)
        .map(n => `<option value="${n}">${esc(t("Hud.CelerityOption", { n }))}</option>`).join("");
      const n = await foundry.applications.api.DialogV2.prompt({
        window: { title: Codex.disciplineLabel("celerity"), icon: "fa-solid fa-forward" }, classes: ["vtm20", "r-dialog"],
        content: `<div class="r-form"><p>${esc(t("Hud.CelerityAsk"))}</p><label class="r-field"><select name="n">${opts}</select></label></div>`,
        ok: { label: t("Hud.CelerityBuy"), callback: (e, b) => Number(b.form.elements.n.value) || 0 }, rejectClose: false
      });
      return n ? a.buyCelerityActions(n) : null;
    }
    case "power": return rollPowerRef(a, el.dataset.ref);
    case "hunt": return openHunt(a);
    case "hazard": return openHazard(a);
    case "defendPending": return defendFromHud(a);
    case "initRoll": {
      const r = await new Roll("1d10 + @initiative", a.getRollData()).evaluate();
      return r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: a }), flavor: t("Roll.Initiative") });
    }
    case "init": {
      const c = game.combat?.combatants?.find(x => x.actor?.id === a.id);
      if (c) return game.combat.rollInitiative([c.id]);
      break;
    }
    case "join": {
      const tok = canvas.tokens.controlled.find(x => x.actor === a) ?? a.getActiveTokens()[0];
      if (tok) await tok.document.toggleCombatant();
      break;
    }
  }
}

/** Не залезать под поле чата, когда боковая панель свёрнута; если места меньше ширины герба — уменьшить его целиком. */
function fitHud() {
  const el = document.getElementById(ID), bottom = document.getElementById("ui-bottom");
  if (!el || !bottom) return;
  const chat = document.getElementById("chat-notifications");
  const r = chat?.getBoundingClientRect(), b = bottom.getBoundingClientRect();
  const input = chat?.querySelector("#chat-message");
  const busy = r && r.width > 0 && r.left < b.right && input && getComputedStyle(input).display !== "none";
  const room = busy ? Math.max(420, r.left - b.left - 12) : b.width;
  el.style.setProperty("--rh-scale", Math.min(1, room / 840).toFixed(3));
}

/** Перерисовать не чаще раза в кадр. */
export function refreshHud() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; renderHud(); });
}

export function registerHud() {
  game.settings.register(SYSTEM_ID, "hud", {
    name: "VTM20.Hud.Setting", hint: "VTM20.Hud.SettingHint",
    scope: "client", config: true, type: Boolean, default: true, requiresReload: true
  });
  Hooks.once("ready", () => {
    if (!enabled()) return;
    renderHud();
    Hooks.on("collapseSidebar", () => setTimeout(fitHud, 350));
    window.addEventListener("resize", () => requestAnimationFrame(fitHud));
    const right = document.getElementById("ui-right");
    if (right) new ResizeObserver(() => fitHud()).observe(right);
    for (const h of ["controlToken", "updateActor", "createItem", "updateItem", "deleteItem", "createChatMessage", "deleteChatMessage",
      "updateCombat", "createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady", "updateUser",
      "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
      Hooks.on(h, refreshHud);
  });
}
