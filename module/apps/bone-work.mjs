// module/apps/bone-work.mjs
// Искусство костей, «своя работа»: окно настройки. Книга задаёт лишь лепку, удар, когти и шипы — всё остальное
// на усмотрение рассказчика, поэтому параметры открыты: сложность, цена (раны любого вида, кровь, Воля),
// оружие (Драка или ближний бой, Сила + N, вид урона, сложность атаки), правки характеристик, прочность
// (даром или ценой Силы, как в Искусстве тканей), свойства шипов. Работ может быть сколько угодно — каждая отдельным эффектом.

import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.TP.BoneC.${k}`, d) : game.i18n.localize(`VTM20.TP.BoneC.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const dmgLabel = k => game.i18n.localize(VTM20.damageTypes[k]?.label ?? k);
const attrLabel = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
const ATTRS = ["strength", "dexterity", "stamina", "charisma", "manipulation", "appearance", "perception", "intelligence", "wits"];
const signed = n => n > 0 ? `+${n}` : `${n}`;

/** Настройки работы в полном виде (старые шаблоны — цена числом). */
export function normBone(c = {}) {
  const cost = typeof c.cost === "object" && c.cost ? c.cost : { wounds: Number(c.cost) || 0, minus: !!c.minus };
  const w = c.weapon ?? null;
  return {
    name: c.name || t("Default"), diff: Math.clamp(Number(c.diff) || 6, 2, 10), note: c.note ?? "",
    cost: { wounds: Math.clamp(Number(cost.wounds) || 0, 0, 10), type: cost.type ?? "lethal", minus: !!cost.minus,
      blood: Math.clamp(Number(cost.blood) || 0, 0, 10), will: Math.clamp(Number(cost.will) || 0, 0, 5) },
    weapon: w ? { name: c.name || t("Default"), kind: w.kind === "melee" ? "melee" : "brawl", damage: Math.clamp(Number(w.damage) || 0, -1, 5), strength: true,
      damageType: w.damageType ?? "lethal", difficulty: Math.clamp(Number(w.difficulty) || 6, 3, 9) } : null,
    attr: Object.fromEntries(Object.entries(c.attr ?? {}).map(([k, v]) => [k, Math.clamp(Number(v) || 0, -3, 3)]).filter(([k, v]) => v && ATTRS.includes(k))),
    soak: Math.clamp(Number(c.soak) || 0, 0, 5), soakStr: !!c.soakStr, spikes: !!c.spikes, grapple: Math.clamp(Number(c.grapple) || 0, 0, 5)
  };
}

/** Плитки-переключатели одной группы. */
const tiles = (name, list, cur, cols) => `<div class="r-tiles r-bw-tiles" style="--cols: ${cols}">${list.map(([v, label, icon]) =>
  `<label class="r-tile is-flat r-bw-tile${String(v) === String(cur) ? " is-active" : ""}"><input type="radio" name="${name}" value="${v}"${String(v) === String(cur) ? " checked" : ""}>${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${esc(label)}</span></label>`).join("")}</div>`;

/** Счётчик − n + (скрытое поле name). */
const stepper = (name, value, min, max, label) => `<span class="r-bw-step" data-min="${min}" data-max="${max}">
  ${label ? `<em>${esc(label)}</em>` : ""}<button type="button" data-d="-1" aria-label="−"><i class="fa-solid fa-minus"></i></button>
  <b>${signed0(name, value)}</b><button type="button" data-d="1" aria-label="+"><i class="fa-solid fa-plus"></i></button>
  <input type="hidden" name="${name}" value="${value}"></span>`;
const signed0 = (name, v) => name.startsWith("attr.") ? (v ? signed(v) : "0") : String(v);

/** Прочитать настройки из формы. */
function readForm(form) {
  const f = form.elements, num = (k, d = 0) => { const v = Number(f[k]?.value); return Number.isFinite(v) ? v : d; };
  const radio = (n, d) => form.querySelector(`[name="${n}"]:checked`)?.value ?? d;
  const wtype = radio("wtype", "none");
  return normBone({
    name: f.name.value.trim(), diff: Number(radio("diff", 6)), note: f.note.value.trim(),
    cost: { wounds: num("cost"), type: radio("ctype", "lethal"), minus: !!f.minus.checked, blood: num("blood"), will: num("will") },
    weapon: wtype === "none" ? null : { kind: radio("wkind", "brawl"), damage: Number(radio("wdmg", 1)), damageType: wtype, difficulty: Number(radio("wdiff", 6)) },
    attr: Object.fromEntries(ATTRS.map(k => [k, num(`attr.${k}`)])),
    soak: Number(radio("soak", 0)), soakStr: !!f.soakStr.checked, spikes: !!f.spikes.checked, grapple: Number(radio("grapple", 0))
  });
}

/** Строка итога: что получится. */
export function boneSummary(c) {
  const parts = [t("SumDiff", { n: c.diff })];
  const price = [c.cost.wounds && t(c.cost.minus ? "SumWoundsMinus" : "SumWounds", { n: c.cost.wounds, type: dmgLabel(c.cost.type).toLowerCase() }),
    c.cost.blood && t("SumBlood", { n: c.cost.blood }), c.cost.will && t("SumWill", { n: c.cost.will })].filter(Boolean);
  parts.push(price.length ? `${t("SumPrice")} ${price.join(", ")}` : t("SumFree"));
  if (c.weapon) parts.push(t("SumWeapon", { n: signed(c.weapon.damage), type: dmgLabel(c.weapon.damageType).toLowerCase(),
    kind: game.i18n.localize(VTM20.weaponKinds?.[c.weapon.kind]?.label ?? c.weapon.kind).toLowerCase(), d: c.weapon.difficulty }));
  const attrs = Object.entries(c.attr).map(([k, v]) => `${attrLabel(k)} ${signed(v)}`);
  if (attrs.length) parts.push(attrs.join(", "));
  if (c.soak) parts.push(t(c.soakStr ? "SumSoakStr" : "SumSoak", { n: c.soak }));
  if (c.spikes) parts.push(t("SumSpikes"));
  if (c.grapple) parts.push(t("SumGrapple", { n: c.grapple }));
  return parts;
}

/**
 * Окно «своя работа». who — кому лепим (для подписи); preset — шаблон (поля заполнены, его можно обновить или удалить).
 * @returns {Promise<object|null>} настройки (normBone) + save; или { deleteTemplate }
 */
export async function boneWorkDialog(powerName, who, { preset = null } = {}) {
  const P = preset ? normBone(preset) : normBone({ name: "" }), w = P.weapon;
  if (!preset) P.name = "";
  const dots = Array.from({ length: 10 }, (_, i) => `<span class="r-dot r-bw-dot" data-n="${i + 1}"></span>`).join("");
  const bodyOpen = Object.keys(P.attr).length > 0;
  const guardOpen = P.soak || P.spikes || P.grapple;
  const content = `<div class="r-form r-bw-form">
    <div class="r-bw-head">
      <span class="r-bw-kicker"><i class="fa-solid fa-bone"></i> ${esc(powerName)} · ${esc(t(preset ? "KickerTpl" : "Kicker"))}</span>
      <input class="r-bw-name" type="text" name="name" value="${esc(P.name)}" placeholder="${esc(t("NameHint"))}" autofocus>
      <span class="r-bw-who">→ ${esc(who.name)}</span>
    </div>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Diff"))}<em>${esc(t("DiffHint"))}</em></h4>
      ${tiles("diff", [5, 6, 7, 8, 9].map(n => [n, String(n)]), P.diff, 5)}
      <div class="r-bw-scale"><span>${esc(t("Crude"))}</span><span>${esc(t("Fine"))}</span></div>
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Cost"))}<em class="r-bw-costn"></em></h4>
      <div class="r-bw-dots"><span class="r-dots is-ten">${dots}</span><input type="hidden" name="cost" value="${P.cost.wounds}"></div>
      <div class="r-bw-ctype">${tiles("ctype", ["bashing", "lethal", "aggravated"].map(k => [k, dmgLabel(k)]), P.cost.type, 3)}</div>
      <label class="r-check"><input type="checkbox" name="minus"${P.cost.minus ? " checked" : ""}><span>${esc(t("Minus"))}</span></label>
      <div class="r-bw-row">${stepper("blood", P.cost.blood, 0, 10, t("Blood"))}${stepper("will", P.cost.will, 0, 5, t("Will"))}</div>
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Weapon"))}</h4>
      ${tiles("wtype", [["none", t("NoWeapon"), "fa-ban"], ["bashing", dmgLabel("bashing"), "fa-hand-fist"], ["lethal", dmgLabel("lethal"), "fa-bone"], ["aggravated", dmgLabel("aggravated"), "fa-skull"]], w?.damageType ?? "none", 4)}
      <div class="r-bw-weapon is-off">
        <div class="r-bw-line"><span class="r-bw-sub">${esc(t("WKind"))}</span>${tiles("wkind", [["brawl", t("Brawl"), "fa-hand-back-fist"], ["melee", t("Melee"), "fa-khanda"]], w?.kind ?? "brawl", 2)}</div>
        <div class="r-bw-line"><span class="r-bw-sub">${esc(t("WDmg"))}</span>${tiles("wdmg", [-1, 0, 1, 2, 3, 4].map(n => [n, signed(n)]), w?.damage ?? 1, 6)}</div>
        <div class="r-bw-line"><span class="r-bw-sub">${esc(t("WDiff"))}</span>${tiles("wdiff", [5, 6, 7, 8].map(n => [n, String(n)]), w?.difficulty ?? 6, 4)}</div>
      </div>
    </section>
    <details class="r-bw-sec r-bw-more"${bodyOpen ? " open" : ""}>
      <summary class="r-bw-cap"><i class="fa-solid fa-caret-right"></i>${esc(t("Body"))}<em>${esc(t("BodyHint"))}</em></summary>
      <div class="r-bw-attrs">${ATTRS.map(k => `<div class="r-bw-attr" data-k="${k}"><span>${esc(attrLabel(k))}</span>${stepper(`attr.${k}`, P.attr[k] ?? 0, -3, 3)}</div>`).join("")}</div>
    </details>
    <details class="r-bw-sec r-bw-more"${guardOpen ? " open" : ""}>
      <summary class="r-bw-cap"><i class="fa-solid fa-caret-right"></i>${esc(t("Guard"))}<em>${esc(t("GuardHint"))}</em></summary>
      <div class="r-bw-line"><span class="r-bw-sub">${esc(t("Soak"))}</span>${tiles("soak", [0, 1, 2, 3].map(n => [n, n ? `+${n}` : "—"]), P.soak, 4)}</div>
      <label class="r-check"><input type="checkbox" name="soakStr"${P.soakStr ? " checked" : ""}><span>${esc(t("SoakStr"))}</span></label>
      <label class="r-check"><input type="checkbox" name="spikes"${P.spikes ? " checked" : ""}><span>${esc(t("Spikes"))}</span></label>
      <div class="r-bw-line"><span class="r-bw-sub">${esc(t("Grapple"))}</span>${tiles("grapple", [0, 1, 2, 3].map(n => [n, n ? `+${n}` : "—"]), P.grapple, 4)}</div>
    </details>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Note"))}</h4>
      <textarea name="note" rows="2" placeholder="${esc(t("NoteHint"))}">${esc(P.note)}</textarea>
    </section>
    <div class="r-bw-sum"></div>
    <label class="r-check r-bw-save"><input type="checkbox" name="save"${preset ? " checked" : ""}><i class="fa-solid fa-bookmark"></i><span>${esc(t(preset ? "SaveTplUpdate" : "SaveTpl"))}</span></label>
  </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `${powerName} · ${t(preset ? "KickerTpl" : "Kicker")}`, icon: "fa-solid fa-bone" },
    classes: ["vtm20", "r-dialog", "r-bw-dialog"],
    position: { width: 560 },
    content,
    render: (ev, dlg) => {
      const el = dlg.element, form = el.querySelector("form") ?? el;
      const sync = () => {
        for (const tl of el.querySelectorAll(".r-bw-tile")) tl.classList.toggle("is-active", tl.querySelector("input").checked);
        const cost = Number(el.querySelector('[name="cost"]').value) || 0;
        el.querySelectorAll(".r-bw-dot").forEach(d => d.classList.toggle("is-filled", Number(d.dataset.n) <= cost));
        el.querySelector(".r-bw-costn").textContent = cost ? t("CostN", { n: cost }) : t("CostNone");
        el.querySelector(".r-bw-ctype").classList.toggle("is-off", !cost);
        el.querySelector(".r-bw-weapon").classList.toggle("is-off", (el.querySelector('[name="wtype"]:checked')?.value ?? "none") === "none");
        for (const a of el.querySelectorAll(".r-bw-attr")) {
          const v = Number(a.querySelector("input").value) || 0;
          a.classList.toggle("is-up", v > 0); a.classList.toggle("is-down", v < 0);
        }
        el.querySelector(".r-bw-sum").innerHTML = (() => { const c = readForm(form), [first, ...rest] = boneSummary(c);
          return `<b>${esc(c.name)}</b> · ${[first, ...rest].map(esc).join(" · ")}`; })();
      };
      // капли цены: клик — столько ран; по той же — ноль
      el.querySelectorAll(".r-bw-dot").forEach(d => d.addEventListener("click", () => {
        const inp = el.querySelector('[name="cost"]'), n = Number(d.dataset.n);
        inp.value = Number(inp.value) === n ? 0 : n; sync();
      }));
      // счётчики − / +
      el.querySelectorAll(".r-bw-step button").forEach(b => b.addEventListener("click", () => {
        const s = b.closest(".r-bw-step"), inp = s.querySelector("input");
        const v = Math.clamp((Number(inp.value) || 0) + Number(b.dataset.d), Number(s.dataset.min), Number(s.dataset.max));
        inp.value = v; s.querySelector("b").textContent = signed0(inp.name, v); sync();
      }));
      el.addEventListener("change", sync);
      el.addEventListener("input", sync);
      sync();
    },
    buttons: [
      { action: "ok", icon: "fa-solid fa-bone", label: t("Go"), default: true, callback: (e, b) => ({ ...readForm(b.form), save: !!b.form.elements.save.checked }) },
      ...(preset ? [{ action: "forget", icon: "fa-solid fa-trash", label: t("DeleteTpl"), callback: () => ({ deleteTemplate: preset.name }) }] : []),
      { action: "cancel", icon: "fa-solid fa-xmark", label: game.i18n.localize("VTM20.Gate.Cancel") }
    ],
    rejectClose: false
  }).then(r => (r && typeof r === "object" ? r : null));
}
