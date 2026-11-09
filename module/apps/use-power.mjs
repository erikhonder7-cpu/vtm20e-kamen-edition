// module/apps/use-power.mjs
// Сила без броска и без своей автоматики (чаще — Дисциплины кровных линий): вместо пустого окна броска —
// «Применить»: цена кровью и Волей из книги (её можно поправить — переменная цена решается за столом),
// списание и карточка в чат. Если бросок всё же нужен — кнопка «Бросок» открывает обычное окно.

const t = (k, d) => d ? game.i18n.format(`VTM20.Use.${k}`, d) : game.i18n.localize(`VTM20.Use.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/** Карточка цены: значок, подпись, − n + (скрытое поле name). */
const costCard = (name, icon, label, value, max, have) => `<div class="r-use-card" data-max="${max}">
  <i class="fa-solid ${icon} r-use-ico"></i>
  <span class="r-use-lbl">${esc(label)}<em>${esc(t("Have", { n: have }))}</em></span>
  <span class="r-bw-step"><button type="button" data-d="-1" aria-label="−"><i class="fa-solid fa-minus"></i></button><b>${value}</b><button type="button" data-d="1" aria-label="+"><i class="fa-solid fa-plus"></i></button>
  <input type="hidden" name="${name}" value="${value}"></span></div>`;

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
    position: { width: 440 },
    content: `<div class="r-use">
      <div class="r-use-head"><span class="r-use-kicker">${esc(subtitle)}</span><b class="r-use-name">${esc(p.name)}</b></div>
      <p class="r-use-note">${esc(r.note || t("NoRoll"))}</p>
      <div class="r-use-cost">
        ${costCard("b", "fa-droplet", t("Blood"), blood0, 30, actor.system.blood?.value ?? 0)}
        ${costCard("w", "fa-star", t("Will"), will0, 10, actor.system.willpower?.temporary ?? 0)}
      </div>
      <input class="r-use-say" type="text" name="n" placeholder="${esc(t("NoteHint"))}">
    </div>`,
    render: (ev, dlg) => {
      for (const b of dlg.element.querySelectorAll(".r-bw-step button")) b.addEventListener("click", () => {
        const card = b.closest(".r-use-card"), inp = card.querySelector("input");
        const v = Math.clamp((Number(inp.value) || 0) + Number(b.dataset.d), 0, Number(card.dataset.max));
        inp.value = v; card.querySelector(".r-bw-step b").textContent = v;
      });
    },
    buttons: [
      { action: "use", icon: "fa-solid fa-hand-sparkles", label: t("Go"), default: true,
        callback: (e, b) => ({ use: true, b: Math.max(0, Number(b.form.elements.b.value) || 0), w: Math.max(0, Number(b.form.elements.w.value) || 0), n: b.form.elements.n.value.trim() }) },
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
