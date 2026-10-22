// module/apps/calendar.mjs
// Ночные часы: внутриигровое время хроники (порт из mass-effect, переведён на
// ApplicationV2 и переосмыслен под вампиров).
//
// КАК ИДУТ ЧАСЫ. В настройке лежит не «сколько сейчас», а ЯКОРЬ:
//   { base — игровое время в точке отсчёта, since — реальное время той же точки,
//     running — идут ли часы, rate — скорость (игровых мс за реальную),
//     until/after/steady — плавная промотка: до игрового момента until часы бегут со скоростью rate,
//     дальше — со скоростью after (0 — встать, если до промотки часы стояли); steady — обычная скорость }
// Текущее время считается от якоря на лету: в базу не пишется каждую секунду,
// все видят одно время без синхронизации, а пауза и промотка — перенос якоря.
//
// ЧТО ВАЖНО ВАМПИРУ. Не дата сама по себе, а сколько осталось до рассвета:
// закат и восход считаются по широте города хроники (упрощённая формула NOAA),
// фаза луны — от известного новолуния. Ночи хроники нумеруются от её начала.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const MS_MIN = 60000;
export const MS_HOUR = 3600000;
export const MS_DAY = 86400000;

/** Начало хроники по умолчанию: Париж, 14 июля 1789 года, 21:00 — ночь после взятия Бастилии. */
export const DEFAULT_CLOCK = new Date(1789, 6, 14, 21, 0).getTime();

const L = k => game.i18n.localize(`VTM20.Calendar.${k}`);
const pad = n => String(n).padStart(2, "0");

/* ── Часы ──────────────────────────────────────────────────────────────── */

/**
 * Общие для всех клиентов реальные часы. Системные часы компьютеров расходятся на секунды, а при
 * плавной промотке секунда реального времени — это минуты игры: фишки на карте города у игроков
 * разъезжались бы. Поэтому якорь хранит две отметки: `srv` — по часам сервера Foundry
 * (game.time.serverTime, общие для всех, но это время работы сервера, оно обнуляется при его
 * перезапуске) и `since` — по дате компьютера ведущего (запасной путь после перезапуска сервера
 * и для старых якорей).
 */
const serverNow = () => { const t = game.time?.serverTime; return Number.isFinite(t) ? t : null; };
export const realStamp = () => ({ since: Date.now(), srv: serverNow() });

/**
 * Сколько реальных мс прошло от отметки якоря. Если сервер с тех пор перезапускался (его часы
 * меньше отметки), простой не считается: часы идут с момента запуска, а не «прожили» дни,
 * пока сервер был выключен. Ведущий раз в несколько минут обновляет отметку (`clockCheckpoint`),
 * так что при перезапуске теряется не больше пары минут игрового хода.
 */
function elapsed(a) {
  const s = serverNow();
  if (s !== null && Number.isFinite(a.srv)) return a.srv <= s + 5000 ? s - a.srv : s;
  return Date.now() - a.since;                            // старые якоря без отметки сервера
}

/** Перезапускался ли сервер после последней отметки якоря. */
export function clockRestarted() {
  const a = clockAnchor(), s = serverNow();
  return a.running && s !== null && Number.isFinite(a.srv) && a.srv > s + 5000;
}

/**
 * Контрольная точка для ведущего: переякорить идущие часы на то же игровое время (без промотки
 * ничего не меняется), чтобы отметка сервера была свежей. Во время плавной промотки — не трогаем.
 */
export async function clockCheckpoint({ force = false } = {}) {
  if (game.user !== game.users.activeGM) return;
  const a = clockAnchor(), s = serverNow();
  if (!a.running || s === null || clockGliding()) return;
  if (!force && Number.isFinite(a.srv) && a.srv <= s + 5000 && s - a.srv < 4 * MS_MIN) return;
  await setClock(getClock(), true, a.steady);
}

/** Реальное «сейчас» в той же шкале, что и отметки: для сравнения свежести (пинги и т. п.). */
export const realNow = () => serverNow() ?? Date.now();

function clockAnchor() {
  const v = game.settings.get(SYSTEM_ID, "clock");
  const base = Number(v?.base);
  const rate = Number(v?.rate) > 0 ? Number(v.rate) : 1;
  return {
    base: Number.isFinite(base) && base ? base : DEFAULT_CLOCK,
    since: Number(v?.since) || 0,
    srv: v?.srv === undefined || v?.srv === null ? NaN : Number(v.srv),
    running: !!v?.running,
    rate, until: Number(v?.until) || 0,
    after: Number.isFinite(Number(v?.after)) && v?.after !== undefined ? Number(v.after) : rate,
    steady: Number(v?.steady) > 0 ? Number(v.steady) : rate
  };
}

export function getClock() {
  const a = clockAnchor();
  if (!a.running || !a.since) return a.base;
  const real = elapsed(a);
  if (a.until > a.base) {
    const reach = (a.until - a.base) / a.rate;          // сколько реальных мс до конца промотки
    if (real >= reach) return a.until + (real - reach) * a.after;
  }
  return a.base + real * a.rate;
}
/** Идут ли часы (после плавной промотки с паузы — уже нет). */
export function clockRunning() {
  const a = clockAnchor();
  if (!a.running) return false;
  return !(a.until && !a.after && getClock() >= a.until);
}
/** Обычная скорость хода (без учёта идущей плавной промотки). */
export const clockRate = () => clockAnchor().steady;
/** Идёт ли сейчас плавная промотка — до какого момента. */
export function clockGliding() {
  const a = clockAnchor();
  return a.running && a.until > getClock() ? a.until : 0;
}
export function getDate() { return new Date(getClock()); }

export async function setClock(ms, running = clockRunning(), rate = clockRate()) {
  if (!game.user?.isGM) return;
  await game.settings.set(SYSTEM_ID, "clock", { base: ms, ...realStamp(), running, rate });
}
export async function advanceClock(ms) { await setClock(getClock() + ms); }
export async function setClockRunning(on) { await setClock(getClock(), !!on); }
export async function setClockRate(rate) { await setClock(getClock(), clockRunning(), rate); }

/** Длительность плавной промотки в реальных секундах: чем дальше, тем дольше, но не дольше 20 с. */
export const glideSeconds = ms => Math.clamp(Math.sqrt(Math.max(ms, 0) / MS_MIN) * 1.6, 3, 20);

/**
 * Плавно промотать время до игрового момента target: часы разгоняются, всё, что от них зависит
 * (фишки на карте города), движется на глазах; в target скорость сама возвращается к обычной.
 */
export async function glideTo(target, seconds = glideSeconds(target - getClock())) {
  if (!game.user?.isGM) return;
  const now = getClock();
  if (target <= now) return setClock(target);
  const steady = clockRate();
  await game.settings.set(SYSTEM_ID, "clock", {
    base: now, ...realStamp(), running: true, rate: (target - now) / (seconds * 1000),
    until: target, after: clockRunning() ? steady : 0, steady
  });
}

/** Сердцебиение для ГМа: раз в 10 секунд сообщает, сколько игровых минут прошло. */
let _beat = null, _beatAt = null;
export function startNightClock(onTick) {
  if (!game.user?.isGM || _beat) return;
  // Сервер перезапустился — сразу переякорить часы на текущее время (см. elapsed).
  if (clockRestarted()) clockCheckpoint({ force: true });
  _beatAt = getClock();
  _beat = setInterval(() => {
    clockCheckpoint();
    const now = getClock();
    const passed = now - _beatAt;
    let mins = 0;
    if (passed < 0) _beatAt = now;
    else if (passed >= MS_MIN) { mins = Math.floor(passed / MS_MIN); _beatAt += mins * MS_MIN; }
    onTick(mins);
  }, 10000);
}

/* ── Форматирование ────────────────────────────────────────────────────── */

export function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function hhmm(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function longDate(d) {
  return d.toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long", year: "numeric" });
}
export function shortDate(d) {
  return d.toLocaleDateString(game.i18n.lang, { day: "numeric", month: "short" });
}
export function weekday(d) { return d.toLocaleDateString(game.i18n.lang, { weekday: "long" }); }
export function stamp(ms = getClock()) { const d = new Date(ms); return `${longDate(d)} · ${hhmm(d)}`; }

/* ── Республиканский календарь ─────────────────────────────────────────── */
// Год I начался 22 сентября 1792 г. (день осеннего равноденствия). Для лет I–XIV —
// исторические даты начала года; дальше — правило «22 сентября». Двенадцать месяцев
// по 30 дней и 5–6 дополнительных дней — санкюлотиды. До 22.09.1792 Республики нет:
// с 14 июля 1789 года считается «год Свободы».

const REP_MONTHS = ["вандемьера", "брюмера", "фримера", "нивоза", "плювиоза", "вантоза",
  "жерминаля", "флореаля", "прериаля", "мессидора", "термидора", "фрюктидора"];
const REP_START_DAY = { 1: 22, 2: 22, 3: 22, 4: 23, 5: 22, 6: 22, 7: 22, 8: 23, 9: 23, 10: 23, 11: 23, 12: 24, 13: 23, 14: 23 };
const ROMAN = n => { const m = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let o = ""; for (const [v, r] of m) while (n >= v) { o += r; n -= v; } return o; };

function republicYearStart(year) {                 // year — номер республиканского года
  const day = REP_START_DAY[year] ?? 22;
  return new Date(1791 + year, 8, day).getTime();
}

/** «28 вандемьера II года», «санкюлотида V года»; до Республики — «I год Свободы». */
export function republicanDate(ms = getClock()) {
  const d = new Date(ms);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (dayStart < republicYearStart(1)) {
    const liberty = new Date(1789, 6, 14).getTime();
    if (dayStart < liberty) return "";
    const y = d.getFullYear() - 1788 - (d < new Date(d.getFullYear(), 6, 14) ? 1 : 0);
    return game.i18n.format("VTM20.Calendar.LibertyYear", { year: ROMAN(Math.max(1, y)) });
  }
  let year = 1;
  while (republicYearStart(year + 1) <= dayStart) year++;
  const day = Math.round((dayStart - republicYearStart(year)) / MS_DAY);   // 0…365
  if (day >= 360) return game.i18n.format("VTM20.Calendar.Sansculottide", { n: day - 359, year: ROMAN(year) });
  return `${day % 30 + 1} ${REP_MONTHS[Math.floor(day / 30)]} ${ROMAN(year)} ${game.i18n.localize("VTM20.Calendar.YearWord")}`;
}

/* ── Солнце ────────────────────────────────────────────────────────────── */
// Упрощённый расчёт NOAA: точность в несколько минут — для игры достаточно.
// Широта берётся из настройки «Широта города хроники».

/** Долгота и часовой пояс города: солнечный полдень сдвигается на 4 минуты за градус. */
function noonShift() {
  const lon = Number(game.settings.get(SYSTEM_ID, "longitude"));
  const tz = Number(game.settings.get(SYSTEM_ID, "utcOffset"));
  return Number.isFinite(lon) && Number.isFinite(tz) ? (tz * 15 - lon) * 4 : 0;
}

function latitude() {
  const v = Number(game.settings.get(SYSTEM_ID, "latitude"));
  return Number.isFinite(v) ? Math.clamp(v, -66, 66) : 48.86;
}
const RAD = Math.PI / 180;

/**
 * Восход и закат для суток, содержащих `ms` (местное время).
 * @returns {{sunrise:number, sunset:number}} миллисекунды
 */
export function sunTimes(ms = getClock()) {
  const d = new Date(ms);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const doy = Math.floor((dayStart - new Date(d.getFullYear(), 0, 1).getTime()) / MS_DAY) + 1;
  const lat = latitude();
  const decl = 23.44 * Math.sin(RAD * (360 / 365) * (doy - 81));        // склонение
  const eot = 9.87 * Math.sin(2 * RAD * (360 / 365) * (doy - 81))       // уравнение времени, мин
    - 7.53 * Math.cos(RAD * (360 / 365) * (doy - 81)) - 1.5 * Math.sin(RAD * (360 / 365) * (doy - 81));
  const cosH = (Math.cos(RAD * 90.833) - Math.sin(RAD * lat) * Math.sin(RAD * decl)) / (Math.cos(RAD * lat) * Math.cos(RAD * decl));
  const H = Math.acos(Math.clamp(cosH, -1, 1)) / RAD;                    // часовой угол, градусы
  // Солнечный полдень — по долготе и часовому поясу города (Гонконг: 114,17° в. д., UTC+8 → ~12:07).
  const noon = 12 * 60 - eot + noonShift();
  const sunrise = dayStart + (noon - H * 4) * MS_MIN;
  const sunset = dayStart + (noon + H * 4) * MS_MIN;
  return { sunrise, sunset };
}

/**
 * Фаза суток для вампира и сколько осталось до перелома.
 * @returns {{key:string,label:string,icon:string,until:number,untilLabel:string,night:boolean}}
 */
export function nightPhase(ms = getClock()) {
  const { sunrise, sunset } = sunTimes(ms);
  const prev = sunTimes(ms - MS_DAY), next = sunTimes(ms + MS_DAY);
  let key, until;
  if (ms < sunrise) { key = "night"; until = sunrise; }
  else if (ms < sunset) { key = ms - sunrise < MS_HOUR ? "dawn" : sunset - ms < MS_HOUR ? "dusk" : "day"; until = sunset; }
  else { key = ms - sunset < MS_HOUR ? "dusk" : "night"; until = next.sunrise; }
  // «Ночь» после заката и перед восходом — считаем как одну.
  const night = key === "night" || key === "dusk";
  const icons = { night: "fa-moon", dawn: "fa-sun", day: "fa-sun", dusk: "fa-cloud-moon" };
  const left = Math.max(0, until - ms);
  const h = Math.floor(left / MS_HOUR), m = Math.floor((left % MS_HOUR) / MS_MIN);
  const untilLabel = game.i18n.format(`VTM20.Calendar.Until.${ms < sunrise || ms >= sunset ? "sunrise" : "sunset"}`, { time: `${h}:${pad(m)}` });
  return { key, label: L(`Phase.${key}`), icon: icons[key], until, untilLabel, night, sunrise, sunset, prevSunset: prev.sunset };
}

/* ── Луна ──────────────────────────────────────────────────────────────── */

const SYNODIC = 29.530588853 * MS_DAY;
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/** Фаза луны: 0 — новолуние, 0.5 — полнолуние. */
export function moonPhase(ms = getClock()) {
  const p = (((ms - NEW_MOON) % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
  const idx = Math.round(p * 8) % 8;
  const keys = ["new", "waxingCrescent", "firstQuarter", "waxingGibbous", "full", "waningGibbous", "lastQuarter", "waningCrescent"];
  const glyphs = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  return { value: p, key: keys[idx], label: L(`Moon.${keys[idx]}`), glyph: glyphs[idx], full: idx === 4, illumination: Math.round((1 - Math.cos(p * 2 * Math.PI)) / 2 * 100) };
}

/* ── Ночи хроники и таймер сцены ──────────────────────────────────────── */

export function chronicleStart() {
  const v = Number(game.settings.get(SYSTEM_ID, "chronicleStart"));
  return Number.isFinite(v) && v ? v : 0;
}
/** Номер ночи хроники: ночь считается от заката, поэтому сдвигаем на полдень. */
export function nightNumber(ms = getClock()) {
  const start = chronicleStart() || DEFAULT_CLOCK;
  const dayOf = t => Math.floor((t - 12 * MS_HOUR) / MS_DAY);
  return dayOf(ms) - dayOf(start) + 1;
}

export function sceneStart() {
  const v = Number(game.settings.get(SYSTEM_ID, "sceneStart"));
  return Number.isFinite(v) && v ? v : 0;
}
export async function setSceneStart(ms) {
  if (!game.user?.isGM) return;
  await game.settings.set(SYSTEM_ID, "sceneStart", Number(ms) || 0);
}
export function sceneElapsed() {
  const start = sceneStart();
  if (!start) return null;
  const ms = Math.max(0, getClock() - start);
  const h = Math.floor(ms / MS_HOUR), m = Math.floor((ms % MS_HOUR) / MS_MIN);
  return { h, m, text: h ? `${h} ${L("Hours")} ${pad(m)} ${L("Minutes")}` : `${m} ${L("Minutes")}` };
}

/** Всё, что нужно полосе и карточкам: одна функция — одинаковые подписи везде. */
export function clockBarData() {
  const ms = getClock(), d = new Date(ms);
  const phase = nightPhase(ms);
  const moon = moonPhase(ms);
  const scene = sceneElapsed();
  return {
    time: hhmm(d), date: shortDate(d), longDate: longDate(d), weekday: weekday(d), republic: republicanDate(ms),
    phase, moon, night: nightNumber(ms), running: clockRunning(), scene: scene?.text || ""
  };
}

/* ── Окно календаря (рассказчик) ──────────────────────────────────────── */

/** Скорости хода часов: игровых минут за реальную. */
const RATES = [1, 10, 60, 300];

const ADVANCES = [
  { ms: -MS_HOUR, label: "−1 ч" },
  { ms: 10 * MS_MIN, label: "+10 м" },
  { ms: 30 * MS_MIN, label: "+30 м" },
  { ms: MS_HOUR, label: "+1 ч" },
  { ms: 3 * MS_HOUR, label: "+3 ч" },
  { ms: MS_DAY, label: "+1 сут" },
  { ms: 7 * MS_DAY, label: "+7 сут" }
];

export class NightCalendar extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-calendar",
    classes: ["vtm20", "r-calendar"],
    tag: "form",
    window: { title: "VTM20.Calendar.Title", icon: "fa-solid fa-moon", resizable: false, contentClasses: ["r-cal-content"] },
    position: { width: 460 },
    form: { handler: NightCalendar.#onSubmit, submitOnChange: false, closeOnSubmit: false },
    actions: {
      advance: NightCalendar.#onAdvance,
      rate: NightCalendar.#onRate,
      smooth: NightCalendar.#onSmooth,
      toggleRun: NightCalendar.#onToggleRun,
      toSunset: NightCalendar.#onToSunset,
      toSunrise: NightCalendar.#onToSunrise,
      sceneStart: NightCalendar.#onSceneStart,
      sceneClear: NightCalendar.#onSceneClear,
      chronicleHere: NightCalendar.#onChronicleHere,
      announce: NightCalendar.#onAnnounce
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/apps/calendar.hbs` }
  };

  async _prepareContext() {
    const d = getDate(), ms = getClock();
    const c = clockBarData();
    return {
      dateInput: ymd(d), timeInput: hhmm(d),
      ...c,
      sunrise: hhmm(new Date(c.phase.sunrise)), sunset: hhmm(new Date(c.phase.sunset)),
      advances: ADVANCES,
      smooth: NightCalendar.smooth,
      rates: RATES.map(r => ({ r, label: `×${r}`, on: Math.abs(clockRate() - r) < 0.01 })),
      scene: sceneElapsed(), hasScene: !!sceneStart(),
      latitude: latitude(),
      longitude: game.settings.get(SYSTEM_ID, "longitude"), utcOffset: game.settings.get(SYSTEM_ID, "utcOffset"),
      chronicleStartLabel: chronicleStart() ? longDate(new Date(chronicleStart())) : "—"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._tick) clearInterval(this._tick);
    this._tick = setInterval(() => this._paintClock(), 1000);
    // Календарь и часы открываются щелчком по всему полю, а не только по крошечному значку.
    for (const i of this.element.querySelectorAll(".r-cal-set input[type=date], .r-cal-set input[type=time]"))
      i.addEventListener("click", () => { try { i.showPicker(); } catch {} });
  }

  /** Раз в секунду меняем только текст: ГМ может в этот момент править дату. */
  _paintClock() {
    const root = this.element; if (!root) return;
    const c = clockBarData();
    const set = (sel, txt) => { const el = root.querySelector(sel); if (el && el.textContent !== txt) el.textContent = txt; };
    set("[data-cal-time]", c.time);
    set("[data-cal-date]", c.longDate);
    set("[data-cal-sub]", `${c.weekday} · ${c.phase.label}`);
    set("[data-cal-until]", c.phase.untilLabel);
    set("[data-cal-night]", String(c.night));
    set("[data-cal-scene]", c.scene);
    root.querySelector("[data-cal-phase]")?.setAttribute("data-phase", c.phase.key);
  }

  async close(options) {
    if (this._tick) { clearInterval(this._tick); this._tick = null; }
    return super.close(options);
  }

  static async #onSubmit(event, form, formData) {
    const o = formData.object;
    if (o.date) {
      const [Y, M, D] = String(o.date).split("-").map(Number);
      const [h, m] = String(o.time || "21:00").split(":").map(Number);
      await setClock(new Date(Y, M - 1, D, h, m).getTime());
    }
    if (o.latitude !== undefined) await game.settings.set(SYSTEM_ID, "latitude", Number(o.latitude) || 55.75);
    if (o.longitude !== undefined && o.longitude !== null && o.longitude !== "") await game.settings.set(SYSTEM_ID, "longitude", Number(o.longitude));
    if (o.utcOffset !== undefined && o.utcOffset !== null && o.utcOffset !== "") await game.settings.set(SYSTEM_ID, "utcOffset", Number(o.utcOffset));
    this.render();
  }

  /** Плавная промотка вперёд вместо скачка — запоминается на время сессии. */
  static smooth = true;
  static #onSmooth() { NightCalendar.smooth = !NightCalendar.smooth; this.render(); }
  static async #onRate(event, target) { await setClockRate(Number(target.dataset.rate) || 1); this.render(); }
  static async #onAdvance(event, target) {
    const ms = Number(target.dataset.ms) || 0;
    // Сутки и больше — всегда скачком: минута игры за кадр ничего не покажет.
    if (NightCalendar.smooth && ms > 0 && ms < MS_DAY) await glideTo(getClock() + ms);
    else await advanceClock(ms);
    this.render();
  }
  static async #onToggleRun() { await setClockRunning(!clockRunning()); this.render(); }
  static async #onToSunset() {
    const ms = getClock();
    let { sunset } = sunTimes(ms);
    if (sunset <= ms) sunset = sunTimes(ms + MS_DAY).sunset;
    await (NightCalendar.smooth && sunset - ms < MS_DAY ? glideTo(sunset + 5 * MS_MIN) : setClock(sunset + 5 * MS_MIN)); this.render();
  }
  static async #onToSunrise() {
    const ms = getClock();
    let { sunrise } = sunTimes(ms);
    if (sunrise <= ms) sunrise = sunTimes(ms + MS_DAY).sunrise;
    await (NightCalendar.smooth && sunrise - ms < MS_DAY ? glideTo(sunrise - 15 * MS_MIN) : setClock(sunrise - 15 * MS_MIN)); this.render();
  }
  static async #onSceneStart() { await setSceneStart(getClock()); this.render(); }
  static async #onSceneClear() { await setSceneStart(0); this.render(); }
  static async #onChronicleHere() {
    await game.settings.set(SYSTEM_ID, "chronicleStart", getClock()); this.render();
  }
  static #onAnnounce() { return announceTime(); }
}

/** Объявить время в чат — отметка, когда что происходило. */
export async function announceTime(subtitle = "") {
  const c = clockBarData();
  const content = await foundry.applications.handlebars.renderTemplate(`${SYSTEM_PATH}/templates/chat/time-card.hbs`, {
    ...c, subtitle, sunrise: hhmm(new Date(c.phase.sunrise)), sunset: hhmm(new Date(c.phase.sunset))
  });
  return ChatMessage.create({ content, speaker: { alias: L("Title") } });
}

export function openCalendar() {
  if (!game.user?.isGM) { ui.notifications.warn(L("GMOnly")); return; }
  const app = foundry.applications.instances.get("r-calendar");
  if (app) { app.render({ force: true }); app.bringToFront?.(); return app; }
  const cal = new NightCalendar(); cal.render({ force: true }); return cal;
}
/**
 * Обновить окно часов. Пока ведущий правит поля (фокус внутри или значение изменено, но не применено),
 * окно не перерисовывается целиком — иначе каждые 10 секунд хода часов сбрасывали бы выбор даты
 * и закрывали всплывающий календарь. Тогда обновляется только текст циферблата.
 */
export function refreshCalendar({ force = false } = {}) {
  const app = foundry.applications.instances.get("r-calendar");
  if (!app?.rendered) return;
  const root = app.element;
  const busy = root?.contains(document.activeElement) && document.activeElement?.matches("input, select")
    || [...(root?.querySelectorAll("input") ?? [])].some(i => i.value !== i.defaultValue);
  if (busy && !force) app._paintClock();
  else app.render();
}
