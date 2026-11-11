// module/ui/strategy-state.mjs
// Изменяемое состояние strategy.mjs одним объектом: все части читают и меняют его поля.

export const ST = {
  me: null,   // выбранный персонаж игрока
  host: null,   // штора «Город», на которой висит доска
  mode: "map",   // map — карта, strategy — доска
  view: "map",   // вкладка доски: map | turn | reports | setup
  sel: null,   // выбранный гекс
  editBid: null,   // заявка в правке
  hist: null,   // номер хода, на который смотрим в истории
  // масштаб соты: k — во сколько раз крупнее «вписанного» вида, cx/cy — центр; base — рамка всех гексов; focus — подсвеченная сфера
  zoom: { k: 1, cx: null, cy: null },
  base: null,
  focus: null,
  dragged: false,
};
