// module/apps/income.mjs
// Доход от Богатства и кровь от Стада (правило системы — в V20 сумма дохода «согласуется с рассказчиком»).
//   · Богатство: раз в месяц хроники (сменился месяц на часах календаря) персонажи игроков с точками «Богатства»
//     получают доход в своей валюте; одна карточка на всех. Суммы по точкам — настройка мира «Доход от Богатства»
//     (пять чисел через «/» в валюте хроники); пусто — по умолчанию: доллары Revised ($500 … $30 000),
//     ливры 1789-го — оценка системы (подмастерье — около ливра в день).
//   · Стадо: с наступлением ночи (кнопка «Ночь») — столько крови, сколько точек Стада, до предела запаса.
//     Отдельная галочка: без неё Стадо, как в книге, только прибавляет кубы к охоте.
// Месяц, за который уже заплачено, — скрытая настройка incomePaid; первый запуск только запоминает месяц.

import { SYSTEM_ID } from "../config.mjs";
import { getClock, ymd } from "./calendar.mjs";
import { currencyOf, worldCurrency, changeMoney, fmtMoney, roundMoney } from "../data/money.mjs";
import { poolValue } from "./coterie.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Доход в месяц по точкам 1–5, по валютам. */
const DEFAULTS = {
  dollar: [500, 1200, 3000, 9000, 30000], euro: [500, 1200, 3000, 9000, 30000], pound: [400, 1000, 2500, 7500, 25000],
  rouble: [40000, 100000, 250000, 750000, 2500000], livre: [25, 100, 400, 1500, 6000]
};

/** Точки факта биографии по одному из имён (без регистра): «Богатство» в старых листах бывало «Ресурсами». */
export const bgDots = (actor, ...names) => actor.items.find(i => i.type === "background" && names.includes(i.name.toLowerCase()))?.system.value ?? 0;

/** Доход за месяц при этих точках «Богатства» в этой валюте. */
export function incomeFor(dots, cur) {
  const n = Math.clamp(Number(dots) || 0, 0, 5);
  if (!n) return 0;
  if (cur === worldCurrency()) {
    const own = String(game.settings.get(SYSTEM_ID, "incomeTable") ?? "").split("/").map(x => Number(x.replace(/[^\d.]/g, "")));
    if (own.length === 5 && own.every(x => x >= 0)) return own[n - 1];
  }
  return (DEFAULTS[cur] ?? DEFAULTS.dollar)[n - 1];
}

/** Месяцев между «ГГГГ-ММ» a и b. */
const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

let busy = false;

/** Сменился месяц хроники — выплатить доход (пишет один активный ведущий; с шага часов и после промотки). */
export async function checkIncome(now = getClock()) {
  if (busy || !game.users.activeGM?.isSelf || !game.settings.get(SYSTEM_ID, "monthlyIncome")) return;
  const month = ymd(new Date(now)).slice(0, 7), paid = game.settings.get(SYSTEM_ID, "incomePaid");
  if (paid === month) return;
  busy = true;
  try {
    await game.settings.set(SYSTEM_ID, "incomePaid", month);
    const months = paid ? monthsBetween(paid, month) : 0;
    if (months <= 0) return;                       // первый запуск или часы отмотаны назад — только запомнить месяц
    const lines = [];
    for (const a of game.actors.filter(x => x.hasPlayerOwner && x.system.money)) {
      const cur = currencyOf(a), sum = incomeFor(bgDots(a, "богатство", "ресурсы", "resources"), cur) * months;
      if (!sum) continue;
      await changeMoney(a, sum);
      lines.push(`<li><b>${esc(a.name)}</b>: +${esc(fmtMoney(sum, cur))}</li>`);
    }
    // общее Богатство котерии (apps/coterie.mjs) — доход поровну между участниками; выше 5 — надёжность, а не размах
    for (const c of game.settings.get(SYSTEM_ID, "coteries") ?? []) {
      const dots = "Богатство" in (c.pools ?? {}) ? poolValue(c, "Богатство") : 0;
      const members = (c.members ?? []).map(id => game.actors.get(id)).filter(a => a?.system.money);
      if (!dots || !members.length) continue;
      const cur = worldCurrency(), each = roundMoney(incomeFor(Math.min(5, dots), cur) * months / members.length, cur);
      for (const a of members) await changeMoney(a, each);
      lines.push(`<li>${t("Income.Coterie", { name: esc(c.name), sum: esc(fmtMoney(each, cur)), n: members.length })}</li>`);
    }
    if (lines.length) await ChatMessage.create({ speaker: { alias: t("Income.Title") },
      content: `<div class="r-notice"><i class="fa-solid fa-coins"></i> <b>${t(months > 1 ? "Income.Months" : "Income.Month", { n: months })}</b><ul>${lines.join("")}</ul></div>` });
  } finally { busy = false; }
}

/** Кровь от Стада для сводки ночи: строки или пусто. Вызывается из nightfall после пробуждения. */
export async function herdBlood(actor) {
  if (!game.settings.get(SYSTEM_ID, "herdNightly") || !actor.isVampire) return "";
  if (actor.statuses?.has("r-torpor") || actor.statuses?.has("dead")) return "";
  const herd = bgDots(actor, "стадо", "herd"), b = actor.system.blood;
  const got = Math.min(herd, Math.max(0, b.max - b.value));
  if (!got) return "";
  await actor.update({ "system.blood.value": b.value + got });
  return t("Income.Herd", { n: got });
}

export function registerIncome() {
  game.settings.register(SYSTEM_ID, "monthlyIncome", {
    name: "VTM20.Settings.MonthlyIncome.Name", hint: "VTM20.Settings.MonthlyIncome.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "incomeTable", {
    name: "VTM20.Settings.IncomeTable.Name", hint: "VTM20.Settings.IncomeTable.Hint",
    scope: "world", config: true, type: String, default: ""
  });
  game.settings.register(SYSTEM_ID, "herdNightly", {
    name: "VTM20.Settings.HerdNightly.Name", hint: "VTM20.Settings.HerdNightly.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "incomePaid", { scope: "world", config: false, type: String, default: "" });
  // промотка часов — доход сразу, не дожидаясь шага часов
  Hooks.on("updateSetting", s => { if (s.key === `${SYSTEM_ID}.clock`) checkIncome(); });
}
