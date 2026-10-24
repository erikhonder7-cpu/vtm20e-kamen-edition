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

# Один ритуал в разных переводах (одинаковые ингредиенты, время и эффект; английского названия у повтора нет):
# Дисциплина → {повтор: оставляемый}. Оставляем версию V20 / Rites of the Blood; Тёмные века — отдельные версии, их не трогаем.
DUPES = {
    "thaumaturgy": {
        "Распускание ритуала": "Распустить ритуал", "Зачаровать Талисман": "Зачарование талисмана",
        "Душа гомункулуса": "Душа гомункула", "Защита от Сородичей": "Защитная печать против Сородичей",
        "Оберег от сородичей": "Защитная печать против Сородичей", "Защитный Круг от Гулей": "Защитный круг против гулей",
        "Щепочный Слуга": "Деревянный слуга", "Защита от Люпинов": "Защитная печать против Люпинов",
        "Оберег от оборотней": "Защитная печать против Люпинов", "Глаза ночного ястреба": "Око ночного ястреба",
        "Прикосновение паслена": "Касание паслёна", "Оберег от духов": "Защитная печать против духов / призраков / демонов",
        "Защита от Духов": "Защитная печать против духов / призраков / демонов", "Кровавый Помощник": "Гомункул‑помощник",
        "Плоть Пламенного Прикосновения": "Огненная плоть", "Привлечение Сосуда Передачи": "Создание переливающего сосуда",
        "Создание кровавого камня": "Создать кровавый камень", "Огненный ходок": "Пожиратель пламени",
        "Прогулка по Огню": "Пожиратель пламени", "Надпись": "Начертание",
        "Острие Отложенной Неподвижности": "Жезл неизбежного покоя", "Сбрасывание пут": "Сбросить оковы",
        "Бегство к Истинному Другу": "Врата истинной дружбы", "Цепляние насекомого": "Паучьи лапы",
        "Восстановление Родины": "Целебная сила родной земли",
        "Связать знакомого": "Привязать фамильяра",          # оба — Тёмные века (Low Clans ↔ V20 Dark Ages)
    },
    "necromancy": {"Ритуал Почтли": "Ритуал Уицилопочтли"},
    "setiteSorcery": {"Броня алмазной стойкости": "Доспех алмазной безмятежности"},
    "assamiteSorcery": {"Из глотки Мардука": "Из горла Мардука"},
}

def _book(r):
    m = re.match(r"^<p><em>Источник:\s*(.+?)[.]?(?:\s|</em>)", r.get("html") or "")
    return r.get("source") or (html.unescape(m.group(1)) if m else "V20")

def dedupe_rituals(groups):
    """Убрать повторы из DUPES; у оставленного ритуала запомнить другие переводы (aka)."""
    n = 0
    for k, pairs in DUPES.items():
        rs = groups.get(k, {}).get("rituals", [])
        by = {r["name"]: r for r in rs}
        drop = set()
        for dup, keep in pairs.items():
            if dup in by and keep in by:
                by[keep].setdefault("aka", []).append(f"«{dup}» ({_book(by[dup])})")
                drop.add(dup)
            elif dup in by:
                print("  повтор без пары:", k, dup, "→", keep)
        groups[k]["rituals"] = [r for r in rs if r["name"] not in drop]
        n += len(drop)
    print("Убрано повторов ритуалов (другие переводы):", n)

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
    var = r.pop("levelVar", "")                   # переменный уровень: «1–5 (переменный)», сложность от выбранного уровня
    parts = [f"<strong>Уровень {var or r['level']}</strong>"]
    diff = "3 + уровень" if var else roll.get("difficulty")
    if pool: parts.append(f"Бросок: {pool}" + (f", сложность {diff}" if diff else ""))
    if book: parts.append(f"Источник: {html.escape(book)}")
    head = f"<p class=\"r-ritual-meta\">{' · '.join(parts)}</p>"
    if note: head += f"<p><em>{html.escape(note)}</em></p>"
    if r.get("aka"): head += f"<p><em>Другие переводы: {html.escape(', '.join(r.pop('aka')))}.</em></p>"
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
