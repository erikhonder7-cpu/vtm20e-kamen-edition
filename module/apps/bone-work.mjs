// module/apps/bone-work.mjs
// Искусство костей, «своя работа»: окно настройки — что вылепить, сложность, цена ранами, оружие, прочность.
// Книга задаёт лишь когти, шипы и удар; всё остальное — на усмотрение рассказчика, поэтому параметры открыты.

import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.TP.BoneC.${k}`, d) : game.i18n.localize(`VTM20.TP.BoneC.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const dmgLabel = k => game.i18n.localize(VTM20.damageTypes[k]?.label ?? k);

/** Плитки-переключатели одной группы. */
const tiles = (name, list, cur, cols) => `<div class="r-tiles r-bw-tiles" style="--cols: ${cols}">${list.map(([v, label, icon]) =>
  `<label class="r-tile is-flat r-bw-tile${String(v) === String(cur) ? " is-active" : ""}"><input type="radio" name="${name}" value="${v}"${String(v) === String(cur) ? " checked" : ""}>${icon ? `<i class="fa-solid ${icon}"></i>` : ""}<span>${esc(label)}</span></label>`).join("")}</div>`;

/** Прочитать настройки из формы. */
function readForm(form) {
  const f = form.elements, num = (k, d) => { const v = Number(f[k]?.value); return Number.isFinite(v) ? v : d; };
  const name = f.name.value.trim() || t("Default");
  const wtype = form.querySelector('[name="wtype"]:checked')?.value ?? "none";
  return {
    name, diff: Math.clamp(num("diff", 6), 2, 10), cost: Math.clamp(num("cost", 0), 0, 10), minus: !!f.minus.checked,
    soak: Math.clamp(num("soak", 0), 0, 5), note: f.note.value.trim(),
    weapon: wtype === "none" ? null : { name, kind: "brawl", damage: Math.clamp(num("wdmg", 1), -1, 5), strength: true, damageType: wtype, difficulty: 6 }
  };
}

/** Строка итога под формой. */
function summary(c) {
  const parts = [t("SumDiff", { n: c.diff })];
  parts.push(c.cost ? t(c.minus ? "SumCostMinus" : "SumCost", { n: c.cost }) : t("SumFree"));
  if (c.weapon) parts.push(t("SumWeapon", { n: c.weapon.damage >= 0 ? `+${c.weapon.damage}` : c.weapon.damage, type: dmgLabel(c.weapon.damageType) }));
  if (c.soak) parts.push(t("SumSoak", { n: c.soak }));
  return `<b>${esc(c.name)}</b> · ${parts.map(esc).join(" · ")}`;
}

/**
 * Окно «своя работа». who — кому лепим (для подписи).
 * @returns {Promise<{name, diff, cost, minus, soak, note, weapon}|null>}
 */
export async function boneWorkDialog(powerName, who, { preset = null } = {}) {
  // шаблон (сохранённая работа) — поля заполнены, можно поправить; его же можно удалить
  const P = preset ?? {}, w = P.weapon ?? null;
  const cost0 = Math.clamp(Number(P.cost) || 0, 0, 10);
  const dots = Array.from({ length: 10 }, (_, i) => `<span class="r-dot r-bw-dot" data-n="${i + 1}"></span>`).join("");
  const content = `<div class="r-form r-bw-form">
    <div class="r-bw-head">
      <span class="r-bw-kicker"><i class="fa-solid fa-bone"></i> ${esc(powerName)} · ${esc(t(preset ? "KickerTpl" : "Kicker"))}</span>
      <input class="r-bw-name" type="text" name="name" value="${esc(P.name ?? "")}" placeholder="${esc(t("NameHint"))}" autofocus>
      <span class="r-bw-who">→ ${esc(who.name)}</span>
    </div>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Diff"))}<em>${esc(t("DiffHint"))}</em></h4>
      ${tiles("diff", [5, 6, 7, 8, 9].map(n => [n, String(n)]), P.diff ?? 6, 5)}
      <div class="r-bw-scale"><span>${esc(t("Crude"))}</span><span>${esc(t("Fine"))}</span></div>
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Cost"))}<em class="r-bw-costn">${esc(t("CostNone"))}</em></h4>
      <div class="r-bw-dots"><span class="r-dots is-ten">${dots}</span><input type="hidden" name="cost" value="${cost0}"></div>
      <label class="r-check"><input type="checkbox" name="minus"${P.minus ? " checked" : ""}><span>${esc(t("Minus"))}</span></label>
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Weapon"))}</h4>
      ${tiles("wtype", [["none", t("NoWeapon"), "fa-ban"], ["bashing", dmgLabel("bashing"), "fa-hand-fist"], ["lethal", dmgLabel("lethal"), "fa-bone"], ["aggravated", dmgLabel("aggravated"), "fa-skull"]], w?.damageType ?? "none", 4)}
      <div class="r-bw-wdmg is-off">
        <span class="r-bw-sub">${esc(t("WDmg"))}</span>
        ${tiles("wdmg", [0, 1, 2, 3, 4].map(n => [n, `+${n}`]), w?.damage ?? 1, 5)}
      </div>
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Soak"))}<em>${esc(t("SoakHint"))}</em></h4>
      ${tiles("soak", [0, 1, 2, 3].map(n => [n, n ? `+${n}` : "—"]), P.soak ?? 0, 4)}
    </section>
    <section class="r-bw-sec">
      <h4 class="r-bw-cap">${esc(t("Note"))}</h4>
      <textarea name="note" rows="2" placeholder="${esc(t("NoteHint"))}">${esc(P.note ?? "")}</textarea>
    </section>
    <div class="r-bw-sum"></div>
    <label class="r-check r-bw-save"><input type="checkbox" name="save"${preset ? " checked" : ""}><i class="fa-solid fa-bookmark"></i><span>${esc(t(preset ? "SaveTplUpdate" : "SaveTpl"))}</span></label>
  </div>`;
  return foundry.applications.api.DialogV2.wait({
    window: { title: `${powerName} · ${t("Kicker")}`, icon: "fa-solid fa-bone" },
    classes: ["vtm20", "r-dialog", "r-bw-dialog"],
    position: { width: preset ? 540 : 480 },
    content,
    render: (ev, dlg) => {
      const el = dlg.element, form = el.querySelector("form") ?? el;
      const sync = () => {
        for (const tl of el.querySelectorAll(".r-bw-tile")) tl.classList.toggle("is-active", tl.querySelector("input").checked);
        const cost = Number(el.querySelector('[name="cost"]').value) || 0;
        el.querySelectorAll(".r-bw-dot").forEach(d => d.classList.toggle("is-filled", Number(d.dataset.n) <= cost));
        el.querySelector(".r-bw-costn").textContent = cost ? t("CostN", { n: cost }) : t("CostNone");
        el.querySelector(".r-bw-wdmg").classList.toggle("is-off", (el.querySelector('[name="wtype"]:checked')?.value ?? "none") === "none");
        el.querySelector(".r-bw-sum").innerHTML = summary(readForm(form));
      };
      // капли цены: клик — столько ран; по той же — ноль
      el.querySelectorAll(".r-bw-dot").forEach(d => d.addEventListener("click", () => {
        const inp = el.querySelector('[name="cost"]'), n = Number(d.dataset.n);
        inp.value = Number(inp.value) === n ? 0 : n; sync();
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
