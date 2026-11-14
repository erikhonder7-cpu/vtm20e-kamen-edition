# tools/changeling_data.py
# Подменыши (Changeling: The Dreaming 20th Anniversary, C20) — данные линейки из справочника проекта
# books/Мир Тьмы/Подменыши/_справочник (пересказ механики по-русски, «Русское (English)»; текста книг в системе нет).
# Пишет:
#   data/changeling.json       — ступени, киты (склонность, Веселье, Высвобождение, Дары, Слабость), Благородные Дома,
#                                Наследия, 18 Искусств (уровни 1–5: текст, Система, тип — химерический / Вирд / по выбору),
#                                6 Царств (уровни целей), Фоны, правила создания, свободных и опыта, модификаторы кантрипа;
#   data/changeling-books.json — компендий «Подменыши — книги»: книга — папка, файл — запись журнала, «## » — страница.
# Запуск: python -I tools/changeling_data.py

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import werewolf_data as wd   # общий разбор Markdown: md_html, split_md   # noqa: E402

REF = os.path.join(ROOT, "books", "Мир Тьмы", "Подменыши", "_справочник")
CORE = os.path.join(REF, "C20_Основная")
OUT = os.path.join(ROOT, "data", "changeling.json")
BOOKS_OUT = os.path.join(ROOT, "data", "changeling-books.json")
BOOKS = [("C20_Основная", "Changeling 20 — основная книга"), ("C20_Players_Guide", "C20 Players Guide"),
         ("C20_Book_of_Freeholds", "C20 Book of Freeholds"), ("C20_Kithbook_Boggans", "C20 Kithbook: Boggans"), ("DA_Fae", "Dark Ages: Fae")]

# ключи — по английскому имени (главный ключ справочника)
ARTS = {"Autumn": "autumn", "Chicanery": "chicanery", "Chronos": "chronos", "Contract": "contract", "Dragon's Ire": "dragonsIre",
        "Legerdemain": "legerdemain", "Metamorphosis": "metamorphosis", "Naming": "naming", "Oneiromancy": "oneiromancy",
        "Primal": "primal", "Pyretics": "pyretics", "Skycraft": "skycraft", "Soothsay": "soothsay", "Sovereign": "sovereign",
        "Spring": "spring", "Summer": "summer", "Wayfare": "wayfare", "Winter": "winter"}
REALMS = {"Actor": "actor", "Fae": "fae", "Nature": "nature", "Prop": "prop", "Scene": "scene", "Time": "time"}
REALM_RU = {"Актёр": "actor", "Фэ": "fae", "Природа": "nature", "Предмет": "prop", "Сцена": "scene", "Время": "time"}
KITHS = {"Boggan": "boggan", "Clurichaun": "clurichaun", "Eshu": "eshu", "Nocker": "nocker", "Piskey": "piskey", "Pooka": "pooka",
         "Redcap": "redcap", "Satyr": "satyr", "Selkie": "selkie", "Arcadian Sidhe": "sidhe", "Autumn Sidhe": "autumnSidhe",
         "Sluagh": "sluagh", "Troll": "troll"}
SEEMINGS = {"Childling": "childling", "Wilder": "wilder", "Grump": "grump"}
BACKGROUNDS = {"Chimera": "chimera", "Contacts": "contacts", "Dreamers": "dreamers", "Holdings": "holdings", "Mentor": "mentor",
               "Remembrance": "remembrance", "Resources": "resources", "Retinue": "retinue", "Title": "title", "Treasure": "treasure"}

# Основная книга, гл. 3 (файл 04) и опыт (файл 05; цены Воли и Гламура сверены с английским текстом, стр. «Experience Costs»)
CREATION = {"attributes": [7, 5, 3], "abilities": [13, 9, 5], "abilityMax": 3, "backgrounds": 5, "arts": 3, "realms": 5,
            "willpower": 4, "glamour": 4, "banality": 3, "freebies": 15, "flawsMax": 7}
SEEMING_TEMPER = {"childling": {"glamour": 1}, "wilder": {"choice": ["glamour", "willpower"]}, "grump": {"willpower": 1}}
FREEBIES = {"attribute": 5, "ability": 2, "art": 5, "realm": 2, "background": 1, "glamour": 3, "willpower": 1}
XP = {"attribute": "×4", "ability": "×2", "newAbility": 3, "art": "×4", "newArt": 7, "realm": "×3", "newRealm": 5,
      "willpower": "×2", "glamour": "×3"}
# Кантрип (файл 07): базовая сложность 8, модификаторы; Высвобождение — Гламур + Кошмар, сл. 7, 2 Гламура и +1 Кошмар
CANTRIP = {"diff": 8, "wyrdCost": 1, "cheatCost": 1, "nightmareBuy": 3, "unleash": {"diff": 7, "glamour": 2, "nightmare": 1},
           "mods": [{"key": "targetBanality", "n": 1}, {"key": "placeBanality", "n": 1}, {"key": "title", "n": 1},
                    {"key": "freehold", "n": -1}, {"key": "enchanted", "n": -1}, {"key": "affinity", "n": -1}]}
# Банальность (файл 16): триггер — бросок Гламура, сл. 8; Пороги Бедлама — штраф +1 за каждый Дисбаланс
BANALITY = {"triggerDiff": 8, "undone": 10}
BEDLAM = [{"key": "whispers", "attr": "perception"}, {"key": "memories", "attr": "intelligence"}, {"key": "weird", "attr": "charisma"},
          {"key": "untrustworthy", "attr": "manipulation"}, {"key": "thickened", "attr": "dexterity"}, {"key": "unstable"},
          {"key": "leash"}, {"key": "self"}, {"key": "drowning"}]


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
    m = re.match(r"^(.+?)\s*\(([^()]+)\)\s*(.*)$", title)
    return (m.group(1).strip(), m.group(2).strip()) if m else (title, "")


def plain(s):
    return re.sub(r"\*\*|\*", "", s).strip()


def html(lines):
    return wd.md_html(lines)


def sections(text, level):
    """Разделы Markdown уровня level («## » или «### »): [(заголовок, строки)]."""
    out, cur = [], None
    mark = "#" * level + " "
    for line in text.splitlines():
        if line.startswith(mark):
            cur = [line[len(mark):].strip(), []]
            out.append(cur)
        elif re.match(r"^#{1,%d} " % (level - 1), line):
            cur = None
        elif cur is not None:
            cur[1].append(line)
    return out


def field(lines, name):
    """Значение «- **Имя:** текст» (или «**Имя:** текст» внутри строки)."""
    for l in lines:
        m = re.search(r"\*\*" + re.escape(name) + r"[^*]*?:\*\*\s*(.*)$", l)
        if m:
            return m.group(1).strip()
    return ""


# ── Ступени и киты (файл 02) ──
def parse_seemings():
    out = []
    for line in core("02").splitlines():
        m = re.match(r"^\|\s*\*\*(.+?) \((\w+)\)\*\*\s*\|(.+?)\|(.+?)\|\s*$", line)
        if m and m.group(2) in SEEMINGS:
            out.append({"key": SEEMINGS[m.group(2)], "name": m.group(1).strip(), "en": m.group(2), "temper": plain(m.group(3)),
                        "banality": plain(m.group(4)), **SEEMING_TEMPER[SEEMINGS[m.group(2)]]})
    return out


def parse_kiths():
    out = []
    for title, lines in sections(core("02"), 2):
        name, en = ru_en(title)
        if en not in KITHS:
            continue
        aff = field(lines, "Склонность")
        realm = next((REALM_RU[k] for k in REALM_RU if aff.startswith(k)), "")
        rights, frailty, intro = [], None, []
        for l in lines:
            m = re.match(r"^  - \*\*(.+?) \(([^)]+)\)[:*]*\*\*:?\s*(.*)$", l) or re.match(r"^  - \*\*(.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
            f = re.match(r"^- \*\*Слабость — (.+?) \(([^)]+)\)[:*]*\*\*:?\s*(.*)$", l) or re.match(r"^- \*\*Слабость — (.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
            if m:
                rights.append({"name": m.group(1).strip(), "en": m.group(2).strip(), "html": html([m.group(3)])})
            elif f:
                frailty = {"name": f.group(1).strip(), "en": f.group(2).strip(), "html": html([f.group(3)])}
            elif not l.startswith("- **") and not l.startswith("  - "):
                intro.append(l)
        out.append({"key": KITHS[en], "name": name, "en": en, "affinity": realm, "affinityText": plain(aff),
                    "revelry": plain(field(lines, "Веселье")), "unleashing": plain(field(lines, "Высвобождение")),
                    "birthrights": rights, "frailty": frailty, "html": html(lines)})
    return out


# ── Благородные Дома (файл 03) ──
def parse_houses():
    text, table = core("03"), {}
    for line in text.splitlines():
        m = re.match(r"^\|\s*(.+?) \((\w+)\)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m:
            court = "seelie" if "Благой" in m.group(3) else "unseelie"
            table[m.group(2)] = {"name": m.group(1).strip(), "court": court, "courtText": m.group(3).strip(), "nick": m.group(4).strip(), "short": m.group(5).strip()}
    out = []
    for title, lines in sections(text, 3):
        name, en = ru_en(title.split(",")[0])
        if en not in table:
            continue
        out.append({"key": en.lower(), "en": en, **table[en], "boon": plain(field(lines, "Дар")), "flaw": plain(field(lines, "Недостаток")),
                    "societies": plain(field(lines, "Общества")), "html": html(lines)})
    return out


# ── Наследия (файл 04) ──
def parse_legacies():
    out, court = [], None
    for line in core("04").splitlines():
        if line.startswith("### Благие"):
            court = "seelie"
        elif line.startswith("### Неблагие"):
            court = "unseelie"
        m = re.match(r"^\|\s*(.+?) \((\w+)\)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m and court:
            out.append({"key": m.group(2).lower(), "name": m.group(1).strip(), "en": m.group(2), "court": court,
                        "text": m.group(3).strip(), "quest": m.group(4).strip(), "ban": m.group(5).strip()})
    return out


# ── Искусства (файлы 08–12) ──
def art_type(t):
    t = t.lower()
    if "по выбору" in t or ("или" in t and "вирд" in t and "химер" in t):
        return "choice"
    return "wyrd" if "вирд" in t else "chimerical" if "химер" in t else ""


def parse_arts():
    out = []
    for prefix in ("08", "09", "10", "11", "12"):
        text = core(prefix)
        for title, lines in sections(text, 2):
            name, en = ru_en(title)
            if en not in ARTS:
                continue
            body = "\n".join(lines)
            art = {"key": ARTS[en], "name": name, "en": en, "levels": [], "intro": [],
                   "unleashing": plain(field(lines, "Высвобождение")), "bunks": plain(field(lines, "Обряды"))}
            for lt, ll in sections(body, 3):
                m = re.match(r"^(.+?) \(([^)]+)\)\s*(•+)(.*)$", lt)   # «Гиммикс •••• (телекинез)» — пометка после точек
                if not m:
                    continue
                t = "\n".join(ll)
                typ = re.search(r"\*\*Тип:\*\*\s*([^\n]*)", t)
                art["levels"].append({"level": len(m.group(3)), "name": m.group(1).strip(), "en": m.group(2).strip(),
                                      "type": art_type(typ.group(1)) if typ else "", "html": html(ll)})
            art["intro"] = [l for l in body.split("### ")[0].splitlines() if l.strip()]
            art["html"] = html(art.pop("intro"))
            out.append(art)
    return out


# ── Царства (файл 13) ──
def parse_realms():
    out = []
    for title, lines in sections(core("13"), 2):
        name, en = ru_en(title.split(" — ")[0])
        if en not in REALMS:
            continue
        levels, intro = [], []
        for l in lines:
            m = re.match(r"^- (●+)\s*\*\*(.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
            if m:
                levels.append({"level": len(m.group(1)), "name": m.group(2).strip(), "en": m.group(3).strip(), "text": plain(m.group(4))})
            elif l.strip():
                intro.append(l)
        out.append({"key": REALMS[en], "name": name, "en": en, "modifier": en in ("Scene", "Time"), "levels": levels, "html": html(intro)})
    return out


# ── Фоны (файл 05) ──
def parse_backgrounds():
    text = core("05")
    part = text.split("## Фоны", 1)[1].split("\n## ", 1)[0]
    out = []
    for title, lines in sections(part, 3):
        name, en = ru_en(title)
        if en in BACKGROUNDS:
            out.append({"key": BACKGROUNDS[en], "name": name, "en": en, "html": html(lines)})
    return out


# ── Достоинства и Недостатки (файл 06): таблицы «Название | Цена | Эффект» по разделам ──
MERIT_CAT = {"Физические": "physical", "Ментальные": "mental", "Социальные": "social", "Сверхъестественные": "supernatural"}
CAT_RU = {"physical": "физическая", "mental": "ментальная", "social": "социальная", "supernatural": "сверхъестественная"}
cap = lambda s: s[:1].upper() + s[1:]   # noqa: E731 — эффекты в таблице книги начинаются со строчной


def merit_costs(cost):
    """«1 (Достоинство)», «1–3 (Н)», «2 или 4 (Д)», «2 (Н) / 4 (Д)» → [(вид, мин, макс, подпись)]."""
    out = []
    for part in cost.split("/"):
        m = re.match(r"^\s*([\d–\-или ]+?)\s*\((Достоинство|Недостаток|Д|Н)\)\s*$", part.strip())
        if not m:
            continue
        nums = [int(x) for x in re.findall(r"\d+", m.group(1))]
        kind = "merit" if m.group(2) in ("Достоинство", "Д") else "flaw"
        out.append((kind, min(nums), max(nums), m.group(1).strip().replace("-", "–")))
    return out


def parse_merits():
    text = core("06")
    out, favor = [], []
    for title, lines in sections(text, 2):
        cat = next((v for k, v in MERIT_CAT.items() if title.startswith(k)), None)
        if not cat:
            continue
        sub = None
        for line in lines:
            if line.startswith("### "):
                sub = line[4:]
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.strip().startswith("|") else []
            if len(cells) < 3 or cells[0] in ("Название", "Черта") or set(cells[0]) <= set("-"):
                continue
            name, en = ru_en(cells[0])
            if sub:                                   # варианты «Животных даров» — списком в саму черту
                favor.append(f"{name} ({en}) — {cells[1]}: {plain(cells[2])}")
                continue
            for kind, lo, hi, label in merit_costs(cells[1]):
                # «Описание» — сам эффект из таблицы книги, «Система» — вид черты и цена
                sysline = f"{'Достоинство' if kind == 'merit' else 'Недостаток'} подменыша, {CAT_RU[cat]} черта; цена {label}."
                out.append({"kind": kind, "category": cat, "name": name, "en": en, "cost": label, "min": lo, "max": hi,
                            "clan": "", "sect": "", "era": "", "source": "C20",
                            "html": f'<h4 class="r-sec">Описание</h4>\n<p>{cap(plain(cells[2]))}</p>\n<h4 class="r-sec">Система</h4>\n<p>{sysline}</p>'})
    if favor:
        for m in out:
            if m["en"] == "Animalistic Favor":
                m["html"] += "\n<ul>" + "".join(f"<li>{x}</li>" for x in favor) + "</ul>"
    return out


# ── Клятвы (файл 15, «Примеры клятв»): текст из справочника, механика — по ключу (module/apps/changeling.mjs, OATHS) ──
OATH_KEYS = {"Clasped Hands": "clasped", "Fealty": "fealty", "Escheat": "escheat", "Accepted Burden": "burden", "Guardianship": "guardianship",
             "True Hearts": "trueHearts", "Long Road": "longRoad", "Crossed Blades": "crossedBlades"}


def parse_oaths():
    text = core("15")
    out = []
    for line in text.splitlines():
        m = re.match(r"^- \*\*(Клятва [^(]+?)\s*\(([^)]+)\):\*\*\s*(.*)$", line)
        if m and m.group(2) in OATH_KEYS:
            out.append({"key": OATH_KEYS[m.group(2)], "name": m.group(1).strip(), "en": f"Oath of {m.group(2)}", "text": plain(m.group(3))})
    return out


# ── Химеры (файл 20): Реды — «- **Имя (English):** цена; затрата; эффект»; цены черт и бюджет по Фону «Химера» ──
CHIMERA = {"budget": [0, 20, 25, 30, 40, 60], "attr": 3, "abil": 3, "glamour": 1, "will": 3, "health": 2}


def parse_redes():
    text = core("20")
    part = text.split("### Реды", 1)[1].split("\n## ", 1)[0]
    out = []
    for line in part.splitlines():
        m = re.match(r"^- \*\*([^(*]+?)\s*\(([^)]+)\):\*\*\s*(.*)$", line)
        if not m:
            continue
        name, en, rest = m.group(1).strip(), m.group(2).strip(), plain(m.group(3))
        num = re.search(r"\d+", rest)
        head = re.split(r"[;.]", rest, maxsplit=1)[0]
        out.append({"key": re.sub(r"[^a-z]", "", en.lower()), "name": name, "en": en, "cost": int(num.group(0)) if num else 0,
                    "costText": head.strip(), "variable": bool(re.search(r"за кажд|за \d|переменн|/", head)), "text": rest})
    return out


# ── Иные фэ (гл. 9, файлы 35–41): таллейны, Нуннехи, Менехуне, Шинма, инанимае, прочие киты — справкой и для НПС ──
OTHER_GROUPS = [("35", "thallain", "## 19 китов"), ("37", "nunnehi", "## Киты Нуннехи"), ("38", "menehune", "## Призвания Менехуне"),
                ("39", "hsien", "## Кваннон-цзинь"), ("40", "inanimae", "## Фила"), ("41", "other", None)]


def _affinity(text):
    m = re.search(r"Склонност[ьи][^:]*:[\s*]*([А-Яа-яЁёA-Za-z]+)", text)
    if not m:
        return ""
    w = m.group(1)
    return REALM_RU.get(w, REALMS.get(w, ""))


def _slug(en):
    return re.sub(r"[^a-z]", "", en.lower()) or "x"


def parse_other_kiths():
    out = []
    for num, group, start in OTHER_GROUPS:
        text = core(num)
        if start:
            i = text.find(start)
            if i < 0:
                continue
            part = text[i:].split("\n", 1)[1]
            nxt = re.search(r"^## ", part, re.M)
            part = part[:nxt.start()] if nxt else part
        else:
            part = text
        lines = part.splitlines()
        # А) абзац «**Имя (English)** — текст» и строки сил «- *…*» под ним
        cur = None
        for line in lines:
            m = re.match(r"^\*\*([^*(]+?)\s*\(([^)]+)\)\*\*\s*(?:,\s*[^—]*)?—\s*(.*)$", line)
            if m:
                cur = {"key": f"{group}-{_slug(m.group(2))}", "group": group, "name": m.group(1).strip(), "en": m.group(2).strip(), "lines": [m.group(3)]}
                out.append(cur)
                continue
            if cur and line.startswith("- "):
                cur["lines"].append(line)
            elif cur and line.strip() and not line.startswith("- "):
                cur = None
        # Б) таблицы: «| **Имя (English)**, пояснение | … |» — шапка таблицы даёт названия столбцов
        head = None
        for line in lines:
            if not line.startswith("|"):
                head = None if not line.strip() else head
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if head is None:
                head = cells
                continue
            if set("".join(cells)) <= set("-: "):
                continue
            m = re.match(r"^\*\*([^*(]+?)\s*\(([^)]+)\)\*\*\s*,?\s*(.*)$", cells[0])
            if not m:
                continue
            rest = [f"- **{h}:** {c}" for h, c in zip(head[1:], cells[1:]) if c and c != "—"]
            out.append({"key": f"{group}-{_slug(m.group(2))}", "group": group, "name": m.group(1).strip(), "en": m.group(2).strip(),
                        "lines": [m.group(3)] + rest})
        # В) разделы «## Имя (English)» (прочие киты)
        if group == "other":
            for title, body in sections(text, 2):
                name, en = ru_en(title)
                if en:
                    out.append({"key": f"{group}-{_slug(en)}", "group": group, "name": name, "en": en, "lines": body})
    res, seen = [], set()
    for k in out:
        if k["key"] in seen:
            continue
        seen.add(k["key"])
        body = "\n".join(k["lines"])
        res.append({"key": k["key"], "group": k["group"], "name": k["name"], "en": k["en"], "affinity": _affinity(body),
                    "html": html([l for l in k["lines"] if l.strip()])})
    return res


# ── Дополнения C20: Players Guide (киты, Знамённые дома, Реды), Kithbook: Boggans (черты), Book of Freeholds (фригольды) ──
PG = os.path.join(REF, "C20_Players_Guide")
BOGG = os.path.join(REF, "C20_Kithbook_Boggans")
BOF = os.path.join(REF, "C20_Book_of_Freeholds")


def book(folder, prefix):
    fn = next(f for f in sorted(os.listdir(folder)) if f.startswith(prefix))
    return read(os.path.join(folder, fn))


def parse_pg_kiths():
    """Новые киты Players Guide (Африка, Беллатьерра, Духи Австралии, Джинны) — разделы «### Имя (English)»."""
    out = []
    for prefix, region in (("03", "Африка"), ("04", "Беллатьерра"), ("05", "")):
        text = book(PG, prefix)
        for start in ("## Новые киты", "## Киты Духов", "## Киты Джиннов"):
            i = text.find(start)
            if i < 0:
                continue
            part = text[i:].split("\n", 1)[1]
            nxt = re.search(r"^## ", part, re.M)
            part = part[:nxt.start()] if nxt else part
            for title, body in sections(part, 3):
                name, en = ru_en(title.split(" — ")[0])
                en = en.split(",")[0].strip()
                if not en:
                    continue
                reg = region or ("Австралия" if "Духов" in start else "Плодородный полумесяц")
                out.append({"key": f"pg-{_slug(en)}", "group": "pg", "name": name, "en": en, "region": reg, "affinity": _affinity("\n".join(body)),
                            "html": f"<p><em>{reg}</em></p>" + html([l for l in body if l.strip()])})
    return out


def parse_banner_houses():
    """Знамённые дома (Players Guide, гл. 1): «**Дом X (House X)** — текст», «- **Отличие:**», «- **Изъян:**»."""
    text = book(PG, "01")
    part = text[text.find("### Знамённые дома-примеры"):]
    out, cur = [], None
    for line in part.splitlines()[1:]:
        if line.startswith("#"):
            break
        m = re.match(r"^\*\*([^*(]+?)\s*\(([^)]+)\)\*\*\s*—\s*(.*)$", line)
        if m:
            cur = {"key": "banner-" + _slug(m.group(2)), "en": m.group(2), "name": m.group(1).strip(), "court": "", "courtText": "Знамённый дом",
                   "nick": "", "short": plain(m.group(3)), "boon": "", "flaw": "", "societies": "", "banner": True}
            out.append(cur)
            continue
        if cur:
            mb = re.match(r"^- \*\*Отличие:\*\*\s*(.*)$", line)
            mf = re.match(r"^- \*\*Изъян:\*\*\s*(.*)$", line)
            if mb:
                cur["boon"] = plain(mb.group(1))
            if mf:
                cur["flaw"] = plain(mf.group(1))
    for h in out:
        h["html"] = f"<p>{h['short']}</p><p><strong>Отличие:</strong> {h['boon']}</p><p><strong>Изъян:</strong> {h['flaw']}</p>"
    return out


def parse_pg_redes():
    """Новые Реды химер и ликийцев (Players Guide, гл. 7): «- **Имя (English)** (цена; затрата): эффект»."""
    text = book(PG, "07")
    out = []
    for start in ("## Новые Реды химер", "## Новые Реды ликийцев"):
        i = text.find(start)
        if i < 0:
            continue
        part = text[i:].split("\n", 1)[1]
        nxt = re.search(r"^## ", part, re.M)
        part = part[:nxt.start()] if nxt else part
        for line in part.splitlines():
            m = re.match(r"^- \*\*([^*(]+?)\s*\(([^)]+)\)[^*]*\*\*\s*(?:\(([^)]*)\))?[:\s]*(.*)$", line)
            if not m:
                continue
            cost_txt = m.group(3) or ""
            num = re.search(r"\d+", cost_txt or m.group(4))
            out.append({"key": "pg" + re.sub(r"[^a-z]", "", m.group(2).lower()), "name": m.group(1).strip(), "en": m.group(2).strip(),
                        "cost": int(num.group(0)) if num else 0, "costText": plain(cost_txt), "variable": bool(re.search(r"/|—|за ", cost_txt)),
                        "text": plain(m.group(4)), "source": "C20 Players Guide"})
    return out


BOGG_CAT = {"физическ": "physical", "социальн": "social", "ментальн": "mental", "сверхъест": "supernatural"}


def parse_boggan_merits():
    """Достоинства и Недостатки из Kithbook: Boggans — таблица «Название (English), вид | Цена | Эффект»."""
    text = book(BOGG, "03")
    out = []
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.startswith("|") else []
        if len(cells) < 3 or cells[0] in ("Название",) or set(cells[0]) <= set("-"):
            continue
        m = re.match(r"^(.+?)\s*\(([^)]+)\)\s*(?:\([^)]*\))?\s*,\s*(.+)$", cells[0])
        if not m:
            continue
        kind = "flaw" if "недостат" in m.group(3) else "merit"
        cat = next((v for k, v in BOGG_CAT.items() if k in m.group(3)), "supernatural")
        nums = [int(x) for x in re.findall(r"\d+", cells[1])]
        if not nums:
            continue
        label = cells[1].replace(" / ", "/")
        out.append({"kind": kind, "category": cat, "name": m.group(1).strip(), "en": m.group(2).split("?")[0].strip(), "cost": label,
                    "min": min(nums), "max": max(nums), "clan": "", "sect": "", "era": "", "source": "C20 Kithbook: Boggans",
                    "html": f'<h4 class="r-sec">Описание</h4>\n<p>{cap(plain(cells[2]))}</p>\n<h4 class="r-sec">Система</h4>\n<p>{"Достоинство" if kind == "merit" else "Недостаток"} подменыша (Kithbook: Boggans), {CAT_RU[cat]} черта; цена {label}.</p>'})
    return out


def parse_freeholds():
    """Book of Freeholds, гл. 2: архетипы (−2 к сложности Способности), черты по очкам, Силы с ценой."""
    text = book(BOF, "02")
    arch, powers = [], []
    part = text[text.find("## Архетипы"):].split("\n## ", 1)[0]
    for line in part.splitlines():
        m = re.match(r"^- \*\*([^*(]+?)\s*\(([^)]+)\)\*\*\s*—\s*(.*)$", line)
        if m:
            arch.append({"key": _slug(m.group(2)), "name": m.group(1).strip(), "en": m.group(2).strip(), "text": plain(m.group(3))})
    part = text[text.find("## Силы"):].split("\n## ", 1)[0]
    for line in part.splitlines():
        m = re.match(r"^- \*\*([^*(]+?)\s*\(([^)]+)\)\s*(?:\([^)]*\))?\s*(•*)[^*]*\*\*\s*—\s*(.*)$", line)
        if m:
            powers.append({"key": _slug(m.group(2)), "name": m.group(1).strip(), "en": m.group(2).strip(), "cost": len(m.group(3)) or 2, "text": plain(m.group(4))})
    return {"archetypes": arch, "powers": powers}


# ── Players Guide, гл. 8: новые Искусства «Вливание» и «Сказ», кит Лебединых дев ──
PG_ARTS = {"Infusion": "infusion", "Tale-Craft": "taleCraft"}


def _top_section(text, start):
    """Раздел верхнего уровня «# …» от заголовка start до следующего «# »."""
    i = text.find(start)
    if i < 0:
        return []
    part = text[i:].split("\n", 1)[1]
    nxt = re.search(r"^# ", part, re.M)
    return (part[:nxt.start()] if nxt else part).splitlines()


def parse_pg_arts():
    """«# Новое Искусство: Имя (English)»: вступление, «**• Сила (Power)** — текст … Тип: …» по уровням."""
    text = book(PG, "08")
    out = []
    for en, key in PG_ARTS.items():
        head = next((l for l in text.splitlines() if l.startswith("# Новое Искусство:") and f"({en})" in l), None)
        if not head:
            continue
        name = ru_en(head.split(":", 1)[1])[0]
        lines = _top_section(text, head)
        intro, levels = [], []
        for l in lines:
            m = re.match(r"^\*\*(•+)\s*(.+?)\s*\(([^)]+)\)\*\*\s*—\s*(.*)$", l)
            if m:
                body = m.group(4).strip()
                typ = re.search(r"Тип:\s*([^.]+)", body)
                levels.append({"level": len(m.group(1)), "name": m.group(2).strip().strip("«»"), "en": m.group(3).strip(),
                               "type": art_type(typ.group(1)) if typ else "", "html": html([body])})
            elif l.strip() and l.strip() != "---":
                intro.append(l)
        joined = " ".join(intro)
        unl = re.search(r"\*\*Высвобождение:\*\*\s*(.+?)(?=\*\*Обряды|$)", joined)
        bunks = re.search(r"\*\*Обряды[^*]*:\*\*\s*(.+?)$", joined)
        out.append({"key": key, "name": name, "en": en, "levels": levels, "unleashing": plain(unl.group(1)) if unl else "",
                    "bunks": plain(bunks.group(1)) if bunks else "", "source": "C20 Players Guide", "html": html(intro)})
    return out


def parse_swan_maidens():
    """Кит Лебединых дев (Players Guide, гл. 8): дары рода, три слабости."""
    text = book(PG, "08")
    lines = _top_section(text, "# Лебединые девы (Swan Maidens)")
    if not lines:
        return []
    aff = field(lines, "Склонность")
    realm = next((REALM_RU[k] for k in REALM_RU if aff.startswith(k)), "")
    rights, frail, intro, mode = [], [], [], ""
    for l in lines:
        if l.startswith("- **Дары рода"):
            mode = "rights"; continue
        if l.startswith("- **Слабости"):
            mode = "frail"; continue
        m = re.match(r"^  - \*\*(.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
        if m and mode:
            (rights if mode == "rights" else frail).append({"name": m.group(1).strip(), "en": m.group(2).strip(), "html": html([m.group(3)])})
            continue
        if not l.startswith("- **") and not l.startswith("  - ") and l.strip() and l.strip() != "---":
            intro.append(l)
    frailty = {"name": " · ".join(f["name"] for f in frail), "en": " · ".join(f["en"] for f in frail),
               "html": "".join(f"<p><strong>{f['name']}.</strong> {f['html'][3:]}" for f in frail)} if frail else None
    veselie = field(lines, "Веселье")
    unl = re.search(r"Высвобождение:\s*(.+)$", veselie)
    return [{"key": "swanMaiden", "name": "Лебединая дева", "en": "Swan Maiden", "affinity": realm, "affinityText": plain(aff),
             "revelry": plain(veselie.split("Высвобождение:")[0]), "unleashing": plain(unl.group(1)) if unl else "",
             "birthrights": rights, "frailty": frailty, "source": "C20 Players Guide", "html": html(intro)}]


# ── Players Guide, гл. 7: ликийцы — Формы (аналог Ступеней) и Облики (аналог китов) ──
SHAPES = {"Humanoid": "humanoid", "Animal": "animal", "Mythic": "mythic"}
GUISES = {"Bucolic": "bucolic", "Maieutic": "maieutic", "Oppidan": "oppidan", "Quixotic": "quixotic"}


def parse_lykeians():
    """Формы «- **Имя (En):** текст» и Облики «### Имя (En) — тема»: Благословения и Недуг."""
    text = book(PG, "07")
    shapes, guises = [], []
    part = text[text.find("## Формы"):].split("\n## ", 1)[0]
    for line in part.splitlines():
        m = re.match(r"^- \*\*(.+?) \(([^)]+)\):\*\*\s*(.*)$", line)
        if m and m.group(2) in SHAPES:
            shapes.append({"key": SHAPES[m.group(2)], "name": m.group(1).strip(), "en": m.group(2), "text": plain(m.group(3))})
    part = text[text.find("## Облики"):].split("\n## ", 1)[0]
    for title, lines in sections(part, 3):
        name, en = ru_en(title.split(" — ")[0])
        if en not in GUISES:
            continue
        blessings, frailty, intro = [], None, []
        for l in lines:
            b = re.match(r"^  - \*\*(.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
            f = re.match(r"^- \*\*Недуг — (.+?) \(([^)]+)\):\*\*\s*(.*)$", l)
            if b:
                blessings.append({"name": b.group(1).strip(), "en": b.group(2).strip(), "text": plain(b.group(3))})
            elif f:
                frailty = {"name": f.group(1).strip(), "en": f.group(2).strip(), "text": plain(f.group(3))}
            elif l.strip() and not l.startswith("- **"):
                intro.append(l)
        guises.append({"key": GUISES[en], "name": name, "en": en, "theme": title.split(" — ")[1].strip() if " — " in title else "",
                       "text": plain(" ".join(intro)), "blessings": blessings, "frailty": frailty})
    return {"shapes": shapes, "guises": guises}


def glyphs():
    """Знаки (tools/changeling_glyphs.mjs → assets/changeling/index.json): kith-*, art-*, realm-*, house-*, court-*, guise-*, group-*, daf-*."""
    p = os.path.join(ROOT, "assets", "changeling", "index.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []


# ── Инанимае (гл. 40): Слайверы и фила — склонность, Империя, начальные Гламур/Воля/Банальность ──
SLIVERS = {"Aquis": "aquis", "Petros": "petros", "Pyros": "pyros", "Stratus": "stratus", "Verdage": "verdage"}
SLIVER_RU = {"Аквис": "aquis", "Петрос": "petros", "Пирос": "pyros", "Стратус": "stratus", "Вердаж": "verdage"}
PHYLA = {"Glomes": "inanimae-glomes", "Kuberas": "inanimae-kuberas", "Ondines": "inanimae-ondines", "Parosemes": "inanimae-parosemes",
         "Solimonds": "inanimae-solimonds", "Mannikins": "inanimae-mannikins"}


def parse_inanimae():
    text = core("40")
    part = text[text.find("## Слайверы"):].split("\n## ", 1)[0]
    perks = {}
    for line in part.splitlines():
        if "Преимущество за 1-ю точку" in line:
            for chunk in line.split(":**", 1)[1].split(";"):
                k, _, v = chunk.strip().partition(" — ")
                if k in SLIVER_RU:
                    perks[SLIVER_RU[k]] = plain(v)
    slivers = []
    for line in part.splitlines():
        m = re.match(r"^- \*\*(.+?) \(([A-Za-z]+)\)\*\*\s*—\s*(.*)$", line)
        if m and m.group(2) in SLIVERS:
            slivers.append({"key": SLIVERS[m.group(2)], "name": m.group(1).strip(), "en": m.group(2), "text": plain(m.group(3)), "perk": perks.get(SLIVERS[m.group(2)], "")})
    phyla = []
    for line in text[text.find("## Фила"):].split("\n## ", 1)[0].splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        m = re.match(r"^\*\*(.+?) \(([A-Za-z]+)\)\*\*", cells[0]) if len(cells) >= 7 else None
        if not m or m.group(2) not in PHYLA:
            continue
        nums = [int(x) for x in re.findall(r"\d+", cells[-1])][:3]
        aff = next((v for k, v in SLIVER_RU.items() if k in cells[3]), "")
        phyla.append({"key": PHYLA[m.group(2)], "empire": plain(cells[1]), "affinity": aff, "start": nums})
    return {"slivers": slivers, "phyla": phyla}


# ── Dark Ages: Fae (книга DA_Fae): Происхождения, Дворы, кантрипы по Доменам, провалы Высвобождения ──
DAF = os.path.join(REF, "DA_Fae")
DAF_ORIGINS = {"changeling": "changeling", "inanimae": "inanimae", "firstborn": "firstborn"}
DAF_COURTS = {"Spring": "spring", "Summer": "summer", "Autumn": "autumn", "Winter": "winter", "Solstice": "solstice"}
DAF_DOM_RU = {"Рассвет": "dawn", "День": "day", "Сумерки": "dusk", "Ночь": "night"}
# Черта броска кантрипа: русское имя → путь черты листа (атрибуты и способности DA:V и DA:Fae)
DAF_TRAITS = {"Сила": "attributes.strength", "Ловкость": "attributes.dexterity", "Выносливость": "attributes.stamina",
              "Обаяние": "attributes.charisma", "Манипуляция": "attributes.manipulation", "Внешность": "attributes.appearance",
              "Восприятие": "attributes.perception", "Интеллект": "attributes.intelligence", "Смекалка": "attributes.wits",
              "Драка": "abilities.brawl", "Хитрость": "abilities.subterfuge", "Эмпатия": "abilities.empathy", "Выживание": "abilities.survival",
              "Запугивание": "abilities.intimidation", "Гремарий": "abilities.gremayre", "Узрение": "abilities.kenning", "Атлетика": "abilities.athletics",
              "Скрытность": "abilities.stealth", "Лидерство": "abilities.leadership", "Медицина": "abilities.medicine", "Оккультизм": "abilities.occult",
              "Загадки": "abilities.enigmas", "Ремесло": "abilities.crafts", "Выразительность": "abilities.expression", "Знание зверей": "abilities.animalKen",
              "Бдительность": "abilities.alertness", "Ближний бой": "abilities.melee", "Этикет": "abilities.etiquette",
              "Обращение с животными": "abilities.animalKen", "Экспрессия": "abilities.expression"}


def daf(prefix):
    fn = next(f for f in sorted(os.listdir(DAF)) if f.startswith(prefix))
    return read(os.path.join(DAF, fn))


# Рабочий перевод названий кантрипов Dark Ages: Fae (английское имя остаётся в поле en).
DAF_CANTRIP_RU = {
    "Call Element": "Зов стихии", "Court Summons": "Призыв ко двору", "Leaves of Metal": "Листья из металла",
    "Control Element": "Власть над стихией", "Drain": "Иссушение", "Hedge of Thorns": "Терновая изгородь", "Mantle": "Мантия",
    "Charm": "Чары", "Fostering": "Воспитание", "Shaping": "Ваяние", "Straight Track": "Прямая тропа", "Sword": "Меч",
    "Arch": "Арка", "Persisting Charm": "Стойкие чары", "Saining": "Осенение", "True Enchantment": "Истинное зачарование",
    "Candor's Light": "Свет прямоты", "Cow the Bitter Wind": "Усмирить злой ветер", "Decree": "Указ", "Fireside Chatter": "Беседа у очага",
    "Friend from Foe": "Друг или враг", "Heart's Rest": "Покой сердца", "Luminous Splendor": "Сияющее великолепие", "Merry Meet": "Добрая встреча",
    "Oathbound Strength": "Сила клятвы", "Seek Treasure": "Поиск сокровищ", "Sunbeam": "Солнечный луч", "Sun's Shield": "Щит солнца",
    "An Air of Wisdom": "Вид мудреца", "Befuddle": "Сбить с толку", "Fire Armor": "Огненный доспех", "Fireside Revelations": "Откровения у очага",
    "Flame's Kin": "Родня пламени", "Lightning-Strike": "Удар молнии", "Plunder": "Грабёж", "Pronouncement": "Оглашение",
    "Summer's Glamour": "Гламур лета", "Veritable": "Подлинность", "Wall of Fire": "Огненная стена", "Will of Fire": "Огненная воля",
    "Brotherly Bond": "Братские узы", "Dominion Writ": "Грамота владения", "Healing Heat": "Целительный жар", "Hearts Afire": "Пылающие сердца",
    "Law of the Land": "Закон земли", "True Ardor": "Истинный пыл", "Verdict": "Приговор", "Flame of the Muse": "Пламя музы",
    "Last Stand": "Последний рубеж", "Pure Form": "Чистый облик", "Oathbreaker's Prison": "Темница клятвопреступника", "Sun's Crown": "Венец солнца",
    "Face of the Sun": "Лик солнца",
    "Black and Blue": "Синяки и ссадины", "Blight Garden": "Порча сада", "Embrace the Night's Chill": "Объятия ночного холода", "Gloom": "Мрак",
    "Hush": "Тишь", "Mindveil": "Покров разума", "Night Sounds": "Звуки ночи", "Owl Eyes": "Совиные глаза", "Paranoia": "Мнительность",
    "Still of the Night": "Ночное безмолвие", "Veil of Tears": "Пелена слёз", "Weariness": "Изнеможение", "Clouded Vision": "Затуманенный взор",
    "Dreamtongue": "Язык снов", "Ice Armor": "Ледяной доспех", "Lesser Hounds of Hell": "Малые псы преисподней", "Night Terror": "Ночной ужас",
    "Nightshade": "Паслён", "Rain-Strike": "Удар ливня", "Salmon's Breath": "Дыхание лосося", "Scare": "Испуг", "Stillness": "Оцепенение",
    "Winter's Glamour": "Гламур зимы", "Freeze Death": "Ледяная смерть", "Midnight's Domain": "Владения полуночи", "Shriek": "Вопль",
    "Silent Brethren": "Безмолвные братья", "True Apathy": "Истинное безразличие", "Winter's Shadows": "Тени зимы", "Blindness": "Слепота",
    "Haunting Curse": "Неотвязное проклятие", "Greater Hounds of Hell": "Великие псы преисподней", "Grotesque": "Уродство", "Nightmares": "Кошмары",
    "Soul Rime": "Иней души",
    "Beast Tongue": "Звериный язык", "Brew and Bread": "Хлеб и брага", "Earthen Refuge": "Земляное убежище", "Faerie's Fog": "Туман фэ",
    "Famine to Feast": "Из голода в пир", "Green Touch": "Зелёное касание", "Hope": "Надежда", "Reveal": "Обнаружение", "Sleep": "Сон",
    "Spring's Urges": "Весенние порывы", "Thricetold Fortune": "Трижды сказанная удача", "Weep": "Плач", "Dawn's Absolution": "Отпущение рассвета",
    "Earth's Armor": "Доспех земли", "Earth's Current": "Ток земли", "Entice": "Соблазн", "Fruitful": "Плодородие", "Immortal Tears": "Бессмертные слёзы",
    "Memory of Stone": "Память камня", "Morning Mist": "Утренний туман", "Morning's Grace": "Милость утра", "Obscure": "Сокрытие", "Slumber": "Дрёма",
    "Strength of the Oak": "Сила дуба", "Bog": "Топь", "Dawn's Revelation": "Откровение рассвета", "Delving": "Раскопки", "Ruins to Refuge": "Из руин в приют",
    "Sight Unseen": "Невидимое зрение", "Storm and Stress": "Буря и натиск", "Tomorrow's Tale": "Сказ о завтрашнем дне", "Aid of the Wood": "Помощь леса",
    "Come Hither": "Иди сюда", "Dawn's Domain": "Владения рассвета", "Storm's Fray": "Ярость бури", "Wooden Arsenal": "Деревянный арсенал",
    "Fortune Weaving": "Плетение судьбы",
    "Amends": "Искупление", "Broken Mirror": "Разбитое зеркало", "Soar": "Парение", "Spectral Whispers": "Шёпот призраков", "Speed of the Wind": "Скорость ветра",
    "Spirit Track": "След духа", "Steal Breath": "Украсть дыхание", "Study Facade": "Изучить личину", "Twilight Shadow's Reach": "Рука сумеречной тени",
    "Unlock": "Отпереть", "Whispered Past": "Шепчущее прошлое", "Words": "Слова", "Barren": "Бесплодие", "Befriend Spirit": "Подружиться с духом",
    "Daunting Distance": "Устрашающая даль", "Evening Mist": "Вечерний туман", "Forgotten": "Забвение", "Leaf in the Wind": "Лист на ветру",
    "Lesser Elfshot": "Малая эльфийская стрела", "Mourning": "Скорбь", "Transport": "Перенос", "Twilight's Glamour": "Гламур сумерек",
    "Waylaid Traveler": "Заплутавший путник", "Wind Armor": "Доспех ветра", "Wind's Eyes": "Глаза ветра", "Atoning": "Покаяние",
    "Grace of the Shadows": "Милость теней", "Journey": "Странствие", "Unchaining": "Освобождение от оков", "Unspoken Vow": "Невысказанный обет",
    "Yesterday's Tale": "Сказ о вчерашнем дне", "Bauble of the Mind": "Безделица разума", "Cloud-Dancing": "Танец в облаках", "Fall's Curse": "Проклятие осени",
    "Greater Elfshot": "Великая эльфийская стрела", "Memory of Trees": "Память деревьев", "Second Chance": "Второй шанс",
}


def _daf_cantrip(line, domain, level):
    m = re.match(r"^- (\*\*|\*)(.+?)\1\s*\((.+?)\)\s*:\s*(.*)$", line)
    if not m:
        return None
    params = m.group(3)
    lv = re.search(r"ур\.\s*(\d)", params)
    trait = re.search(r"\+\s*([А-ЯЁа-яё ]+?)(?:[,;)]|$)", params + ")")
    diff = re.search(r"сл\.\s*(\d+)", params)
    tname = trait.group(1).strip() if trait else ""
    tname = next((k for k in sorted(DAF_TRAITS, key=len, reverse=True) if tname.startswith(k)), tname)
    en = m.group(2).strip()
    return {"key": _slug(en), "name": DAF_CANTRIP_RU.get(en, en), "en": en, "domain": domain, "level": int(lv.group(1)) if lv else level,
            "trait": DAF_TRAITS.get(tname, ""), "traitName": tname, "diff": int(diff.group(1)) if diff else 6,
            "params": plain(params), "text": plain(m.group(4))}


def parse_daf():
    """Происхождения и Дворы (таблицы гл. 1), кантрипы (общие — для всех Доменов, и по Доменам), провалы Высвобождения."""
    t1 = daf("01")
    origins, courts = [], []
    for line in t1.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.startswith("|") else []
        if len(cells) == 4:
            m = re.match(r"^(.+?) \(([a-z]+)\)$", cells[0])
            nums = [int(x) for x in re.findall(r"\d+", cells[1])]
            if m and m.group(2) in DAF_ORIGINS and len(nums) >= 3:
                origins.append({"key": m.group(2), "name": m.group(1).strip(), "mists": nums[0], "weaving": nums[1], "dominions": nums[2],
                                "birthright": plain(cells[2]), "frailty": plain(cells[3]), "unleash": 3 if m.group(2) == "firstborn" else 5})
        if len(cells) == 3:
            m = re.match(r"^(.+?) \(([A-Za-z]+)\)$", cells[0])
            if m and m.group(2) in DAF_COURTS:
                fav = next((v for k, v in DAF_DOM_RU.items() if k in cells[1]), "")
                courts.append({"key": DAF_COURTS[m.group(2)], "name": m.group(1).strip(), "favorite": fav, "text": plain(cells[2])})
    cantrips, fails = [], {}
    t2 = daf("02")
    common = t2[t2.find("## Общие кантрипы"):].split("\n## ", 1)[0]
    for line in common.splitlines():
        c = _daf_cantrip(line, "common", 1)
        if c:
            cantrips.append(c)
    files = {"day": ("02", "## День"), "night": ("03", None), "dawn": ("04", None), "dusk": ("05", None)}
    for dom, (prefix, start) in files.items():
        text = daf(prefix)
        if start:
            text = text[text.find(start):]
        level = 1
        for line in text.splitlines():
            lm = re.match(r"^(?:## Уровень|\*\*Уровень)\s*(\d)", line)
            if lm:
                level = int(lm.group(1))
                # строкой: «**Уровень 2:** *Имя* (Д + Черта; текст); *Имя* (…)»
                tail = line.split(":**", 1)[1] if ":**" in line else ""
                for im in re.finditer(r"\*([^*]+)\*\s*\(((?:[^()]|\([^()]*\))*)\)", tail):
                    params, _, rest = im.group(2).partition(";")
                    c = _daf_cantrip(f"- *{im.group(1)}* ({params}): {rest.strip()}", dom, level)
                    if c:
                        cantrips.append(c)
                continue
            if line.startswith("## Провалы") or line.startswith("## Таблица"):
                level = 0
            if level:
                c = _daf_cantrip(line, dom, level)
                if c:
                    cantrips.append(c)
        fm = re.search(r"Провалы Высвобождения [А-Яа-яё]+(?::\*\*|\n)\s*(.+)", daf(prefix))
        if fm:
            fails[dom] = plain(fm.group(1))
    return {"origins": origins, "courts": courts, "cantrips": cantrips, "unleashFails": fails}


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
            title = re.sub(r"\s+—\s+(C20|Changeling)\b.*$", "", title) or fn[:-3].replace("_", " ")
            out.append({"key": f"{folder}:{fn.split('_')[0]}", "book": label, "name": title, "pages": pages})
    return out


def build():
    arts, realms, kiths = parse_arts() + parse_pg_arts(), parse_realms(), parse_kiths() + parse_swan_maidens()
    # осенние ши: Дары «те же, что у аркадийских» (файл 02)
    sidhe = next(k for k in kiths if k["key"] == "sidhe")
    for k in kiths:
        if k["key"] == "autumnSidhe" and not k["birthrights"]:
            k["birthrights"] = sidhe["birthrights"]
    data = {"source": "Changeling: The Dreaming 20th Anniversary Edition — справочник проекта (пересказ механики)",
            "seemings": parse_seemings(), "kiths": kiths, "houses": parse_houses() + parse_banner_houses(), "legacies": parse_legacies(),
            "arts": arts, "realms": realms, "backgrounds": parse_backgrounds(), "merits": parse_merits() + parse_boggan_merits(), "oaths": parse_oaths(), "redes": parse_redes() + parse_pg_redes(), "chimera": CHIMERA, "lykeian": parse_lykeians(), "inanimae": parse_inanimae(), "daf": parse_daf(), "glyphs": glyphs(), "otherKiths": parse_other_kiths() + parse_pg_kiths(), "freeholds": parse_freeholds(),
            "creation": CREATION, "freebies": FREEBIES, "xp": XP, "cantrip": CANTRIP, "banality": BANALITY, "bedlam": BEDLAM}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    books = parse_books()
    with open(BOOKS_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(books, f, ensure_ascii=False, indent=1)
    return (f"ступени {len(data['seemings'])}, киты {len(kiths)}, Дома {len(data['houses'])}, Наследия {len(data['legacies'])}, "
            f"Искусства {len(arts)} (уровней {sum(len(a['levels']) for a in arts)}), Царства {len(realms)} "
            f"(уровней {sum(len(r['levels']) for r in realms)}), Фоны {len(data['backgrounds'])}, черты {len(data['merits'])}; книги: записей {len(books)}")


if __name__ == "__main__":
    import fsretry   # Windows ненадолго держит файлы, пока Foundry их читает — запись с повтором
    fsretry.install()
    print(build())
