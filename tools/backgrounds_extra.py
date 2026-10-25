# tools/backgrounds_extra.py
# Факты биографии из дополнений: V20 (Anarchs Unbound, The Black Hand, Lore of the Clans, Rites of the Blood,
# Hunters Hunted II), Revised (Guide to the Camarilla, Clanbook: Nosferatu, Storytellers Handbook) и
# 2nd Edition (Player's Guide to the Sabbat, Elysium). Вызывается из build_data.main().
#
# Повторы основной книги не берутся: Второе «я», Членство в Чёрной Руке и Ритуалы уже есть в V20,
# «Призрачные рабы» кланбука Джованни — это «Рабы‑духи» Lore of the Clans, «Неуловимость» Revised
# в V20 стала достоинством «Тайный» (The Black Hand), Статус в Шабаше покрывает обычный Статус.

import os, re, html
from build_data import REF, read, md_to_html

AU, BH, LOTC, ROTB, HH2 = "V20 Anarchs Unbound", "V20 The Black Hand", "V20 Lore of the Clans", "V20 Rites of the Blood", "V20 Hunters Hunted II (охотники)"
GTC, NOS, STH = "Guide to the Camarilla (Revised)", "Clanbook: Nosferatu (Revised)", "Storyteller's Handbook (Revised)"
PGS, ELY = "Player's Guide to the Sabbat (2nd Ed.)", "Elysium: The Elder Wars (2nd Ed.)"

# (файл, начало заголовка раздела, книга, русское имя, английское имя, примечание)
SECTIONS = [
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", "Информационный обмен анархов", AU, None, None, ""),
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", "Статус анархов", AU, None, None, ""),
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", "Арсенал", AU, None, None, ""),
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", "Общее убежище", AU, None, None, "Можно складывать в котерии (основная книга, «Общие факты биографии котерии»)."),
    ("Black_Hand/01_Тал_Махе_Ра_персонажи_и_Пути.md", "Новый факт биографии: Культ", BH, "Культ", "Cult", ""),
    ("Lore_of_the_Clans/05_Джованни.md", "Мементо мори", LOTC, None, None, ""),
    ("Lore_of_the_Clans/05_Джованни.md", "Рабы‑духи", LOTC, None, None, ""),
    ("Rites_of_the_Blood/04_Независимые_Ассамиты_Сетиты_Джованни.md", "Новый факт биографии: Кощунственное", ROTB, "Кощунственное святилище", "Blasphemous Shrine", ""),
    ("Revised_Гайды_сект/01e_Камарилья_должности_клановые_правила_и_процедуры.md", "Клановый престиж", GTC, "Престиж в клане", "Clan Prestige", ""),
    ("Revised_Кланбуки/13_Носферату.md", "Новый факт биографии: Информационная сеть", NOS, "Информационная сеть", "Information Network", ""),
    ("Revised_Основные/01_Storytellers_Handbook.md", "Возраст", STH, None, None, "Необязательно — для хроник старейшин."),
    ("Revised_Основные/01_Storytellers_Handbook.md", "Военная сила", STH, None, None, "Необязательно — для хроник старейшин."),
    ("Прочее/07_Элизиум_Elysium.md", "Статус Старейшины", ELY, "Статус старейшины", "Elder Status", "Только для старейшин."),
    ("Прочее/07_Элизиум_Elysium.md", "Поколение Старейшины", ELY, "Поколение старейшины", "Elder Generation", "Только для старейшин; заменяет Поколение ниже 10‑го."),
]

# Пункты списка «- **Имя** (En) — текст» (Hunters Hunted II), с вложенными уровнями
BULLETS = [
    ("Hunters_Hunted_II/01_Охотник_создание_тактика_снаряжение.md", "Новые факты биографии", HH2, {"Арсенал"}),
    ("Hunters_Hunted_II/03_Организации_охотников.md", "Факты биографии", HH2, {"Статус", "Наставник", "Ресурсы"}),
    ("Hunters_Hunted_II/03_Организации_охотников.md", "Факты биографии", HH2, {"Статус", "Наставник", "Ресурсы"}, 1),
    ("Hunters_Hunted_II/03_Организации_охотников.md", "Факты биографии", HH2, {"Статус", "Наставник", "Ресурсы"}, 2),
]

# Таблица «Название | Уровни | Суть» (Player's Guide to the Sabbat 1992): только новое
TABLE_ROWS = [
    ("Revised_Гайды_сект/04a_Шабаш_1992_Players_Guide_создание_персонажа_ритуалы_Винкулум.md", "5. Новые предыстории", PGS, {"Признание стаи"}),
]

def split_en(title):
    m = re.match(r"^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)", title)
    return (m.group(1).strip(), m.group(2).strip()) if m else (title.strip(), "")

def section(rel, start, nth=0):
    """Раздел по началу заголовка; nth — какой по счёту из одноимённых (в Hunters Hunted II их три)."""
    lines = read(os.path.join(REF, rel))
    for i, l in enumerate(lines):
        m = re.match(r"^(#{2,4})\s+(.*)$", l)
        if m and m.group(2).startswith(start):
            if nth: nth -= 1; continue
            lvl = len(m.group(1))
            end = next((j for j in range(i + 1, len(lines)) if re.match(r"^#{1,%d}\s" % lvl, lines[j]) or lines[j].strip() == "---"), len(lines))
            return m.group(2), lines[i + 1:end]
    print("  факт биографии не найден:", rel, start)
    return None, []

# секта книги — пометка в мастере создания и библиотеке (у Шабаша — прежний флаг sabbat)
SECT_OF_BOOK = {AU: "anarchs"}

def entry(ru, en, book, body_html, note=""):
    return {"name": ru, "en": en, "sabbat": False, **({"sect": SECT_OF_BOOK[book]} if book in SECT_OF_BOOK else {}), "source": book,
            "html": f"<p><em>Источник: {html.escape(book)}.{(' ' + html.escape(note)) if note else ''}</em></p>" + body_html}

def collect(core):
    have = {re.sub(r"[^a-zа-яё]", "", (x.get("en") or x["name"]).lower()) for x in core} | {x["name"].lower() for x in core}
    out = []
    def add(e):
        key = re.sub(r"[^a-zа-яё]", "", (e["en"] or e["name"]).lower())
        if key in have or e["name"].lower() in have: return
        have.add(key); have.add(e["name"].lower()); out.append(e)
    for rel, start, book, ru, en, note in SECTIONS:
        title, body = section(rel, start)
        if title is None: continue
        r2, e2 = split_en(re.sub(r"\s*[•]+[–\-]*[•]*\s*$", "", title))
        e = entry(ru or r2, en or e2, book, md_to_html(body), note)
        if "Шабаш" in book or "Sabbat" in book: e["sabbat"] = True
        add(e)
    for rel, start, book, skip, *nth in BULLETS:
        _, body = section(rel, start, nth[0] if nth else 0)
        cur = None
        for l in body + ["- **@**"]:
            m = re.match(r"^- \*\*([^*]+?)\*\*\s*(?:\(([^)]+)\))?\s*[:—]\s*(.*)$", l) or re.match(r"^- \*\*(@)\*\*$", l)
            if m:
                if cur and cur[0] not in skip: add(entry(cur[0], cur[1], book, md_to_html(cur[2])))
                cur = (m.group(1), m.group(2) or "", [m.group(3)] if m.lastindex and m.lastindex >= 3 else []) if m.group(1) != "@" else None
            elif cur is not None and l.strip():
                cur[2].append(l)
    for rel, start, book, take in TABLE_ROWS:
        _, body = section(rel, start)
        for l in body:
            m = re.match(r"^\| \*\*(.+?)\*\*\s*(?:\((.+?)\))?\s*\| (.+?) \| (.+) \|$", l)
            if m and m.group(1) in take:
                e = entry(m.group(1), m.group(2) or "", book, md_to_html([m.group(4)]), "Только Шабаш.")
                e["sabbat"] = True
                add(e)
    print(f"Факты биографии из дополнений: +{len(out)} — {', '.join(x['name'] for x in out)}")
    return out
