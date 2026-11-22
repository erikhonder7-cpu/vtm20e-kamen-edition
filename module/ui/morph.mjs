/**
 * Обновление части листа на месте вместо замены (sheets/actor-sheet.mjs, _replaceHTML).
 * Сравниваем прошлый вывод шаблона (snap) с новым (next) и переносим отличия на живую разметку (live):
 * атрибуты, классы поштучно, текст, значения полей. Что добавлено на ходу (классы анимаций, служебные data-метки
 * обработчиков, подсказки) — не трогаем: этого нет ни в прошлом, ни в новом выводе шаблона.
 * Если строение разошлось (другие теги, другое число узлов, на ходу вставлен узел, редактор текста) — возвращаем false,
 * часть заменяется целиком, как раньше. Выигрыш: браузер не раскладывает заново сотни новых узлов — только изменённые.
 */

const SKIP_TAGS = new Set(["PROSE-MIRROR", "SCRIPT", "STYLE", "IFRAME", "CANVAS", "VIDEO"]);

/** Совпадает ли строение трёх деревьев: прошлого вывода, нового и живого. Ничего не меняет. */
function sameShape(s, n, l) {
  if (s.nodeType !== n.nodeType || s.nodeType !== l.nodeType) return false;
  if (s.nodeType !== Node.ELEMENT_NODE) return true;
  if (s.tagName !== n.tagName || s.tagName !== l.tagName) return false;
  if (SKIP_TAGS.has(s.tagName) && !s.isEqualNode(n)) return false;      // редактор и прочее со своей жизнью — только целиком
  const sc = s.childNodes, nc = n.childNodes, lc = l.childNodes;
  if (sc.length !== nc.length || sc.length !== lc.length) return false;
  for (let i = 0; i < sc.length; i++) if (!sameShape(sc[i], nc[i], lc[i])) return false;
  return true;
}

function syncClasses(s, n, l) {
  const was = new Set(s.classList), now = new Set(n.classList);
  for (const c of was) if (!now.has(c)) l.classList.remove(c);
  for (const c of now) if (!was.has(c)) l.classList.add(c);
}

/** Перенести отличия s → n на l (строение уже проверено). */
function apply(s, n, l) {
  if (s.nodeType !== Node.ELEMENT_NODE) {
    if (s.nodeValue !== n.nodeValue) l.nodeValue = n.nodeValue;
    return;
  }
  if (!s.isEqualNode(n)) {
    let valueChanged = false, checkedChanged = false;
    for (const { name, value } of n.attributes) {
      const old = s.getAttribute(name);
      if (old === value) continue;
      if (name === "class") syncClasses(s, n, l);
      else l.setAttribute(name, value);
      if (name === "value") valueChanged = true;
      if (name === "checked") checkedChanged = true;
    }
    for (const { name } of s.attributes) {
      if (n.hasAttribute(name)) continue;
      if (name === "class") syncClasses(s, n, l);
      else l.removeAttribute(name);
      if (name === "checked") checkedChanged = true;
      if (name === "value") valueChanged = true;
    }
    // свойства полей: атрибут value/checked после первого ввода уже не управляет тем, что видно
    if (l.tagName === "INPUT" && l !== document.activeElement) {
      if (valueChanged) l.value = n.getAttribute("value") ?? "";
      if (checkedChanged) l.checked = n.hasAttribute("checked");
    }
    const sc = s.childNodes, nc = n.childNodes, lc = l.childNodes;
    for (let i = 0; i < sc.length; i++) apply(sc[i], nc[i], lc[i]);
    if (l.tagName === "TEXTAREA" && l !== document.activeElement && s.textContent !== n.textContent) l.value = n.textContent;
    if (l.tagName === "SELECT" && l !== document.activeElement) {
      const opt = n.querySelector("option[selected]") ?? n.querySelector("option");
      if (opt && l.value !== opt.value) l.value = opt.value;
    }
  }
}

/** Обновить живую часть на месте. true — обновлена; false — строение другое, заменять целиком (ничего не тронуто). */
export function morphPart(snap, next, live) {
  if (!snap || !next || !live || !sameShape(snap, next, live)) return false;
  apply(snap, next, live);
  return true;
}
