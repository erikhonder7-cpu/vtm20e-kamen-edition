# tools/supplements.py
# Магия и силы из дополнений V20 (Rites of the Blood, Lore of the Clans, Lore of the Bloodlines,
# The Black Hand, Anarchs Unbound, Dread Names): пути, ритуалы, новые силы Дисциплин и комбинированные
# Дисциплины. Вызывается из build_data.main() до разметки бросков.
#
# Книги размечены по‑разному (таблицы, абзацы «**Имя** (En) — N», заголовки «### Имя (En) — Дисциплина N»),
# поэтому разбор общий, а что откуда брать — в перечнях ниже.

import os, re, html
from build_data import REF, DOT, read, md_to_html, split_name, md_table, parse_roll

ROTB, LOTC, LOTB = "V20 Rites of the Blood", "V20 Lore of the Clans", "V20 Lore of the Bloodlines"
BH, AU, DN = "V20 The Black Hand", "V20 Anarchs Unbound", "V20 Dread Names, Red List"

# Новые Дисциплины магии крови (механика как у Тауматургии: путь — Воля, сл. 3 + уровень, 1 кровь)
NEW_DISCIPLINES = {
    "setiteSorcery": {
        "name": "Чародейство Сетитов", "en": "Setite Sorcery", "source": ROTB, "clans": "Последователи Сета",
        "rules": [{"title": "", "html": md_to_html([
            "Три традиции Последователей Сета: **Акху** (египетская), **Садхана** (индийская, у Дайтья) и **Ванга** (вуду). "
            "Механически — как Тауматургия: сила пути — **1 кровь** и бросок **Воли**, сл. **3 + уровень**; "
            "ритуал — **Интеллект + Оккультизм**, сл. **3 + уровень** (не выше 9).",
            "",
            "- Путь Ванги «Поток Аше» не стоит крови: травяные смеси заменяют её; неудача — **2 крови** вместо одной.",
            "- С чужой школой магии крови — как у Ассамитов: опыт ×1,5, путь +1 кровь, ритуал втрое дольше и на 1 успех больше."])}]},
    "darkThaumaturgy": {
        "name": "Тёмная Тауматургия", "en": "Dark Thaumaturgy", "source": ROTB, "clans": "Баали, инферналисты",
        "rules": [{"title": "", "html": md_to_html([
            "Магия крови, дарованная демонами. Механически — как Тауматургия: сила пути — **1 кровь** и бросок **Воли**, "
            "сл. **3 + уровень**; ритуал — **Интеллект + Оккультизм**.",
            "",
            "- При первом применении — **−1 к морали**, затем проверка **Совести** при каждом применении "
            "(кроме идущих Путём Злых Откровений).",
            "- Источник — тёмный покровитель: каждая новая точка обычно стоит услуги или обещания."])}]},
}

# Русские названия Дисциплин в тексте → ключ (по первым буквам, чтобы ловить падежи)
DISC_RU = [
    ("тауматург", "thaumaturgy"), ("тёмная таумат", "darkThaumaturgy"), ("некромант", "necromancy"), ("колдовств", "koldunism"),
    ("ясновид", "auspex"), ("стремител", "celerity"), ("мощ", "potence"), ("стойкост", "fortitude"),
    ("величи", "presence"), ("доминир", "dominate"), ("сокрыт", "obfuscate"), ("затмени", "obtenebration"),
    ("метаморф", "protean"), ("преображ", "vicissitude"), ("анимализм", "animalism"), ("помешат", "dementation"),
    ("серпентис", "serpentis"), ("фантасмаг", "chimerstry"), ("упокоен", "quietus"), ("висцерат", "visceratika"),
    ("демонион", "daimoinon"), ("мельпомен", "melpominee"), ("мистифика", "mytherceria"), ("обеа", "obeah"),
    ("валерен", "valeren"), ("темпорис", "temporis"), ("танатозис", "thanatosis"), ("бардо", "bardo"),
    ("сангвинус", "sanguinus"), ("спиритус", "spiritus"), ("огам", "ogham"), ("полёт", "flight"),
    ("акху", "setiteSorcery"), ("стекловидный путь", "necromancy"),
]

def disc_key(text):
    t = text.lower().strip()
    for ru, k in sorted(DISC_RU, key=lambda x: -len(x[0])):
        if t.startswith(ru): return k
    return None

def level_of(text):
    """«•••», «3», «Мощь 6», «Величие 6 / 7» → первое число уровня."""
    t = text.replace("*", "")
    m = re.search(rf"[{DOT}]+", t)
    if m: return m.group(0).count(DOT)
    m = re.search(r"\d+", t)
    return int(m.group(0)) if m else None

def reqs_of(text):
    """«Ясновидение 3, Стремительность ••» → [{key, level, text}] — требования комбинированной силы."""
    out = []
    for part in re.split(r",|\s\+\s|\sи\s", text.replace("*", "")):
        part = part.strip()
        lv = level_of(part)
        k = disc_key(part)
        if lv and k: out.append({"key": k, "level": lv})
    return out

def plain_name(cell):
    return split_name(re.sub(r"\*\*", "", cell).strip())

def heading_level(l):
    m = re.match(r"^(#{1,6}) ", l)
    return len(m.group(1)) if m else 0

def grab(rel, *titles):
    """Строки раздела: по цепочке заголовков (каждый следующий — внутри предыдущего), до заголовка того же уровня."""
    lines = read(os.path.join(REF, rel))
    for t in titles:
        start = None
        for i, l in enumerate(lines):
            h = heading_level(l)
            if h and re.match(t, l[h + 1:].strip()):
                start, lvl = i, h; break
        if start is None:
            print("  раздел не найден:", rel, t); return [], ""
        end = next((j for j in range(start + 1, len(lines)) if heading_level(lines[j]) and heading_level(lines[j]) <= lvl), len(lines))
        title, lines = lines[start][lvl + 1:].strip(), lines[start + 1:end]
    return lines, title

def tables(lines):
    """Все markdown‑таблицы: [(шапка, строки)]."""
    res, cur = [], []
    for l in lines + [""]:
        if l.startswith("|"):
            cur.append(l)
        elif cur:
            h, rows = md_table(cur)
            if h: res.append((h, rows))
            cur = []
    return res

def src_p(book, note=""):
    return f"<p><em>Источник: {html.escape(book)}.{(' ' + html.escape(note)) if note else ''}</em></p>"

# ── Ритуалы ─────────────────────────────────────────────────────────────────

ITEM_RE = re.compile(r"^\*\*(.+?)\*\*\s*\(([^()]*[A-Za-z][^()]*)\)\s*(?:—\s*(?:уровень\s*)?(\d+)\s*(?:,\s*(.+?))?)?\s*$")
H3_RE = re.compile(r"^(.+?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*—\s*(.*)$")

def rituals_from(lines, disc, book, note="", disc_of=None):
    """Ритуалы из раздела: таблица «Ритуал | Ур. | …», абзацы «**Имя** (En) — N» или заголовки «### Имя (En) — … N».
    Уровень может задаваться заголовком «Уровень N»."""
    res, cur, lvl = [], None, None
    def close():
        if cur:
            body = cur.pop("body")
            cur["html"] = src_p(book, cur.pop("note", note)) + md_to_html(body)
            res.append(cur)
    for h, rows in tables(lines):
        if not h or not re.match(r"Ритуал", h[0].replace("*", "")): continue
        for r in rows:
            if len(r) < 3: continue
            ru, en = plain_name(r[0])
            lv = level_of(r[1]) or 5
            parts = [f"**{h[i].replace('*', '')}:** {r[i]}" for i in range(2, len(r)) if r[i].strip()] if len(r) > 3 else [r[2]]
            if not level_of(r[1]): parts.append(f"**Уровень:** {r[1]}.")
            res.append({"discipline": disc_of(ru + " " + " ".join(r)) if disc_of else disc, "level": lv, "name": ru, "en": en,
                        "html": src_p(book, note) + md_to_html([("- " + p) if len(parts) > 1 else p for p in parts])})
    for l in lines:
        m = re.match(r"^#{2,4} Уровень (\d+)", l)
        if m:
            close(); cur = None; lvl = int(m.group(1)); continue
        m = ITEM_RE.match(l)
        if m and (m.group(3) or lvl):
            close()
            extra = m.group(4)
            cur = {"discipline": disc_of(extra or "") if disc_of else disc, "level": int(m.group(3) or lvl),
                   "name": m.group(1).strip(), "en": m.group(2).strip(), "body": [],
                   "note": (note + (" Традиция: " + extra + "." if extra else "")).strip()}
            continue
        h = heading_level(l)
        if h >= 3:
            mm = H3_RE.match(l[h + 1:].strip())
            close(); cur = None
            if mm and level_of(mm.group(3)):
                cur = {"discipline": (disc_of(mm.group(3)) if disc_of else disc) or disc, "level": level_of(mm.group(3)),
                       "name": re.sub(r"^Ритуал:\s*", "", mm.group(1).strip()), "en": mm.group(2).strip(), "body": []}
                if "запрещ" in mm.group(3): cur["note"] = note + " Запрещён Пирамидой."
            continue
        if h or l.strip() == "---":
            close(); cur = None; continue
        if cur is not None: cur["body"].append(l)
    close()
    return res

def ritual_heading(rel, title_re, disc, book, level):
    """Раздел, где сам заголовок — ритуал: «## Новый ритуал …: Имя (уровень 5)»."""
    lines, title = grab(rel, title_re)
    name = re.sub(r"^.*?:\s*", "", title)
    name = re.sub(r"\s*\((?:уровень|ур\.)[^)]*\)\s*$", "", name)
    name = re.sub(r"\s*—\s*.*$", "", name)
    ru, en = split_name(name)
    return [{"discipline": disc, "level": level, "name": ru, "en": en, "html": src_p(book) + md_to_html(lines)}]

# повторы уже перенесённых ритуалов под другим именем
SKIP_RITUALS = {"Оберег от демонов", "Погасить пламя"}
def setite_or_thaum(t): return "setiteSorcery" if re.search(r"Акху|Ванга|Садхана", t) else "thaumaturgy"

RITUALS = [
    # (файл, цепочка заголовков, Дисциплина, книга, примечание)
    ("Rites_of_the_Blood/09_Ритуалы_Тауматургии_гл7.md", [r"Ритуалы Тауматургии"], "thaumaturgy", ROTB, "Ритуалы прежних изданий, сверены по V20."),
    ("Rites_of_the_Blood/01_Камарилья_ритуалы_Тауматургии.md", [r"Ритуалы Тауматургии"], "thaumaturgy", ROTB, "Тауматургия Камарильи."),
    ("Rites_of_the_Blood/03_Анархи_четыре_школы.md", [r"Ритуалы Старой школы"], "thaumaturgy", ROTB, "Анархи, Старая школа."),
    ("Rites_of_the_Blood/03_Анархи_четыре_школы.md", [r"Ритуалы нью"], "thaumaturgy", ROTB, "Анархи, нью‑эйдж."),
    ("Rites_of_the_Blood/03_Анархи_четыре_школы.md", [r"Ритуалы панк"], "thaumaturgy", ROTB, "Анархи, панк‑колдовство."),
    ("Rites_of_the_Blood/03_Анархи_четыре_школы.md", [r"Ритуалы хактивистов"], "thaumaturgy", ROTB, "Анархи, хактивисты."),
    ("Rites_of_the_Blood/05_Необычное_Инконну_ТалМахеРа_создания.md", [r"Ритуалы Тауматургии Инконну"], "thaumaturgy", ROTB, "Инконну."),
    ("Rites_of_the_Blood/05_Необычное_Инконну_ТалМахеРа_создания.md", [r"Ритуалы некромантии Тал"], "necromancy", ROTB, "Тал'Махе'Ра."),
    ("Rites_of_the_Blood/04_Независимые_Ассамиты_Сетиты_Джованни.md", [r"Чародейство Сетитов", r"Ритуалы"], "setiteSorcery", ROTB, ""),
    ("Rites_of_the_Blood/04_Независимые_Ассамиты_Сетиты_Джованни.md", [r"Новые ритуалы некромантии"], "necromancy", ROTB, "Джованни."),
    ("Rites_of_the_Blood/10_Колдовство_ДурАнКи_Сетиты_тёмная_Тауматургия.md", [r"Ритуалы колдовства"], "koldunism", ROTB, ""),
    ("Rites_of_the_Blood/10_Колдовство_ДурАнКи_Сетиты_тёмная_Тауматургия.md", [r"Ритуалы анархов"], "koldunism", ROTB, "Колдуны‑анархи."),
    ("Rites_of_the_Blood/10_Колдовство_ДурАнКи_Сетиты_тёмная_Тауматургия.md", [r"Ритуалы Дур"], "assamiteSorcery", ROTB, "Дур‑Ан‑Ки."),
    ("Rites_of_the_Blood/10_Колдовство_ДурАнКи_Сетиты_тёмная_Тауматургия.md", [r"Ритуалы Сетитов"], "setiteSorcery", ROTB, ""),
    ("Rites_of_the_Blood/02_Шабаш_ритуалы_и_ритусы.md", [r"Ритуал Аль"], "assamiteSorcery", ROTB, "Ритуал Дур‑Ан‑Ки, известный в Шабаше."),
    ("Rites_of_the_Blood/02_Шабаш_ритуалы_и_ритусы.md", [r"Мистика Бездны"], "obtenebration", ROTB, "Мистика Бездны: бросок Смекалка + Оккультизм; у каждого ритуала есть побочный эффект."),
    ("Lore_of_the_Clans/05_Джованни.md", [r"Новые некромантические ритуалы"], "necromancy", LOTC, "Джованни."),
    ("Lore_of_the_Clans/06_Ласомбра.md", [r"Мистицизм Бездны"], "obtenebration", LOTC, "Мистика Бездны."),
    ("Lore_of_the_Clans/11_Тремер.md", [r"Новые ритуалы"], "thaumaturgy", LOTC, ""),
    ("Lore_of_the_Bloodlines/03_Горгульи.md", [r"Ритуалы Горгулий"], "thaumaturgy", LOTB, "Ритуал Горгулий."),
    ("Lore_of_the_Bloodlines/04_Вестники_Черепов.md", [r"Ритуал некромантии"], "necromancy", LOTB, "Вестники Черепов."),
    ("Dread_Names/01_Аласторы_Анафема_и_механика.md", [r"Новые ритуалы Тауматургии"], "thaumaturgy", DN, ""),
    ("Dread_Names/01_Аласторы_Анафема_и_механика.md", [r"Ритуалы тёмной Тауматургии"], "darkThaumaturgy", DN, ""),
]

# ── Пути ────────────────────────────────────────────────────────────────────

def path_from(rel, title_re, disc, book, note="", parent=None):
    titles = [parent, title_re] if parent else [title_re]
    lines, title = grab(rel, *titles)
    if not lines: return None
    name = re.sub(r"\s*—\s*(путь|Некромантия).*$", "", title)
    ru, en = split_name(name)
    intro, powers = [], []
    for h, rows in tables(lines):
        if len(h) >= 3 and re.match(r"Ур", h[0]) and re.match(r"Сила|Вид", h[1]):
            for r in rows:
                lv = level_of(r[0])
                if not lv or len(r) < 3: continue
                pr, pe = plain_name(r[1])
                powers.append({"level": lv, "name": pr, "en": pe, "html": md_to_html([r[2]])})
    intro = [l for l in lines if not l.startswith("|") and not re.match(r"^\*\*.+ — результаты:\*\*$", l)]
    return {"name": ru, "en": en, "source": book, "powers": powers, "html": src_p(book, note) + md_to_html(intro)}

def scaled_path(p, label, rows):
    """Путь из одной силы с растущим охватом (Путь Духа, Праапти): строки таблицы — уровни."""
    p["powers"] = [{"level": lv, "name": f"{p['name']} — {val}", "en": "",
                    "html": f"<p>{html.escape(label)}: <strong>{html.escape(val)}</strong>. Остальное — в описании пути.</p>"} for lv, val in rows]
    return p

def table_rows(rel, title_re, parent=None):
    lines, _ = grab(rel, *([parent, title_re] if parent else [title_re]))
    t = tables(lines)
    return [(level_of(r[0]), r[1:]) for r in t[0][1] if level_of(r[0])] if t else []

R10 = "Rites_of_the_Blood/10_Колдовство_ДурАнКи_Сетиты_тёмная_Тауматургия.md"

def build_paths():
    """{disc: [пути]} из дополнений."""
    out = {k: [] for k in ("thaumaturgy", "necromancy", "koldunism", "assamiteSorcery", "setiteSorcery", "darkThaumaturgy")}
    f08 = "Rites_of_the_Blood/08_Новые_пути_Тауматургии.md"
    for t in (r"Власть над смертной", r"Путь Сосредоточенного", r"Путь Молнии", r"Путь Управления духами"):
        p = path_from(f08, t, "thaumaturgy", ROTB)
        if p: out["thaumaturgy"].append(p)
    p = path_from("Black_Hand/02_Бахари_культ_Тёмной_Матери.md", r"Благословения Великой", "thaumaturgy", BH, "Путь Бахари.")
    if p and p["powers"]: out["thaumaturgy"].append(p)
    for rel, t, note in (("Black_Hand/02_Бахари_культ_Тёмной_Матери.md", r"Путь Паслёна", "Путь Бахари."),
                         ("Black_Hand/05_Линии_колдунство_достоинства_диаблери_Голконда.md", r"Путь Призраков", "")):
        p = path_from(rel, t, "necromancy", BH, note)
        if p: out["necromancy"].append(p)
    # Колдовство по Rites of the Blood: Воля, сл. 3 + уровень, 1 кровь; вне Восточной Европы +1
    kold_note = "Механика Rites of the Blood: бросок Воли, сл. 3 + уровень, 1 кровь; вне Восточной Европы +1 к сложности."
    spirit = path_from(R10, r"Путь Духа", "koldunism", ROTB, kold_note)
    if spirit:
        out["koldunism"].append(scaled_path(spirit, "Радиус восприятия", [(lv, c[0]) for lv, c in table_rows(R10, r"Путь Духа")]))
    p = path_from(R10, r"Путь Скорбей", "koldunism", ROTB, kold_note + " Цель нужно воспринимать напрямую.")
    if p: out["koldunism"].append(p)
    for t in (r"Путь Ветров охотника", r"Путь Дурного глаза"):
        p = path_from(R10, t, "assamiteSorcery", ROTB, "Путь Дур‑Ан‑Ки.")
        if p: out["assamiteSorcery"].append(p)
    p = path_from(R10, r"Ушебти", "setiteSorcery", ROTB, "Путь Акху.")
    if p: out["setiteSorcery"].append(p)
    p = path_from(R10, r"Путь Праапти", "setiteSorcery", ROTB, "Путь Садханы (Тремер переделали его в Путь Меркурия).")
    if p: out["setiteSorcery"].append(scaled_path(p, "Дальность перемещения", [(lv, c[0]) for lv, c in table_rows(R10, r"Путь Праапти")]))
    p = path_from(R10, r"Поток Аше", "setiteSorcery", ROTB, "Путь Ванги: травяные смеси вместо крови.")
    if p: out["setiteSorcery"].append(p)
    fires = path_from(R10, r"Огни Преисподней", "darkThaumaturgy", ROTB)
    if fires:
        fires["powers"] = [{"level": lv, "name": f"Огни Преисподней — {lv}", "en": "",
                            "html": md_to_html([f"Адское пламя (по силе — {c[0].lower()}): поглощение **{c[1]}** (только со Стойкостью), урон **{c[2]}** губительный за ход."])}
                           for lv, c in table_rows(R10, r"Огни Преисподней")]
        out["darkThaumaturgy"].append(fires)
    p = path_from(R10, r"Путь Фобоса", "darkThaumaturgy", ROTB)
    if p: out["darkThaumaturgy"].append(p)
    taking = path_from(R10, r"Взятие духа", "darkThaumaturgy", ROTB)
    if taking:
        rec = {1: "3 Воли за день отдыха", 2: "2 Воли за день", 3: "1 Воля за день", 4: "1 Воля в неделю", 5: "1 Воля за две недели"}
        taking["powers"] = [{"level": lv, "name": f"Взятие духа — {lv}", "en": "",
                             "html": md_to_html([f"Касание и состязание **Воли** (сл. 8). Жертва восстанавливает отнятую Волю медленнее: **{rec[lv]}**."])}
                            for lv in range(1, 6)]
        out["darkThaumaturgy"].append(taking)
    return out

# ── Новые силы Дисциплин и комбинированные Дисциплины ───────────────────────

POWER_SECTIONS = [
    # (файл, заголовок раздела, книга, Дисциплина по умолчанию)
    ("Lore_of_the_Clans/02_Бруха.md", r"Новая сила", LOTC, None),
    ("Lore_of_the_Clans/03_Последователи_Сета.md", r"Новые силы", LOTC, None),
    ("Lore_of_the_Clans/04_Гангрелы.md", r"Новые силы Метаморфоз", LOTC, "protean"),
    ("Lore_of_the_Clans/06_Ласомбра.md", r"Новые силы", LOTC, None),
    ("Lore_of_the_Clans/07_Малкавиане.md", r"Новые силы", LOTC, None),
    ("Lore_of_the_Clans/08_Носферату.md", r"Новые силы Сокрытия", LOTC, "obfuscate"),
    ("Lore_of_the_Clans/09_Равнос.md", r"Новая сила Фантасмагории", LOTC, "chimerstry"),
    ("Lore_of_the_Clans/10_Тореадор.md", r"Новая сила Величия", LOTC, "presence"),
    ("Lore_of_the_Clans/12_Цимисхи.md", r"Новые силы", LOTC, None),
    ("Lore_of_the_Clans/13_Вентру.md", r"Новые силы", LOTC, None),
    ("Lore_of_the_Bloodlines/01_Баали.md", r"Альтернативная сила", LOTB, "daimoinon"),
    ("Lore_of_the_Bloodlines/02_Дочери_Какофонии.md", r"Силы старейшин", LOTB, "melpominee"),
    ("Lore_of_the_Bloodlines/07_Салюбри.md", r"Новые силы", LOTB, None),
    ("Lore_of_the_Bloodlines/08_Самеди.md", r"Сила старейшин", LOTB, "thanatosis"),
    ("Lore_of_the_Bloodlines/09_Истинные_Бруха.md", r"Силы старейшин", LOTB, "temporis"),
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", r"Силы старейшин", AU, None),
]

COMBO_FILES = [
    *[(f"Lore_of_the_Clans/{f}", LOTC) for f in ("01_Ассамиты.md", "02_Бруха.md", "03_Последователи_Сета.md", "04_Гангрелы.md",
      "05_Джованни.md", "06_Ласомбра.md", "07_Малкавиане.md", "08_Носферату.md", "09_Равнос.md", "10_Тореадор.md",
      "11_Тремер.md", "12_Цимисхи.md", "13_Вентру.md", "14_Каитиф_и_антитрибу.md")],
    *[(f"Lore_of_the_Bloodlines/{f}", LOTB) for f in ("01_Баали.md", "02_Дочери_Какофонии.md", "03_Горгульи.md",
      "04_Вестники_Черепов.md", "05_Киасиды.md", "06_Нагараджа.md", "07_Салюбри.md", "08_Самеди.md", "09_Истинные_Бруха.md")],
    ("Anarchs_Unbound/01_Анархи_черты_и_дисциплины.md", AU),
    ("Dread_Names/01_Аласторы_Анафема_и_механика.md", DN),
]

def new_powers(lines, book, default):
    """[(ключ, сила)] из таблицы «Сила | Уровень | Эффект», пунктов «- **Имя** (En) — **Мощь 6**. …» или «### Имя (En) — Дисциплина N»."""
    res = []
    for h, rows in tables(lines):
        if len(h) < 3 or not re.match(r"Сила", h[0]) or not re.match(r"Уров", h[1]): continue
        for r in rows:
            k = disc_key(r[1]) or default
            lv = level_of(r[1])
            if not k or not lv: continue
            ru, en = plain_name(r[0])
            res.append((k, {"level": lv, "name": ru, "en": en, "html": src_p(book) + md_to_html([r[2]]), "source": book}))
    cur = None
    def close():
        if cur: res.append((cur[0], {**cur[1], "html": src_p(book) + md_to_html(cur[2])}))
    for l in lines:
        m = re.match(r"^- \*\*(.+?)\*\*\s*\((.+?)\)\s*—\s*\*\*(.+?)\*\*\.?\s*(.*)$", l)
        h = heading_level(l)
        mh = H3_RE.match(l[h + 1:].strip()) if h >= 3 else None
        if m and level_of(m.group(3)) and disc_key(m.group(3)):
            close()
            k = disc_key(m.group(3)) or default
            cur = (k, {"level": level_of(m.group(3)), "name": m.group(1), "en": m.group(2), "source": book}, [m.group(4)])
        elif mh and level_of(mh.group(3)):
            close()
            k = disc_key(mh.group(3)) or default
            cur = (k, {"level": level_of(mh.group(3)), "name": mh.group(1).strip(), "en": mh.group(2).strip(), "source": book}, [])
        elif h or l.strip() == "---":
            close(); cur = None
        elif cur is not None:
            cur[2].append(l)
    close()
    return [(k, p) for k, p in res if k]

def combos_from(rel, book):
    lines = read(os.path.join(REF, rel))
    res = []
    def add(name, reqtxt, xp, body):
        ru, en = split_name(re.sub(r"\*\*", "", name).strip())
        res.append({"name": ru, "en": en, "requires": reqs_of(reqtxt), "requiresText": re.sub(r"\*\*", "", reqtxt).strip(),
                    "xp": int(xp) if str(xp).strip().isdigit() else None, "source": book,
                    "html": src_p(book, f"Комбинированная Дисциплина: {re.sub(r'[*]', '', reqtxt).strip()}" + (f" · опыт {xp}." if xp else ".")) + md_to_html(body)})
    for h, rows in tables(lines):
        if len(h) >= 4 and re.match(r"Сила", h[0]) and re.match(r"Требован", h[1]):
            for r in rows:
                if len(r) >= 4: add(r[0], r[1], r[2], [r[3]])
    cur = None
    for l in lines:
        h = heading_level(l)
        m = re.match(r"^(?:Комбинированная сила:\s*)?(.+?)\s*—\s*(.+?)\s*·\s*опыт\s*(\d+)\s*$", l[h + 1:].strip()) if h >= 2 else None
        if m and reqs_of(m.group(2)):
            if cur: add(*cur)
            cur = [m.group(1), m.group(2), m.group(3), []]
        elif h or l.strip() == "---":
            if cur: add(*cur); cur = None
        elif cur is not None:
            cur[3].append(l)
    if cur: add(*cur)
    return res

# ── Сборка ──────────────────────────────────────────────────────────────────

def norm(s): return re.sub(r"[^a-zа-яё]", "", (s or "").lower())

def apply(disc, rituals):
    """Добавить дополнения в справочник. Возвращает список комбинированных Дисциплин."""
    for k, d in NEW_DISCIPLINES.items():
        disc.setdefault(k, {"key": k, "powers": [], "paths": [], **d})
    # пути: V20‑версия Пути Скорбей заменяет кланбук Revised
    paths = build_paths()
    if paths["koldunism"]:
        disc["koldunism"]["paths"] = [p for p in disc["koldunism"]["paths"] if not p["name"].startswith("Путь Скорби")]
    n_paths = 0
    for k, lst in paths.items():
        have = {norm(p.get("en")) or norm(p["name"]) for p in disc[k]["paths"]}
        for p in lst:
            if (norm(p.get("en")) or norm(p["name"])) in have: continue
            disc[k]["paths"].append(p); n_paths += 1
            for pw in p["powers"]:
                if k == "koldunism":
                    pw["roll"] = {"trait1": "willpower.permanent", "difficulty": min(9, 3 + pw["level"]), "blood": 1,
                                  "note": "вне Восточной Европы +1 к сложности"}
                elif k == "necromancy":
                    r = parse_roll(pw["html"])
                    if r: pw["roll"] = r
                else:
                    # как у Тауматургии: Воля, сл. 3 + уровень, 1 кровь; свой пул из описания, если указан
                    own = parse_roll(pw["html"]) or {}
                    pw["roll"] = {"trait1": "willpower.permanent", "difficulty": min(9, 3 + pw["level"]), "blood": 1,
                                  **{x: own[x] for x in ("trait1", "trait2", "difficulty") if x in own and own.get("trait2")}}
                    if k == "setiteSorcery" and p["name"].startswith("Поток Аше"):
                        pw["roll"]["blood"] = 0
    # ритуалы
    n_rit = 0
    for rel, titles, k, book, note in RITUALS:
        lines, _ = grab(rel, *titles)
        found = rituals_from(lines, k, book, note)
        for r in found:
            key = r["discipline"]
            rituals.setdefault(key, {"rules": [], "rituals": []})
            have = {norm(x.get("en")) or norm(x["name"]) for x in rituals[key]["rituals"]}
            if (norm(r.get("en")) or norm(r["name"])) in have or r["name"] in SKIP_RITUALS: continue
            if key == "obtenebration":
                r["roll"] = {"trait1": "attributes.wits", "trait2": "abilities.occult", "difficulty": min(9, 3 + r["level"])}
            rituals[key]["rituals"].append(r); n_rit += 1
    # созданные существа (Rites of the Blood, гл. 5): ритуалы‑заголовки «### Имя (En) — Тауматургия 5»
    lines, _ = grab("Rites_of_the_Blood/05_Необычное_Инконну_ТалМахеРа_создания.md", r"Созданные существа")
    for r in rituals_from(lines, "thaumaturgy", ROTB, "Созданные существа.", setite_or_thaum):
        have = {norm(x.get("en")) for x in rituals[r["discipline"]]["rituals"]}
        if norm(r["en"]) not in have: rituals[r["discipline"]]["rituals"].append(r); n_rit += 1
    for rel, t, k, book, lv in (("Lore_of_the_Clans/01_Ассамиты.md", r"Новый ритуал Дур", "assamiteSorcery", LOTC, 5),):
        for r in ritual_heading(rel, t, k, book, lv):
            rituals[k]["rituals"].append(r); n_rit += 1
    lines, _ = grab("Black_Hand/05_Линии_колдунство_достоинства_диаблери_Голконда.md", r"Путь Призраков")
    for r in rituals_from(lines, "necromancy", BH, "Маэгары."):
        rituals["necromancy"]["rituals"].append(r); n_rit += 1
    rituals.setdefault("obtenebration", {"rules": [], "rituals": []})
    if not rituals["obtenebration"]["rules"]:
        rituals["obtenebration"]["rules"].append({"title": "Мистика Бездны", "html": md_to_html([
            "Ритуалы Ласомбра‑мистиков (V20 Rites of the Blood, Lore of the Clans).",
            "",
            "- **Требования:** Затмение 1+ и Оккультизм 1+; уровень ритуала — не выше меньшего из двух.",
            "- **Бросок:** **Смекалка + Оккультизм**, сл. **3 + уровень** (не выше 9); достаточно одного успеха.",
            "- **Изучение:** **3 × уровень** опыта. У каждого ритуала есть побочный эффект; недостатки от него не дают очков."])})
    for k in ("setiteSorcery", "darkThaumaturgy"):
        rituals.setdefault(k, {"rules": [], "rituals": []})
    # новые силы Дисциплин
    n_pow = 0
    for rel, t, book, default in POWER_SECTIONS:
        lines, _ = grab(rel, t)
        for k, p in new_powers(lines, book, default):
            if k not in disc: continue
            have = {norm(x.get("en")) or norm(x["name"]) for x in disc[k]["powers"]}
            if (norm(p["en"]) or norm(p["name"])) in have: continue
            r = parse_roll(p["html"])
            if r: p["roll"] = r
            disc[k]["powers"].append(p); n_pow += 1
        for k in disc:
            disc[k]["powers"].sort(key=lambda x: int(x["level"]))
    # комбинированные
    combos, seen = [], set()
    for rel, book in COMBO_FILES:
        for c in combos_from(rel, book):
            key = norm(c["en"]) or norm(c["name"])
            if key in seen: continue
            seen.add(key); combos.append(c)
    for k, r in rituals.items():
        for rt in r["rituals"]:
            rt.setdefault("roll", {"trait1": "attributes.intelligence", "trait2": "abilities.occult", "difficulty": min(9, 3 + rt["level"])})
    for c in combos:
        r = parse_roll(c["html"])
        if r: c["roll"] = r
    print(f"Дополнения V20: путей +{n_paths}, ритуалов +{n_rit}, сил +{n_pow}, комбинированных {len(combos)}")
    return combos
