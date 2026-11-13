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
    arts, realms, kiths = parse_arts(), parse_realms(), parse_kiths()
    # осенние ши: Дары «те же, что у аркадийских» (файл 02)
    sidhe = next(k for k in kiths if k["key"] == "sidhe")
    for k in kiths:
        if k["key"] == "autumnSidhe" and not k["birthrights"]:
            k["birthrights"] = sidhe["birthrights"]
    data = {"source": "Changeling: The Dreaming 20th Anniversary Edition — справочник проекта (пересказ механики)",
            "seemings": parse_seemings(), "kiths": kiths, "houses": parse_houses(), "legacies": parse_legacies(),
            "arts": arts, "realms": realms, "backgrounds": parse_backgrounds(), "merits": parse_merits(), "oaths": parse_oaths(), "redes": parse_redes(), "chimera": CHIMERA,
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
