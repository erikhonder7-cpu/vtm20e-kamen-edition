// module/ui/city-state.mjs
// Карта города — изменяемое состояние одним объектом: карта MapLibre, инструмент, выбранное, черновик зоны, данные мира.
// Все части карты (citymap.mjs и вынесенные из него файлы) читают и меняют его поля.

export const S = {
  gl: null,   // maplibregl
  map: null,
  pins: new Map(),   // id → { marker, sig }
  tool: "select",   // select | marker | zone
  picked: null,   // { kind: "marker"|"poi"|"zone"|"found", id }
  draft: [],   // вершины новой зоны [lat, lng]
  drawGround: "slums",   // какие угодья чертит инструмент «Угодья»
  search: "",
  found: [],
  busy: false,
  opening: null,   // идущее открытие шторы (openCity) — повторный вызов ждёт его
  saveTimer: null,
  echo: null,
  state: null,   // данные мира (все города)
  privates: {},   // личные метки: { cityId: [...] }
  presets: {},   // готовые данные городов: { presetId: {...} }
  metros: {},   // сети метро: { presetId: {...} }
  presetIndex: null,   // data/cities/index.json
  icons: null,   // картинки значков для слоя мест
  shownCity: null,   // город, который сейчас на карте
  charPins: new Map(),   // actorId → { marker, sig }
  placing: null,   // актёр, которого ставят на карту следующим щелчком
  raf: null,
  lastLabels: 0,
  menuFolder: null,   // папка, у которой раскрыто меню «⋯»
};
