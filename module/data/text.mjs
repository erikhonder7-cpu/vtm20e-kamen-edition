// module/data/text.mjs
// HTML → простой текст для подсказок, превью и поиска. Блочные теги (абзац, пункт, ячейка, перенос) — пробелом,
// строчные (<b>, <em>, <a>…) — без пробела, чтобы «<b>Сон</b>,» не стало «Сон ,»; сущности (&lt; &nbsp; &#8212;) раскрыты.

const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…", times: "×", minus: "−" };
const BLOCK = /<(?:br|hr|\/?(?:p|div|li|ul|ol|h[1-6]|tr|td|th|table|thead|tbody|blockquote|section|dt|dd|dl))\b[^>]*>/gi;

export function plainText(html) {
  return String(html ?? "")
    .replace(BLOCK, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] !== "#" ? ENT[e.toLowerCase()] ?? m
      : String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))))
    .replace(/\s+/g, " ")
    .replace(/ ([,.;:!?»)])/g, "$1")
    .trim();
}
