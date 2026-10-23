# tools/paths_extra.py
# Пути Просветления сверх основной книги V20 и Дороги Тёмных веков → data/paths.json.
# Вызывается из build_data.main() после parse_paths().
#
# Разметка книг одна и та же: заголовок «Путь/Дорога (En) — «прозвище»», строки «**Добродетели:** …»,
# «**Аура/Столп:** …» и таблица «Ур. | Грех | …». Пути внутри Дороги Тёмных веков (### Путь Охотника под
# ## Дорогой Зверя) перечисляют только отличающиеся грехи — остальное наследуют от своей Дороги.
# Повторы (по английскому названию, иначе по русскому) отсекаются; материалы Тёмных веков — era = "darkAges".

import os, re, unicodedata
from build_data import REF, read, md_to_html, translit

DA = "darkAges"

# английские названия путей основной книги V20 (в справочнике их нет) — для сверки повторов
CORE_EN = {"humanity": "Humanity", "power": "Path of Power and the Inner Voice", "feralHeart": "Path of the Feral Heart",
           "caine": "Path of Caine", "cathari": "Path of Cathari", "bones": "Path of Bones", "blood": "Path of Blood",
           "lilith": "Path of Lilith", "night": "Path of Night", "paradox": "Path of Paradox",
           "metamorphosis": "Path of Metamorphosis", "typhon": "Path of Typhon", "honorableAccord": "Path of Honorable Accord"}
# старые английские имена тех же путей
ALIAS_EN = {"death soul": "bones", "harmony": "feralHeart", "honorable agreement": "honorableAccord",
            "power inner voice": "power", "evil revelations": None}

# (файл, эпоха, книга, {замены: название раздела → {name, en}}, родительская Дорога из другой книги)
SOURCES = [
    ("Lore_of_the_Clans/02_Бруха.md", "", "V20 Lore of the Clans", {}, None),
    ("Lore_of_the_Clans/03_Последователи_Сета.md", "", "V20 Lore of the Clans", {}, None),
    ("Lore_of_the_Clans/09_Равнос.md", "", "V20 Lore of the Clans", {}, None),
    ("Black_Hand/01_Тал_Махе_Ра_персонажи_и_Пути.md", "", "V20 The Black Hand",
     {"Виа Хирон": {"name": "Путь Улья (Виа Хирон)", "en": "Via Hyron: The Path of the Hive"}}, None),
    ("Revised_Гайды_сект/03d_Шабаш_1999_Пути_Просветления.md", "", "Guide to the Sabbat (Revised, 1999)", {}, None),
    ("Revised_Основная/03_Пути_Просветления_достоинства_недостатки_особые_системы.md", "", "Vampire: The Masquerade Revised", {}, None),
    ("Revised_Гайды_сект/04c_Шабаш_1992_Players_Guide_Пути_Просветления.md", "", "The Player's Guide to the Sabbat (2nd Edition)", {}, None),
    ("Revised_Кланбуки/01_Последователи_Сета.md", "", "Clanbook: Followers of Set (Revised)", {"Путь Сутеха": {"en": "Path of Sutekh"}}, None),
    # Тёмные века
    ("V20_Dark_Ages/02_Дороги.md", DA, "V20 Dark Ages",
     {"Дорога Человечности": {"bearing": "Человечность"}}, None),        # в книге у Ауры только описание
    ("DA_Companion/01_Дороги_и_пути.md", DA, "V20 Dark Ages Companion",
     {"Путь Чистых": {"bearing": "Святость", "virtues": ["conscience", "selfControl"]},       # «как у Дороги Небес»
      "Дорога Ахура": {"en": "Road of Ahura Mazda", "followers": "Кающиеся", "virtues": ["conviction", "selfControl"],
                       "parent": "Дорога Человечности", "add": True}}, None),             # «как Дорога Человечности + добавления»
    ("DA_Road_of_Heaven/01_Дорога_Небес_Пути_и_обряды.md", DA, "Dark Ages: Road of Heaven", {}, "Дорога Небес"),
    ("DA_Clanbook_Salubri/03_Касты_слабость_запреты_Дорога_Скорби.md", DA, "Dark Ages Clanbook: Salubri", {}, None),
    ("DA_Clanbook_Baali/01_Дороги_Путь_Улья.md", DA, "Dark Ages Clanbook: Baali", {}, None),
    ("DA_Storytellers_Companion/01_Линии_крови_и_малые_Дороги.md", DA, "Dark Ages Storytellers Companion", {}, None),
    ("DA_Основная/02_Дороги_Dark_Ages_2002.md", DA, "Dark Ages: Vampire (2002)", {}, None),
    ("DA_House_of_Tremere/05_Горгульи_и_творения_мастерских.md", DA, "Dark Ages: House of Tremere",
     {"Дорога Служения": {"en": "Road of Service", "followers": "горгульи"}}, None),
]

VIRT = [(r"убеждённ|решимост|решительн|conviction", "conviction"), (r"инстинкт|instinct", "instinct"),
        (r"совест|conscience", "conscience"), (r"самоконтрол|самообладан|self.?control", "selfControl")]

def akey(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(w for w in re.findall(r"[a-z]+", s) if w not in {"the", "path", "of", "road", "via", "a", "and"})

def rkey(s):
    return re.sub(r"[^а-яё]", "", re.sub(r"\(.*?\)", "", (s or "").lower()).replace("ё", "е"))

def blocks(lines):
    """[(уровень, заголовок, собственные строки до следующего заголовка любого уровня, индекс)]"""
    heads = [(i, len(m.group(1)), m.group(2).strip()) for i, l in enumerate(lines) if (m := re.match(r"^(#{1,4})\s+(.*)$", l))]
    out = []
    for n, (i, lvl, t) in enumerate(heads):
        j = heads[n + 1][0] if n + 1 < len(heads) else len(lines)
        out.append((lvl, t, lines[i + 1:j]))
    return out

def hierarchy(lines):
    """Таблица «Ур./Уровень/Рейтинг | Грех/Принцип | …» → [{rating, sin}]."""
    res, on = [], False
    for k, l in enumerate(lines):
        if l.startswith("|") and k + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|", lines[k + 1]):
            c = [x.strip().replace("*", "") for x in l.strip().strip("|").split("|")]
            on = len(c) >= 2 and re.match(r"Ур|Уров|Рейтинг|У\.|Значение", c[0]) and re.match(r"Грех|Принцип|Запрет|Нарушен|Минимальное прегрешение", c[1])
            continue
        if on and l.startswith("|"):
            c = [x.strip() for x in l.strip().strip("|").split("|")]
            m = re.match(r"^(\d{1,2})$", c[0].replace("*", ""))
            if m and len(c) >= 2 and c[1] and not re.match(r"^[-:]+$", c[1]):
                res.append({"rating": int(m.group(1)), "sin": re.sub(r"\*\*", "", c[1]).strip().rstrip(".")})
        elif not l.startswith("|"):
            on = False
    return res

def title_parts(t):
    """«4. Путь Злых Откровений (Path of Evil Revelations) — «Развратители»» → (ru, en, прозвище).
    Скобки снимаются до разбора по тире: внутри бывает своё тире («(Via Pinaculum? — OCR/шрифт)»)."""
    t = re.sub(r"^\d+\.\s*", "", t).replace("‑", "-")      # неразрывный дефис («Ахура‑Мазда»)
    parens = re.findall(r"\(([^()]*)\)", t)
    head = re.sub(r"\s*\([^()]*\)", "", t)
    nick = ""
    m = re.search(r"\s+[—–]\s+(.*)$", head)
    if m:
        tail = m.group(1); head = head[:m.start()]
        mq = re.search(r"«([^»]+)»", tail)
        if mq and not re.match(r"иерарх", tail, re.I): nick = mq.group(1)
    # английское — первая латинская часть первой скобки с латиницей («Via Dolorosa; у Аширра — …» → «Via Dolorosa»)
    en = next((re.split(r"\s*[;?]|\s+[—–]\s+", p)[0].strip() for p in parens if re.search(r"[A-Za-z]", p)
               and not re.match(r"^(?:Crusaders|Martyrs|Penitents|Faithful)\b", p)), "")
    return head.strip(), en, nick

def field(text, rx):
    m = re.search(rx, text, re.I)
    return re.sub(r"\*", "", m.group(1)).strip(" .,;:") if m else ""

def make(title, body, book, era, ov, parent_hier):
    ru, en, nick = title_parts(title)
    ru, en = ov.get("name", ru), ov.get("en", en)
    text = "\n".join(body)
    virt = field(text, r"Добродетели:?\**\s*:?\s*([^.\n]+)")
    vs = [k for rx, k in VIRT if re.search(rx, virt, re.I)]
    order = {"conscience": 0, "conviction": 0, "selfControl": 1, "instinct": 1}
    vs = sorted(dict.fromkeys(vs), key=lambda v: order[v])[:2]
    bearing = field(text, r"(?:Аура|Столп)(?:\s*\(Bearing\))?\**\s*:\s*\**\s*([^*—(.\n]+)").strip("«» ")
    if bearing[:1].islower(): bearing = ""             # «Аура: влияет на исход…» — описание, а не название
    nick = field(text, r"Прозвищ[еа]:?\**\s*:?\s*([^.(\n]+)") or nick
    own = hierarchy(body)
    hier = own
    inherited = False
    if parent_hier and 0 < len(own) < 10:
        merged = {h["rating"]: h["sin"] for h in parent_hier}
        for h in own:                           # «Грех (добавление)» — к греху Дороги, иначе вместо него
            merged[h["rating"]] = f'{merged[h["rating"]]}; {h["sin"]}' if ov.get("add") and h["rating"] in merged else h["sin"]
        hier = [{"rating": r, "sin": merged[r]} for r in sorted(merged, reverse=True)]
        inherited = True
    note = f"<p><em>Источник: {book}.{' Грехи, не указанные для пути, — как у его Дороги.' if inherited else ''}</em></p>"
    return {"key": "", "name": ru, "en": en, "followers": ov.get("followers", nick),
            "virtues": ov.get("virtues") or vs or ["conviction", "instinct"], "bearing": ov.get("bearing", bearing), "hierarchy": hier, "era": era, "source": book,
            "html": note + md_to_html([l for l in body if not l.startswith("|")])}, len(own)

def apply(paths):
    for p in paths:
        if not p.get("en"): p["en"] = CORE_EN.get(p["key"], "")
        p.setdefault("era", "")
    have = {akey(p["en"]) for p in paths if p.get("en")} | {rkey(p["name"]) for p in paths}
    have |= {a for a, k in ALIAS_EN.items() if k}
    keys = {p["key"] for p in paths}
    roads = {}                                  # Дороги по названию — для путей из других книг
    added, report = 0, []
    for rel, era, book, over, parent_name in SOURCES:
        path = os.path.join(REF, rel)
        if not os.path.exists(path): report.append(f"  нет файла: {rel}"); continue
        lines = read(path)
        stack = []                              # Дороги-родители: {level, hierarchy, bearing}
        n_file = 0
        for lvl, title, body in blocks(lines):
            stack = [s for s in stack if s["level"] < lvl]
            if not re.search(r"Путь|Дорога|Виа|Via|Path|Road", title): continue
            ov = next((v for k, v in over.items() if title_parts(title)[0].startswith(k)), {})
            pname = ov.get("parent", parent_name)
            parent = stack[-1] if stack and not ov.get("parent") else (roads.get(pname) if pname else None)
            p, n_own = make(title, body, book, era, ov, parent["hierarchy"] if parent else None)
            if parent and not p["bearing"]: p["bearing"] = parent["bearing"]      # Столп пути — от его Дороги
            if re.search(r"Дорога|Road|Via", title) and lvl <= 2:
                road = {"level": lvl, "hierarchy": p["hierarchy"] if n_own >= 8 else [], "bearing": p["bearing"]}
                stack.append(road); roads[p["name"]] = road
            if len(p["hierarchy"]) < 5: continue
            if (p["en"] and akey(p["en"]) in have) or rkey(p["name"]) in have: continue
            key = translit(p["name"]) or f"path{len(keys)}"
            while key in keys: key += "2"
            p["key"] = key; keys.add(key)
            paths.append(p); added += 1; n_file += 1
            have |= {akey(p["en"]), rkey(p["name"])}
        report.append(f"  {rel.split('/')[0][:28]:28} +{n_file}")
    print(f"Пути Просветления и Дороги из дополнений: +{added} (Тёмные века: {sum(1 for p in paths if p.get('era') == DA)})")
    for r in report: print(r)
    return paths
