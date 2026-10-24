// module/ui/pause.mjs
// Пауза «Капля» вместо стандартной: из темноты стекает нить крови, капля срывается,
// падает и замирает в воздухе — вместе с ней выцветает мир. Снятие паузы: капля
// долетает до лужи, брызги и круги, мир снова окрашивается. Ночь, час и время
// до рассвета — из ночных часов системы.

import { SYSTEM_ID } from "../config.mjs";
import { getClock, getDate, hhmm, nightNumber, nightPhase } from "../apps/calendar.mjs";

const ID = "r-pause";
const t = k => game.i18n.localize(`VTM20.Pause.${k}`);
const OUT_MS = 2100;   // длительность снятия паузы, см. r-pause.css
let leaving = null;
let ticker = null;

const enabled = () => game.settings.get(SYSTEM_ID, "pauseLook") === "drop";

const ROMAN = n => {
  const m = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let o = ""; for (const [v, r] of m) while (n >= v) { o += r; n -= v; } return o;
};

const DROP = `<svg viewBox="0 0 64 92" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="rp-dg" cx="38%" cy="62%" r="62%"><stop offset="0" stop-color="#d42a35"/><stop offset=".5" stop-color="#8a0d16"/><stop offset="1" stop-color="#2c0306"/></radialGradient>
<linearGradient id="rp-dr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ff6a72" stop-opacity=".55"/><stop offset=".25" stop-color="#ff6a72" stop-opacity="0"/></linearGradient>
<filter id="rp-db"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
<path d="M32 1 C32 1 5 42 5 62 A27 27 0 0 0 59 62 C59 42 32 1 32 1 Z" fill="url(#rp-dg)"/>
<path d="M32 1 C32 1 5 42 5 62 A27 27 0 0 0 59 62 C59 42 32 1 32 1 Z" fill="url(#rp-dr)"/>
<path d="M17 52 C18 44 23 36 27 30" stroke="#fff" stroke-opacity=".55" stroke-width="3.2" stroke-linecap="round" fill="none" filter="url(#rp-db)"/>
<ellipse cx="21" cy="67" rx="3.2" ry="5" fill="#fff" opacity=".18" filter="url(#rp-db)"/></svg>`;

function poolSvg() {
  const cx = 310, cy = 70;
  const rings = [[240, .2, .7], [188, .32, .9], [140, .46, 1.1], [98, .62, 1.3]].map(([rx, op, sw], i) =>
    `<ellipse class="rp-ring rp-ring${i}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${(rx * .17).toFixed(1)}" fill="none" stroke="#c4474c" stroke-opacity="${op}" stroke-width="${sw}"/>`).join("");
  return `<svg viewBox="0 0 620 140" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="rp-pg" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#6e0a12"/><stop offset=".7" stop-color="#2a0306"/><stop offset="1" stop-color="#120103" stop-opacity="0"/></radialGradient>
<radialGradient id="rp-pgl" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#b83a3f" stop-opacity=".35"/><stop offset="1" stop-color="#b83a3f" stop-opacity="0"/></radialGradient>
<filter id="rp-pb"><feGaussianBlur stdDeviation="3"/></filter></defs>
<ellipse class="rp-glow" cx="${cx}" cy="${cy}" rx="290" ry="56" fill="url(#rp-pgl)"/>${rings}
<ellipse cx="${cx}" cy="${cy}" rx="66" ry="11.5" fill="url(#rp-pg)"/>
<path d="M${cx - 40} ${cy - 4} Q${cx} ${cy - 10} ${cx + 34} ${cy - 5}" stroke="#ff8a90" stroke-opacity=".35" stroke-width="1.1" fill="none" filter="url(#rp-pb)"/>
<ellipse class="rp-refl" cx="${cx}" cy="${cy + 2}" rx="6" ry="16" fill="#d42a35" opacity=".22" filter="url(#rp-pb)"/></svg>`;
}

const ANKH = `<svg viewBox="0 0 20 30" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" fill-rule="evenodd" d="M10 2 C5.5 2 4 6 4 8.5 C4 11.5 7 13.5 8.4 14.2 L2 14.2 L2 16.6 L8.6 16.6 L8.6 28 L11.4 28 L11.4 16.6 L18 16.6 L18 14.2 L11.6 14.2 C13 13.5 16 11.5 16 8.5 C16 6 14.5 2 10 2 Z M10 4.6 C12.3 4.6 13.2 6.6 13.2 8.4 C13.2 10.6 11.4 12.2 10 13 C8.6 12.2 6.8 10.6 6.8 8.4 C6.8 6.6 7.7 4.6 10 4.6 Z"/></svg>`;

/** Брызги: угол разлёта и высота каждой капельки. */
const SPLASH = [[-92, 64, 11], [-62, 98, 8], [-28, 124, 9], [8, 136, 6], [36, 118, 9], [68, 92, 8], [98, 60, 11], [-128, 30, 6], [132, 34, 6], [-14, 70, 5], [22, 78, 5]]
  .map(([dx, dy, r], i) => `<i style="--dx:${dx}px;--dy:${-dy}px;--r:${r}px;--d:${(i % 3) * 30}ms"></i>`).join("");

function meta() {
  const ms = getClock();
  const until = nightPhase(ms).untilLabel.replace(/(\S+)$/, "<b>$1</b>");
  return `${t("Night")} ${ROMAN(Math.max(1, nightNumber(ms)))}<s>✦</s>${hhmm(getDate())}<s>✦</s><span class="rp-moon"></span>${until}`;
}

/** Композиция — по центру экрана, а при раскрытой боковой панели — по центру поля слева от неё;
 *  на низких экранах — уменьшенная. */
function fit(el) {
  const sb = document.getElementById("sidebar");
  const r = ui.sidebar?.expanded && sb ? Math.max(0, window.innerWidth - sb.getBoundingClientRect().left) : 0;
  el.style.setProperty("--rp-right", `${r}px`);
  el.style.setProperty("--rp-s", Math.min(1, window.innerHeight / 860).toFixed(3));
}

function build() {
  const el = document.createElement("div");
  el.id = ID;
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `<div class="rp-veil"></div><div class="rp-wave"></div>
<div class="rp-stage">
  <div class="rp-stream"></div>
  <div class="rp-neck"></div><div class="rp-bead"></div>
  <div class="rp-drop"><div class="rp-hang">${DROP}</div></div>
  <div class="rp-pool">${poolSvg()}<div class="rp-splash">${SPLASH}<b></b></div></div>
  <div class="rp-shock"></div>
  <div class="rp-sep"><i></i>${ANKH}<i></i></div>
  <h1 class="rp-title">${t("Title")}</h1>
  <p class="rp-lead">${t("Lead")}</p>
  <div class="rp-meta">${meta()}</div>
</div>
<div class="rp-foot">${t("Foot")}</div>`;
  fit(el);
  return el;
}

function show() {
  if (!enabled()) return;
  clearTimeout(leaving); leaving = null;
  document.getElementById(ID)?.remove();
  const el = build();
  document.body.appendChild(el);
  clearInterval(ticker);
  ticker = setInterval(() => { const m = el.querySelector(".rp-meta"); if (m) m.innerHTML = meta(); }, 20000);
}

function release() {
  const el = document.getElementById(ID);
  clearInterval(ticker); ticker = null;
  if (!el || el.classList.contains("rp-out")) return;
  el.classList.add("rp-out");
  setTimeout(drip, 430);
  leaving = setTimeout(() => { el.remove(); leaving = null; }, OUT_MS);
}

/** Звук падения капли — синтез, без файлов; громкость — «Интерфейс» в настройках звука. */
function drip() {
  try {
    const vol = Number(game.settings.get("core", "globalInterfaceVolume") ?? .5);
    if (!vol) return;
    const ac = game.audio?.interface?.context ?? new AudioContext();
    const now = ac.currentTime;
    const g = ac.createGain();
    g.connect(ac.destination);
    g.gain.setValueAtTime(.0001, now);
    g.gain.exponentialRampToValueAtTime(.32 * vol, now + .006);
    g.gain.exponentialRampToValueAtTime(.0001, now + .16);
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(380, now);
    o.frequency.exponentialRampToValueAtTime(1500, now + .07);
    o.connect(g); o.start(now); o.stop(now + .18);
    const g2 = ac.createGain();
    g2.connect(ac.destination);
    g2.gain.setValueAtTime(.18 * vol, now);
    g2.gain.exponentialRampToValueAtTime(.0001, now + .22);
    const o2 = ac.createOscillator();
    o2.frequency.setValueAtTime(140, now);
    o2.frequency.exponentialRampToValueAtTime(60, now + .2);
    o2.connect(g2); o2.start(now); o2.stop(now + .24);
  } catch (e) { /* без звука — не беда */ }
}

function applyLook() {
  document.body.classList.toggle("r-pause-drop", enabled());
  if (enabled() && game.paused) show();
  else document.getElementById(ID)?.remove();
}

export function registerPause() {
  game.settings.register(SYSTEM_ID, "pauseLook", {
    name: "VTM20.Settings.PauseLook.Name", hint: "VTM20.Settings.PauseLook.Hint",
    scope: "client", config: true, type: String, default: "drop",
    choices: { drop: "VTM20.Settings.PauseLook.drop", core: "VTM20.Settings.PauseLook.core" },
    onChange: () => applyLook()
  });
  Hooks.once("ready", () => applyLook());
  Hooks.on("pauseGame", paused => {
    if (!enabled()) return;
    if (paused) show(); else release();
  });
  window.addEventListener("resize", () => { const el = document.getElementById(ID); if (el) fit(el); });
  Hooks.on("collapseSidebar", () => setTimeout(() => { const el = document.getElementById(ID); if (el) fit(el); }, 260));
}
