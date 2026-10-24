# tools/dt_archive.py
# Тёмная Тауматургия из пользовательского архива конспектов (tools/sources/dark_thaumaturgy_archive):
# ритуалы и пути, которых нет в книгах справочника (Player's Guide to the Sabbat 1992, Storytellers Handbook
# to the Sabbat, Sins of the Blood, Dark Ages Companion 1998). Это пересказы, а не тексты книг — так и помечено
# в источнике и шапке. Вызывается из build_data.main() сразу после magic_extra.apply().
#
# Не берём: Strigia (фанатское / хроники), MET- и OWbN-варианты (файлы с «MET»/«Intermediate»), то, что уже есть
# (8 ритуалов V20 Dread Names, пути V20 и Tome of Secrets), Hands of Destruction (путь Тауматургии — только заметка),
# общий блок ссылок в конце файлов. Здесь же мелкие правки уже собранной Тёмной Тауматургии.

import os, re, html
from magic_extra import akey, rkey, GTS, PGS

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources", "dark_thaumaturgy_archive")
DA = "darkAges"
MARK = "пересказ по конспекту, не текст книги"
STH_S, SOTB, DAC98 = "Storytellers Handbook to the Sabbat", "Sins of the Blood (Revised)", "Dark Ages Companion (1998)"
# название книги в конспекте → подпись в «Источник: …» (длинные — первыми)
BOOKS = [("Storytellers Handbook to the Sabbat", STH_S), ("Player's Guide to the Sabbat", PGS), ("Player’s Guide to the Sabbat", PGS),
         ("Guide to the Sabbat", GTS), ("Sins of the Blood", SOTB), ("Dark Ages Companion", DAC98)]
SKIP_RITUALS = {"34", "35"}          # только MET
SKIP_PATHS = {"05", "19"}            # Hands of Destruction — путь Тауматургии (заметка ниже); Strigia — фанатское
# русские названия путей-«законов» — как у «Закона призыва» (Rego Calatio); вариант конспекта — в «Другие названия»
PATH_NAMES = {"Rego Venalis": "Закон порчи", "Rego Dolor": "Закон боли", "Rego Manes": "Закон духов",
              "Maleficia": "Малефиция", "Video Nefas": "Путь Зловещих Откровений"}
POWER_PREFIX = {"Rego Manes": "Закон духов — Демон: "}       # уровни-ранги демонов, как у «Закона призыва»
RITUAL_NAMES = {"Spite of the Harridan": "Злоба ведьмы"}     # в конспекте «Злоба ведьмы/Харридан»
# ранние ритуалы Player's Guide to the Sabbat: пул по виду ритуала
PGS_POOL = [(r"^Summon|^Bring Forth", ("attributes.charisma", "Призыв")), (r"^Bind", ("attributes.manipulation", "Связывание")),
            (r"^Dismiss", ("attributes.intelligence", "Изгнание")), (r"^Sign of", ("attributes.wits", "Защитный знак"))]
# аналоги: (школа, путь) ↔ (школа, путь), пометка
EQUIV = [(("darkThaumaturgy", "Закон боли"), ("darkThaumaturgy", "Путь Боли"), "та же тема в редакции Sins of the Blood, другие силы"),
         (("darkThaumaturgy", "Закон боли"), ("darkThaumaturgy", "Путь Мучений"), "по сходству сил: причинение боли"),
         (("darkThaumaturgy", "Путь Мучений"), ("darkThaumaturgy", "Путь Боли"), "по сходству сил: причинение боли"),
         (("darkThaumaturgy", "Оковы Наслаждения"), ("darkThaumaturgy", "Путь Наслаждений"), "ранний набор сил того же пути"),
         (("darkThaumaturgy", "Путь Зловещих Откровений"), ("darkThaumaturgy", "Путь Тайного Знания"), "по сходству сил: знание от демонов"),
         (("darkThaumaturgy", "Путь Тайного Знания"), ("darkThaumaturgy", "Путь Несказанного"), "по сходству сил: запретное знание"),
         (("darkThaumaturgy", "Закон духов"), ("darkThaumaturgy", "Закон призыва"), "по сходству сил: призыв демонов"),
         (("darkThaumaturgy", "Закон духов"), ("thaumaturgy", "Путь Управления духами"), "по сходству сил: призыв и подчинение сущностей"),
         (("darkThaumaturgy", "Закон порчи"), ("thaumaturgy", "Путь Совращения"), "по сходству сил: моральное разложение")]
FIRES_EN = ["Lighter", "Stovetop", "Blowtorch", "Flame-thrower", "Conflagration"]
VARIABLE = {"Call Forth the Host", "Bind the Interloper"}   # «Уровень: переменный» у V20 Dread Names

# термины конспекта → термины справочника
TERMS = [(r"Силой Воли", "Волей"), (r"Силу Воли", "Волю"), (r"Силы Воли", "Воли"), (r"Сила Воли", "Воля"), (r"Силе Воли", "Воле"),
         (r"Сообразительность", "Смекалка"), (r"Манипулирование", "Манипуляция"), (r"Мандрагорy", "Мандрагору")]

def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")

def _t(s):
    s = re.sub(r"\s+", " ", s).strip()
    for rx, rep in TERMS: s = re.sub(rx, rep, s)
    return html.escape(s, quote=False)

def _sections(text, heads):
    """{заголовок: текст} по строкам-заголовкам из heads; всё после «ИСТОЧНИКИ И СВЕРКА» / «СВЕРКА ИСТОЧНИКА» отбрасывается."""
    text = re.split(r"\n(?:ИСТОЧНИКИ И СВЕРКА|СВЕРКА ИСТОЧНИКА)\n", text)[0]
    out, cur = {"": []}, ""
    for line in text.split("\n"):
        if line.strip() in heads: cur = line.strip(); out[cur] = []; continue
        out[cur].append(line)
    return {k: "\n".join(v).strip() for k, v in out.items()}

def _books(s):
    found = []
    for name, label in BOOKS:
        i = s.find(name)
        if i >= 0 and label not in [b for _, b in found]:
            found.append((i, label)); s = s.replace(name, "#" * len(name))
    return [b for _, b in sorted(found)]

def _source(books):
    return f"{' / '.join(books)} ({MARK})"

def _title(text):
    first = text.split("\n", 1)[0].strip()
    a, _, b = first.partition(" — ")
    return a.strip(), b.strip()

def _li(label, s):
    return f"<li><strong>{label}:</strong> {_t(s)}</li>" if s and s.strip() else ""

# ── ритуалы ───────────────────────────────────────────────────────────────────────────────────────────────
R_HEADS = {"ЭФФЕКТ", "СИСТЕМА", "КОМПОНЕНТЫ / ЗАТРАТЫ", "ИСТОЧНИК", "УВЕРЕННОСТЬ СВЕРКИ", "ПРАВИЛО ИСПОЛЬЗОВАНИЯ"}

def _keys(en, ru):
    """Ключи сверки по всем вариантам названия («Into the Abyss / Into the Inferno»)."""
    return {akey(x) for x in en.split("/") if akey(x)} | {rkey(x) for x in ru.split("/") if rkey(x)}

def ritual_from(path):
    text = _read(path)
    en, ru = _title(text)
    sec = _sections(text, R_HEADS)
    st = re.search(r"^Редакционный статус:.*$", sec[""], re.M)
    if (re.search(r"MET_only", path) or re.search(r"\bMET\b|OWbN", st.group(0) if st else "")
            or not re.search(r"^Уровень:\s*\d", sec[""], re.M)):
        return None                                           # MET-вариант («Intermediate», «уровень 2 в MET Sabbat Guide»)
    m = re.search(r"^Уровень:\s*(\d+)", sec[""], re.M)
    if not m: return None
    level = int(m.group(1))
    status = re.search(r"^Редакционный статус:\s*(.+)$", sec[""], re.M)
    status = status.group(1).strip() if status else ""
    books = _books(sec.get("ИСТОЧНИК", "")) or _books(sec[""])
    era = DA if books and all(b == DAC98 for b in books) else ""
    pool, kind = "attributes.intelligence", ""
    if PGS in books:
        for rx, (attr, k) in PGS_POOL:
            if re.search(rx, en): pool, kind = attr, k; break
    body = "".join([_li("Эффект", sec.get("ЭФФЕКТ")), _li("Система", sec.get("СИСТЕМА")), _li("Компоненты", sec.get("КОМПОНЕНТЫ / ЗАТРАТЫ"))])
    h = f"<ul>{body}</ul>"
    if PGS in books:
        h += ("<p><em>Бросок по ранним правилам Player's Guide to the Sabbat"
              + (f" ({kind.lower()})" if kind else "") + "; сложность задаёт Рассказчик (по умолчанию — 3 + уровень).</em></p>")
    if status and not re.fullmatch(r"Настольный (классический VTM|Dark Ages)\.", status):
        h += f"<p><em>Статус: {_t(status)}</em></p>"
    if sec.get("УВЕРЕННОСТЬ СВЕРКИ"):
        h += f"<p><em>Сверка конспекта: {_t(sec['УВЕРЕННОСТЬ СВЕРКИ'])}</em></p>"
    return {"discipline": "darkThaumaturgy", "level": level, "name": RITUAL_NAMES.get(en, ru), "en": en, "source": _source(books), "era": era,
            "html": h, "roll": {"trait1": pool, "trait2": "abilities.occult", "difficulty": min(9, 3 + level)}}

# ── пути ──────────────────────────────────────────────────────────────────────────────────────────────────
P_HEADS = {"УРОВНИ ПУТИ", "ПЕРСОНАЛЬНАЯ ЦЕНА / ПОБОЧНЫЕ ЭФФЕКТЫ", "ПРИМЕЧАНИЯ ПО СИСТЕМЕ", "ВАЖНО"}

def path_from(path):
    text = _read(path)
    a, b = _title(text)
    if re.search(r"[A-Za-z]", a) and not re.search(r"[А-Яа-яЁё]", a):     # «Rego Dolor — Путь Боли (Dark Ages)»
        en, alt = a, re.sub(r"\s*\(.*\)$", "", b)
        ru = PATH_NAMES.get(en, alt)
    else:                                                                 # «Путь Боли — Path of Pain (Sins of the Blood)»
        ru, en, alt = a, re.sub(r"\s*\((Sins of the Blood|Dark Ages)\)$", "", b), ""
    sec = _sections(text, P_HEADS)
    src = re.search(r"^Источник:\s*(.+)$", sec[""], re.M)
    src = src.group(1) if src else ""
    books = _books(re.split(r";|\.\s", src)[0]) or _books(src)
    era = DA if books == [DAC98] else ""
    status = re.search(r"^Статус:\s*(.+)$", sec[""], re.M)
    powers = []
    for m in re.finditer(r"^([1-5]) — (.+?)(?: / «(.+?)»)?\n(.+?)(?=\n[1-5] — |\Z)", sec.get("УРОВНИ ПУТИ", ""), re.M | re.S):
        lv, pen, pru, desc = int(m.group(1)), m.group(2).strip(), (m.group(3) or "").strip(), m.group(4)
        powers.append({"level": lv, "name": POWER_PREFIX.get(en, "") + (pru or pen), "en": pen if pru else "", "html": f"<p>{_t(desc)}</p>",
                       "roll": {"trait1": "willpower.permanent", "difficulty": min(9, 3 + lv), "blood": 1}})
    h = f"<p><em>Источник: {html.escape(_source(books), quote=False)}.</em></p>"
    if alt and alt != ru: h += f"<p><em>Другие названия: «{_t(alt)}».</em></p>"
    if status: h += f"<p>{_t(status.group(1))}</p>"
    ul = _li("Цена и побочные эффекты", sec.get("ПЕРСОНАЛЬНАЯ ЦЕНА / ПОБОЧНЫЕ ЭФФЕКТЫ")) + _li("Примечания", sec.get("ПРИМЕЧАНИЯ ПО СИСТЕМЕ"))
    if ul: h += f"<ul>{ul}</ul>"
    if sec.get("ВАЖНО"): h += f"<p><em>Сверка конспекта: {_t(sec['ВАЖНО'])}</em></p>"
    return {"name": ru, "en": en, "source": _source(books), "era": era, "powers": powers, "html": h}

# ── правки уже собранного ─────────────────────────────────────────────────────────────────────────────────
def _fixes(disc, rituals):
    for p in disc["darkThaumaturgy"]["paths"]:
        if p.get("en") == "The Fires of the Inferno":
            for pw in p["powers"]:
                if 1 <= pw["level"] <= 5 and not pw.get("en"): pw["en"] = FIRES_EN[pw["level"] - 1]
        for k in ("en", "html"):
            if "Heriroschaft" in (p.get(k) or ""): p[k] = p[k].replace("Heriroschaft", "Herrschaft")
    for r in rituals["darkThaumaturgy"]["rituals"]:
        if r.get("en") in VARIABLE:
            # уровень выбирают по силе демона: лежит с 1-го уровня, в шапке — «1–5 (переменный)»
            r["level"], r["levelVar"] = 1, "1–5 (переменный)"
            r["roll"] = {**(r.get("roll") or {}), "difficulty": 4, "note": "сложность 3 + выбранный уровень (по силе демона)"}

def _note(p, text):
    p["html"] = f'<p class="r-path-equiv"><em>{html.escape(text)}</em></p>' + p.get("html", "")

def _equiv(disc):
    def path(k, name):
        return next((p for p in disc[k]["paths"] if p["name"] == name), None)
    n = 0
    for (k1, a), (k2, b), why in EQUIV:
        pa, pb = path(k1, a), path(k2, b)
        if not (pa and pb):
            print("  аналог не найден:", a, "↔", b); continue
        same = k1 == k2
        _note(pa, f"Аналог{'' if same else ' в Тауматургии'}: «{pb['name']}» ({why}).")
        _note(pb, f"Аналог{'' if same else ' в Тёмной Тауматургии'}: «{pa['name']}» ({why}).")
        n += 1
    hd = path("thaumaturgy", "Длань Разрушения")
    if hd:
        _note(hd, "Также путь Тёмной Тауматургии: Player's Guide to the Sabbat относит его к инфернальной магии "
                  "(инферналистам доступны пути Тауматургии).")
        n += 1
    return n

def apply(disc, rituals):
    _fixes(disc, rituals)
    rit = rituals.setdefault("darkThaumaturgy", {"rules": [], "rituals": []})["rituals"]
    have = {akey(x.get("en")) for x in rit if x.get("en")} | {rkey(x["name"]) for x in rit}
    n_r, skipped = 0, []
    rdir = os.path.join(SRC, "rituals")
    for f in sorted(os.listdir(rdir)):
        if not f.endswith(".txt") or f.startswith("00_"): continue
        if f[:2] in SKIP_RITUALS: skipped.append(f); continue
        if _keys(*_title(_read(os.path.join(rdir, f)))) & have:
            continue                                          # уже есть (V20 Dread Names)
        r = ritual_from(os.path.join(rdir, f))
        if not r: skipped.append(f); continue
        rit.append(r); have |= _keys(r["en"], r["name"]); n_r += 1
    rit.sort(key=lambda x: (x["level"], x["name"]))
    paths = disc["darkThaumaturgy"]["paths"]
    have = {akey(p.get("en")) for p in paths if p.get("en")} | {rkey(p["name"]) for p in paths}
    n_p = 0
    pdir = os.path.join(SRC, "paths")
    for f in sorted(os.listdir(pdir)):
        if not f.endswith(".txt") or f.startswith("00_"): continue
        if f[:2] in SKIP_PATHS: skipped.append(f); continue
        p = path_from(os.path.join(pdir, f))
        if _keys(p["en"], p["name"]) & have:
            continue                                          # уже есть (Rites of the Blood, Tome of Secrets)
        if len(p["powers"]) < 5:
            print("  путь без пяти уровней:", f, len(p["powers"])); continue
        paths.append(p); have |= _keys(p["en"], p["name"]); n_p += 1
    n_e = _equiv(disc)
    print(f"Тёмная Тауматургия из конспектов: ритуалов +{n_r}, путей +{n_p}, аналогов {n_e}; пропущено: {', '.join(skipped)}")
