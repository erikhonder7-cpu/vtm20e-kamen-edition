# tools/build_data.py
# Собирает данные системы из справочника «Мир Тьмы» (books/Мир Тьмы/Вампиры/_справочник):
#   data/disciplines.json — Дисциплины V20: правила, силы 1–5 и старшие, пути магии крови
#   data/rituals.json     — ритуалы Тауматургии и Некромантии
#   data/merits.json      — достоинства и недостатки основной книги
#   data/backgrounds.json — факты биографии
#   data/paths.json       — Человечность и Пути Просветления с Иерархиями грехов
#
# Запуск из корня системы:  python -I tools/build_data.py

import sys, re, json, os, html

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "books", "Мир Тьмы", "Вампиры", "_справочник")
OUT = os.path.join(ROOT, "data")

# Файл справочника → ключ Дисциплины в системе
DISCIPLINES = {
    "01": "animalism", "02": "presence", "03": "dominate", "04": "obtenebration", "05": "protean",
    "06": "potence", "07": "necromancy", "09": "dementation", "10": "vicissitude", "11": "serpentis",
    "12": "obfuscate", "13": "fortitude", "14": "celerity", "15": "thaumaturgy", "17": "quietus",
    "18": "chimerstry", "19": "auspex", "20": "bardo", "21": "valeren", "22": "visceratika",
    "23": "daimoinon", "24": "koldunism", "25": "melpominee", "26": "mytherceria", "27": "obeah",
    "28": "ogham", "29": "flight", "30": "sanguinus", "31": "spiritus", "32": "thanatosis",
    "33": "temporis", "34": "assamiteSorcery",
}
# В этих файлах силы разложены по путям (## Путь … / ### • Сила)
PATHED = {"07", "15", "24", "34"}
RITUAL_FILES = {"08": "necromancy", "16": "thaumaturgy"}

DOT = "•"

# ── Markdown → HTML (ровно то, что встречается в справочнике) ───────────────

def inline(s):
    s = html.escape(s, quote=False)
    s = s.replace("\\*", "\u0000")
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s.replace("\u0000", "*")

def md_to_html(lines):
    out, i = [], 0
    lines = [l.rstrip() for l in lines]
    while i < len(lines):
        l = lines[i]
        if not l.strip() or l.strip() == "---":
            i += 1; continue
        if l.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                    rows.append(cells)
                i += 1
            if rows:
                head, body = rows[0], rows[1:]
                t = ["<table>"]
                if any(head):
                    t.append("<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>")
                else:
                    body = rows[1:]
                t.append("<tbody>" + "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table>")
                out.append("".join(t))
            continue
        m = re.match(r"^(\s*)[-*] (.*)$", l)
        if m:
            items = []
            while i < len(lines):
                m2 = re.match(r"^(\s*)[-*] (.*)$", lines[i])
                if not m2: break
                depth = len(m2.group(1)) // 2
                items.append((depth, m2.group(2)))
                i += 1
            out.append(render_list(items))
            continue
        m = re.match(r"^\d+\. (.*)$", l)
        if m:
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\. ", lines[i]):
                items.append(re.sub(r"^\s*\d+\. ", "", lines[i])); i += 1
            out.append("<ol>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ol>")
            continue
        m = re.match(r"^(#{3,6}) (.*)$", l)
        if m:
            out.append(f"<h4>{inline(m.group(2))}</h4>"); i += 1; continue
        if l.startswith(">"):
            q = []
            while i < len(lines) and lines[i].startswith(">"):
                q.append(lines[i].lstrip("> ")); i += 1
            out.append("<blockquote>" + " ".join(inline(x) for x in q) + "</blockquote>")
            continue
        para = [l]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r"^(\||\s*[-*] |#|\d+\. |>)", lines[i]):
            para.append(lines[i]); i += 1
        out.append("<p>" + "<br>".join(inline(x) for x in para) + "</p>")
    return "\n".join(out)

def render_list(items):
    res, stack = [], []
    for depth, text in items:
        while len(stack) > depth + 1:
            res.append("</li></ul>"); stack.pop()
        if len(stack) == depth + 1:
            res.append("</li><li>" + inline(text))
        else:
            while len(stack) < depth + 1:
                res.append("<ul><li>"); stack.append(1)
            res.append(inline(text))
    while stack:
        res.append("</li></ul>"); stack.pop()
    return "".join(res)

# ── Разбор ──────────────────────────────────────────────────────────────────

def read(path):
    with open(path, encoding="utf-8") as f:
        txt = f.read()
    txt = re.sub(r"^---\n.*?\n---\n", "", txt, flags=re.S)
    return txt.splitlines()

def split_name(s):
    """«Русское (English)» → (ru, en). Хвосты вроде « — только Шабаш» остаются в ru."""
    m = re.match(r"^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*(.*)$", s.strip())
    if m:
        ru = (m.group(1) + (" " + m.group(3) if m.group(3) else "")).strip()
        return ru, m.group(2).strip()
    return s.strip(), ""

def dot_level(s):
    """«••••• •• Название» → (7, «Название»)."""
    m = re.match(rf"^([{DOT}\s]+)\s+(.*)$", s)
    if not m or DOT not in m.group(1):
        return None, s
    return m.group(1).count(DOT), m.group(2).strip()

def sections(lines, level):
    """Делит строки на секции по заголовкам ровно этого уровня: [(title, body_lines)]."""
    pref = "#" * level + " "
    res, title, body = [], None, []
    for l in lines:
        if l.startswith(pref):
            res.append((title, body)); title, body = l[len(pref):].strip(), []
        elif title is not None and re.match(r"^#{1,%d} " % (level - 1), l) if level > 1 else False:
            # заголовок старшего уровня закрывает секцию: иначе в путь утекают соседние главы книги
            res.append((title, body)); title, body = None, [l]
        else:
            body.append(l)
    res.append((title, body))
    return res

def meta_lines(lines):
    """Строки «**Источник:** …», «**Клановая для:** …» в начале файла."""
    meta, rest = {}, []
    for l in lines:
        m = re.match(r"^\*\*(.+?):\*\*\s*(.*)$", l)
        if m and not rest and m.group(1) in ("Источник", "Клановая для", "Ключевая характеристика", "Носители", "Кто владеет"):
            meta[m.group(1)] = m.group(2)
        else:
            rest.append(l)
    return meta, rest

def power(level, title, body, extra=None):
    ru, en = split_name(title)
    p = {"level": level, "name": ru, "en": en, "html": md_to_html(body)}
    if extra: p.update(extra)
    return p

def parse_discipline(num, key, path):
    lines = read(path)
    top = sections(lines, 1)
    title = next(t for t, _ in top if t)
    body = next(b for t, b in top if t)
    name = re.sub(r"\s+—\s+пути$", "", title)
    ru, en = split_name(name)
    meta, body = meta_lines([l for l in body if l.strip() or True])
    d = {"key": key, "name": ru, "en": en, "source": meta.get("Источник", ""),
         "clans": meta.get("Клановая для", ""), "rules": [], "powers": [], "paths": []}
    secs = sections(body, 2)
    intro = secs[0][1]
    if any(x.strip() for x in intro):
        d["rules"].append({"title": "", "html": md_to_html(intro)})
    for t, b in secs[1:]:
        lvl, nm = dot_level(t)
        if lvl:
            # Сила уровня 1–5, внутри могут быть подзаголовки ### — оставляем их в тексте
            d["powers"].append(power(lvl, nm, b))
            continue
        subs = sections(b, 3)
        dotted = [(dot_level(st), sb) for st, sb in subs[1:] if st]
        if num in PATHED and not re.match(r"^(Старшие|Общие|Как устроена|Активация)", t):
            pru, pen = split_name(t)
            pth = {"name": pru, "en": pen, "html": md_to_html(subs[0][1]), "powers": []}
            for (lv, nm), sb in dotted:
                if lv: pth["powers"].append(power(lv, nm, sb))
            if not pth["powers"]:
                pth["powers"] = table_powers(subs[0][1])
            d["paths"].append(pth)
            continue
        # Старшие силы / Уровни 1–5 / общие правила
        rule_body = subs[0][1]
        if any(x.strip() for x in rule_body):
            d["rules"].append({"title": t, "html": md_to_html(rule_body)})
        for (lv, nm), sb in dotted:
            if lv: d["powers"].append(power(lv, nm, sb, {"elder": lv > 5}))
        for st, sb in subs[1:]:
            if st and not dot_level(st)[0]:
                d["rules"].append({"title": st, "html": md_to_html(sb)})
    d["powers"].sort(key=lambda p: p["level"])
    return d

def parse_rituals(key, path):
    lines = read(path)
    res, rules = [], []
    secs = sections(lines, 2)
    for t, b in secs[1:]:
        m = re.match(r"^Уровень (\d+)", t or "")
        if not m:
            if t and any(x.strip() for x in b):
                rules.append({"title": t, "html": md_to_html(b)})
            continue
        lvl = int(m.group(1))
        for st, sb in sections(b, 3)[1:]:
            ru, en = split_name(st)
            res.append({"discipline": key, "level": lvl, "name": ru, "en": en, "html": md_to_html(sb)})
    return {"rules": rules, "rituals": res}

def parse_merits(paths):
    res = []
    cat_map = {"Физические": "physical", "Ментальные": "mental", "Социальные": "social", "Сверхъестественные": "supernatural"}
    for path in paths:
        for t, b in sections(read(path), 2)[1:]:
            if not t: continue
            m = re.match(r"^(\S+) (достоинства|недостатки)", t)
            if not m: continue
            cat = cat_map.get(m.group(1), "other")
            kind = "merit" if m.group(2) == "достоинства" else "flaw"
            for l in b:
                mm = re.match(r"^\| (.+?) \| (.+?) \| (.+) \|$", l)
                if not mm or mm.group(1) in ("Название",) or set(mm.group(1)) <= set("-|: "): continue
                name = re.sub(r"\*\*", "", mm.group(1)).strip()
                ru, en = split_name(name)
                cost_raw = mm.group(2).strip()
                nums = [int(x) for x in re.findall(r"\d+", cost_raw)]
                res.append({"kind": kind, "category": cat, "name": ru, "en": en, "cost": cost_raw,
                            "min": min(nums) if nums else 0, "max": max(nums) if nums else 0,
                            "html": "<p>" + inline(mm.group(3)) + "</p>"})
    return res

def parse_backgrounds(path):
    res = []
    for t, b in sections(read(path), 2)[1:]:
        if not t or t.startswith("Общие"): continue
        ru, en = split_name(t)
        sect_only = "Шабаш" in ru
        ru = re.sub(r"\s*—\s*только Шабаш", "", ru).strip()
        res.append({"name": ru, "en": en, "sabbat": sect_only, "html": md_to_html(b)})
    return res

def parse_paths(path):
    lines = read(path)
    res = []
    hum_hier = []
    in_h = False
    for l in lines:
        if l.startswith("### Иерархия грехов Человечности"): in_h = True; continue
        if in_h:
            m = re.match(r"^\| (\d+) \| (.+?) \|$", l)
            if m: hum_hier.append({"rating": int(m.group(1)), "sin": m.group(2)})
            elif l.startswith("#"): in_h = False
    res.append({"key": "humanity", "name": "Человечность", "en": "Humanity", "virtues": ["conscience", "selfControl"],
                "bearing": "Нормальность", "hierarchy": hum_hier, "html": ""})
    virt = {"решимость": "conviction", "инстинкты": "instinct", "совесть": "conscience", "самоконтроль": "selfControl",
            "совесть и самоконтроль": None}
    body = None
    for t, b in sections(lines, 2):
        if t == "Пути Просветления": body = b
    for t, b in sections(body, 3)[1:]:
        if not t: continue
        ru, en = split_name(t)
        m = re.match(r"^(Путь .+?)(?:\s*\((.+)\))?$", t)
        nick = m.group(2) if m else ""
        pname = m.group(1) if m else t
        text = "\n".join(b)
        vm = re.search(r"\*\*Добродетели:\*\*\s*\**(.+?)\**\.", text)
        vs = []
        if vm:
            for w in re.split(r",| и ", vm.group(1)):
                w = w.strip().strip("*").strip()
                if w in virt and virt[w]: vs.append(virt[w])
        bm = re.search(r"\*\*Столп:\*\*\s*(.+?)(?:\s*\(|\.)", text)
        hier = []
        for l in b:
            mm = re.match(r"^\| (\d+) \| (.+?) \|$", l)
            if mm: hier.append({"rating": int(mm.group(1)), "sin": mm.group(2)})
        key = {"Путь Власти и Внутреннего Голоса": "power", "Путь Дикого Сердца": "feralHeart", "Путь Каина": "caine",
               "Путь Катаров": "cathari", "Путь Костей": "bones", "Путь Крови": "blood", "Путь Лилит": "lilith",
               "Путь Ночи": "night", "Путь Парадокса": "paradox", "Путь Преображения": "metamorphosis",
               "Путь Тифона": "typhon", "Путь Чести": "honorableAccord"}.get(pname.strip(), re.sub(r"\W", "", pname))
        res.append({"key": key, "name": pname.strip(), "followers": nick or "", "virtues": vs or ["conviction", "instinct"],
                    "bearing": bm.group(1).strip() if bm else "", "hierarchy": hier,
                    "html": md_to_html([l for l in b if not l.startswith("|")])})
    return res

CLAN_KEYS = {
    "Ассамиты": "assamite", "Бруха": "brujah", "Вентру": "ventrue", "Гангрелы": "gangrel", "Джованни": "giovanni",
    "Ласомбра": "lasombra", "Малкавиане": "malkavian", "Носферату": "nosferatu", "Последователи Сета": "setite",
    "Равнос": "ravnos", "Тореадор": "toreador", "Тремер": "tremere", "Цимисхи": "tzimisce", "Каитифы": "caitiff",
}

def translit(s):
    t = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m",
         "н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch",
         "ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}
    out, up = [], False
    for ch in s.lower():
        if ch in t: out.append(t[ch].capitalize() if up else t[ch]); up = False
        elif ch.isalnum(): out.append(ch.upper() if up else ch); up = False
        else: up = True
    r = "".join(out)
    return r[:1].lower() + r[1:]

def parse_clans(path, disc):
    """Таблицы кланов, линий крови, ветвей и антитрибу из V20_Основные_правила/02."""
    by_ru = {}
    for k, d in disc.items():
        by_ru[d["name"].lower()] = k
    # синонимы из таблиц кланов
    by_ru.update({"чародейство ассамитов": "assamiteSorcery", "колдовство": "koldunism"})
    groups = {"Тринадцать кланов": "clan", "Линии крови (гл. 10)": "bloodline",
              "Ветви и отдельные линии кланов": "variant", "Антитрибу (Шабаш)": "antitribu"}
    res = []
    for t, b in sections(read(path), 2) + [(t3, b3) for _, bb in sections(read(path), 2) for t3, b3 in sections(bb, 3)]:
        g = groups.get(t)
        if not g: continue
        for l in b:
            cells = [c.strip() for c in l.strip().strip("|").split("|")] if l.startswith("|") else None
            if not cells or len(cells) < 3 or cells[0] in ("Клан (прозвище)", "Линия (прозвище)", "Линия", "Антитрибу (прозвище)") or set(cells[0]) <= set("-: "):
                continue
            name_cell = cells[0]
            disc_cell, flaw = (cells[2], cells[3]) if g == "clan" else (cells[1], cells[2])
            sect = cells[1] if g == "clan" else ""
            m = re.match(r"^\*\*(.+?)\*\*\s*(?:\((.+)\))?", name_cell)
            ru = m.group(1).replace("‑", "-") if m else name_cell
            nick = (m.group(2) or "") if m else ""
            en = ""
            mm = re.match(r"^([A-Z][A-Za-z ]+?)(?:;\s*(.*))?$", nick)
            if mm: en, nick = mm.group(1), (mm.group(2) or "")
            def find_keys(text):
                found, low = [], re.sub(r"\*", "", text).lower()
                for nm, k in sorted(by_ru.items(), key=lambda x: -len(x[0])):
                    i = low.find(nm)
                    if i >= 0 and k not in [f[1] for f in found]:
                        found.append((i, k)); low = low[:i] + "#" * len(nm) + low[i + len(nm):]
                return [k for _, k in sorted(found)]
            # «А, Б + В или Г (на выбор); Д — как сторонняя»: до «+» — обязательные, после — выбор одной
            main_part = re.split(r";", disc_cell)[0]
            main_part = re.sub(r"\(.*?\)", "", main_part)
            fixed_txt, _, choice_txt = main_part.partition("+")
            keys = find_keys(fixed_txt)
            choice = find_keys(choice_txt) if choice_txt else []
            if choice and "или" not in choice_txt:      # «+ Бардо»: тоже обязательная
                keys += choice; choice = []
            if nick.startswith("не линия"): nick = ""
            key = CLAN_KEYS.get(ru) or translit(ru)
            res.append({"key": key, "name": ru, "en": en, "nickname": nick, "group": g, "sect": re.sub(r"\*", "", sect),
                        "disciplines": keys, "choice": choice, "disciplinesText": re.sub(r"\*\*", "", disc_cell),
                        "weakness": "<p>" + inline(flaw) + "</p>"})
    # «Ветви» вложены в раздел линий крови и попадают дважды — оставляем последнее вхождение
    uniq = {}
    for c in res: uniq[c["key"]] = c
    return list(uniq.values())

def parse_archetypes(path):
    res = []
    for l in read(path):
        m = re.match(r"^\| \*\*(.+?)\*\* \| (.+) \|$", l)
        if m: res.append({"name": m.group(1), "regain": m.group(2)})
    return res

# ── Пулы бросков из текста сил ───────────────────────────────────────────────

TRAITS = {
    "Сила": "attributes.strength", "Ловкость": "attributes.dexterity", "Выносливость": "attributes.stamina",
    "Обаяние": "attributes.charisma", "Манипуляция": "attributes.manipulation", "Привлекательность": "attributes.appearance",
    "Восприятие": "attributes.perception", "Интеллект": "attributes.intelligence", "Смекалка": "attributes.wits",
    "Бдительность": "abilities.alertness", "Атлетика": "abilities.athletics", "Шестое чувство": "abilities.awareness",
    "Драка": "abilities.brawl", "Эмпатия": "abilities.empathy", "Красноречие": "abilities.expression",
    "Запугивание": "abilities.intimidation", "Лидерство": "abilities.leadership", "Уличное чутьё": "abilities.streetwise",
    "Уличное чутье": "abilities.streetwise", "Хитрость": "abilities.subterfuge", "Обращение с животными": "abilities.animalKen",
    "Ремесло": "abilities.crafts", "Вождение": "abilities.drive", "Этикет": "abilities.etiquette", "Стрельба": "abilities.firearms",
    "Воровство": "abilities.larceny", "Фехтование": "abilities.melee", "Исполнение": "abilities.performance",
    "Скрытность": "abilities.stealth", "Выживание": "abilities.survival", "Гуманитарные науки": "abilities.academics",
    "Информатика": "abilities.computer", "Финансы": "abilities.finance", "Расследование": "abilities.investigation",
    "Законы": "abilities.law", "Медицина": "abilities.medicine", "Оккультизм": "abilities.occult", "Политика": "abilities.politics",
    "Естественные науки": "abilities.science", "Электроника": "abilities.technology",
    "Совесть": "virtues.conscience", "Решимость": "virtues.conscience", "Самоконтроль": "virtues.selfControl",
    "Инстинкты": "virtues.selfControl", "Смелость": "virtues.courage", "Воля": "willpower.permanent",
    "Человечность": "morality.value",
}

def add_discipline_traits(disc):
    for k, d in disc.items():
        TRAITS.setdefault(d["name"], f"disciplines.{k}")

def plain(html_):
    t = re.sub(r"<[^>]+>", " ", html_)
    return html.unescape(t).replace(" ", " ")

def parse_roll(html_, default=None):
    """Первый пул «Черта + Черта» в тексте силы, сложность и цена."""
    t = plain(html_)
    names = sorted(TRAITS, key=len, reverse=True)
    alt = "|".join(re.escape(n) for n in names)
    roll = dict(default or {})
    m = re.search(rf"(?<![А-Яа-яЁё])({alt})\s*\+\s*({alt})(?![а-яё])", t)
    if m:
        roll["trait1"], roll["trait2"] = TRAITS[m.group(1)], TRAITS[m.group(2)]
        tail = t[m.end():m.end() + 160]
    else:
        m = re.search(r"(?:проверк\w+|бросок|кидает)\s+(Воли|Воля)(?![а-яё])", t)
        if m and not roll.get("trait1"):
            roll["trait1"] = "willpower.permanent"
        tail = t[m.end():m.end() + 160] if m else t[:240]
    md = re.search(r"сложност\w*\s*(?:—\s*)?(\d{1,2})", tail)
    if md and 2 <= int(md.group(1)) <= 10:
        roll["difficulty"] = int(md.group(1))
    else:
        mv = re.search(r"сложност\w*\s*(?:—|равна|=)?\s*([^.;,)]{3,40})", tail)
        if mv and "difficulty" not in roll: roll["note"] = "сложность: " + mv.group(1).strip()
    mb = re.search(r"(\d+)\s*(?:пункт\w*\s+)?кров(?:ь|и)(?![а-яё]*\s+жертв)", t[:400])
    if mb: roll["blood"] = int(mb.group(1))
    elif re.search(r"(?:тратит|потратить|стоит)\s+(?:один\s+)?пункт\s+крови", t[:400]): roll["blood"] = 1
    if re.search(r"(?:1|один)\s+(?:пункт\s+)?вол(?:я|и)|пункт\s+Воли", t[:400], re.I): roll["willpower"] = True
    return roll if roll.get("trait1") else ({k: v for k, v in roll.items() if k in ("blood", "willpower")} or None)

# ── Магия крови: пути‑таблицы, краины Колдовства, пути Магусов ─────────────

ATTR_WORDS = {"Восприятие": "perception", "Ловкость": "dexterity", "Сила": "strength", "Выносливость": "stamina",
              "Обаяние": "charisma", "Манипуляция": "manipulation", "Манипулирование": "manipulation", "Привлекательность": "appearance",
              "Интеллект": "intelligence", "Смекалка": "wits", "Смекалки": "wits", "Остроумие": "wits", "Обаянием": "charisma"}

def md_table(lines):
    """Первая markdown‑таблица в строках: (шапка, строки)."""
    rows = []
    for l in lines:
        if l.startswith("|"):
            cells = [c.strip() for c in l.strip().strip("|").split("|")]
            if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                rows.append(cells)
        elif rows:
            break
    return (rows[0], rows[1:]) if rows else (None, [])

def row_level(cell):
    c = cell.replace("*", "").strip()
    if DOT in c and c.replace(DOT, "").strip() == "":
        return c.count(DOT)
    return int(c) if c.isdigit() and 1 <= int(c) <= 5 else None

def table_powers(lines):
    """Путь, где уровни расписаны таблицей (Игра с Огнём, Мановение Мысли, Защита, Погода): сила на каждую строку."""
    headr, rows = md_table(lines)
    if not headr:
        return []
    out = []
    for r in rows:
        lv = row_level(r[0])
        if not lv:
            continue
        cell = r[1] if len(r) > 1 else ""
        bold = re.findall(r"\*\*(.+?)\*\*", cell)
        labels = [b for b in bold if b.strip().endswith(":")]
        if bold:
            name = " / ".join(b.rstrip(":").strip() for b in (labels or bold[:1]))
        else:
            name = re.sub(r"\*", "", cell).split(";")[0].strip()
            if re.match(r"^[\d,.]", name):
                name = f"{headr[1]}: {name}"
        name = name[:1].upper() + name[1:]
        body = [f"- **{headr[i]}:** {r[i]}" for i in range(1, min(len(headr), len(r))) if r[i]]
        out.append(power(lv, name, body))
    return out

def section_powers(lines):
    """Краина из дополнения: «**• Сила (En):** текст» абзацами или таблица «| ур. | **Сила** (En) | эффект |»."""
    intro, powers, cur = [], [], None
    for l in lines:
        m = re.match(rf"^\*\*([{DOT}]+)\s+(.+?):\*\*\s*(.*)$", l)
        if m:
            cur = {"level": m.group(1).count(DOT), "title": m.group(2), "body": [m.group(3)]}
            powers.append(cur); continue
        if cur is not None:
            cur["body"].append(l)
        else:
            intro.append(l)
    if powers:
        return intro, [power(p["level"], p["title"], p["body"]) for p in powers]
    headr, rows = md_table(lines)
    res = []
    for r in rows:
        lv = row_level(r[0]) if r else None
        if not lv or len(r) < 3:
            continue
        name = re.sub(r"\*", "", r[1]).strip()
        res.append(power(lv, name, [r[2]]))
    if res:
        intro = [l for l in lines if not l.startswith("|")]
        return intro, res
    return lines, table_powers(lines)

def koldun_roll(p, way_attr=None, default_blood=True):
    """Колдовство (V20, гл. 10): кровь земле + [характеристика] + Оккультизм, сл. 3 + уровень; характеристика — без усилений."""
    t = plain(p["html"])
    attr = way_attr
    if not attr:
        for w in re.findall(r"\b([А-ЯЁ][а-яё]+)\b", t):
            if w in ATTR_WORDS:
                attr = ATTR_WORDS[w]; break
    roll = {"trait1": f"attributes.{attr}" if attr else "", "trait2": "abilities.occult", "difficulty": min(9, 3 + p["level"]), "base": True}
    if default_blood: roll["blood"] = 1
    if re.search(r"(?:1|один)\s+(?:пункт\s+)?Вол|1 Воля", t): roll["willpower"] = True
    if not attr: roll.pop("trait1")
    return roll

KOLDUN_EXTRA = [
    # (файл, заголовок раздела ###, источник, примечание)
    ("V20_Dark_Ages/11_Магия_Бездны_Колдовство_и_Комбинации.md", "Трансильванская крайна", "V20 Dark Ages",
     "Крайна Карпат. В горах Карпат многие силы не требуют крови."),
    ("V20_Dark_Ages/11_Магия_Бездны_Колдовство_и_Комбинации.md", "Крайна Чёрного моря", "V20 Dark Ages",
     "Крайна Дуная и Понта. На Чёрном море и Дунае кровь часто не нужна."),
    ("V20_Dark_Ages/11_Магия_Бездны_Колдовство_и_Комбинации.md", "Genius Loci («Гений места»)", "V20 Dark Ages",
     "Духовная крайна: многие колдуны её учат, но никто не делает основной."),
    ("Black_Hand/05_Линии_колдунство_достоинства_диаблери_Голконда.md", "Краина Еноха (The Kraina of Enoch)", "V20 The Black Hand",
     "Вторичная краина Старого клана в Тал'Махе'Ра: вместо крови — часть собственного тела."),
    ("Black_Hand/05_Линии_колдунство_достоинства_диаблери_Голконда.md", "Краина Колодца (The Kraina of the Well)", "V20 The Black Hand",
     "Только Орден Молоха. Нужен свой колодец‑копия (неделя работы, 25 успехов) и ежемесячная жертва."),
    ("Revised_Кланбуки/03_Цимисхи.md", "Путь Скорби (тайный путь)", "Clanbook: Tzimisce (Revised)",
     "Тайный путь. Сложность — постоянная Воля жертвы; каждое заклинание — 1 Воля; провал бьёт по колдуну как 5 успехов."),
]

def extra_koldun(disc):
    d = disc["koldunism"]
    # уклады основной книги: характеристика в названии уклада
    for pth in d["paths"]:
        m = re.search(r"\((\w+)\)", pth["name"])
        attr = ATTR_WORDS.get(m.group(1)) if m else None
        for p in pth["powers"]:
            p["roll"] = koldun_roll(p, attr)
    for rel, title, book, note in KOLDUN_EXTRA:
        lines = read(os.path.join(REF, rel))
        body = None
        for lv in (3, 2):
            for t, b in sections(lines, lv):
                if t and t.strip() == title:
                    body = b; break
            if body: break
        if not body:
            print("краина не найдена:", title); continue
        intro, powers = section_powers(body)
        ru, en = split_name(title)
        if title.startswith("Genius Loci"): ru, en = "Гений места", "Genius Loci"
        html_ = f"<p><em>Источник: {html.escape(book)}. {html.escape(note)}</em></p>" + md_to_html(intro)
        for p in powers:
            if "Скорби" in title:
                p["roll"] = {"trait1": "attributes.manipulation", "trait2": "disciplines.koldunism", "willpower": True,
                             "note": "сложность — постоянная Воля жертвы", "base": True}
            elif title.startswith("Genius Loci"):
                # одна сила с растущим радиусом: строки таблицы — её уровни
                r = re.sub(r"^.*?:\s*", "", p["name"])
                p["name"] = f"Гений места — {r}"
                p["html"] = f"<p>Колдун ощущает всё вокруг в радиусе <strong>{html.escape(r)}</strong> и может применять там свои колдунские силы уровня ≤ {p['level']}. <strong>1 Воля</strong>, кровь как обычно, бросок <strong>Обаяние + Оккультизм</strong>; каждый успех — одна сцена.</p>"
                p["roll"] = {**koldun_roll(p, "charisma"), "willpower": True}
            else:
                p["roll"] = koldun_roll(p, default_blood="Еноха" not in title)
        d["paths"].append({"name": ru if "крайна" not in ru.lower() else ru[:1].upper() + ru[1:], "en": en, "html": html_, "powers": powers, "source": book})

# Традиционные пути Магусов: основная книга, «Руководство по Камарилье» (Стихии, Нептун, Погода), «Руководство по Шабашу» (Отчее Воздаяние)
MAGUS_PATHS = ["Путь Крови", "Игра с Огнём", "Мановение Мысли", "Путь Воплощения", "Длань Разрушения",
               "Власть над Стихиями", "Могущество Нептуна", "Управление Погодой", "Путь Отчего Воздаяния"]
MAGUS_PRIMARY = {"Игра с Огнём", "Мановение Мысли", "Власть над Стихиями", "Могущество Нептуна", "Управление Погодой"}

def _blocks(lines, start_re, stop_re=r"^(#|---)"):
    """Блоки «заголовок + строки до следующего заголовка» внутри куска текста."""
    out, cur = [], None
    for l in lines:
        m = re.match(start_re, l)
        if m:
            cur = (m, []); out.append(cur); continue
        if cur is not None:
            if re.match(stop_re, l):
                cur = None; continue
            cur[1].append(l)
    return out

def _section(rel, title_start, level=2):
    lines = read(os.path.join(REF, rel))
    for t, b in sections(lines, level):
        if t and t.startswith(title_start):
            return b
    print("раздел не найден:", rel, title_start)
    return []

def _ritual(name, en, lvl, body, book):
    html_ = f"<p><em>Источник: {html.escape(book)}.</em></p>" + md_to_html(body)
    return {"discipline": "assamiteSorcery", "level": lvl, "name": name, "en": en, "html": html_,
            "roll": {"trait1": "attributes.intelligence", "trait2": "abilities.occult", "difficulty": min(9, 3 + lvl)}}

def magus_supplements(asm):
    """Путь Хранителей и ритуалы Аламута (V20 DA Tome of Secrets), ритуалы Дур‑Ан‑Ки (V20 Rites of the Blood),
    путь «Шёпот небес» и ритуалы (DA Player's Guide to Low Clans)."""
    rit = []
    tome = "V20 Dark Ages: Tome of Secrets"
    # Путь Хранителей: «**• Сила** (En) — текст» + пункты
    body = _section("DA_Tome_of_Secrets/02_Чародейство_Ассамитов.md", "Хранители бассейна")
    intro = [l for l in body if not l.startswith("**") and not l.startswith("###")][:6]
    powers = []
    for m, b in _blocks(body, rf"^\*\*([{DOT}]+)\s+(.+?)\*\*\s*\((.+?)\)\s*(?:—\s*(.*))?$", r"^(#|---|\*\*[{DOT}])".replace("{DOT}", DOT)):
        powers.append(power(m.group(1).count(DOT), f"{m.group(2)} ({m.group(3)})", [m.group(4) or ""] + b))
    if powers:
        for p in powers:
            p["roll"] = {"trait1": "willpower.permanent", "difficulty": min(9, 3 + p["level"]), "blood": 1}
        asm["paths"].append({"name": "Путь Хранителей", "en": "The Keepers Way", "source": tome, "powers": powers,
            "html": f"<p><em>Источник: {tome}. Только Хранители бассейна Аламута: каждую ночь ≥ 1 кровь из Великого бассейна, иначе 1 непоглощаемый отягчённый урон.</em></p>" + md_to_html(intro)})
    # Ритуалы Аламута: «**Имя** (En) — уровень N»
    lines = read(os.path.join(REF, "DA_Tome_of_Secrets/02_Чародейство_Ассамитов.md"))
    for t, b in sections(lines, 2):
        m = re.match(r"^Ритуал «(.+?)» \((.+?)\) — уровень (\d)", t or "")
        if m: rit.append(_ritual(m.group(1), m.group(2), int(m.group(3)), b, tome))
    for m, b in _blocks(_section("DA_Tome_of_Secrets/02_Чародейство_Ассамитов.md", "Ритуалы Ассамитов"),
                        r"^\*\*(.+?)\*\*\s*\((.+?)\)\s*—\s*уровень\s*(\d)", r"^(#|---|\*\*[^*]+\*\*\s*\()"):
        rit.append(_ritual(m.group(1), m.group(2), int(m.group(3)), b, tome))
    # Дур‑Ан‑Ки: «**Имя** (En) — N»
    rotb = read(os.path.join(REF, "Rites_of_the_Blood/04_Независимые_Ассамиты_Сетиты_Джованни.md"))
    part = rotb[rotb.index("# Чародейство Ассамитов (Дур‑Ан‑Ки)"):rotb.index("# Чародейство Сетитов")]
    rit_part = part[next(i for i, l in enumerate(part) if l.startswith("## Ритуалы")):]
    for m, b in _blocks(rit_part, r"^\*\*(.+?)\*\*\s*\((.+?)\)\s*—\s*(\d)\s*$", r"^(#|---|\*\*[^*]+\*\*\s*\()"):
        rit.append(_ritual(m.group(1), m.group(2), int(m.group(3)), b, "V20 Rites of the Blood (Дур‑Ан‑Ки)"))
    # Шёпот небес (DA Low Clans): «### N. Сила»
    low = "Dark Ages: Player's Guide to Low Clans"
    body = _section("DA_Low_Clans/11_Колдовство_ассамитов.md", "Путь «Шёпот небес»")
    secs = sections(body, 3)
    wp = []
    for t, b in secs[1:]:
        m = re.match(r"^(\d)\.\s*(.+)$", t or "")
        if m:
            p = power(int(m.group(1)), m.group(2), b)
            p["roll"] = {"trait1": "willpower.permanent", "difficulty": min(9, 3 + p["level"]), "blood": 1,
                         "note": "нужно видеть ночное небо; пасмурно +1, гроза +2 к сложности"}
            wp.append(p)
    if wp:
        asm["paths"].append({"name": "Шёпот небес", "en": "Whispers of the Heavens", "source": low, "powers": wp,
            "html": f"<p><em>Источник: {low} (старая редакция, числа сверены по V20).</em></p>" + md_to_html(secs[0][1])})
    # ритуалы «### Уровень N» → «- **Имя:** текст» с вложенными строками
    rbody = _section("DA_Low_Clans/11_Колдовство_ассамитов.md", "Ритуалы Ассамитов")
    for t, b in sections(rbody, 3)[1:]:
        m = re.match(r"^Уровень (\d)", t or "")
        if not m: continue
        for mm, bb in _blocks(b, r"^- \*\*(.+?):\*\*\s*(.*)$", r"^(#|---|- \*\*)"):
            name = re.sub(r"\s*\(.*?\)\s*$", "", mm.group(1)).strip()
            rit.append(_ritual(name, "", int(m.group(1)), [mm.group(2)] + [l.strip() for l in bb], low))
    return rit

def magus_paths(disc, rituals):
    """Чародейство Ассамитов (V20, гл. 10): механика Тауматургии; традиционные пути и ритуалы Магусов."""
    th, asm = disc["thaumaturgy"], disc["assamiteSorcery"]
    have = {p["name"] for p in asm["paths"]}
    for pth in th["paths"]:
        if pth["name"] in MAGUS_PATHS and pth["name"] not in have:
            cp = json.loads(json.dumps(pth))
            star = " Может быть основным (с согласия наставника)." if pth["name"] in MAGUS_PRIMARY or pth["name"] == "Путь Крови" else ""
            cp["html"] = f"<p><em>Традиционный путь Магусов (описан у Тауматургии): для чародея‑ассамита — свой, без удвоенной цены.{star}</em></p>" + cp["html"]
            asm["paths"].append(cp)
    rule = " ".join(plain(r["html"]) for r in asm["rules"])
    m = re.search(r"Ритуалы:\s*(.+?)(?:\.\s|$)", rule)
    names = []
    if m:
        for part in re.split(r",\s*(?![^()]*\))", m.group(1)):
            nm = re.sub(r"\s*\(.*?\)\s*", "", part).strip(" *.")
            magus = re.search(r"\((.*?)\)", part)
            if nm: names.append((nm, magus.group(1) if magus else ""))
    by = {r["name"]: r for r in rituals["thaumaturgy"]["rituals"]}
    res = []
    for nm, magus in names:
        r = by.get(nm)
        if not r: continue
        cp = dict(r, discipline="assamiteSorcery")
        if magus: cp["html"] = f"<p><em>У Магусов — «{html.escape(magus)}».</em></p>" + r["html"]
        res.append(cp)
    res += magus_supplements(asm)
    rituals["assamiteSorcery"] = {"rules": [{"title": "Ритуалы Магусов", "html": "<p>Традиционные ритуалы чародеев‑ассамитов — те же, что у Тауматургии, но проводятся каждый раз по‑своему. Чужие (нетрадиционные) ритуалы: изучение ×2, время ×2, нужен +1 успех.</p>"}], "rituals": res}
    print("Магусы: путей", len(asm["paths"]), "ритуалов", len(res))

def annotate_rolls(disc, rituals):
    add_discipline_traits(disc)
    n = 0
    for k, d in disc.items():
        for p in d["powers"]:
            r = parse_roll(p["html"])
            if r: p["roll"] = r; n += r.get("trait1") is not None
        for pth in d["paths"]:
            for p in pth["powers"]:
                if k in ("thaumaturgy", "assamiteSorcery"):
                    base = {"trait1": "willpower.permanent", "difficulty": min(9, 3 + p["level"]), "blood": 1}
                    own = parse_roll(p["html"]) or {}
                    p["roll"] = {**base, **{x: own[x] for x in ("trait1", "trait2", "difficulty") if x in own and own.get("trait2")}}
                    if pth["name"].startswith("Тауматургическая Защита"):
                        p["roll"] = {"dice": 2 * p["level"], "blood": 1, "difficulty": 6,
                                     "note": "сложность — как у чужой силы; каждый успех отменяет один успех противника; свободное действие"}
                elif k == "koldunism":
                    continue
                else:
                    r = parse_roll(p["html"])
                    if r: p["roll"] = r
                n += 1
    for k, r in rituals.items():
        for rt in r["rituals"]:
            rt["roll"] = {"trait1": "attributes.intelligence", "trait2": "abilities.occult", "difficulty": min(9, 3 + rt["level"])}
    return n

def main():
    os.makedirs(OUT, exist_ok=True)
    ddir = os.path.join(REF, "Дисциплины")
    files = {f[:2]: os.path.join(ddir, f) for f in os.listdir(ddir) if f.endswith(".md")}
    disc = {}
    for num, key in DISCIPLINES.items():
        disc[key] = parse_discipline(num, key, files[num])
    rituals = {k: parse_rituals(k, files[n]) for n, k in RITUAL_FILES.items()}
    print("сил с пулом:", annotate_rolls(disc, rituals))
    extra_koldun(disc)
    magus_paths(disc, rituals)
    import supplements
    combos = supplements.apply(disc, rituals)
    mdir = os.path.join(REF, "Достоинства_и_недостатки")
    merits = parse_merits([os.path.join(mdir, f) for f in sorted(os.listdir(mdir)) if f.endswith(".md")])
    bdir = os.path.join(REF, "Факты_биографии")
    backgrounds = parse_backgrounds(os.path.join(bdir, sorted(f for f in os.listdir(bdir) if f.endswith(".md"))[0]))
    paths = parse_paths(os.path.join(REF, "V20_Основные_правила", "06_Человечность_Пути_Добродетели.md"))

    def dump(name, obj):
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    dump("disciplines.json", disc)
    dump("rituals.json", rituals)
    dump("combos.json", combos)
    dump("merits.json", merits)
    dump("backgrounds.json", backgrounds)
    dump("paths.json", paths)
    core = os.path.join(REF, "V20_Основные_правила")
    clans = parse_clans(os.path.join(core, "02_Кланы_линии_крови_секты_Традиции.md"), disc)
    dump("clans.json", clans)
    archetypes = parse_archetypes(os.path.join(core, "01_Создание_персонажа_архетипы_опыт.md"))
    dump("archetypes.json", archetypes)
    for c in clans:
        print(f"  {c['group']:9} {c['key']:24} {c['name']:26} {','.join(c['disciplines'])}  выбор: {','.join(c['choice'])}")
    print("архетипов:", len(archetypes))

    for k, d in disc.items():
        lv = [p["level"] for p in d["powers"]]
        print(f"{k:16} {d['name']:28} сил {len(lv):2} (1–5: {sum(1 for x in lv if x<=5)})  путей {len(d['paths'])}  правил {len(d['rules'])}")
    print("ритуалы:", {k: len(v["rituals"]) for k, v in rituals.items()})
    print("достоинства/недостатки:", len(merits), " факты:", len(backgrounds), " Пути:", len(paths))

if __name__ == "__main__":
    main()
