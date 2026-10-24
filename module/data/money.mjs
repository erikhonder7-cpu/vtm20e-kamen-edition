// module/data/money.mjs
// Деньги персонажа: монета (сумма в основной единице валюты) и, в 1789-м, ассигнаты.
//
// Ливр старого режима делится по-каролингски: 1 ливр = 20 су = 240 денье; сумма хранится
// в ливрах и округляется до денье, показывается «12 л. 8 с. 9 д.». Ассигнаты — бумага
// с номиналом в ливрах: держатся отдельно, а в монету переводятся по курсу, который
// задаёт рассказчик (настройка мира «Курс ассигната», % от номинала) — книги курса не дают.
// Валюта мира — настройка «Валюта»; «по эпохе» — ливры в 1789-м, доллары в наше время.

import { VTM20, SYSTEM_ID } from "../config.mjs";

const L = (k, d) => d ? game.i18n.format(`VTM20.Money.${k}`, d) : game.i18n.localize(`VTM20.Money.${k}`);

/** Валюта хроники: из настройки или по эпохе. */
export function worldCurrency() {
  const c = game.settings.get(SYSTEM_ID, "currency");
  if (VTM20.currencies[c]) return c;
  return game.settings.get(SYSTEM_ID, "era") === "revolution" ? "livre" : "dollar";
}

/** Валюта персонажа (своя или хроники). */
export const currencyOf = actor => {
  const c = actor?.system?.money?.currency;
  return VTM20.currencies[c] ? c : worldCurrency();
};

/** Курс ассигната: доля номинала, которую дают монетой (0…1). */
export const assignatRate = () => Math.clamp(Number(game.settings.get(SYSTEM_ID, "assignatRate")) || 0, 0, 100) / 100;

/** Округлить сумму до мельчайшей монеты валюты (денье, цент, копейка). */
export function roundMoney(amount, cur) {
  const step = VTM20.currencies[cur]?.lsd ? 240 : 100;
  return Math.round((Number(amount) || 0) * step) / step;
}

/** Ливры, су, денье из суммы в ливрах. */
export function toLsd(amount) {
  const total = Math.round((Number(amount) || 0) * 240);
  return { l: Math.floor(total / 240), s: Math.floor((total % 240) / 12), d: total % 12 };
}

/** Сумма с единицами: «12 л. 8 с. 9 д.», «$ 1 250». */
export function fmtMoney(amount, cur = worldCurrency()) {
  const c = VTM20.currencies[cur] ?? VTM20.currencies.dollar;
  const lang = game.i18n.lang;
  if (c.lsd) {
    const { l, s, d } = toLsd(amount);
    const parts = [l && `${l.toLocaleString(lang)} ${L("L")}`, s && `${s} ${L("S")}`, d && `${d} ${L("D")}`].filter(Boolean);
    return parts.length ? parts.join(" ") : `0 ${L("L")}`;
  }
  const n = Number(amount) || 0;
  return `${c.symbol} ${n.toLocaleString(lang, { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;
}

/** Хватает ли монеты (в валюте персонажа). */
export const canPay = (actor, amount) => (actor?.system?.money?.amount ?? 0) >= amount;

/**
 * Списать или начислить монету (delta < 0 — списание).
 * @returns {Promise<boolean>} false — не хватило
 */
export async function changeMoney(actor, delta, { force = false } = {}) {
  const m = actor?.system?.money;
  if (!m) return false;
  const next = roundMoney(m.amount + delta, currencyOf(actor));
  if (next < 0 && !force) return false;
  await actor.update({ "system.money.amount": Math.max(0, next) });
  return true;
}

/** Для листа: строка кошелька, ассигнаты и их цена монетой. */
export function moneyView(actor) {
  const m = actor.system.money, cur = currencyOf(actor);
  const lsd = !!VTM20.currencies[cur]?.lsd;
  const rate = assignatRate();
  return {
    text: fmtMoney(m.amount, cur), currency: cur, lsd,
    coins: lsd ? (({ l, s, d }) => [
      { n: l.toLocaleString(game.i18n.lang), unit: L("L"), metal: "gold" },
      { n: s, unit: L("S"), metal: "silver" },
      { n: d, unit: L("D"), metal: "copper" }
    ])(toLsd(m.amount)) : null,
    paper: lsd && m.paper > 0 ? fmtMoney(m.paper, cur) : "",
    paperCoin: lsd && m.paper > 0 ? fmtMoney(roundMoney(m.paper * rate, cur), cur) : "",
    rate: Math.round(rate * 100)
  };
}

/** Окно «Кошелёк»: прибавить, убавить, задать; обмен ассигнатов на монету по курсу. */
export async function openMoney(actor) {
  if (!actor?.system?.money) return;
  const m = actor.system.money, cur = currencyOf(actor);
  const lsd = !!VTM20.currencies[cur]?.lsd;
  const rate = assignatRate();
  const opts = Object.entries(VTM20.currencies)
    .map(([k, c]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${game.i18n.localize(c.label)}</option>`).join("");
  const view = moneyView(actor);
  // Сейчас в кошельке — монетами, как на листе (ливры, су, денье) или одной суммой
  const now = lsd
    ? `<div class="r-coins r-money-coins">${view.coins.map(c => `<span class="r-coin is-${c.metal}"><i></i><b>${c.n}</b> ${c.unit}</span>`).join("")}</div>`
    : `<div class="r-money-sum">${fmtMoney(m.amount, cur)}</div>`;
  const coinInput = (name, metal, unit) => `<label class="r-money-in is-${metal}"><i></i><input type="number" name="${name}" min="0" step="1" placeholder="0"><span>${unit}</span></label>`;
  const amountFields = lsd
    ? `<div class="r-money-lsd">${coinInput("l", "gold", L("Livres"))}${coinInput("s", "silver", L("Sous"))}${coinInput("d", "copper", L("Deniers"))}</div>`
    : `<label class="r-money-in is-gold is-wide"><i></i><input type="number" name="amount" min="0" step="any" placeholder="0"><span>${L("Amount")}</span></label>`;
  const ops = [["1", "fa-plus", L("Add")], ["-1", "fa-minus", L("Sub")], ["0", "fa-equals", L("Set")]]
    .map(([v, icon, label], k) => `<label class="r-tile is-flat r-money-op${k ? "" : " is-active"}"><input type="radio" name="op" value="${v}"${k ? "" : " checked"}><i class="fa-solid ${icon}"></i><span>${label}</span></label>`).join("");
  const paperFields = lsd ? `
      <details class="r-money-more"${m.paper > 0 ? " open" : ""}>
        <summary><i class="fa-solid fa-scroll"></i> ${L("Assignats")} <em>${L("RateNow", { rate: Math.round(rate * 100) })}</em>${m.paper > 0 ? `<b>${fmtMoney(m.paper, cur)}</b>` : ""}</summary>
        ${m.paper > 0 ? `<p class="r-money-note">≈ ${fmtMoney(roundMoney(m.paper * rate, cur), cur)} ${L("InCoin")}</p>` : ""}
        <label class="r-money-in is-paper is-wide"><i class="fa-solid fa-scroll"></i><input type="number" name="paper" min="0" step="1" placeholder="0"><span>${L("PaperShort")}</span></label>
        <label class="r-check"><input type="checkbox" name="exchange"><span>${L("Exchange")}</span></label>
      </details>` : "";
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `${L("Title")}: ${actor.name}`, icon: "fa-solid fa-coins" },
    classes: ["vtm20", "r-dialog", "r-money-dialog"],
    position: { width: 440 },
    content: `<div class="r-form r-money-form">
      <div class="r-money-purse"><span class="r-money-kicker">${L("Now")}</span>${now}</div>
      <div class="r-tiles r-money-ops" style="--cols: 3">${ops}</div>
      ${amountFields}
      ${paperFields}
      <details class="r-money-more">
        <summary><i class="fa-solid fa-sliders"></i> ${L("Currency")} <em>${game.i18n.localize(VTM20.currencies[cur]?.label ?? cur)}</em></summary>
        <select name="currency">${opts}</select>
      </details>
      <p class="r-hint">${L(lsd ? "HintLsd" : "Hint")}</p>
    </div>`,
    render: (ev, dlg) => {
      // плитки действия подсвечиваются по выбору
      const el = dlg.element;
      el.addEventListener("change", e => {
        if (e.target.name !== "op") return;
        el.querySelectorAll(".r-money-op").forEach(t => t.classList.toggle("is-active", t.querySelector("input").checked));
      });
      el.querySelector("input[type=number]")?.focus();
    },
    buttons: [
      { action: "apply", icon: "fa-solid fa-check", label: L("Apply"), default: true,
        callback: (e, b) => ({ op: Number(b.form.elements.op.value), ...read(b.form, lsd) }) }
    ],
    rejectClose: false
  });
  if (!res) return;
  const update = {};
  if (res.currency !== m.currency) update["system.money.currency"] = res.currency;
  let coin = m.amount, paper = m.paper ?? 0;
  if (Number.isFinite(res.amount)) coin = res.op === 0 ? res.amount : coin + res.op * res.amount;
  if (Number.isFinite(res.paper)) {
    if (res.exchange) {
      // Обмен у менялы: ассигнаты уходят, монета приходит по курсу
      paper -= res.paper;
      coin += res.paper * rate;
    } else paper = res.op === 0 ? res.paper : paper + res.op * res.paper;
  }
  if (coin < 0 || paper < 0) return ui.notifications.warn(L("NotEnough"));
  if (coin !== m.amount) update["system.money.amount"] = roundMoney(coin, res.currency);
  if (paper !== (m.paper ?? 0)) update["system.money.paper"] = Math.round(paper);
  if (Object.keys(update).length) await actor.update(update);
}

function read(form, lsd) {
  const n = name => { const v = form.elements[name]?.value; return v === "" || v == null ? NaN : Number(v); };
  const coin = lsd
    ? ([n("l"), n("s"), n("d")].every(Number.isNaN) ? NaN : (n("l") || 0) + (n("s") || 0) / 20 + (n("d") || 0) / 240)
    : n("amount");
  return { amount: coin, paper: n("paper"), exchange: !!form.elements.exchange?.checked, currency: form.elements.currency.value };
}
