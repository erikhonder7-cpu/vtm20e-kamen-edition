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
const ROMAN = n => { const m = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let o = ""; for (const [v, r] of m) while (n >= v) { o += r; n -= v; } return o; };

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
    phase, moon, night: nightNumber(ms), running: clockRunning(), gliding: !!clockGliding(), scene: scene?.text || "",
    span: nightSpan(ms)
  };
}

/**
 * Текущий отрезок суток для полоски «до рассвета»: ночь — от заката до восхода, день — от восхода до заката.
 * @returns {{night:boolean, start:number, end:number, left:number, leftText:string, pct:number, hot:boolean}}
 *          hot — ночью до рассвета меньше часа.
 */
export function nightSpan(ms = getClock()) {
  const { sunrise, sunset, prevSunset } = nightPhase(ms);
  const night = ms < sunrise || ms >= sunset;
  const start = ms < sunrise ? prevSunset : ms >= sunset ? sunset : sunrise;
  const end = ms < sunrise ? sunrise : ms >= sunset ? sunTimes(ms + MS_DAY).sunrise : sunset;
  const left = Math.max(0, end - ms);
  const pct = Math.clamp((ms - start) / Math.max(1, end - start) * 100, 0, 100);
  return { night, start, end, left, leftText: `${Math.floor(left / MS_HOUR)}:${pad(Math.floor((left % MS_HOUR) / MS_MIN))}`, pct, hot: night && left < MS_HOUR };
}

/* ── Журнал ночей (К3) ─────────────────────────────────────────────────── */

const nightNotes = () => game.settings.get(SYSTEM_ID, "nightNotes") ?? {};

/** Вечер ночи хроники n (ночь считается от заката, как в nightNumber). */
function nightEvening(n) {
  const start = chronicleStart() || DEFAULT_CLOCK, s = new Date(start - 12 * MS_HOUR);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + n - 1, 20);
}

/** Последние ночи хроники (текущая сверху) и все более ранние с заметками. */
export function nightJournal(ms = getClock(), recent = 8) {
  const cur = nightNumber(ms), notes = nightNotes();
  const ns = new Set([...Array.from({ length: Math.min(recent, Math.max(cur, 1)) }, (_, i) => cur - i).filter(n => n >= 1),
    ...Object.keys(notes).map(Number).filter(n => n >= 1 && n <= cur && notes[n])]);
  return [...ns].sort((a, b) => b - a).map(n => ({ n, roman: ROMAN(n), date: shortDate(nightEvening(n)), text: notes[n] ?? "", current: n === cur }));
}
export const nightNote = (ms = getClock()) => nightNotes()[nightNumber(ms)] ?? "";

export async function setNightNote(n, text) {
  if (!game.user.isGM) return;
  const notes = { ...nightNotes() };
  if (String(text).trim()) notes[n] = String(text).trim(); else delete notes[n];
  await game.settings.set(SYSTEM_ID, "nightNotes", notes);
}

/** Ближайшие полнолуние и новолуние: в какую ночь и через сколько ночей. */
export function moonEvents(ms = getClock()) {
  const out = [], step = 3 * MS_HOUR, cur = nightNumber(ms);
  let prev = moonPhase(ms).value;
  for (let t = ms + step; t < ms + 32 * MS_DAY && out.length < 2; t += step) {
    const v = moonPhase(t).value;
    const kind = prev < .5 && v >= .5 ? "full" : prev > .9 && v < .1 ? "new" : null;
    if (kind && !out.some(e => e.kind === kind)) {
      const n = nightNumber(t), inN = n - cur;
      out.push({ kind, icon: kind === "full" ? "fa-circle" : "fa-circle-notch", label: L(`Moon.${kind}`),
        when: inN <= 0 ? L("EventTonight") : game.i18n.format("VTM20.Calendar.EventIn", { night: ROMAN(n), n: inN }) });
    }
    prev = v;
  }
  return out;
}

/* ── Рассвет в чат (К4) ────────────────────────────────────────────────── */

const DAWN_LEAD = 30 * MS_MIN;
let _dawnBusy = false;

/**
 * За 30 минут до восхода и в момент восхода — карточка в чат и удар колокола у всех (один раз на рассвет).
 * Пишет один активный рассказчик; вызывается из хода ночных часов.
 */
export async function checkDawn(ms = getClock()) {
  if (_dawnBusy || !game.users.activeGM?.isSelf || !game.settings.get(SYSTEM_ID, "dawnWarnings")) return;
  let sr = sunTimes(ms).sunrise;
  if (ms >= sr + 10 * MS_MIN) sr = sunTimes(ms + MS_DAY).sunrise;
  const key = ymd(new Date(sr)), done = game.settings.get(SYSTEM_ID, "dawnWarned") ?? {};
  const kind = ms >= sr - DAWN_LEAD && ms < sr && done.soon !== key && done.rise !== key ? "soon"
    : ms >= sr && ms < sr + 10 * MS_MIN && done.rise !== key ? "rise" : null;
  if (!kind) return;
  _dawnBusy = true;
  try {
    await game.settings.set(SYSTEM_ID, "dawnWarned", { ...done, [kind]: key });
    const left = Math.max(0, Math.round((sr - ms) / MS_MIN));
    await ChatMessage.create({
      speaker: { alias: L("Title") }, flags: { [SYSTEM_ID]: { dawn: kind } },
      content: `<div class="r-dawn-card is-${kind}"><i class="fa-solid ${kind === "soon" ? "fa-hourglass-end" : "fa-sun"}"></i>
        <div><b>${kind === "soon" ? game.i18n.format("VTM20.Calendar.DawnSoon", { n: left }) : L("DawnRise")}</b>
        <span>${L(kind === "soon" ? "DawnSoonText" : "DawnRiseText")}</span></div></div>`
    });
  } finally { _dawnBusy = false; }
}

/** Удар колокола — синтез (несколько негармонических призвуков с затуханием), громкость «Интерфейс». */
function ringBell(times = 1) {
  try {
    const vol = Number(game.settings.get("core", "globalInterfaceVolume") ?? .5);
    if (!vol) return;
    const ac = game.audio?.interface?.context ?? new AudioContext();
    for (let k = 0; k < times; k++) {
      const t0 = ac.currentTime + k * 1.6;
      for (const [f, a, d] of [[220, .32, 3.2], [440, .18, 2.4], [566, .12, 1.8], [693, .09, 1.4], [1010, .05, .9]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(.0001, t0);
        g.gain.exponentialRampToValueAtTime(a * vol, t0 + .01);
        g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
        o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d + .05);
      }
    }
  } catch (e) { /* без звука — не беда */ }
}

/** Настройки журнала ночей и рассвета, колокол на новых карточках рассвета. */
export function registerNightExtras() {
  game.settings.register(SYSTEM_ID, "nightNotes", { scope: "world", config: false, type: Object, default: {}, onChange: () => refreshCalendar() });
  game.settings.register(SYSTEM_ID, "dawnWarned", { scope: "world", config: false, type: Object, default: {} });
  game.settings.register(SYSTEM_ID, "dawnWarnings", {
    name: "VTM20.Settings.DawnWarnings.Name", hint: "VTM20.Settings.DawnWarnings.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  Hooks.on("createChatMessage", msg => { const k = msg.flags?.[SYSTEM_ID]?.dawn; if (k) ringBell(k === "rise" ? 3 : 1); });
}

/**
 * Циферблат ночи (К1): сутки по кругу, полночь сверху. Ночь — синяя дуга от заката до восхода, прошедшая её
 * часть — светлее; днём ночь впереди. Стрелка — сейчас, в центре — время и сколько осталось до рассвета (заката).
 * @returns {string} SVG
 */
export function nightDial(ms = getClock()) {
  const C = 120, R = 98;
  const dayStart = t => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const ang = t => (t - dayStart(t)) / MS_DAY * 360;
  const pt = (a, r = R) => [C + r * Math.sin(a * Math.PI / 180), C - r * Math.cos(a * Math.PI / 180)];
  const f = n => n.toFixed(1);
  const arc = (t0, t1, r = R) => {
    const a0 = ang(t0), span = Math.max(.5, (t1 - t0) / MS_DAY * 360), [x0, y0] = pt(a0, r), [x1, y1] = pt(a0 + span, r);
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`;
  };
  const s = nightSpan(ms);
  // ночь, которую показываем: идущая — или предстоящая, если сейчас день
  const night = s.night ? { start: s.start, end: s.end } : { start: s.end, end: sunTimes(s.end + MS_DAY / 2).sunrise };
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const big = h % 6 === 0, [x0, y0] = pt(h * 15, R + 9), [x1, y1] = pt(h * 15, R + (big ? 17 : 13));
    return `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="rgba(216,207,191,${big ? .55 : .22})" stroke-width="${big ? 1.6 : 1}"/>`;
  }).join("");
  const labels = [0, 6, 12, 18].map(h => { const [x, y] = pt(h * 15, R + 28); return `<text x="${f(x)}" y="${f(y + 4)}" text-anchor="middle" class="r-dial-h">${h}</text>`; }).join("");
  // стрелка — отрезок у кольца, чтобы не перечёркивать время в центре
  const [hx, hy] = pt(ang(ms), R + 6), [ix, iy] = pt(ang(ms), R - 30), [sx, sy] = pt(ang(night.start)), [ex, ey] = pt(ang(night.end));
  const d = new Date(ms), left = s.leftText;
  return `<svg class="r-dial${s.hot ? " is-hot" : ""}${s.night ? "" : " is-day"}" viewBox="-12 -12 264 264" role="img"
      aria-label="${L(s.night ? "DialNight" : "DialDay")} ${left}">
    <circle cx="${C}" cy="${C}" r="${R + 20}" class="r-dial-face"/>
    ${ticks}${labels}
    <circle cx="${C}" cy="${C}" r="${R}" class="r-dial-day"/>
    <path d="${arc(night.start, night.end)}" class="r-dial-night"/>
    ${s.night ? `<path d="${arc(night.start, ms)}" class="r-dial-past"/>` : ""}
    <circle cx="${f(sx)}" cy="${f(sy)}" r="5" class="r-dial-sunset"/><circle cx="${f(ex)}" cy="${f(ey)}" r="5" class="r-dial-sunrise"/>
    <line x1="${f(ix)}" y1="${f(iy)}" x2="${f(hx)}" y2="${f(hy)}" class="r-dial-hand"/><circle cx="${f(ix)}" cy="${f(iy)}" r="3.5" class="r-dial-pin"/>
    <text x="${C}" y="${C - 18}" text-anchor="middle" class="r-dial-time">${hhmm(d)}</text>
    <text x="${C}" y="${C + 16}" text-anchor="middle" class="r-dial-cap">${L(s.night ? "DialToSunrise" : "DialToSunset")}</text>
    <text x="${C}" y="${C + 44}" text-anchor="middle" class="r-dial-left">${left}</text>
  </svg>`;
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
    position: { width: 440 },
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
      announce: NightCalendar.#onAnnounce,
      calTab: NightCalendar.#onTab
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
      chronicleStartLabel: chronicleStart() ? longDate(new Date(chronicleStart())) : "—",
      // вкладки (К2): «Сейчас» — то, что нужно за столом; настройки хода и города — отдельно
      tabs: ["now", "flow", "chron"].map(id => ({ id, label: L(`Tab.${id}`), active: id === NightCalendar.tab })),
      tabNow: NightCalendar.tab === "now", tabFlow: NightCalendar.tab === "flow", tabChron: NightCalendar.tab === "chron",
      dial: nightDial(ms), nightNote: nightNote(ms), journal: nightJournal(ms), events: moonEvents(ms)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._tick) clearInterval(this._tick);
    this._tick = setInterval(() => this._paintClock(), 1000);
    // Календарь и часы открываются щелчком по всему полю, а не только по крошечному значку.
    for (const i of this.element.querySelectorAll(".r-cal-set input[type=date], .r-cal-set input[type=time]"))
      i.addEventListener("click", () => { try { i.showPicker(); } catch {} });
    // заметка к ночи сохраняется, когда ведущий уходит из поля
    for (const t of this.element.querySelectorAll("textarea[data-night]"))
      t.addEventListener("change", () => setNightNote(Number(t.dataset.night), t.value));
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
    const dial = root.querySelector("[data-cal-dial]");
    if (dial) dial.innerHTML = nightDial();
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
  /** Открытая вкладка — запоминается на время сессии. */
  static tab = "now";
  static #onTab(event, target) { NightCalendar.tab = target.dataset.tab; this.render(); }
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
  const busy = root?.contains(document.activeElement) && document.activeElement?.matches("input, select, textarea")
    || [...(root?.querySelectorAll("input, textarea") ?? [])].some(i => i.value !== i.defaultValue);
  if (busy && !force) app._paintClock();
  else app.render();
}
