// module/ui/hud.mjs
// HUD вместо панели макросов (по образцу vtm5e-kamen-edition, под правила V20):
// персонаж игрока или выделенный токен — табличка с именем, портрет, семь уровней здоровья, воля и запасы
// своего вида (кровь и мораль; Ярость, Гнозис и форма Гару; Вера и Мука падшего; Убеждённость охотника;
// Эссенция духа); оружие, естественное оружие формы и манёвры; защиты; свои действия вида (Мощь,
// Стремительность, охота; формы и действия Гару; облик падшего; второе зрение); инициатива, броня, прочность.
// Цвет — по виду персонажа (класс rh-t-*, styles/r-hud.css).

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

/** Здоровье: семь клеток с отметками /, X, ✱ (04). */
function healthTrack(s) {
  const last = s.health.levels.reduce((n, l, i) => l.state && l.state !== "empty" && l.state !== "none" ? i : n, -1);
  const cells = s.health.levels.map((l, i) => `<i class="is-${l.state}${i === last ? " is-current" : ""}" data-tooltip="${esc(game.i18n.localize(l.label))}">${l.state === "empty" ? "" : VTM20.damageTypes[l.state]?.mark ?? ""}</i>`);
  return `<span class="rh-track rh-health">${cells.join("")}</span>`;
}

/** Воля: постоянная — рамка клетки, временная — заполнение. */
function willTrack(s) {
  const w = s.willpower, out = [];
  for (let i = 0; i < w.permanent; i++) out.push(`<i class="${i < w.temporary ? "on" : ""}"></i>`);
  return `<span class="rh-track rh-will">${out.join("")}</span>`;
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

/** Запас крупной цифрой: значок, значение, предел. */
const stat = (cls, icon, value, max, tip, act = "") => `<${act ? `a data-act="${act}"` : "span"} class="rh-stat ${cls}" data-tooltip="${esc(tip)}">
  <i class="fa-solid ${icon}"></i><b>${value}</b>${max != null ? `<small>/${max}</small>` : ""}</${act ? "a" : "span"}>`;

/** Запасы по виду: кровь и мораль, Ярость и Гнозис с формой, Вера и Мука, Убеждённость, Эссенция духа… */
function statsOf(a, kind) {
  const s = a.system, out = [];
  if (a.hasBlood) {
    const perTurn = s.blood?.perTurn ?? 1, spent = a.bloodSpentThisTurn ?? 0;
    const pips = perTurn <= 10 ? `<span class="rh-turn">${Array.from({ length: perTurn }, (_, i) => `<i class="${i < spent ? "on" : ""}"></i>`).join("")}</span>` : "";
    out.push(`<a class="rh-stat rh-blood" data-act="spend" data-tooltip="${esc(game.combat?.started ? t("Hud.BloodTipTurn", { n: perTurn, spent }) : t("Hud.BloodTip", { n: perTurn }))}">
      <i class="fa-solid fa-droplet"></i><b>${s.blood.value}</b><small>/${s.blood.max}</small>${pips}</a>`);
  }
  if (kind === "werewolf") {
    const w = s.werewolf, fera = feraOf(a), form = (fera?.forms ?? VTM20.garouForms).find(f => f.key === w.form);
    out.push(stat("rh-rage", "fa-fire", w.rage.value, w.rage.permanent, t("Hud.RageTip")));
    out.push(stat("rh-gnosis", "fa-moon", w.gnosis.value, w.gnosis.permanent, t("Hud.GnosisTip")));
    // форма — подписью у запасов только без группы форм (узкий HUD прячет её подпись, кнопка формы остаётся)
    if (form) out.push(`<span class="rh-stat rh-form" data-tooltip="${esc(t("Hud.FormNow"))}"><b>${esc(VTM20.label(form))}</b></span>`);
  } else if (kind === "demon") {
    out.push(stat("rh-faith", "fa-hand-sparkles", s.faith?.temporary ?? 0, s.faith?.permanent ?? 0, t("Demon.Faith")));
    out.push(stat("rh-torment", "fa-skull", s.torment?.permanent ?? 0, null, t("Hud.TormentTip", { n: s.torment?.temporary ?? 0 })));
  } else if (kind === "hunter") {
    out.push(stat("rh-conviction", "fa-sun", s.hunter?.conviction ?? 0, null, t("Hunter.Conviction")));
  } else if (kind === "spirit") {
    const sp = s.spirit;
    out.push(stat("rh-essence", "fa-wind", sp.essence.value, sp.essence.max, t("Hud.EssenceTip")));
    out.push(stat("rh-rage", "fa-fire", sp.rage, null, t("Werewolf.Rage")), stat("rh-gnosis", "fa-moon", sp.gnosis, null, t("Werewolf.Gnosis")));
  } else {
    if (s.morality) out.push(stat("rh-moral", "fa-scale-balanced", s.morality.value, null, Codex.path(s.morality.path)?.name ?? t("Humanity")));
    if (s.kinfolk?.on && s.kinfolk.gnosis) out.push(stat("rh-gnosis", "fa-moon", s.kinfolk.gnosis, null, t("Werewolf.Gnosis")));
    if (s.kami?.on) out.push(stat("rh-gnosis", "fa-seedling", s.kami.gnosis, null, t("Werewolf.Gnosis")));
    if ((s.kami?.on && s.kami.rage) || (s.fomor?.on && s.fomor.rage)) out.push(stat("rh-rage", "fa-fire", s.kami?.on ? s.kami.rage : s.fomor.rage, null, t("Werewolf.Rage")));
  }
  return out.join("");
}

/** Свои действия вида: Мощь и Стремительность, лечение и охота; действия Гару; облик падшего; второе зрение. */
function actionsOf(a, kind) {
  const s = a.system, btn = (k, icon, tip, on = false, extra = "") => `<a class="rh-btn ${on ? "is-on" : ""}" data-act="${k}" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fa-solid ${icon}"></i>${extra}</a>`;
  let out = btn("roll", "fa-dice-d10", t("Hud.RollTip"));
  if (a.hasBlood) {
    // Мощь за кровь и дополнительные действия Стремительности — на этот ход (Дисциплины/06, 14)
    const pot = a.discipline("potence"), cel = a.discipline("celerity");
    if (pot) out += btn("potence", "fa-hand-fist", t(a.potenceActive ? "Hud.PotenceOnTip" : "Hud.PotenceTip", { n: pot }), a.potenceActive);
    if (cel) out += btn("celerity", "fa-forward", t("Hud.CelerityTip", { n: cel, used: a.celerityActions }), !!a.celerityActions, a.celerityActions ? `<small>${a.celerityActions}</small>` : "");
    out += btn("heal", "fa-hand-holding-droplet", t("Sheet.HealHint")) + btn("hunt", "fa-moon", t("Hunt.Button"));
  }
  if (kind === "werewolf") out += btn("wwActions", "fa-forward-fast", t("Werewolf.ActionsHint")) + btn("wwRegen", "fa-heart-pulse", t("Werewolf.RegenHint"))
    + btn("wwStep", "fa-circle-half-stroke", t("Werewolf.StepHint")) + btn("wwFrenzy", "fa-face-angry", t("Werewolf.FrenzyHint"));
  if (kind === "demon") out += btn("apocalyptic", "fa-dragon", t(s.apocalyptic ? "Hud.ApocOn" : "Hud.ApocOff"), !!s.apocalyptic);
  if (kind === "hunter") out += btn("sight", "fa-eye", t("Hud.SightTip"));
  return out + btn("hazard", "fa-fire-flame-curved", t("Hazard.Title"));
}

/** Формы Гару и Фера — мини-кнопками; текущая подсвечена, смена — бросок или трата Ярости (werewolf.mjs, changeForm). */
function formsOf(a) {
  const w = a.system.werewolf, fera = feraOf(a), list = fera ? fera.forms.map(f => ({ ...f, icon: "fa-paw" })) : VTM20.garouForms;
  return list.map(f => `<a class="rh-btn rh-formbtn ${f.key === w.form ? "is-on" : ""}" ${f.key === w.form ? "" : `data-act="form" data-form="${f.key}"`} data-tooltip="${esc(VTM20.label(f))}" aria-label="${esc(VTM20.label(f))}"><i class="fa-solid ${f.icon ?? "fa-paw"}"></i></a>`).join("");
}

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
  const s = a.system, kind = kindOf(a), vamp = a.isVampire;
  el.classList.add(`rh-t-${kind}`);

  // оружие — значок по названию (лук, коса, кинжал…); естественное оружие формы (когти, клыки Криноса, облик падшего) — следом
  const weapons = weaponsOf(a).slice(0, 4).map(w => `<a class="rh-btn rh-weapon" data-act="attack" data-weapon="${w.id}" data-tooltip="${esc(`${w.name} · ${w.label} · ${game.i18n.localize(VTM20.damageTypes[w.damageType]?.label ?? "")}`)}" aria-label="${esc(w.name)}">
      <i class="fa-solid ${weaponGlyph(w)}"></i></a>`).join("");
  const natural = (s.formFx?.weapons ?? []).map((w, i) => `<a class="rh-btn rh-weapon rh-natural" data-act="natural" data-n="${i}" data-tooltip="${esc(`${w.name} · ${game.i18n.localize(VTM20.damageTypes[w.type]?.label ?? "")}`)}" aria-label="${esc(w.name)}">
      <i class="fa-solid ${w.icon ?? (/укус|клык|bite/i.test(w.name) ? "fa-tooth" : "fa-paw")}"></i></a>`).join("");
  const man = (k, icon) => {
    const tip = [t(`Combat.M.${k}`), t(`Combat.MNote.${k}`)].filter(Boolean).join(" — ");
    return `<a class="rh-btn rh-man ${k === "bite" ? "rh-bite" : ""}" data-act="maneuver" data-man="${k}" data-tooltip="${esc(tip)}" aria-label="${esc(t(`Combat.M.${k}`))}"><i class="fa-solid ${icon}"></i></a>`;
  };
  // с естественным оружием формы (Кринос, облик падшего) приёмы — под «…», чтобы когти и клыки были видны и в узком HUD
  const maneuvers = natural ? "" : man("punch", "fa-hand-fist") + (s.fx?.claws ? man("claws", "fa-paw") : "") + (vamp ? man("bite", "fa-tooth") : man("clinch", "fa-people-pulling"));
  // силы, вынесенные булавкой с листа (флаг hudPowers): знак Дисциплины и уровень, щелчок — бросок
  const powers = (a.getFlag(SYSTEM_ID, "hudPowers") ?? []).map(ref => {
    const x = powerByRef(ref);
    if (!x) return "";
    return `<a class="rh-btn rh-power" data-act="power" data-ref="${esc(ref)}" data-tooltip="${esc(`${x.p.name} · ${x.pathName || x.d.name} ${x.p.level}`)}">
      <img class="rh-pico" src="${esc(foundry.utils.getRoute(Codex.disciplineIcon(x.disc)))}" alt=""><small>${x.p.level}</small></a>`;
  }).join("");
  // у сил «на час» и «до рассвета» — остаток полоской под знаком (apps/timers.mjs подкрашивает)
  const fxChips = (a.powerEffects ?? []).map(x => {
    const tm = effectTimer(x.effect);
    const tip = tm ? `${x.effect.name} · ${t(x.def.mode === "night" ? "Timer.ToDawn" : "Timer.Left")} ${tm.left}` : x.effect.name;
    return `<span class="rh-chip rh-fx" data-tooltip="${esc(tip)}" ${tm ? `data-fx-start="${tm.start}" data-fx-until="${tm.until}"` : ""}><img src="${esc(x.effect.img)}" alt="">${tm ? `<i class="rh-fx-bar" style="width:${tm.pctW}%"></i>` : ""}</span>`;
  }).join("");

  const arm = a.armor;
  const soak = `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`;
  const combatant = game.combat?.combatants?.find(c => c.actor?.id === a.id);
  const myTurn = !!(combatant && game.combat?.started && game.combat.combatant === combatant);
  const initBox = (tag, act, num, cap, tip = "") => `<${tag} class="rh-init ${myTurn ? "is-turn" : ""}" ${act ? `data-act="${act}"` : ""} ${tip ? `data-tooltip="${esc(tip)}"` : ""}><b>${num}</b><span>${cap}</span></${tag}>`;
  const init = game.combat ? (combatant
    ? (combatant.initiative == null ? initBox("a", "init", `<i class="fa-solid fa-dice-d10"></i>`, esc(t("Hud.Init")))
      : initBox("span", "", Math.floor(combatant.initiative), myTurn ? esc(t("Hud.YourTurn")) : `<i class="fa-solid fa-bolt"></i> ${esc(t("Hud.InitShort"))}`, t("Sheet.Initiative")))
    : initBox("a", "join", `<i class="fa-solid fa-swords"></i>`, esc(t("Hud.Join"))))
    : initBox("a", "initRoll", s.initiative, `<i class="fa-solid fa-bolt"></i> ${esc(t("Hud.InitShort"))}`, t("Hud.InitTip"));

  // Атаки, ждущие защиты этого персонажа
  const pend = pendingAttacks(a);
  const last = pend.at(-1)?.getFlag(SYSTEM_ID, "combat");
  const alarm = last ? `<a class="rh-alarm" data-act="defendPending" data-tooltip="${esc(t("Hud.DefendTip", { a: last.attackerName, w: last.weaponName, n: last.successes }))}">
      <i class="fa-solid fa-triangle-exclamation"></i><span>${esc(t("Hud.UnderAttack", { name: last.attackerName }))}</span>${pend.length > 1 ? `<b>×${pend.length}</b>` : ""}</a>` : "";
  const btn = (k, icon, tip) => `<a class="rh-btn" data-act="${k}" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fa-solid ${icon}"></i></a>`;
  const group = (label, body, cls = "") => `<div class="rh-group ${cls}"><label>${esc(label)}</label><div class="rh-group-body">${body}</div></div>`;
  const healthNote = s.health.damage ? `${game.i18n.localize(`VTM20.Health.${s.health.status}`)}${s.health.penalty ? ` ${s.health.penalty}` : ""}` : t("Health.healthy");
  // состояния (торпор, бешенство, Харано…) — значками у портрета
  const states = ["r-torpor", "r-staked", "r-frenzy", "r-rotschreck", "r-harano", "r-rapture"].filter(id => a.statuses?.has(id))
    .map(id => CONFIG.statusEffects.find(e => e.id === id)).filter(Boolean)
    .map(e => `<img src="${esc(e.img)}" data-tooltip="${esc(game.i18n.localize(e.name))}" alt="">`).join("");
  el.innerHTML = `
    <a class="rh-plate" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}"><img class="rh-sigil" src="${esc(VTM20.typeSigil(a.type))}" alt=""><b>${esc(a.name)}</b><small>${esc(subtitleOf(a, kind))}</small></a>
    <div class="rh-face" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}">
      <span class="rh-ring"><img src="${esc(a.img)}" alt=""></span>${states ? `<span class="rh-states">${states}</span>` : ""}
    </div>
    <div class="rh-tracks">
      <div data-tooltip="${esc(healthNote)}"><label>${esc(t("Sheet.Health"))}</label>${healthTrack(s)}<em class="${s.health.damage ? "is-hurt" : ""}">${esc(healthNote)}</em></div>
      <div><label>${esc(t("Willpower"))}</label>${willTrack(s)}<em>${s.willpower.temporary}/${s.willpower.permanent}</em></div>
      <div class="rh-stats">${statsOf(a, kind)}</div>
    </div>
    ${group(t("Combat.Attack"), `${alarm}${weapons}${natural}${maneuvers}<a class="rh-btn rh-man" data-act="attack" data-tooltip="${esc(t("Hud.AttackTip"))}"><i class="fa-solid fa-ellipsis"></i></a>`, "rh-attacks")}
    ${group(t("Hud.Defense"), btn("dodge", "fa-person-running", t("Combat.Defense.dodge")) + btn("block", "fa-shield-halved", t("Combat.Defense.block")) + btn("parry", "fa-khanda", t("Combat.Defense.parry")))}
    ${kind === "werewolf" ? group(t("Hud.Form"), formsOf(a), "rh-forms") : ""}
    ${group(t("Hud.Actions"), actionsOf(a, kind))}
    ${powers || fxChips ? group(t("Hud.Powers"), powers + fxChips, "rh-powers") : ""}
    <div class="rh-side">${init}
      <div class="rh-side-row">
        <span class="rh-chip ${arm.rating ? "" : "is-off"}" data-tooltip="${esc(arm.rating ? t("Hud.ArmorTip", { r: arm.rating, p: arm.penalty }) : t("Hud.NoArmor"))}"><i class="fa-solid fa-shield"></i> ${arm.rating}${arm.penalty ? ` <small>−${arm.penalty}</small>` : ""}</span>
        <span class="rh-chip" data-tooltip="${esc(t("Sheet.SoakHint"))}"><i class="fa-solid fa-shield-halved"></i> ${soak}</span>
      </div>
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

/** Не залезать под поле чата, когда боковая панель свёрнута. */
function fitHud() {
  const el = document.getElementById(ID), bottom = document.getElementById("ui-bottom");
  if (!el || !bottom) return;
  const chat = document.getElementById("chat-notifications");
  const r = chat?.getBoundingClientRect(), b = bottom.getBoundingClientRect();
  const input = chat?.querySelector("#chat-message");
  const busy = r && r.width > 0 && r.left < b.right && input && getComputedStyle(input).display !== "none";
  el.style.maxWidth = busy ? `${Math.max(420, r.left - b.left - 12)}px` : "";
  el.style.marginLeft = busy ? "0" : "";
  fitWeapons(el);
}

/** Оружие в группе атаки: прятать с конца, пока приёмы и «…» не влезут целиком (хотя бы одно оружие остаётся). */
function fitWeapons(el) {
  const body = el.querySelector(".rh-attacks .rh-group-body");
  if (!body) return;
  const list = [...body.querySelectorAll(".rh-weapon")];
  list.forEach(w => { w.hidden = false; });
  for (let i = list.length - 1; i > 0 && body.scrollWidth > body.clientWidth + 1; i--) list[i].hidden = true;
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
