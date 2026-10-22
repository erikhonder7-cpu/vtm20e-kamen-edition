// module/apps/damage.mjs
// «Получить урон»: число повреждений, тип, прочность с бронёй (04).

import { VTM20 } from "../config.mjs";
import { soakAndApply } from "../dice/roll.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

export async function openDamageDialog(actor) {
  const types = Object.entries(VTM20.damageTypes)
    .map(([k, d]) => `<option value="${k}">${game.i18n.localize(d.label)}</option>`).join("");
  const content = `
    <div class="r-form">
      <label class="r-field"><span>${t("DamageDlg.Amount")}</span><input type="number" name="amount" value="1" min="0" max="20"></label>
      <label class="r-field"><span>${t("DamageDlg.Type")}</span><select name="type">${types}</select></label>
      <label class="r-check"><input type="checkbox" name="soak" checked> ${t("DamageDlg.Soak")}</label>
      <label class="r-check"><input type="checkbox" name="fangs"> ${t("DamageDlg.Fangs")}</label>
      <p class="r-hint">${t("DamageDlg.Hint")}</p>
    </div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("DamageDlg.Title", { name: actor.name }), icon: "fa-solid fa-heart-crack" },
    classes: ["vtm20", "r-dialog"],
    content,
    ok: {
      label: t("DamageDlg.Apply"), icon: "fa-solid fa-burst",
      callback: (event, button) => {
        const f = new foundry.applications.ux.FormDataExtended(button.form).object;
        return { amount: Number(f.amount) || 0, type: f.type, soak: !!f.soak, fangs: !!f.fangs };
      }
    },
    rejectClose: false
  });
  if (!res || res.amount <= 0) return;
  return soakAndApply(actor, res.amount, res.type, { soak: res.soak, fangs: res.fangs });
}
