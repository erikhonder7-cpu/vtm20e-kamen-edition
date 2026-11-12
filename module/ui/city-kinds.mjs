// module/ui/city-kinds.mjs
// Категории меток, виды готовых мест, печати и сургуч. Вынесено из citymap.mjs: здесь нет состояния карты.

/** Категории меток: значок и цвет. Цвета приглушены — ночь, а не неон. */
export const CITY_CATEGORIES = {
  // хроника
  elysium:   { icon: "fa-landmark",            color: "#c2a06e", chronicle: true },
  haven:     { icon: "fa-house-chimney-crack", color: "#9aa6b6", chronicle: true },
  hunting:   { icon: "fa-paw",                 color: "#b0404c", chronicle: true },
  domain:    { icon: "fa-chess-rook",          color: "#8c73a8", chronicle: true },
  danger:    { icon: "fa-skull",               color: "#b8603f", chronicle: true },
  kindred:   { icon: "fa-user-secret",         color: "#b34a55", chronicle: true },
  mortal:    { icon: "fa-user",                color: "#8ea28a", chronicle: true },
  event:     { icon: "fa-star",                color: "#bfa35e", chronicle: true },
  other:     { icon: "fa-location-dot",        color: "#b9b1a9", chronicle: true },
  // ночи Революции и штабы фракций Теневого Собрания (эпоха «Революция»)
  "assembly": { icon: "fa-landmark-dome", color: "#b3aa98", chronicle: true, group: "night" },
  "meeting": { icon: "fa-comments", color: "#9aa6b6", chronicle: true, group: "night" },
  "catacomb": { icon: "fa-dungeon", color: "#8a8276", chronicle: true, group: "night" },
  "rumor": { icon: "fa-bullhorn", color: "#a8997a", chronicle: true, group: "night" },
  "battle": { icon: "fa-khanda", color: "#b0404c", chronicle: true, group: "night" },
  "torpor": { icon: "fa-bed", color: "#8f8590", chronicle: true, group: "night" },
  "ghoul": { icon: "fa-link", color: "#b34a55", chronicle: true, group: "night" },
  "stash": { icon: "fa-box-archive", color: "#a58f6c", chronicle: true, group: "night" },
  "barricade": { icon: "fa-road-barrier", color: "#b8603f", chronicle: true, group: "night" },
  "press": { icon: "fa-feather-pointed", color: "#9e7c98", chronicle: true, group: "night" },
  "breach": { icon: "fa-mask", color: "#c4474c", chronicle: true, group: "night" },
  "hunter": { icon: "fa-cross", color: "#d8cfbf", chronicle: true, group: "night" },
  "mob": { icon: "fa-fire", color: "#b8603f", chronicle: true, group: "night" },
  "f-montagnards": { icon: "fa-fire", color: "#a3242a", chronicle: true, group: "faction" },
  "f-girondins": { icon: "fa-scale-balanced", color: "#b8703f", chronicle: true, group: "faction" },
  "f-feuillants": { icon: "fa-scroll", color: "#6f86a6", chronicle: true, group: "faction" },
  "f-royalists": { icon: "fa-chess-king", color: "#d8cfbf", chronicle: true, group: "faction" },
  "f-neutral": { icon: "fa-eye", color: "#7d8a74", chronicle: true, group: "faction" },
  // места других линеек Мира Тьмы: оборотни, маги, охотники, призраки
  "caern":     { icon: "fa-tree",             color: "#8fae8a", chronicle: true, group: "lines" },
  "hive":      { icon: "fa-biohazard",        color: "#8a8f4a", chronicle: true, group: "lines" },
  "chantry":   { icon: "fa-tower-observation", color: "#a58fd0", chronicle: true, group: "lines" },
  "node":      { icon: "fa-gem",              color: "#b9a6ee", chronicle: true, group: "lines" },
  "safehouse": { icon: "fa-house-lock",       color: "#e3a24c", chronicle: true, group: "lines" },
  "haunt":     { icon: "fa-ghost",            color: "#c9d2dc", chronicle: true, group: "lines" },
  "nihil":     { icon: "fa-hurricane",        color: "#7d8592", chronicle: true, group: "lines" },
  "freehold":  { icon: "fa-fire",            color: "#e08bb0", chronicle: true, group: "lines" },
  "trod":      { icon: "fa-route",           color: "#c9a3e8", chronicle: true, group: "lines" },
  // город
  hospital:  { icon: "fa-hospital",            color: "#a3afbd" },
  blood:     { icon: "fa-droplet",             color: "#b8333f" },
  death:     { icon: "fa-cross",               color: "#8f8590" },
  cemetery:  { icon: "fa-monument",            color: "#7f8a7c" },
  police:    { icon: "fa-shield-halved",       color: "#7185a1" },
  power:     { icon: "fa-scale-balanced",      color: "#a8997a" },
  nightlife: { icon: "fa-martini-glass",       color: "#a8566b" },
  gambling:  { icon: "fa-dice",                color: "#b39650" },
  landmark:  { icon: "fa-building",            color: "#bfb3a5" },
  hotel:     { icon: "fa-bed",                 color: "#9589a8" },
  culture:   { icon: "fa-masks-theater",       color: "#9e7c98" },
  worship:   { icon: "fa-place-of-worship",    color: "#b89a6c" },
  transport: { icon: "fa-ship",                color: "#7a8c98" },
  education: { icon: "fa-graduation-cap",      color: "#8997ab" },
  market:    { icon: "fa-store",               color: "#a58f6c" }
};
export const catOf = k => CITY_CATEGORIES[k] ?? CITY_CATEGORIES.other;

/** Вид объекта в готовых местах → свой значок; цвет — от категории папки. */
export const CITY_KINDS = {
  hospital: ["fa-hospital", "hospital"],
  donor: ["fa-hand-holding-droplet", "blood"], bloodbank: ["fa-droplet", "blood"],
  mortuary: ["fa-coffin", "death"], crematorium: ["fa-fire-flame-curved", "death"], funeral: ["fa-dove", "death"],
  columbarium: ["fa-monument", "cemetery"], cemetery: ["fa-tombstone", "cemetery"],
  police: ["fa-shield-halved", "police"],
  court: ["fa-gavel", "power"], prison: ["fa-handcuffs", "power"], consulate: ["fa-flag", "power"],
  military: ["fa-person-military-rifle", "power"], government: ["fa-building-columns", "power"],
  nightdistrict: ["fa-champagne-glasses", "nightlife"], club: ["fa-compact-disc", "nightlife"],
  karaoke: ["fa-microphone", "nightlife"], bar: ["fa-martini-glass", "nightlife"],
  racecourse: ["fa-horse-head", "gambling"], casino: ["fa-coins", "gambling"], bookmaker: ["fa-ticket", "gambling"],
  mahjong: ["fa-dice", "gambling"],
  hotel: ["fa-bed", "hotel"], museum: ["fa-scroll", "culture"], theatre: ["fa-masks-theater", "culture"],
  buddhist: ["fa-vihara", "worship"], taoist: ["fa-yin-yang", "worship"], church: ["fa-church", "worship"],
  mosque: ["fa-mosque", "worship"], hindu: ["fa-om", "worship"], synagogue: ["fa-synagogue", "worship"], sikh: ["fa-khanda", "worship"],
  airport: ["fa-plane-departure", "transport"], ferry: ["fa-ferry", "transport"], pier: ["fa-anchor", "transport"],
  station: ["fa-train", "transport"], port: ["fa-ship", "transport"],
  university: ["fa-graduation-cap", "education"], market: ["fa-store", "market"],
  peak: ["fa-binoculars", "landmark"], park: ["fa-tree", "landmark"], tower: ["fa-building", "landmark"],
  historic: ["fa-chess-rook", "landmark"], landmark: ["fa-landmark-flag", "landmark"],
  // Париж 1789 года (data/cities/paris-1789.json)
  palace: ["fa-crown", "power"], castle: ["fa-chess-rook", "power"], gibbet: ["fa-skull", "death"],
  manufacture: ["fa-industry", "market"], bridge: ["fa-bridge", "landmark"], mill: ["fa-wind", "landmark"],
  faubourg: ["fa-house", "landmark"],
  // места хроники «Liberté»
  battle: ["fa-khanda", "danger"], press: ["fa-feather-pointed", "culture"], catacomb: ["fa-dungeon", "death"], stash: ["fa-box-archive", "market"]
};

/**
 * Эмблемы эпохи (assets/icons/city, tools/build_city_icons.py; game-icons.net, CC BY 3.0) —
 * на сургучной печати. Ключ — вид места или категория метки; цвет воска — по категории.
 */
export const SEAL_SVG = new Set(["church", "prison", "court", "government", "palace", "military", "club", "bar", "nightdistrict",
  "theatre", "museum", "hospital", "cemetery", "mortuary", "gibbet", "market", "manufacture", "historic", "landmark", "bridge",
  "mill", "park", "faubourg", "castle", "elysium", "haven", "hunting", "domain", "danger", "kindred", "mortal", "event", "other",
  "assembly", "meeting", "catacomb", "rumor", "battle", "torpor", "ghoul", "stash", "barricade", "press", "breach", "hunter", "mob", "f-montagnards", "f-girondins", "f-feuillants", "f-royalists", "f-neutral"]);
/** Воск: [светлый край, тёмная глубина]. Красный — власть и кровь, чёрный — смерть, зеленоватый — лекари, бурый — церковь и торг. */
export const WAX = {
  power: ["#8e1b20", "#3a070a"], nightlife: ["#9a2a1c", "#3f0c06"], gambling: ["#9a2a1c", "#3f0c06"], culture: ["#5a2f5c", "#200d22"],
  worship: ["#7a5524", "#2e1d08"], hospital: ["#3c5a43", "#122219"], cemetery: ["#2a2725", "#070606"], death: ["#2a2725", "#070606"],
  blood: ["#8e1b20", "#3a070a"], police: ["#3b4660", "#121827"], market: ["#7a5530", "#2c1a0b"], landmark: ["#4a463f", "#161512"],
  transport: ["#4a463f", "#161512"], education: ["#5a2f5c", "#200d22"], hotel: ["#4a463f", "#161512"],
  elysium: ["#8a6a2a", "#33240a"], haven: ["#2a2725", "#070606"], hunting: ["#9e1f24", "#3a070a"], domain: ["#5a2f5c", "#200d22"],
  danger: ["#6a1015", "#1c0305"], kindred: ["#8e1b20", "#2a0507"], mortal: ["#4a463f", "#161512"], event: ["#8a6a2a", "#33240a"],
  other: ["#8e1b20", "#3a070a"],
  "assembly": ["#5a2f5c", "#200d22"],
  "meeting": ["#3b4660", "#121827"],
  "catacomb": ["#2a2725", "#070606"],
  "rumor": ["#7a5530", "#2c1a0b"],
  "battle": ["#9e1f24", "#3a070a"],
  "torpor": ["#2a2725", "#070606"],
  "ghoul": ["#8e1b20", "#2a0507"],
  "stash": ["#7a5530", "#2c1a0b"],
  "barricade": ["#9a2a1c", "#3f0c06"],
  "press": ["#5a2f5c", "#200d22"],
  "breach": ["#6a1015", "#1c0305"],
  "hunter": ["#4a463f", "#161512"],
  "mob": ["#9a2a1c", "#3f0c06"],
  "f-montagnards": ["#a3242a", "#3a070a"],
  "f-girondins": ["#9a5a2c", "#3a1e08"],
  "f-feuillants": ["#4f6688", "#16202f"],
  "f-royalists": ["#c9c0ae", "#5c564a"],
  "f-neutral": ["#5a6652", "#1d2419"]
};
