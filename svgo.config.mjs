// svgo.config.mjs — сжатие SVG-иконок без потери вида. Запуск: npm run svg. Foundry этот файл не читает.
export default {
  multipass: true,
  plugins: [
    { name: "preset-default", params: { overrides: {
      // viewBox нужен для масштаба иконок; id — для <use href> (маркер хода)
      removeViewBox: false, cleanupIds: false
    } } }
  ]
};
