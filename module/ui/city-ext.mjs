// module/ui/city-ext.mjs
// Реестр расширений карты города (модули регистрируют их на init). Вынесено из citymap.mjs: здесь нет состояния карты.

/**
 * Расширения карты (модули): свои стили карты, готовые города, слои, кнопки, режимы щелчка, виды объектов в инспекторе,
 * разметка поверх карты, доска режимов (вкладки над картой), печати. Регистрируются до открытия шторы — на init.
 * Пустая система — общий инструмент: свои города, метки, папки, зоны, персонажи, часы, современные стили.
 */
export const EXT = { styles: [], presets: [], overlays: [], tools: [], toolModes: [], acts: {}, clicks: [], kinds: {}, mounts: [], boards: [], seals: [],
  // Стратегия города (module/ui/strategy.mjs): заготовки секторов и кварталы, к которым их можно привязать
  strategy: { presets: [], districts: [] } };
export function registerCityExtension(e = {}) {
  if (e.strategy?.presets) EXT.strategy.presets.push(...[].concat(e.strategy.presets));
  if (e.strategy?.districts) EXT.strategy.districts.push(...[].concat(e.strategy.districts));
  for (const k of ["styles", "presets", "overlays", "tools", "toolModes", "clicks", "mounts", "boards", "seals"]) if (e[k]) EXT[k].push(...[].concat(e[k]));
  if (e.acts) Object.assign(EXT.acts, e.acts);
  if (e.kinds) Object.assign(EXT.kinds, e.kinds);
}
