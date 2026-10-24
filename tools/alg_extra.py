# tools/alg_extra.py
# «Vampire: Age of the Living Gods» — фанатское дополнение к V20 Dark Ages (Месопотамия, 2350 г. до н. э.):
# Дисциплина Мортис, новые Способности и Факты биографии. Пути Морали этой книги собирает tools/paths_extra.py.
# Всё с era = "darkAges" (видно с настройкой «Контент из Dark Ages») и fan = true (своя папка в компендиях).
# Вызывается из build_data.main().

import os, re, html
from build_data import REF, read, md_to_html, parse_roll
from supplements import grab, tables, src_p

REL = "Прочее/06_Век_живых_богов_Age_of_the_Living_Gods.md"
BOOK = "Vampire: Age of the Living Gods (фанатское)"
DA = "darkAges"

def _cap(s): return s[:1].upper() + s[1:]

def mortis():
    """Дисциплина Мортис: вступление раздела — правила, таблица «Ур. | Сила | Эффект» — силы."""
    lines, _ = grab(REL, r"7\. Дисциплина Мортис")
    intro = [l for l in lines if not l.startswith("|")]
    powers = []
    for hd, rows in tables(lines):
        if len(hd) < 3 or not re.match(r"Ур", hd[0]): continue
        for r in rows:
            m = re.match(r"\d+", r[0].strip())
            if not m: continue
            body = [_cap(" ".join(r[2:]).strip())]
            p = {"level": int(m.group(0)), "name": r[1].replace("**", "").strip(), "en": "", "source": BOOK, "era": DA,
                 "html": src_p(BOOK) + md_to_html(body)}
            roll = parse_roll(p["html"])
            if roll: p["roll"] = roll
            powers.append(p)
    return {"key": "mortis", "name": "Мортис (Век живых богов)", "en": "Mortis", "source": BOOK, "clans": "Каппадокийцы",
            "era": DA, "fan": True, "powers": powers, "paths": [],
            "rules": [{"title": "", "html": src_p(BOOK, "Замена Некромантии у Каппадокийцев этой эпохи; не считается колдовством.")
                       + md_to_html([l for l in intro if l.strip()])}]}

def _dotted(lines, title):
    """Пункты «- **Имя:** • …; •• …» раздела → [(имя, [строки уровней], хвост после ступеней)]."""
    body, _ = grab(REL, title)
    out = []
    for l in body:
        m = re.match(r"^\s*-\s*\*\*(.+?)(?:\s*\(([A-Za-z][^)]*)\))?:\*\*\s*(.+)$", l)
        if not m: continue
        name, en, rest = m.group(1).strip(), (m.group(2) or "").strip(), m.group(3)
        levels = [x.strip(" ;") for x in re.split(r";\s*(?=•+\s)", rest) if x.strip(" ;")]   # «• …; •• …» — по «; » перед точками
        out.append((name, en, levels))
    return out

def _levels_html(levels):
    """«• текст; •• текст» → список ступеней; хвост («Спец.: …», правила) — отдельным абзацем."""
    items, tail = [], []
    for x in levels:
        m = re.match(r"^(•+)\s*(.+)$", x)
        if not m: tail.append(x); continue
        text = m.group(2)
        # хвост после последней ступени: «… Специализации: …», «Работает между …»
        if x is levels[-1]:
            parts = re.split(r"\.\s+(?=[А-ЯЁ])", text, maxsplit=1)
            text, extra = parts[0], (parts[1] if len(parts) > 1 else "")
            if extra: tail.append(extra)
        items.append(f"<li><b>{m.group(1)}</b> {html.escape(_cap(text.rstrip('.')))}</li>")
    return (f"<ul>{''.join(items)}</ul>" if items else "") + "".join(md_to_html([_cap(t)]) for t in tail)

def abilities():
    out = []
    for name, en, levels in _dotted(None, r"2\. Новые Способности"):
        out.append({"name": name, "en": en, "group": "knowledges", "source": BOOK, "era": DA, "fan": True,
                    "html": src_p(BOOK, "Способность эпохи: добавляется на лист как вторичная.") + _levels_html(levels)})
    return out

def backgrounds():
    out = []
    for name, en, levels in _dotted(None, r"3\. Новые Предыстории"):
        if name.startswith("Поколение"): continue                  # рекомендации рассказчику, а не Факт биографии
        out.append({"name": name, "en": en, "sabbat": False, "source": BOOK, "era": DA, "fan": True,
                    "html": src_p(BOOK) + _levels_html(levels)})
    return out

def apply(disc, backgrounds_list):
    """Мортис — в Дисциплины, Факты биографии — в общий список; Способности возвращаются отдельным списком."""
    if not os.path.exists(os.path.join(REF, REL)):
        print("Век живых богов: нет файла"); return []
    disc["mortis"] = mortis()
    have = {b["name"] for b in backgrounds_list}
    new_bg = [b for b in backgrounds() if b["name"] not in have]
    backgrounds_list += new_bg
    abil = abilities()
    print(f"Век живых богов: Мортис — сил {len(disc['mortis']['powers'])}, фактов биографии +{len(new_bg)}, способностей {len(abil)}")
    return abil
