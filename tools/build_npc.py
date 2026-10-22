# tools/build_npc.py
# Статблоки для генератора НПС (module/apps/npc-gen.mjs) — из V20, гл. 9 «Иные»
# (русское издание, books/Мир Тьмы/Вампиры/_текст/V20): охотники и преступники,
# оборотни, маги, феи, призраки, демоны, «Зверинец» и таблица «Рои и стаи».
#
# Блок в книге: «Характеристики: …», «Способности: …», «Аналоги Дисциплин: …»,
# «Человечность: …; воля: …; <запас>: …», у зверей — «Воля: …; уровни здоровья: …»,
# «Атака: …», «Запас крови: …». В квадратных скобках — навыки только у дрессированных.
# Названия блоков — по порядку (TEMPLATES): в тексте заголовок часто стоит выше описания.
#
# Запуск из корня системы:  python -I tools/build_npc.py
# Результат: data/npc.json (вместе с наборами имён из NAMES ниже).

import json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "books", "Мир Тьмы", "Вампиры", "_текст", "V20",
                   "Vampire_the_Masquerade_20th_Aniversary_-_V20_-_Core_Rulebook_RU.txt")
LANG = json.load(open(os.path.join(ROOT, "lang", "ru.json"), encoding="utf-8"))["VTM20"]
DISC = json.load(open(os.path.join(ROOT, "data", "disciplines.json"), encoding="utf-8"))

ATTR = {v.lower(): k for k, v in LANG["Attr"].items()}
ABIL = {v.lower(): k for k, v in LANG["Abil"].items()}
DISC_BY_NAME = {d["name"].lower(): d["key"] for d in DISC.values()}

GROUPS = [
    ("hunters", "Охотники на вампиров"), ("criminals", "Преступники"), ("lupines", "Оборотни"),
    ("mages", "Маги"), ("fae", "Феи"), ("ghosts", "Призраки"), ("demons", "Демоны"),
    ("animals", "Зверинец"), ("swarms", "Рои и стаи")
]
# (ключ, название, группа, тип актёра, запас силы)
TEMPLATES = [
    ("inquisitor", "Инквизитор", "hunters", "mortal", ""),
    ("agent", "Правительственный агент", "hunters", "mortal", ""),
    ("arcanist", "Учёный арканист", "hunters", "mortal", ""),
    ("gangster", "Гангстер, босс", "criminals", "mortal", ""),
    ("lupineYoung", "Молодой оборотень", "lupines", "creature", "гнозис"),
    ("lupineAdult", "Взрослый Люпен", "lupines", "creature", "гнозис"),
    ("lupineOld", "Старый волколак", "lupines", "creature", "гнозис"),
    ("mageNeophyte", "Неофит", "mages", "creature", "квинтэссенция"),
    ("mageArch", "Верховный волшебник", "mages", "creature", "квинтэссенция"),
    ("mageTechno", "Техновыродок", "mages", "creature", "квинтэссенция"),
    ("pooka", "Пука-проказник", "fae", "creature", "чары"),
    ("redcap", "Красная шапка-воин", "fae", "creature", "чары"),
    ("sidhe", "Сид-чаровница", "fae", "creature", "чары"),
    ("ghostYoung", "Молодой призрак", "ghosts", "creature", "пафос"),
    ("ghostHungry", "Голодный призрак", "ghosts", "creature", "пафос"),
    ("ghostOld", "Старый призрак", "ghosts", "creature", "пафос"),
    ("demonTempter", "Падший совратитель", "demons", "creature", "вера"),
    ("demonEarthbound", "Пленённый осквернитель", "demons", "creature", "вера"),
    ("alligator", "Аллигатор", "animals", "creature", ""),
    ("camel", "Верблюд", "animals", "creature", ""),
    ("wolf", "Волк", "animals", "creature", ""),
    ("constrictor", "Удав", "animals", "creature", ""),
    ("viper", "Ядовитая змея", "animals", "creature", ""),
    ("lynx", "Рысь", "animals", "creature", ""),
    ("cat", "Домашняя кошка", "animals", "creature", ""),
    ("leopard", "Леопард (ягуар, пантера)", "animals", "creature", ""),
    ("tiger", "Тигр (лев)", "animals", "creature", ""),
    ("rat", "Крыса", "animals", "creature", ""),
    ("bear", "Медведь", "animals", "creature", ""),
    ("bat", "Летучая мышь", "animals", "creature", ""),
    ("spider", "Паук", "animals", "creature", ""),
    ("pony", "Маленькая лошадь (пони, жеребёнок)", "animals", "creature", ""),
    ("horse", "Большая лошадь (жеребец, тяжеловоз)", "animals", "creature", ""),
    ("smallBird", "Маленькая птица (зяблик, попугай)", "animals", "creature", ""),
    ("bigBird", "Большая птица (ястреб, ворон)", "animals", "creature", ""),
    ("pig", "Маленькая свинья (домашняя)", "animals", "creature", ""),
    ("boar", "Большая свинья (кабан)", "animals", "creature", ""),
    ("smallDog", "Маленькая собака (мопс)", "animals", "creature", ""),
    ("dog", "Средняя собака (бигль, колли)", "animals", "creature", ""),
    ("bigDog", "Большая собака (овчарка, дог)", "animals", "creature", ""),
    ("chimp", "Шимпанзе", "animals", "creature", ""),
]
SWARMS = [  # «Рои и стаи»: урон, уровни здоровья, инициатива (таблица гл. 9)
    ("swarmTiny", "Рой мелких насекомых", 1, 5, 2), ("swarmBugs", "Рой крупных насекомых", 2, 7, 3),
    ("swarmFlies", "Рой летающих насекомых", 2, 5, 4), ("swarmBats", "Стая птиц или летучих мышей", 4, 9, 5),
    ("swarmRats", "Стая крыс", 3, 7, 3), ("swarmBigRats", "Стая крупных крыс", 4, 9, 3),
    ("swarmCats", "Стая диких кошек", 4, 6, 6), ("swarmDogs", "Стая диких собак или волков", 6, 15, 4),
]
SWARM_RULE = ("Рой атакует раз в ход: проверка урона (сл. 6) пулом из таблицы, повреждения тяжёлые "
              "(у мелких тварей — лёгкие). Защита — уклонение; не уклонился — скорость вдвое. Больше 2 повреждений "
              "или провал — сбит с ног и захлёстнут: только ползёт, сложность урона роя 5. Уровни здоровья — сколько "
              "повреждений рой выдержит до рассеивания, ещё 2 — уничтожен. Пистолеты, винтовки и лёгкое холодное "
              "оружие — не больше 1 повреждения за атаку; дробовики, тяжёлое оружие и урон по площади — как обычно. "
              "Рои не поглощают урон.")
ANIMAL_RULE = ("Зверя можно сделать гулем: раз в месяц поить витэ. Животное-гуль получает волю, 1 точку Мощи "
               "и 2 пункта крови (V20, гл. 9).")

LABELS = ["Характеристики", "Способности", "Аналоги Дисциплин", "Человечность", "Воля", "уровни здоровья",
          "Атака", "Запас крови", "Снаряжение", "Примечание"]


def clean(s):
    return s.replace("‑ ", "").replace("‑", "-").replace("­", "").strip()


def blocks(lines):
    """Строки, с которых начинаются статблоки главы 9, и текст блока целиком."""
    start = next(i for i, l in enumerate(lines) if l.strip() == "Охотники на вампиров" and i > 10000)
    end = next(i for i, l in enumerate(lines) if l.strip() == "Рои и стаи" and i > start)
    heads = [i for i in range(start, end) if lines[i].startswith("Характеристики")]
    out = []
    for n, i in enumerate(heads):
        stop = heads[n + 1] if n + 1 < len(heads) else end
        buf = []
        j = i
        while j < stop:
            s = lines[j].strip()
            if not s or s == "Глава девятая. Иные" or s.isdigit(): j += 1; continue
            # продолжение блока: метка поля, строчная буква, цифра, скобка
            if j == i or any(s.startswith(l) for l in LABELS) or s[0].islower() or s[0].isdigit() or s[0] in "([":
                buf.append(s); j += 1; continue
            # врезка посреди блока («Опасный деликатес»): блок продолжается после колонтитула
            k = next((k for k in range(j, min(j + 15, stop)) if lines[k].strip() == "Глава девятая. Иные"), None)
            nxt = next((lines[m].strip() for m in range(k + 1, stop) if lines[m].strip() and not lines[m].strip().isdigit()), "") if k else ""
            if nxt and nxt[0].islower():
                j = k + 1; continue
            break
        page = next((int(lines[k].strip()) for k in range(i, i - 80, -1) if lines[k].strip().isdigit() and 300 < int(lines[k].strip()) < 500), None)
        out.append((clean(" ".join(buf)), page))
    return out


def fields(text):
    """Разрезать блок по меткам полей."""
    marks = sorted((m.start(), m.group(1)) for m in re.finditer(r"(?:^|[.;]\s*)(" + "|".join(map(re.escape, LABELS)) + r")[^:]*:", text))
    res = {}
    for n, (pos, label) in enumerate(marks):
        body_start = text.index(":", pos) + 1
        body_end = marks[n + 1][0] if n + 1 < len(marks) else len(text)
        # у поля важно первое вхождение: дальше в склейке может оказаться текст соседнего раздела
        body = re.split(r"\s\d+\.\s*Прим\. пер|Прим\. пер", text[body_start:body_end])[0]
        res.setdefault(label, body.strip(" .;"))
    return res


def split_list(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch in "([«": depth += 1
        if ch in ")]»": depth -= 1
        if ch == "," and depth == 0: out.append(cur.strip()); cur = ""
        else: cur += ch
    if cur.strip(): out.append(cur.strip())
    return out


def parse_attrs(s):
    res = {}
    for part in split_list(s):
        m = re.match(r"([а-яё]+)\s+(\d+)(?:\s*/\s*(\d+))?", part.strip().lower())
        if m and m.group(1) in ATTR:
            # «сила 0 / 2» (призраки, демоны) — обычно 0, во плоти — второе число
            res[ATTR[m.group(1)]] = int(m.group(3) or m.group(2))
    return res


def parse_abils(s):
    """Способности и [навыки дрессированных]; «(специализация)», «4 (или выше)»."""
    trained = ""
    m = re.search(r"\[(.*)\]", s)
    if m: trained, s = m.group(1), s[:m.start()] + s[m.end():]
    def one(src):
        res, notes = {}, []
        for part in split_list(src):
            p = part.strip().lower()
            if not p: continue
            m = re.match(r"([а-яё ]+?)\s*(?:\(([^)]*)\))?\s*(\d+)", p)
            if m and m.group(1).strip() in ABIL:
                res[ABIL[m.group(1).strip()]] = {"value": int(m.group(3)), "specialty": (m.group(2) or "").strip()}
            elif p != "нет":
                notes.append(part.strip())
        return res, notes
    base, n1 = one(s)
    tr, n2 = one(trained)
    return base, tr, n1 + n2


def parse_discs(s):
    res, notes = {}, []
    for part in split_list(s):
        m = re.match(r"([а-яё ]+?)\s+(\d+)(?:\s*\((.*)\))?", part.strip().lower())
        if m and m.group(1).strip() in DISC_BY_NAME:
            res[DISC_BY_NAME[m.group(1).strip()]] = int(m.group(2))
            if m.group(3): notes.append(part.strip())
        else:
            notes.append(part.strip())
    return res, notes


def parse_attacks(s, strength):
    """«укус (сила + 1), удар хвостом (сила + 2)» → оружие ближнего боя зверя (кубы = Сила ± n)."""
    out = []
    for part in split_list(s):
        m = re.match(r"(.+?)\s*\(сила(?:\s*([+—–-])\s*(\d+))?", part.strip())
        if not m: continue
        name = re.sub(r"^.*?—\s*", "", m.group(1)).strip()
        name = name[0].upper() + name[1:]
        sign = m.group(2)
        n = int(m.group(3) or 0) * (-1 if sign and sign in "—–-" else 1)
        lethal = re.search(r"укус|когт|клык", name, re.I)
        out.append({"name": name, "dice": max(1, strength + n), "damageType": "lethal" if lethal else "bashing"})
    return out


def num(s, label):
    """Число после метки; «от 6 до 8» — середина."""
    m = re.search(label + r"\s*:?\s*(?:от\s*)?(\d+)(?:\s*до\s*(\d+))?", s, re.I)
    if not m: return None
    return (int(m.group(1)) + int(m.group(2)) + 1) // 2 if m.group(2) else int(m.group(1))


def build():
    lines = open(SRC, encoding="utf-8").read().split("\n")
    raw = blocks(lines)
    assert len(raw) == len(TEMPLATES), f"блоков {len(raw)}, шаблонов {len(TEMPLATES)}"
    out = []
    for (key, name, group, kind, pool), (text, page) in zip(TEMPLATES, raw):
        f = fields(text)
        attrs = parse_attrs(f.get("Характеристики", ""))
        abil, trained, abil_notes = parse_abils(f.get("Способности", ""))
        discs, disc_notes = parse_discs(f.get("Аналоги Дисциплин", ""))
        morality = f.get("Человечность", "")
        t = {
            "key": key, "name": name, "group": group, "kind": kind, "page": page,
            "attributes": attrs, "abilities": abil, "trained": trained, "disciplines": discs,
            "humanity": num("Человечность: " + morality, "Человечность"),
            "humanityText": morality.split(";")[0].strip(),
            "willpower": num(morality, "воля") or num("Воля: " + f.get("Воля", ""), "Воля"),
            "notes": [x for x in abil_notes + disc_notes if x],
        }
        if pool:
            t["pool"] = {"name": pool, "value": num(morality, pool)}
        if "уровни здоровья" in f: t["health"] = f["уровни здоровья"]
        if "Атака" in f: t["attacks"] = parse_attacks(f["Атака"], attrs.get("strength", 1)); t["attackText"] = f["Атака"]
        if "Запас крови" in f:
            b = f["Запас крови"]
            t["blood"] = 0 if b.startswith("нет") else int(re.match(r"\d+", b).group(0))
            t["bloodText"] = b
        # список снаряжения кончается точкой; дальше в книге может идти текст следующего раздела
        if "Снаряжение" in f: t["equipment"] = re.split(r"\.\s", f["Снаряжение"] + " ")[0].strip(" .")
        if "Примечание" in f: t["note"] = f["Примечание"]
        if group == "animals": t["supernatural"] = False
        out.append(t)
    for key, name, dmg, health, init in SWARMS:
        out.append({"key": key, "name": name, "group": "swarms", "kind": "creature", "page": 420,
                    "swarm": {"damage": dmg, "health": health, "initiative": init}, "supernatural": False, "note": SWARM_RULE})
    return out


# Наборы имён: французы 1789 года (хроника «Liberté»), англичане, немцы, русские, итальянцы.
NAMES = {
    "fr": {"label": "Французы (XVIII век)",
           "m": ["Жан", "Пьер", "Луи", "Жак", "Франсуа", "Антуан", "Николя", "Этьен", "Клод", "Мишель", "Шарль", "Жозеф",
                 "Огюстен", "Бертран", "Гийом", "Ипполит", "Камиль", "Максимильен", "Андре", "Филипп", "Габриэль", "Анри",
                 "Жан-Батист", "Жан-Поль", "Лоран", "Мартен", "Оноре", "Рене", "Тома", "Венсан"],
           "f": ["Мари", "Анна", "Жанна", "Луиза", "Маргарита", "Франсуаза", "Катрин", "Элизабет", "Мадлен", "Женевьева",
                 "Антуанетта", "Софи", "Шарлотта", "Аделаида", "Тереза", "Олимпия", "Манон", "Люсиль", "Жюли", "Полина",
                 "Клер", "Изабель", "Виктуар", "Розали", "Эмили"],
           "last": ["Мартен", "Бернар", "Дюбуа", "Тома", "Робер", "Ришар", "Пети", "Дюран", "Леруа", "Моро", "Симон",
                    "Лоран", "Лефевр", "Мишель", "Гарнье", "Шевалье", "Бонне", "Жирар", "Руссо", "Фурнье", "Мерсье",
                    "Дюпон", "Ламбер", "Фонтен", "Бланшар", "Гийо", "Лемуан", "Марешаль", "Обер", "Сансон", "Карно",
                    "Дантон", "Демулен", "Ролан", "Кордье", "де Ла Тур", "де Сен-Пьер", "де Монморанси", "де Ноай", "де Бриссак"]},
    "en": {"label": "Англичане",
           "m": ["Джон", "Уильям", "Томас", "Джордж", "Джеймс", "Генри", "Эдвард", "Чарльз", "Ричард", "Роберт", "Сэмюэл", "Бенджамин"],
           "f": ["Мэри", "Элизабет", "Энн", "Сара", "Джейн", "Маргарет", "Шарлотта", "Эмили", "Кэтрин", "Ханна", "Элинор"],
           "last": ["Смит", "Браун", "Тейлор", "Уилсон", "Джонсон", "Уайт", "Хьюз", "Эванс", "Кларк", "Холл", "Райт", "Грин", "Фостер", "Харрис"]},
    "de": {"label": "Немцы",
           "m": ["Иоганн", "Фридрих", "Карл", "Вильгельм", "Генрих", "Георг", "Людвиг", "Готфрид", "Эрнст", "Франц"],
           "f": ["Анна", "Мария", "Елизавета", "Катарина", "Маргарета", "Шарлотта", "Доротея", "Луиза", "Вильгельмина"],
           "last": ["Мюллер", "Шмидт", "Шнайдер", "Фишер", "Вебер", "Майер", "Вагнер", "Беккер", "Шульц", "Гофман", "Кох", "Рихтер"]},
    "it": {"label": "Итальянцы",
           "m": ["Джованни", "Джузеппе", "Антонио", "Франческо", "Лоренцо", "Марко", "Пьетро", "Карло", "Никколо", "Витторио"],
           "f": ["Мария", "Анна", "Лукреция", "Изабелла", "Катерина", "Беатриче", "Франческа", "Джулия", "Лючия"],
           "last": ["Росси", "Руссо", "Феррари", "Эспозито", "Бьянки", "Романо", "Колонна", "Конти", "Риччи", "Марино", "Гримальди", "Медичи"]},
    "ru": {"label": "Русские", "femLast": True,
           "m": ["Иван", "Пётр", "Алексей", "Николай", "Михаил", "Дмитрий", "Андрей", "Сергей", "Фёдор", "Григорий", "Василий"],
           "f": ["Мария", "Анна", "Екатерина", "Елизавета", "Наталья", "Ольга", "Татьяна", "Софья", "Прасковья", "Варвара"],
           "last": ["Иванов", "Петров", "Соколов", "Орлов", "Волков", "Лебедев", "Морозов", "Голицын", "Долгоруков", "Шереметев", "Воронцов"]},
}

data = {
    "source": "V20, основная книга (RU), гл. 9 «Иные»",
    "groups": [{"key": k, "label": v} for k, v in GROUPS],
    "templates": build(),
    "animalRule": ANIMAL_RULE,
    "names": NAMES,
}
with open(os.path.join(ROOT, "data", "npc.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=1)
print(f"data/npc.json: {len(data['templates'])} шаблонов")
