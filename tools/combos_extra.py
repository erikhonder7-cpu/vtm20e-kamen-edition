# tools/combos_extra.py
# Комбинированные Дисциплины сверх дополнений V20: Rites of the Blood, гайды сект и кланбуки Revised,
# книги Тёмных веков (era = "darkAges"). Вызывается из build_data.main() после supplements.apply().
#
# Разметка: таблицы «Название/Сила/Техника | Требования | Опыт | Система», заголовки
# «### Имя (En) — Требования · опыт N» / «; опыт N» и «## Имя (Требования)» с описанием ниже.
# Повторы отсекаются по английскому названию, иначе по русскому; одна и та же сила в разных переводах
# (одинаковые требования, другое название) перечислена в SAME.

import os, re
from build_data import REF, read, md_to_html, parse_roll
from supplements import DISC_RU, level_of, heading_level, tables, src_p, split_name

DA = "darkAges"
ROTB = "V20 Rites of the Blood"

# (файл, книга, эпоха, опыт по умолчанию: множитель наибольшего уровня или None)
SOURCES = [
    ("Rites_of_the_Blood/05_Необычное_Инконну_ТалМахеРа_создания.md", ROTB, "", None),
    ("Rites_of_the_Blood/06_Проклятые_инфернализм_Инквизиция.md", ROTB, "", None),
    ("Revised_Гайды_сект/01d_Камарилья_Тауматургия_Пути_и_ритуалы.md", "Guide to the Camarilla (Revised)", "", None),
    ("Revised_Гайды_сект/02_Анархи.md", "Guide to the Anarchs (Revised)", "", None),
    ("Revised_Кланбуки/01_Последователи_Сета.md", "Clanbook: Followers of Set (Revised)", "", None),
    ("Revised_Кланбуки/02_Тремер.md", "Clanbook: Tremere (Revised)", "", None),
    ("Revised_Кланбуки/04_Гангрелы.md", "Clanbook: Gangrel (Revised)", "", None),
    ("Revised_Кланбуки/05_Ассамиты.md", "Clanbook: Assamite (Revised)", "", None),
    ("Revised_Кланбуки/06_Тореадор.md", "Clanbook: Toreador (Revised)", "", None),
    ("Revised_Кланбуки/07_Вентру.md", "Clanbook: Ventrue (Revised)", "", None),
    ("DA_Low_Clans/09_Дисциплинарные_техники.md", "Dark Ages: Player's Guide to Low Clans", DA, 7),   # «Затмение» здесь — Сокрытие
    ("DA_Road_of_Heaven/02_Достоинства_недостатки_особые_силы_Эхо_гнева_Аллаха.md", "Dark Ages: Road of Heaven", DA, None),
    ("DA_High_Clans/10_Новые_приёмы_Дисциплин_комбинации.md", "Dark Ages: Player's Guide to High Clans", DA, None),
    ("DA_Tome_of_Secrets/11_Комбинации_и_ритуалы_игроков.md", "V20 Dark Ages: Tome of Secrets", DA, None),
]

# старые переводы названий Дисциплин (Revised, Тёмные века)
DISC_OLD = [("могуществ", "potence"), ("присутстви", "presence"), ("затемнени", "obfuscate"), ("химери", "chimerstry"),
            ("демонизм", "daimoinon"), ("изменчивост", "vicissitude"), ("власть над тень", "obtenebration"),
            ("прорицани", "auspex")]
DISC_ALL = sorted(DISC_RU + DISC_OLD, key=lambda x: -len(x[0]))

# та же сила под другим русским названием (без английского в книге) — не дублировать
SAME = {"Зов Крови", "Сохранение Стремительной Крови", "Уловка Улыбчивого Джека", "Сумрачная Вуаль", "Лик возлюбленного",
        "Взвесить сердце", "Чародейский взгляд", "Иммунитет к животным", "Фантомная неуязвимость", "Удар из тени",
        "Бдение стража", "Хранить быструю кровь", "Разлом памяти", "Теневой удар", "Долгий марш", "Симпатическая агония",
        "Выпить разум", "Рисунок Души", "Двойной разговор"}
# книги, где «Затмение» — старый перевод Сокрытия (Obfuscate), а не Obtenebration
ZATM_OBFUSCATE = {"DA_Low_Clans/09_Дисциплинарные_техники.md"}

def disc_key(text, obf=False):
    t = text.lower().strip()
    if obf and t.startswith("затмени"): return "obfuscate"
    return next((k for ru, k in DISC_ALL if t.startswith(ru)), None)

def reqs_of(text, obf=False):
    out = []
    for part in re.split(r",|;|\s\+\s|\sи\s", re.sub(r"\([^)]*\)", "", text.replace("*", ""))):
        lv, k = level_of(part), disc_key(part.strip(), obf)
        if lv and k: out.append({"key": k, "level": lv})
    return out

def norm(s): return re.sub(r"[^a-zа-яё]", "", (s or "").lower().replace("ё", "е"))

def clean(s): return re.sub(r"\*\*", "", s or "").strip()

HEAD_XP = re.compile(r"^(?:Комбинированная сила:\s*)?(.+?)\s*—\s*(.+?)\s*[·;]\s*опыт\s*\**(\d+)\**\s*$")
HEAD_PAREN = re.compile(r"^(?:\d+\.\s*)?([^()]+?)\s*\((.*\d.*)\)\s*$")          # скобки бывают вложенные: «(Тауматургия (Rego Vitae) 1)»
# абзацы: «**Эгида Энтропии** (Стойкость 3, Некромантия [Распад могилы] 1) — **21 опыта**» (High Clans)
BOLD_XP = re.compile(r"^\*\*([^*]+?)\*\*\s*\((.*\d.*)\)\s*[—–-]\s*\**(\d+)\s*опыт")
# «**Грация Макшоу** (McShaw's Grace)» и строкой ниже «- **Требования:** … **Опыт: 6.**» (Tome of Secrets)
BOLD_EN = re.compile(r"^\*\*([^*]+?)\*\*\s*\(([A-Z][^()]*)\)\s*$")
REQ_LINE = re.compile(r"^\s*-\s*\*\*Требования:\*\*\s*(.+?)\.\s*\*\*Опыт:\s*([^*]*?)\.?\*\*")
BOLD_START = re.compile(r"^\*\*[^*]+\*\*\s*\(")

def from_file(rel, book, era, xp_mult):
    lines = read(os.path.join(REF, rel))
    obf = rel in ZATM_OBFUSCATE
    found, bodies = [], {}
    # заголовки с описанием ниже
    cur = None
    def close():
        if cur: bodies[norm(split_name(clean(cur[0]))[0])] = cur
    skip = -1
    for i, l in enumerate(lines):
        if i == skip: continue                      # строка «Требования … Опыт» уже ушла в шапку
        h = heading_level(l)
        t = l[h + 1:].strip() if h >= 2 else ""
        m = HEAD_XP.match(t) if t else None
        mp = HEAD_PAREN.match(t) if t and not m else None
        mb = BOLD_XP.match(l) if not h else None
        me = BOLD_EN.match(l) if not h and not mb else None
        mr = REQ_LINE.match(lines[i + 1]) if me and i + 1 < len(lines) else None
        if m and reqs_of(m.group(2), obf):
            close(); cur = [m.group(1), m.group(2), m.group(3), []]
        elif mp and len(reqs_of(mp.group(2), obf)) >= 2:
            close(); cur = [mp.group(1), mp.group(2), None, []]
        elif mb and reqs_of(mb.group(2), obf):
            close(); cur = [mb.group(1), mb.group(2), mb.group(3), []]
        elif mr and reqs_of(mr.group(1), obf):
            rest = lines[i + 1][mr.end():].strip()
            close(); cur = [f"{me.group(1)} ({me.group(2)})", mr.group(1), mr.group(2), [rest] if rest else []]; skip = i + 1
        elif h or l.strip() == "---" or (cur is not None and BOLD_START.match(l)):
            close(); cur = None
        elif cur is not None:
            cur[3].append(l)
    close()
    # таблицы: описание из таблицы или из одноимённого раздела
    for hd, rows in tables(lines):
        if len(hd) < 3 or not re.match(r"Сила|Название|Техника", hd[0]) or not re.match(r"Требован|Уров", hd[1]): continue
        xi = 2 if re.match(r"Опыт", hd[2]) else None
        mixed = hd[1].startswith("Уров")          # «Сила | Уровень | Эффект»: силы Дисциплины вперемешку с комбинированными
        for r in rows:
            if len(r) < 2 or len(reqs_of(r[1], obf)) < (2 if mixed else 1): continue
            body = [" ".join(c for i, c in enumerate(r[2:], 2) if i != xi)] if len(r) > (3 if xi else 2) else []
            sec = bodies.pop(norm(split_name(clean(r[0]))[0]), None)
            if sec: body = sec[3] or body
            elif not body:                      # вариант, описанный пунктом в чужом разделе: «- **Бич раба** (…): …»
                nm = re.sub(r"\s*\(.*$", "", clean(r[0]))
                body = [l for l in lines if re.match(rf"^- \*\*{re.escape(nm)}\*\*", l)][:1]
            mx = re.search(r"Опыт\s*(\d+)", " ".join(body))       # «**Опыт 20.** …» в описании
            body = [re.sub(r"^\*\*Опыт\s*\d+\.?\*\*\s*", "", l) for l in body]
            found.append([r[0], r[1], r[xi] if xi else (mx.group(1) if mx else None), body])
    found += list(bodies.values())
    res = []
    for name, reqtxt, xp, body in found:
        ru, en = split_name(re.sub(r"\s*\((?:вариант|variant)[^)]*\)", "", clean(name)))
        req = reqs_of(reqtxt, obf)
        if not req or ru in SAME: continue
        xp = int(re.sub(r"\D", "", str(xp))) if xp and re.search(r"\d", str(xp)) else (xp_mult * max(x["level"] for x in req) if xp_mult else None)
        rt = re.sub(r"\s*\+\s*", ", ", clean(reqtxt))
        c = {"name": ru, "en": en, "requires": req, "requiresText": rt, "xp": xp, "source": book,
             "html": src_p(book, f"Комбинированная Дисциплина: {rt}" + (f" · опыт {xp}." if xp else ".")) + md_to_html(body)}
        if era: c["era"] = era
        roll = parse_roll(c["html"])
        if roll: c["roll"] = roll
        res.append(c)
    return res

def apply(combos):
    for c in combos: c.setdefault("era", "")
    have = {norm(c["en"]) for c in combos if c["en"]} | {norm(c["name"]) for c in combos}
    added, report = 0, []
    for rel, book, era, xp_mult in SOURCES:
        if not os.path.exists(os.path.join(REF, rel)): report.append(f"  нет файла: {rel}"); continue
        n = 0
        for c in from_file(rel, book, era, xp_mult):
            c.setdefault("era", "")
            if (c["en"] and norm(c["en"]) in have) or norm(c["name"]) in have: continue
            have |= {norm(c["en"]), norm(c["name"])} - {""}
            combos.append(c); n += 1; added += 1
        report.append(f"  {rel.split('/')[-1][:40]:40} +{n}")
    print(f"Комбинированные Дисциплины из Revised и Тёмных веков: +{added} (Тёмные века: {sum(1 for c in combos if c['era'] == DA)})")
    for r in report: print(r)
    return combos
