// module/apps/use-power.mjs
// Сила без броска и без своей автоматики (чаще — Дисциплины кровных линий): вместо пустого окна броска —
// «Применить»: цена кровью и Волей из книги (её можно поправить — переменная цена решается за столом),
// списание и карточка в чат. Если бросок всё же нужен — кнопка «Бросок» открывает обычное окно.

const t = (k, d) => d ? game.i18n.format(`VTM20.Use.${k}`, d) : game.i18n.localize(`VTM20.Use.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/**
 * @param {Actor} actor
 * @param {object} p        сила из справочника (name, roll, html)
 * @param {string} subtitle «Дисциплина · уровень»
 * @param {Function} roll   открыть обычное окно броска
 */
export async function usePower(actor, p, subtitle, roll) {
  const r = p.roll ?? {};
  const blood0 = Number(r.blood) || 0, will0 = r.willpower ? (Number(r.willpower) > 1 ? Number(r.willpower) : 1) : 0;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: p.name, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog", "r-use-dialog"],
    position: { width: 420 },
    content: `<div class="r-form">
      <p class="r-use-sub">${esc(subtitle)}</p>
      ${r.note ? `<p class="r-hint">${esc(r.note)}</p>` : `<p class="r-hint">${esc(t("NoRoll"))}</p>`}
      <div class="r-use-cost">
        <label class="r-field"><span><i class="fa-solid fa-droplet"></i> ${esc(t("Blood"))}</span><input type="number" name="b" value="${blood0}" min="0" max="30"></label>
        <label class="r-field"><span><i class="fa-solid fa-star"></i> ${esc(t("Will"))}</span><input type="number" name="w" value="${will0}" min="0" max="10"></label>
      </div>
      <label class="r-field"><span>${esc(t("Note"))}</span><input type="text" name="n" placeholder="${esc(t("NoteHint"))}"></label>
    </div>`,
    buttons: [
      { action: "use", icon: "fa-solid fa-hand-sparkles", label: t("Go"), default: true,
        callback: (e, b) => ({ use: true, b: Math.max(0, Math.round(Number(b.form.elements.b.value) || 0)), w: Math.max(0, Math.round(Number(b.form.elements.w.value) || 0)), n: b.form.elements.n.value.trim() }) },
      { action: "roll", icon: "fa-solid fa-dice-d10", label: t("Roll"), callback: () => ({ roll: true }) }
    ],
    rejectClose: false
  });
  if (!choice) return null;
  if (choice.roll) return roll();
  // сперва проверить, что хватит того и другого, потом списать
  if (choice.w && (actor.system.willpower?.temporary ?? 0) < choice.w) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  if (choice.b && (actor.system.blood?.value ?? 0) < choice.b) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
  if (choice.w && !(await actor.spendWillpower(choice.w))) return null;
  if (choice.b && !(await actor.spendBlood(choice.b, { reason: p.name }))) return null;
  const price = [choice.b && `<i class="fa-solid fa-droplet"></i>${choice.b}`, choice.w && `<i class="fa-solid fa-star"></i>${choice.w}`].filter(Boolean).join(" ");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-hand-sparkles"></i> <b>${esc(p.name)}</b> <span class="r-muted">${esc(subtitle)}</span>${price ? ` · ${price}` : ""}${choice.n ? `<br>${esc(choice.n)}` : ""}</div>` });
}
