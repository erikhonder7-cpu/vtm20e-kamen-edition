# tools/wraith_data.py
# Призрак: Забвение (Wraith: The Oblivion 20th Anniversary) — данные линейки из справочника проекта
# books/Мир Тьмы/Призраки/_справочник (пересказ механики по-русски, «Русское (English)»; текста книг в системе нет).
# Пишет:
#   data/wraith.json       — 16 Арканоев (уровни 1–5: Общий и Посвящённый — пул, сложность, цена в Пафосе, Корпусе,
#                            Воле, Ангст Тени), Гильдии и их союзы, Легионы, фракции, архетипы Психеи и Тени, Шипы,
#                            фоны, правила создания и опыта;
#   data/wraith-books.json — компендий «Призраки — книги»: книга — папка, файл — запись журнала, «## » — страница.
# Запуск — из build_data.py (или сам: python -I tools/wraith_data.py).

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import werewolf_data as wd   # общий разбор Markdown: md_html, split_md   # noqa: E402

REF = os.path.join(ROOT, "books", "Мир Тьмы", "Призраки", "_справочник")
CORE = os.path.join(REF, "Wraith20_Основная")
OUT = os.path.join(ROOT, "data", "wraith.json")
BOOKS_OUT = os.path.join(ROOT, "data", "wraith-books.json")
BOOKS = [("Wraith20_Основная", "Wraith 20 — основная книга"), ("Wraith20_Book_of_Oblivion", "Book of Oblivion"),
         ("Wraith20_Handbook", "Handbook for the Recently Deceased")]

ATTR = {"Сила": "strength", "Ловкость": "dexterity", "Выносливость": "stamina", "Стойкость": "stamina", "Обаяние": "charisma",
        "Манипуляция": "manipulation", "Внешность": "appearance", "Восприятие": "perception", "Интеллект": "intelligence",
        "Смекалка": "wits"}
# группа Гильдии (основная книга, гл. 1): высокие, рабочие, преступные, запретные
GUILD_GROUP = {"Ремесленники": "high", "Отпустители": "high", "Лицедеи": "high", "Ростовщики": "high",
               "Певцы": "working", "Вестники": "working", "Оракулы": "working", "Песочники": "working",
               "Пугала": "criminal", "Проказники": "criminal", "Прокторы": "criminal", "Кукловоды": "criminal", "Наблюдатели": "criminal",
               "Ходатаи": "forbidden", "Мнемои": "forbidden", "Алхимики": "forbidden"}
ICONS = {"argos": "fa-wind", "castigate": "fa-hand-holding-heart", "embody": "fa-person-rays", "fatalism": "fa-eye",
         "flux": "fa-flask", "inhabit": "fa-gears", "intimation": "fa-comment-dots", "keening": "fa-music", "lifeweb": "fa-diagram-project",
         "mnemosynis": "fa-brain", "moliate": "fa-hand-sparkles", "outrage": "fa-burst", "pandemonium": "fa-tornado",
         "phantasm": "fa-moon", "puppetry": "fa-masks-theater", "usury": "fa-scale-balanced"}


DESC_H, SYS_H = '<h4 class="r-sec">Описание</h4>', '<h4 class="r-sec">Система</h4>'
ART_TEXTS = {}
for _fn in sorted(f for f in os.listdir(os.path.join(HERE, "sources")) if re.match(r"wraith_art_texts_\d+\.json$", f)):
    with open(os.path.join(HERE, "sources", _fn), encoding="utf-8") as _f:
        ART_TEXTS.update(json.load(_f))


def read(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return text.split("---", 2)[2] if text.startswith("---") else text


def core(prefix):
    fn = next(f for f in sorted(os.listdir(CORE)) if f.startswith(prefix))
    return read(os.path.join(CORE, fn))


def ru_en(title):
    """«Русское (English)» → (русское, английское) по последним скобкам."""
    title = title.strip()
    m = re.match(r"^(.+?)\s*\(([^()]+)\)\s*$", title)
    return (m.group(1).strip(), m.group(2).strip()) if m else (title, "")


def plain(s):
    return re.sub(r"\*\*|\*", "", s).strip()


def html(lines):
    return wd.md_html(lines)


def table(text, header_start):
    """Строки Markdown-таблицы после строки-заголовка, начинающейся с header_start: списки ячеек."""
    rows, on = [], False
    for line in text.splitlines():
        if line.startswith(header_start):
            on = True
            continue
        if on:
            if not line.startswith("|"):
                if rows:
                    break
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
                continue
            rows.append(cells)
    return rows


def costs(text, arcanos):
    """Пул, сложность и цена уровня по тексту системы (первое упоминание)."""
    t = plain(text)
    out = {}
    m = re.search(r"(" + "|".join(ATTR) + r")\s*\+\s*" + re.escape(arcanos) + r"[а-яё]*", t)
    if m:
        out["attr"] = ATTR[m.group(1)]
    d = re.search(r"сложность\s+(\d+)", t)
    if d:
        out["diff"] = int(d.group(1))
    for key, rx in (("pathos", r"(\d+)\s+Пафос"), ("corpus", r"(\d+)\s+Корпус"), ("willpower", r"(\d+)\s+Вол[иья]"), ("angst", r"(\d+)\s+(?:временн[а-я]+\s+)?Ангст")):
        mm = re.search(rx, t)
        if mm:
            out[key] = int(mm.group(1))
    if re.search(r"Тень получает", t) and "angst" not in out:
        out["angst"] = 1
    if "без броска" in t or "Действует всегда" in t:
        out["noRoll"] = True
    # Покров (гл. 5): уровень, действующий сквозь Покров, по умолчанию идёт против рейтинга Покрова (не ниже 4);
    # «сложность = …» без числа — переменная (Воля цели, уровень Мальстрёма…): правило — подсказкой в окне броска
    rule = re.search(r"сложность\s*=\s*([^).;]+)", t)
    if rule:
        out["diffRule"] = rule.group(1).strip()
    if re.search(r"сложность\s*=\s*Покров", t) or ("diff" not in out and "diffRule" not in out and
            re.search(r"сквозь Покров|по ту сторону Покрова|Покров|в мир[еау]? живых|Земл[ия]х? Кожи|живо(?:й|го|му|е)|смертн", t)):
        out["shroud"] = True
    if re.search(r"или Покров, что выше", t):
        out["shroudMax"] = True
    return out


def parse_arcanoi():
    out = []
    for prefix in ("04", "05", "06"):
        lines = core(prefix).splitlines()
        i = 0
        while i < len(lines):
            m = re.match(r"^## (.+?) \(([^)]+)\) — (.+?) \(([^)]+)\)(.*)$", lines[i])
            if not m:
                i += 1
                continue
            name, en, guild, guild_en, rest = m.groups()
            key = re.sub(r"[^a-z]", "", en.lower())
            j = i + 1
            body = []
            while j < len(lines) and not lines[j].startswith("## "):
                body.append(lines[j])
                j += 1
            intro, levels, cur = [], [], None
            for line in body:
                lm = re.match(r"^- \*\*(•+) (.+) \((О|П)\)\.\*\*\s*(.*)$", line)
                if lm:
                    if cur:
                        levels.append(cur)
                    dots, title, kind, tail = lm.groups()
                    ru, lvl_en = ru_en(title)
                    cur = {"level": len(dots), "kind": "common" if kind == "О" else "initiate", "name": ru, "en": lvl_en,
                           "lines": ([f"- {tail}"] if tail else [])}
                    continue
                if line.startswith("#"):
                    if cur:
                        levels.append(cur)
                        cur = None
                    intro.append(line)   # сайдбары после уровней — в общий текст
                    continue
                if cur is not None:
                    if line.strip() and not line.startswith(" "):
                        levels.append(cur)
                        cur = None
                        intro.append(line)
                    else:
                        # таблица внутри уровня (с отступом пункта) — отдельным блоком, иначе склеится в строку пункта
                        cur["lines"].append(line.strip() if line.strip().startswith("|") else line[2:] if line.startswith("  ") else line)
                else:
                    intro.append(line)
            if cur:
                levels.append(cur)
            for lv in levels:
                text = "\n".join(lv.pop("lines"))
                lv.update(costs(text, name))
                desc_ = ART_TEXTS.get(f"{key}|{lv['level']}|{lv['kind']}", "")
                # описание тоже говорит, действует ли уровень сквозь Покров («шепчет сквозь Покров», «по ту сторону Покрова»)
                if not lv.get("shroud") and "diff" not in lv and "diffRule" not in lv and re.search(r"сквозь Покров|по ту сторону Покрова|в мир[еау]? живых|Земл[ия]х? Кожи", desc_):
                    lv["shroud"] = True
                # как силы Дисциплин у вампиров: «Описание» (своими словами по Wraith 20, tools/sources/wraith_art_texts_*.json) + «Система»
                desc = ART_TEXTS.get(f"{key}|{lv['level']}|{lv['kind']}", "")
                body = html(text.splitlines())
                lv["html"] = f"{DESC_H}\n<p>{desc}</p>\n{SYS_H}\n{body}" if desc else body
            attrs = sorted({lv["attr"] for lv in levels if lv.get("attr")})
            out.append({"key": key, "name": name, "en": en, "guild": guild, "guildEn": guild_en,
                        "group": GUILD_GROUP.get(guild, ""), "forbidden": "запретн" in rest, "icon": ICONS.get(key, "fa-ghost"),
                        "attrs": attrs, "html": html(intro), "levels": levels})
            i = j
    return out


def parse_allies(arcanoi):
    by_guild = {a["guild"]: a["key"] for a in arcanoi}
    rows = table(core("03"), "| Гильдия (Арканос)")
    out = {}
    for g, allies in rows:
        gname = re.sub(r"\s*\(.*$", "", g).strip()
        keys = [by_guild.get(re.sub(r"\s*\(.*$", "", x).strip()) for x in allies.split("),")]
        if by_guild.get(gname):
            out[by_guild[gname]] = [k for k in keys if k]
    return out


def parse_psyche_archetypes():
    out = []
    for name, when in table(core("03"), "| Архетип | Волю"):
        ru, en = ru_en(name)
        out.append({"name": ru, "en": en, "will": plain(when)})
    return out


def parse_backgrounds():
    out = []
    for name, text in table(core("03"), "| Фон | Суть"):
        ru, en = ru_en(plain(name))
        out.append({"name": ru, "en": en, "html": html([text])})
    return out


def parse_legions():
    out = []
    for name, death, lord, seat in table(core("01"), "| Легион |"):
        ru, en = ru_en(re.sub(r",\s*Gaunt", "", name))
        out.append({"key": re.sub(r"[^a-z]", "", en.lower()), "name": ru, "en": en, "death": death, "lord": lord, "seat": seat})
    return out


def parse_shadow():
    text = core("07")
    arch = []
    for name, core_, cath in table(text, "| Архетип | Суть"):
        ru, en = ru_en(plain(name))
        arch.append({"name": re.sub(r"^The\s+", "", ru), "en": re.sub(r"^The\s+", "", en), "text": plain(core_), "catharsis": plain(cath)})
    thorns = []
    for name, cost, effect in table(text, "| Шип | Цена"):
        ru, en = ru_en(plain(name))
        nums = [int(x) for x in re.findall(r"\d+", cost)]
        thorns.append({"key": re.sub(r"[^a-z]", "", en.lower()), "name": ru, "en": en, "costText": cost,
                       "cost": nums[0] if nums else 1, "perLevel": "за уровень" in cost, "max": nums[-1] if len(nums) > 1 else None,
                       "html": html([effect])})
    return arch, thorns


def parse_books():
    out = []
    for folder, label in BOOKS:
        d = os.path.join(REF, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(f for f in os.listdir(d) if f.endswith(".md")):
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                title, pages = wd.split_md(f.read())
            if not pages:
                continue
            title = re.sub(r"\s+—\s+Wraith 20\b.*$", "", title) or fn[:-3].replace("_", " ")
            out.append({"key": f"{folder}:{fn.split('_')[0]}", "book": label, "name": title, "pages": pages})
    return out


# Основная книга, гл. 4 и 8: создание и опыт (файлы 02 и 12)
CREATION = {"attributes": [7, 5, 3], "abilities": [13, 9, 5], "abilityMax": 3, "arcanoi": 5, "arcanosMax": 3, "backgrounds": 7,
            "passions": 10, "fetters": 10, "corpus": 10, "pathosBase": 5, "willpower": 5, "freebies": 15, "shadowTrade": 7,
            "shadowFreebies": 10, "darkPassions": 7}
FREEBIES = {"attribute": 5, "arcanos": 5, "willpower": 2, "ability": 2, "passion": 2, "background": 1, "fetter": 1, "pathosPer2": 1}
XP = {"attribute": "×4", "newAbility": 3, "ability": "×2", "newArcanos": 7, "arcanos": "×3", "willpower": "×1",
      "newPassion": 3, "passion": "×3", "fetter": "3 × рейтинг", "newBackground": 4, "background": "×3",
      "newDarkPassion": 2, "darkPassion": "×2", "angst": "×1"}
FACTIONS = [{"key": "hierarchy", "name": "Иерархия", "en": "Hierarchy"}, {"key": "renegade", "name": "Отступники", "en": "Renegades"},
            {"key": "heretic", "name": "Еретики", "en": "Heretics"}, {"key": "ferryman", "name": "Перевозчики", "en": "Ferrymen"}]
STATES = ["corporeal", "incorporeal", "wavering", "material", "harrowed"]



# ── Спектры (основная книга, гл. 10; файлы 20–23) ──
ATTR_SP = dict(ATTR, **{"Сообразительность": "wits"})
DARK_ICONS = {"collogue": "fa-circle-nodes", "contaminate": "fa-virus", "corruption": "fa-eye-low-vision", "larceny": "fa-hand-holding-droplet",
              "maleficence": "fa-skull", "shroudrending": "fa-scissors", "tempestos": "fa-hurricane", "tempestweaving": "fa-water"}
CASTES = [("mortwight", "Мортвайты", "Mortwights"), ("stripling", "Стриплинги", "Striplings"), ("doppelganger", "Двойники", "Doppelgangers"),
          ("nephwrack", "Нефврэки", "Nephwracks"), ("shade", "Шейды", "Shades"), ("malfean", "Мальфеаны", "Malfeans")]
# касты при создании (гл. 4 Спектров, файл 23): какие Арканои, бесплатный Тёмный Арканос, точки на выбор, Оковы
CASTE_RULES = {"mortwight": {"arcanoi": "dark", "free": {"tempestweaving": 1}, "points": 5, "fetters": True},
               "stripling": {"arcanoi": "all", "free": {"shroudrending": 1}, "points": 7, "fetters": False, "attributes": [6, 4, 2], "darkPassions": 8},
               "doppelganger": {"arcanoi": "all", "free": {}, "points": 6, "fetters": True},
               "nephwrack": {"arcanoi": "all", "free": {}, "points": 8, "fetters": False},
               "shade": {"arcanoi": "dark", "free": {}, "points": 5, "fetters": False, "darkPassions": 12, "shadecraft": 1},
               "malfean": {"arcanoi": "all", "free": {}, "points": 12, "fetters": False, "willpower": 10}}


def dark_costs(text):
    t = plain(text)
    out = {}
    m = re.search(r"(" + "|".join(ATTR_SP) + r")\s*\+\s*[A-Za-z][A-Za-z ]*", t)
    if m:
        out["attr"] = ATTR_SP[m.group(1)]
    d = re.search(r"сложность\s+(\d+)", t)
    if d:
        out["diff"] = int(d.group(1))
    a = re.search(r"Затрата:\s*(\d+)\s+Ангст", t) or re.search(r"(\d+)\s+Ангст", t)
    if a and not ("Ангста получаете" in t and "Затрата" not in t):   # «Смакование агонии» Ангст даёт, а не тратит
        out["angst"] = int(a.group(1))
    if re.search(r"сложность\s*[—=-]\s*(?:местный\s+)?рейтинг\w*\s+Покрова", t):
        out["shroud"] = True
    if re.search(r"рейтинг Покрова или Воля цели, что больше", t):
        out["shroudMax"] = True
    pa = re.search(r"(?<![+\d])(\d+)\s+Пафос", t)
    if pa:
        out["pathos"] = int(pa.group(1))
    w = re.search(r"(\d+)\s+Вол[иья]", t)
    if w:
        out["willpower"] = int(w.group(1))
    p = re.search(r"Психея[^.]*?\+(\d+)\s+Пафос", t)
    if p:
        out["psyche"] = int(p.group(1))
    if re.search(r"оспариваем", t):
        out["contested"] = True
    return out


def parse_dark_arcanoi(prefix="21", icons=None):
    icons = icons or DARK_ICONS
    lines = core(prefix).splitlines()
    out, cur, lv = [], None, None
    for line in lines:
        m = re.match(r"^## (.+?) \(([^)]+)\)(.*)$", line)
        if m:
            cur = {"key": re.sub(r"[^a-z]", "", m.group(2).lower()), "name": m.group(1).strip(), "en": m.group(2).strip(),
                   "intro": [], "levels": []}
            cur["icon"] = icons.get(cur["key"], "fa-ghost")
            out.append(cur)
            lv = None
            continue
        m = re.match(r"^### (.+?) \(([^)]+)\)\s*(•+)\s*$", line)
        if m and cur:
            lv = {"level": len(m.group(3)), "name": m.group(1).strip(), "en": m.group(2).strip(), "lines": []}
            cur["levels"].append(lv)
            continue
        if line.startswith("---"):
            lv = None
            continue
        if cur is None:
            continue
        (lv["lines"] if lv else cur["intro"]).append(line)
    for a in out:
        a["html"] = html(a.pop("intro"))
        for lv in a["levels"]:
            text = "\n".join(lv.pop("lines"))
            lv.update(dark_costs(text))
            lv["html"] = html(text.splitlines())
    return out


def parse_shadecraft():
    out = []
    for line in "\n".join(section_lines(core("22"), "## Искусство Шейдов")).splitlines():
        m = re.match(r"^- \*\*(.+?) \(([^)]+)\)\*\*\s*—\s*(.*)$", line)
        if m:
            t = m.group(3)
            a = re.search(r"(\d+)\s+Ангст", t)
            out.append({"key": re.sub(r"[^a-z]", "", m.group(2).lower()), "name": m.group(1).strip(), "en": m.group(2).strip(),
                        "angst": int(a.group(1)) if a else 0, "html": html([t])})
    return out


def section_lines(text, heading):
    out, on = [], False
    for line in text.splitlines():
        if on and re.match(r"^#{1,2} ", line):
            break
        if on:
            out.append(line)
        elif line.startswith(heading):
            on = True
    return out


def parse_castes():
    t22, out = core("22"), []
    for key, name, en in CASTES:
        body = section_lines(t22, f"## {name}")
        created = [x for x in section_lines(core("23"), "### Касты при создании") if x.startswith(f"- **{name}**")]
        out.append({"key": key, "name": name, "en": en, "html": html(body), "creation": html(created), **CASTE_RULES[key]})
    return out


def parse_psyche():
    text = core("23")
    arch_line = next(x for x in text.splitlines() if x.startswith("1. **Архетип:**"))
    arch = []
    for ru, en in re.findall(r"([А-ЯЁ][а-яё]+)\s*\(([A-Za-z]+)\)", arch_line):
        arch.append({"name": ru, "en": en})
    fronds = []
    for line in section_lines(text, "### Ветви Психеи"):
        m = re.match(r"^- \*\*(.+?) \(([^)]+)\)\*\*\s*\(([^)]*)\)\s*—\s*(.*)$", line)
        if m:
            cost = m.group(3)
            nums = [int(x) for x in re.findall(r"\d+", cost)]
            fronds.append({"key": re.sub(r"[^a-z]", "", m.group(2).lower()), "name": m.group(1).strip(), "en": m.group(2).strip(),
                           "costText": cost, "cost": nums[0] if nums else 1, "perLevel": "уровень" in cost, "max": nums[-1] if len(nums) > 1 else None,
                           "html": html([m.group(4)])})
    return {"archetypes": arch, "fronds": fronds}


def parse_spectre_backgrounds():
    text, out = core("23"), []
    for name, en in (("Земли Теней", "Shadowlands"), ("Лабиринт", "Labyrinth")):
        body = section_lines(text, f"### Новая Предыстория: {name}")
        out.append({"name": name, "en": en, "spectre": True, "html": html(body)})
    return out


RISEN = {"strengthMin": 3, "appearanceMax": 3, "backgrounds": 5, "noBackgrounds": ["Artifact", "Mentor", "Status"], "fetters": 10, "passions": 10,
         "pathos": 5, "willpower": 6, "freebies": 15, "disciplineCost": 7,
         "unconscious": [[5, "1 ход"], [4, "1 сцена"], [3, "10 минут"], [2, "1 час"], [1, "6 часов"], [0, "12 часов"], [-1, "сутки и дольше"]]}
SPECTRE = {"angstStart": 5, "willpower": 5, "corpus": 10, "darkPassions": 10, "backgrounds": 5, "psychePassions": 7, "freebies": 20, "psycheTrade": 7,
           "freebieCosts": {"attribute": 5, "ability": 2, "arcanos": 5, "basic": 3, "background": 1, "darkPassion": 2, "fetter": 1, "angstPer2": 1, "willpower": 2},
           "psycheCosts": {"pathosRating": 5, "pathosPool": 2, "passion": 1},
           "xp": {"newAbility": 3, "newArcanos": 6, "attribute": "×3", "ability": "×2", "arcanos": "×2", "willpower": "×1"},
           "noBackgrounds": ["Eidolon", "Notoriety", "Wealth"]}


# пул уровня Восставшего — любые две черты: «Serendipity + Чутьё», «Fascinate + Manipulation», «Обаяние + Выразительность»
RISEN_TRAITS = {"Fascinate": "risen.fascinate", "Очарование": "risen.fascinate", "Serendipity": "risen.serendipity", "Случайность": "risen.serendipity",
                "Manipulation": "attributes.manipulation", "Чутьё": "abilities.awareness", "Эмпатия": "abilities.empathy",
                "Выразительность": "abilities.expression", **{k: f"attributes.{v}" for k, v in ATTR.items()}}


def risen_pools(arcs):
    for a in arcs:
        for lv in a["levels"]:
            t = plain(re.sub(r"<[^>]+>", " ", lv["html"]))
            m = re.search(r"([A-Za-zА-ЯЁа-яё]+)\s*\+\s*([A-Za-zА-ЯЁа-яё]+)", t)
            if m and m.group(1) in RISEN_TRAITS and m.group(2) in RISEN_TRAITS:
                lv["pool"] = [RISEN_TRAITS[m.group(1)], RISEN_TRAITS[m.group(2)]]
            d = re.search(r"сложност[ьи]\s*(?:—\s*)?(\d+)", t)
            if d and "diff" not in lv:
                lv["diff"] = int(d.group(1))
            rule = re.search(r"сложность\s*—\s*([^)]+)\)", t)
            if rule and not rule.group(1).strip()[0].isdigit():
                lv["diffRule"] = rule.group(1).strip()
    return arcs

# ── «Орфей» (приложение; файлы 34–35): Оттенки проекторов, Пятна, правила ──
SHADE_ARC = {"Keening": "keening", "Fatalism": "fatalism", "Outrage": "outrage", "Inhabit": "inhabit", "Flux": "flux", "Castigate": "castigate",
             "Fascinate": "fascinate", "Puppetry": "puppetry", "Lifeweb": "lifeweb", "Moliate": "moliate", "Argos": "argos", "Phantasm": "phantasm",
             "Pandemonium": "pandemonium", "Embody": "embody", "Sandman": "phantasm"}
# русские имена Оттенков — рабочие (в справочнике только английские); «Haunter» не путать с Гильдией Проказников
SHADE_RU = {"Banshee": "Банши", "Haunter": "Скиталец", "Poltergeist": "Полтергейст", "Skinrider": "Наездник", "Wisp": "Огонёк",
            "Phantasm": "Фантазм", "Marrow": "Нутро"}


def parse_shades():
    out = []
    for row in table(core("35"), "| Shade |"):
        name, natures, fav, proh, pathos, will, angst = row[:7]
        num = lambda x: int(x.replace("−", "-").replace("+", ""))
        out.append({"key": name.lower(), "en": name, "name": SHADE_RU.get(name, name), "natures": natures,
                    "favored": [SHADE_ARC[x.strip()] for x in fav.split(",") if x.strip() in SHADE_ARC],
                    "prohibited": [SHADE_ARC[w] for w in re.findall(r"[A-Za-z]+", proh) if w in SHADE_ARC][:1],
                    "pathos": num(pathos), "willpower": num(will), "angst": num(angst)})
    return out


def parse_stains():
    out = []
    for name, adv, dis in table(core("35"), "| Пятно |"):
        ru, en = ru_en(plain(name))
        out.append({"key": re.sub(r"[^a-z]", "", en.lower()), "name": ru, "en": en, "adv": plain(adv), "dis": plain(dis)})
    return out


PROJECTOR = {"arcanoi": "1 Арканос Оттенка, Воплощение 1, Паутина жизни 1 + 2 точки", "backgrounds": 7, "passions": 5, "tethers": 10, "bodyTether": 5,
             "pathos": 5, "willpower": 5, "angst": 5, "freebies": 18, "noBackgrounds": ["Eidolon", "Haunt", "Legacy", "Memoriam"],
             "emblem": {"pathos": 2, "armor": [4, 2, 1], "shock": 1}}

# ── Другие Тёмные Царства (гл. 13; файлы 32–33): Пути Нефритовой Империи и Цепи Императора, Смещение Сварги, Повеление абамбо ──
REALMS = [{"key": "jade", "name": "Нефритовая Империя", "en": "Jade Empire", "glyph": "jade"},
          {"key": "swarga", "name": "Сварга", "en": "Swarga", "glyph": "displace"},
          {"key": "africa", "name": "Куст Призраков", "en": "Ghost Bush", "glyph": "behest"}]
REALM_ARC = {"Way of the Scholar": ("scholar", "jade"), "Way of the Artisan": ("artisan", "jade"), "Way of the Farmer": ("farmer", "jade"),
             "Way of the Merchant": ("merchant", "jade"), "Way of the Soul": ("soul", "jade"), "Chains of the Emperor": ("chains", "jade"),
             "Displace": ("displace", "swarga"), "Behest": ("behest", "africa")}
REALM_TOKEN = {"Way of the Scholar": "scholar", "Way of the Artisan": "artisan", "Way of the Farmer": "farmer", "Way of the Merchant": "merchant",
               "Way of the Soul": "soul", "Chains": "chains", "Displace": "displace", "Behest": "behest"}


def ability_tokens():
    with open(os.path.join(ROOT, "lang", "ru.json"), encoding="utf-8") as fh:
        abil = json.load(fh)["VTM20"]["Abil"]
    out = {v: f"abilities.{k}" for k, v in abil.items() if isinstance(v, str)}
    # в справочнике Способности названы по книге Wraith 20, в системе — по V20 («Выразительность» — «Красноречие» и т. п.)
    out.update({"Выразительность": "abilities.expression", "Чутьё": "abilities.awareness", "Ремесло": "abilities.crafts", "Драка": "abilities.brawl",
                "Скрытность": "abilities.stealth", "Расследование": "abilities.investigation", "Запугивание": "abilities.intimidation",
                "Лидерство": "abilities.leadership", "Эмпатия": "abilities.empathy", "Медитация": "abilities.meditation"})
    return out


def realm_pool(text, abil):
    traits = {**{k: f"attributes.{v}" for k, v in ATTR_SP.items()}, **abil, **{k: f"realm.{v}" for k, v in REALM_TOKEN.items()}}
    names = sorted(traits, key=len, reverse=True)
    rx = "(" + "|".join(re.escape(n) for n in names) + ")"
    # бывает два броска (транс, затем сам Арканос) — берём пару с Арканосом Царства, иначе первую
    pairs = [[traits[m.group(1)], traits[m.group(2)]] for m in re.finditer(rx + r"\s*\+\s*" + rx, text)]
    if pairs:
        return next((p for p in pairs if any(x.startswith("realm.") for x in p)), pairs[0])
    m = re.search(r"бросок\s+" + rx, text)
    return [traits[m.group(1)]] if m else None


def parse_realm_arcanoi():
    abil, out = ability_tokens(), []
    for prefix in ("32", "33"):
        cur = None
        for line in core(prefix).splitlines():
            m = re.match(r"^## (.+?) \(([^)]+)\)(.*)$", line)
            if m:
                key, realm = REALM_ARC.get(m.group(2).strip(), (None, None))
                cur = {"key": key, "realm": realm, "name": m.group(1).strip(), "en": m.group(2).strip(), "levels": [], "intro": []} if key else None
                if cur:
                    out.append(cur)
                continue
            if not cur:
                continue
            m = re.match(r"^- \*\*(.+?) \(([^)]+)\)\*\*\s*(•+)\s*—\s*(.*)$", line) or re.match(r"^### (.+?) \(([^)]+)\)\s*(•+)\s*(.*)$", line)
            if m:
                cur["levels"].append({"level": len(m.group(3)), "name": m.group(1).strip(), "en": m.group(2).strip(), "lines": [m.group(4)] if m.group(4).strip() else []})
            elif line.startswith("---") or line.startswith("## "):
                cur = None
            elif cur["levels"] and not line.startswith("### "):
                cur["levels"][-1]["lines"].append(line)
            else:
                cur["intro"].append(line)
    for a in out:
        a["html"] = html(a.pop("intro"))
        a["glyph"] = next(r["glyph"] for r in REALMS if r["key"] == a["realm"])
        for lv in a["levels"]:
            text = "\n".join(lv.pop("lines"))
            t = plain(text)
            lv.update({k: v for k, v in dark_costs(text).items() if k in ("diff", "pathos", "willpower")})
            c = re.search(r"(\d+)\s+Корпус", t)
            if c:
                lv["corpus"] = int(c.group(1))
            pool = realm_pool(t, abil)
            prev = a["levels"][a["levels"].index(lv) - 1] if a["levels"].index(lv) else None
            if not pool and prev and re.search(r"те же бросок", t):   # «Работа с белым нефритом» — тот же бросок, что уровнем ниже
                pool, lv["diff"] = prev.get("pool"), prev.get("diff", 6)
            if pool:
                lv["pool"] = pool
            rule = re.search(r"сложность\s*(?:—|=)\s*([^);]+)", t)
            if rule:
                lv["diffRule"] = rule.group(1).strip()
            lv["html"] = html(text.splitlines())
    return out

def build():
    arcanoi = parse_arcanoi()
    allies = parse_allies(arcanoi)
    for a in arcanoi:
        a["allies"] = allies.get(a["key"], [])
    arch, thorns = parse_shadow()
    data = {
        "source": "Wraith: The Oblivion 20th Anniversary Edition — справочник проекта (пересказ механики)",
        "arcanoi": arcanoi, "legions": parse_legions(), "factions": FACTIONS, "archetypes": parse_psyche_archetypes(),
        "shadowArchetypes": arch, "thorns": thorns, "backgrounds": parse_backgrounds(), "states": STATES,
        "creation": CREATION, "freebies": FREEBIES, "xp": XP,
        "darkArcanoi": parse_dark_arcanoi(), "shadecraft": parse_shadecraft(), "castes": parse_castes(), "psyche": parse_psyche(),
        "spectreBackgrounds": parse_spectre_backgrounds(), "spectre": SPECTRE,
        # Восставшие (гл. 11, файлы 24–25): два своих Арканоса — Очарование и Случайность; Ангста за них нет
        "realms": REALMS, "realmArcanoi": parse_realm_arcanoi(),
        "shades": parse_shades(), "stains": parse_stains(), "projector": PROJECTOR,
        "risenArcanoi": risen_pools(parse_dark_arcanoi("25", {"fascinate": "fa-eye", "serendipity": "fa-dice"})), "risen": RISEN,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    books = parse_books()
    with open(BOOKS_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(books, f, ensure_ascii=False, indent=1)
    lv = sum(len(a["levels"]) for a in arcanoi)
    return (f"Арканои {len(arcanoi)} (уровней {lv}), Легионы {len(data['legions'])}, архетипы {len(data['archetypes'])}, "
            f"архетипы Тени {len(arch)}, Шипы {len(thorns)}, фоны {len(data['backgrounds'])}; книги: записей {len(books)}")


if __name__ == "__main__":
    print(build())
