# tools/polish.py
# Единое оформление описаний ритуалов перед записью data/rituals.json: шапка «Уровень · Бросок · Источник»,
# расшифровка сокращений справочника, без ссылок на страницы книг. Вызывается из build_data.main().

import re, html

TRAIT = {"attributes.intelligence": "Интеллект", "attributes.wits": "Смекалка", "attributes.perception": "Восприятие",
         "attributes.manipulation": "Манипуляция", "attributes.stamina": "Выносливость", "attributes.charisma": "Харизма",
         "abilities.occult": "Оккультизм", "abilities.medicine": "Медицина", "willpower.permanent": "Воля"}

# сокращения конспекта → полные слова (только в тексте, не в тегах)
WORDS = [(r"\bсл\.\s*(?==|\d|\(|\+|−|-)", "сложность "), (r"\bсл\.(?=\s)", "сложность"), (r"\bур\.(?=\s*\d)", "уровень"),
         (r"\bоп\.(?=\s)", "опыта"), (r"≥\s*", "не меньше "), (r"≤\s*", "не больше "), (r"\s*→\s*", " — "),
         (r"\s*\((?:с|стр)\.\s*\d+(?:[–-]\d+)?\)", ""), (r",\s*(?:с|стр)\.\s*\d+(?:[–-]\d+)?(?=[)\s.,;])", "")]

def _text(s):
    for rx, rep in WORDS:
        s = re.sub(rx, rep, s)
    return s

def _clean(h):
    """Сокращения — только в текстовых узлах."""
    return "".join(part if part.startswith("<") else _text(part) for part in re.split(r"(<[^>]+>)", h))

def ritual(r):
    h = r.get("html") or ""
    # «Источник: X. Пометка.» из первого абзаца — в шапку
    book, note = r.get("source") or "", ""
    m = re.match(r"^<p><em>Источник:\s*(.+?)</em></p>", h)
    if m:
        h = h[m.end():]
        src = html.unescape(m.group(1)).strip()
        mb = re.match(r"^(.+?[^.\s])\.(?:\s+(.*))?$", src)
        book, note = (mb.group(1), (mb.group(2) or "").strip()) if mb else (src.rstrip("."), "")
    book = book or "V20"                          # ритуалы основной книги (и их копии у Ассамитов) без пометки
    roll = r.get("roll") or {}
    pool = " + ".join(TRAIT.get(roll.get(k), "") for k in ("trait1", "trait2") if roll.get(k))
    parts = [f"<strong>Уровень {r['level']}</strong>"]
    if pool: parts.append(f"Бросок: {pool}" + (f", сложность {roll['difficulty']}" if roll.get("difficulty") else ""))
    if book: parts.append(f"Источник: {html.escape(book)}")
    head = f"<p class=\"r-ritual-meta\">{' · '.join(parts)}</p>"
    if note: head += f"<p><em>{html.escape(note)}</em></p>"
    r["html"] = head + _clean(h)
    if book and not r.get("source"): r["source"] = book
    return r

def rituals(groups):
    n = 0
    for g in groups.values():
        for r in g["rituals"]:
            ritual(r); n += 1
    print("Оформлено описаний ритуалов:", n)

def combos(items):
    """Комбинированные: «Требования · Опыт · Источник» вместо строки-пометки «Источник: … Комбинированная Дисциплина: …»."""
    for c in items:
        h = re.sub(r"^<p><em>Источник:.*?</em></p>", "", c.get("html") or "", count=1)
        parts = [f"<strong>Требования:</strong> {html.escape(c.get('requiresText') or '')}"]
        if c.get("xp"): parts.append(f"<strong>Опыт:</strong> {c['xp']}")
        parts.append(f"Источник: {html.escape(c.get('source') or 'V20')}")
        c["html"] = f"<p class=\"r-ritual-meta\">{' · '.join(parts)}</p>" + _clean(h)
    print("Оформлено комбинированных:", len(items))
