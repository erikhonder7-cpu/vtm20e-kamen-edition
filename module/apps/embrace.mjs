// module/apps/embrace.mjs
// Становление (V20, гл. 6 «Кровь», гл. 2 «Кланы»): смертный или гуль становится Сородичем. Клан — от сира, поколение —
// поколение сира + 1, сир и ночь Становления — в сведениях (родословная и паутина хроники строятся по полю «Сир» сами),
// каждое дитя связано с сиром первой ступенью уз крови. Ангра-Майнью не могут давать Становление, у Кровных Братьев
// смертный гибнет. Запас крови новообращённого — 1d10, как при создании (правило системы: книга о запасе после
// Становления в игре молчит). Характеристики, Способности, Добродетели, Человечность, Воля, факты биографии, предметы
// и Дисциплины гуля остаются; Дисциплины клана добавляются с 0 точек.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { LibraryItems } from "./library.mjs";
import { getClock, longDate, ymd } from "./calendar.mjs";
import { nameKey } from "../data/lineage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Embrace.${k}`, d) : game.i18n.localize(`VTM20.Embrace.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
/** Кланы, которые не могут дать Становление (V20, гл. 2): Ангра-Майнью — инертная кровь, у Кровных Братьев смертный гибнет. */
const NO_EMBRACE = { angraMaynyu: "Inert", krovnyeBratya: "Dies" };
/** Поля смертного и гуля, которых у Сородича нет. */
const DROP = ["vessel", "trueFaith", "thrall", "kinfolk", "exorcist", "ebServant", "domitor", "domitorClan", "domitorGeneration", "ghoulType", "family", "dhampir"];

export async function embrace(actor) {
  if (!["mortal", "ghoul"].includes(actor.type)) return null;
  await Codex.load();
  const vampires = game.actors.filter(a => a.type === "vampire").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const clans = Codex.clans.filter(c => Codex.visible(c)).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  // гуль — по умолчанию его домитор
  const dom = actor.type === "ghoul" ? vampires.find(v => nameKey(v.name) === nameKey(actor.system.domitor)) : null;
  const night = longDate(new Date(getClock()));
  const content = `<p class="r-choice-hint">${t("Hint")}</p><div class="r-form">
    <label class="r-field"><span>${t("Sire")}</span><select name="sire"><option value="">${t("SireFree")}</option>${vampires.map(v =>
      `<option value="${v.id}" data-clan="${esc(v.system.clan)}" data-gen="${v.system.generation}"${v === dom ? " selected" : ""}>${esc(v.name)} · ${esc(v.clanLabel)}, ${v.system.generation}</option>`).join("")}</select></label>
    <label class="r-field"><span>${t("SireName")}</span><input type="text" name="name" placeholder="${esc(t("SireNamePh"))}"></label>
    <label class="r-field"><span>${t("Clan")}</span><select name="clan">${clans.map(c =>
      `<option value="${c.key}"${c.key === (dom?.system.clan ?? "caitiff") ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
    <label class="r-field"><span>${t("Generation")}</span><input type="number" name="gen" min="4" max="15" value="${dom ? Math.min(15, dom.system.generation + 1) : 13}"></label>
    <label class="r-field"><span>${t("Night")}</span><input type="text" name="night" value="${esc(night)}"></label>
    <p class="r-note" data-warn hidden></p>
  </div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Title", { name: actor.name }), icon: "fa-solid fa-moon" }, classes: ["vtm20", "r-dialog", "r-embrace"], position: { width: 460 }, content,
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element, el = n => f.querySelector(`[name=${n}]`), warn = f.querySelector("[data-warn]");
      // сир с листом — клан и поколение от него; запрещённые кланы — предупреждение прямо в окне
      const check = () => { const no = NO_EMBRACE[el("clan").value]; warn.hidden = !no; warn.textContent = no ? t(`No${no}`) : ""; };
      const fromSire = () => {
        const o = el("sire").selectedOptions[0];
        if (o?.value) { el("clan").value = o.dataset.clan; el("gen").value = Math.min(15, Number(o.dataset.gen) + 1); }
        check();
      };
      el("sire").addEventListener("change", fromSire);
      el("clan").addEventListener("change", check);
      check();
    },
    ok: { label: t("Ok"), icon: "fa-solid fa-moon", callback: (ev, btn) => { const e = btn.form.elements;
      return { sire: e.sire.value, name: e.name.value.trim(), clan: e.clan.value, gen: Math.clamp(Number(e.gen.value) || 13, 4, 15), night: e.night.value.trim() }; } },
    rejectClose: false
  }).catch(() => null);
  if (!res) return null;
  if (NO_EMBRACE[res.clan]) return ui.notifications.warn(t(`No${NO_EMBRACE[res.clan]}`));
  const sire = res.sire ? game.actors.get(res.sire) : null, sireName = sire?.name ?? res.name;

  // слуга падшего — договор рвётся, как и при Становлении гуля
  if (actor.isThrall && actor.system.thrall?.master) {
    const m = await fromUuid(actor.system.thrall.master);
    if (m?.isOwner && m.type === "demon") await m.update({ "system.thralls": m.system.thralls.filter(x => x.uuid !== actor.uuid) });
  }
  const roll = await new Roll("1d10").evaluate();
  const sys = actor.toObject().system;
  for (const k of DROP) delete sys[k];
  const today = ymd(new Date(getClock()));
  const bonds = (sys.bonds ?? []).filter(b => !(b.role === "regnant" && sireName && nameKey(b.name) === nameKey(sireName)));
  const had = (actor.system.bonds ?? []).find(b => b.role === "regnant" && sireName && nameKey(b.name) === nameKey(sireName));
  if (sireName) bonds.push(had ? { ...had, last: today } : { name: sireName, rating: 1, role: "regnant", drinks: 1, last: today });
  Object.assign(sys, { clan: res.clan, generation: res.gen, blood: { value: roll.total }, boosts: { strength: 0, dexterity: 0, stamina: 0 }, bonds });
  sys.details = { ...(sys.details ?? {}), sire: sireName, embraced: res.night };
  // знак типа по умолчанию — на знак Сородича; второй столбик жетона — запас крови
  const icon = n => `systems/${SYSTEM_ID}/assets/icons/${n}.svg`, plain = [icon("mortal"), icon("ghoul")];
  const look = { "prototypeToken.bar2.attribute": "blood", "prototypeToken.sight.enabled": true,
    ...(plain.includes(actor.img) ? { img: icon("vampire") } : {}),
    ...(plain.includes(actor.prototypeToken.texture.src) ? { "prototypeToken.texture.src": icon("vampire") } : {}) };
  await actor.update({ type: "vampire", system: sys }, { recursive: false });
  await actor.update(look);
  // Дисциплины клана — с 0 точек (что уже было у гуля, остаётся как есть)
  const owned = new Set(actor.items.filter(i => i.type === "discipline").map(i => i.system.key));
  const add = (actor.clanDisciplines ?? []).filter(k => !owned.has(k) && Codex.discipline(k)).map(k => LibraryItems.discipline(k, 0));
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
  await actor.setFlag(SYSTEM_ID, "created", true);
  // у сира — дитя-вассал первой ступени (лист сира меняет тот, кому он доступен)
  if (sire?.isOwner) {
    const dl = foundry.utils.deepClone(sire._source.system.bonds ?? []);
    if (!dl.some(b => b.role === "thrall" && nameKey(b.name) === nameKey(actor.name))) dl.push({ name: actor.name, rating: 1, role: "thrall", drinks: 1, last: today });
    await sire.update({ "system.bonds": dl });
  }
  const clan = Codex.clan(res.clan)?.name ?? res.clan;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { embrace: true } },
    content: `<div class="r-notice"><i class="fa-solid fa-moon"></i> ${t("Done", { name: esc(actor.name), clan: esc(clan), gen: res.gen, sire: esc(sireName || t("SireUnknown")) })}
      <br><small>${t("DoneBlood", { n: roll.total })}${sireName ? ` ${t("DoneBond", { sire: esc(sireName) })}` : ""}${res.gen > 13 ? ` ${t("ThinNote")}` : ""}</small></div>` });
  actor.sheet?.render(true);
  return actor;
}
