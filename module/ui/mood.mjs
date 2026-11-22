// module/ui/mood.mjs
// Состояние персонажа, которое видно на листе и в худе (styles/r-mood.css):
//   · голод — вампиру крови меньше, чем 7 − Самоконтроль (Инстинкты) (V20, «Охота»): пустые капли сохнут, края листа краснеют;
//     пустой запас — сильнее и медленно пульсирует;
//   · раны — от «серьёзно ранен» по краям проступает кровь, чем ниже, тем гуще; «при смерти» — ещё и блёкнет;
//   · ярость и Ротшрек — красная (огненная) пульсация по краям, пока висит статус.
// Метки — data-r-hunger / data-r-wound / data-r-fury на корне листа и худа; рисует только CSS.

/** Что сейчас происходит с персонажем. */
export function moodOf(actor) {
  const s = actor?.system;
  if (!s) return {};
  const h = s.health ?? {}, max = h.max || 7, dmg = h.damage ?? 0;
  const wound = dmg >= max ? "incap" : dmg >= max - 1 ? "crippled" : dmg >= max - 2 ? "mauled" : dmg >= max - 3 ? "wounded" : "";
  let hunger = "";
  if (actor.isVampire && s.blood) {
    const v = s.blood.value ?? 0, sc = s.virtues?.selfControl?.value ?? 1;
    hunger = v <= 0 ? "empty" : v < 7 - sc ? "low" : "";
  }
  const st = actor.statuses ?? new Set();
  const fury = st.has("r-rotschreck") ? "rotschreck" : st.has("r-frenzy") ? "frenzy" : "";
  return { hunger, wound, fury };
}

/** Проставить метки состояния на элемент (лист, худ); пустые — убрать. */
export function applyMood(el, actor) {
  if (!el) return;
  const m = moodOf(actor);
  for (const [k, attr] of [["hunger", "rHunger"], ["wound", "rWound"], ["fury", "rFury"]]) {
    if (m[k]) el.dataset[attr] = m[k]; else delete el.dataset[attr];
  }
}
