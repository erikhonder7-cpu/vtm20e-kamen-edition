# tools/powers_extra.py
# Силы Дисциплин сверх V20 и его дополнений, прежде всего высокие уровни (6–9): гайды по Камарилье и Шабашу
# (Revised), кланбуки Revised, Player's Guide to High Clans / Low Clans (Тёмные века, era = "darkAges").
# Вызывается из build_data.main() после supplements.apply() и magic_extra.apply().
#
# Разметка: таблицы «Сила | Уровень/У. | Эффект» (уровень числом или «Серпентис 6»), таблицы без уровня
# (Guide to the Camarilla: на каждом из уровней 6–9 — одна способность из списка) и заголовки
# «## ••••• • (6) Имя» / «## Уровень 6 — Имя» с описанием ниже. Дисциплина — из ближайшего заголовка
# с её названием или из ячейки уровня. Повторы внутри Дисциплины отсекаются по названию.

import os, re
from build_data import REF, read, md_to_html, parse_roll, split_name
from supplements import DISC_RU, heading_level, tables, src_p

DA = "darkAges"

# (файл, книга, эпоха, «Затмение» = Сокрытие)
SOURCES = [
    ("Revised_Гайды_сект/01c_Камарилья_высокие_Дисциплины_1.md", "Guide to the Camarilla (Revised)", "", False),
    ("Revised_Гайды_сект/03c_Шабаш_1999_Дисциплины_и_магия.md", "Guide to the Sabbat (Revised)", "", False),
    *[(f"Revised_Кланбуки/{f}", f"Clanbook: {b} (Revised)", "", False) for f, b in (
        ("01_Последователи_Сета.md", "Followers of Set"), ("02_Тремер.md", "Tremere"), ("03_Цимисхи.md", "Tzimisce"),
        ("04_Гангрелы.md", "Gangrel"), ("05_Ассамиты.md", "Assamite"), ("06_Тореадор.md", "Toreador"), ("07_Вентру.md", "Ventrue"))],
    *[(f"DA_High_Clans/{f}", "Dark Ages: Player's Guide to High Clans", DA, False) for f in (
        "02_Ясновидение_высокие_уровни.md", "03_Стремительность_высокие_уровни.md", "04_Доминирование_высокие_уровни.md",
        "05_Стойкость_высокие_уровни.md", "06_Затмение_высокие_уровни.md", "07_Мощь_высокие_уровни.md",
        "08_Величие_высокие_уровни.md", "09_Преображение_высокие_уровни.md")],
    *[(f"DA_Low_Clans/{f}", "Dark Ages: Player's Guide to Low Clans", DA, f.startswith("05_")) for f in (
        "02_Анимализм_высокие_уровни.md", "03_Химерия_высокие_уровни.md", "04_Помешательство_высокие_уровни.md",
        "05_Затмение_высокие_уровни.md", "06_Метаморфозы_высокие_уровни.md", "07_Упокоение_высокие_уровни.md",
        "08_Серпентис_высокие_уровни.md")],
]

DISC_OLD = [("могуществ", "potence"), ("присутстви", "presence"), ("затемнени", "obfuscate"), ("химери", "chimerstry"),
            ("изменчивост", "vicissitude"), ("прорицани", "auspex"), ("смертоносност", "quietus"),
            ("мифэрсери", "mytherceria"), ("валерен", "valeren"), ("сангвинус", "sanguinus")]
DISC_ALL = sorted(DISC_RU + DISC_OLD, key=lambda x: -len(x[0]))

CHOICE_NOTE = "Уровень в книге не указан: на каждом из уровней 6–9 Дисциплина даёт одну способность из списка на выбор."

def disc_key(text, obf=False):
    t = re.sub(r"^[\d.\s]+", "", text.lower().replace("*", "")).strip()
    if obf and t.startswith("затмени"): return "obfuscate"
    return next((k for ru, k in DISC_ALL if t.startswith(ru)), None)

def norm(s): return re.sub(r"[^a-zа-яё]", "", (s or "").lower().replace("ё", "е"))

def clean(s): return re.sub(r"\*\*", "", s or "").strip()

HEAD_DOTS = re.compile(r"^[•\s]+\((\d+)\)\s*(.+)$")            # «••••• • (6) Разум раскрыт»
HEAD_LVL = re.compile(r"^Уровень\s+(\d+)\s*[—–-]\s*(.+)$")      # «Уровень 6 — Невидимое оружие»

def from_file(rel, book, era, obf):
    lines = read(os.path.join(REF, rel))
    res = []                                    # [(ключ, уровень, имя, тело, без уровня)]
    disc, cur, cur_lvl = None, None, 0
    def close():
        if cur: res.append(cur)
    # заголовки: Дисциплина раздела и силы-заголовки
    marks = []                                  # (номер строки, Дисциплина) — для таблиц
    for i, l in enumerate(lines):
        h = heading_level(l)
        if h:
            t = l[h + 1:].strip()
            if cur and h <= cur_lvl: close(); cur = None
            m = HEAD_DOTS.match(t) or HEAD_LVL.match(t)
            k = disc_key(t, obf)
            if k: disc = k
            elif h <= 2 and not m: disc = disc if h > 1 else None
            if m and disc:
                close(); cur, cur_lvl = (disc, int(m.group(1)), m.group(2), [], False), h
            marks.append((i, disc))
        elif cur is not None:
            cur[3].append(l)
    close()
    # таблицы
    starts = [i for i, l in enumerate(lines) if l.startswith("|") and (i == 0 or not lines[i - 1].startswith("|"))]
    for start, (hd, rows) in zip(starts, tables(lines)):
        if not hd or not re.match(r"Сила|Способность|Название", hd[0]): continue
        here = next((d for i, d in reversed(marks) if i < start), None)
        lvl_col = len(hd) >= 3 and re.match(r"Уров|У\.", hd[1])
        if not lvl_col and not (len(hd) == 2 and re.match(r"Систем|Эффект", hd[1])): continue
        for r in rows:
            if len(r) < 2: continue
            if lvl_col:
                cell = clean(r[1])
                if re.search(r"комбинир", cell, re.I): continue
                # «Доминирование 2 + Величие 3» — комбинированная (они в tools/combos_extra.py), не сила одной Дисциплины
                if sum(1 for x in re.split(r"\+|,|\sи\s", cell) if disc_key(x, obf)) >= 2: continue
                k = disc_key(cell, obf) or here
                m = re.search(r"\d+", cell)
                lv, free = (int(m.group(0)), False) if m else (6, True)
                body = r[2:]
            else:
                k, lv, free, body = here, 6, True, r[1:]
            if k: res.append((k, lv, r[0], [" ".join(body)], free))
    out = []
    for k, lv, name, body, free in res:
        ru, en = split_name(re.sub(r"\s*\(в оригинале[^)]*\)", "", clean(name)))
        ru = re.sub(r"\s*\([^()]*[а-яё][^()]*\)?\s*$", "", ru)     # «Передать мощь (Придать сверхъестественную…)» — второе название
        note = CHOICE_NOTE if free else ""
        p = {"level": lv, "name": ru.rstrip(" .:"), "en": en, "source": book,
             "html": src_p(book, note) + md_to_html(body)}
        if era: p["era"] = era
        roll = parse_roll(p["html"])
        if roll: p["roll"] = roll
        out.append((k, p))
    return out

def apply(disc):
    added, report, unknown = 0, [], set()
    for rel, book, era, obf in SOURCES:
        if not os.path.exists(os.path.join(REF, rel)): report.append(f"  нет файла: {rel}"); continue
        n = 0
        for k, p in from_file(rel, book, era, obf):
            if k not in disc: unknown.add(k); continue
            have = {norm(x.get("en")) for x in disc[k]["powers"] if x.get("en")} | {norm(x["name"]) for x in disc[k]["powers"]}
            if (p["en"] and norm(p["en"]) in have) or norm(p["name"]) in have: continue
            disc[k]["powers"].append(p); n += 1; added += 1
        report.append(f"  {rel.split('/')[-1][:44]:44} +{n}")
    for d in disc.values():
        d["powers"].sort(key=lambda x: int(x["level"]))       # устойчиво: силы V20 остаются первыми на своём уровне
    print(f"Силы Дисциплин из Revised и Тёмных веков: +{added} "
          f"(Тёмные века: {sum(1 for d in disc.values() for p in d['powers'] if p.get('era') == DA)})"
          + (f"; нет Дисциплины: {sorted(unknown)}" if unknown else ""))
    for r in report: print(r)
