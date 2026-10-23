# tools/derangements_extra.py
# Расстройства сверх основной книги V20: кланбуки Revised (Тремер, Цимисхи, Малкавиане), The Black Hand,
# V20 Dark Ages (расстройства эпохи, era = "darkAges"). Вызывается из build_data.main() после parse_derangements().
#
# Разметка у книг разная: пункты «- **Имя.** текст» / «- **Имя** (кто): текст», таблица «Расстройство | Эффект»,
# отдельный раздел (Black Hand) и строки групп «- **Группа:** *Имя* — текст; *Имя* — текст» (Тёмные века).

import os, re, html
from build_data import REF, read, md_to_html, split_name
from supplements import grab, tables
import polish                                   # расшифровка сокращений («сл.» → «сложность»)

DA = "darkAges"

def src_p(book, note=""):
    return f"<p><em>Источник: {html.escape(book)}.{(' ' + html.escape(note)) if note else ''}</em></p>"

def clean(s): return re.sub(r"\*\*", "", s or "").strip()

def item(name, body, book, era="", note=""):
    if body and body[0][:1].islower(): body = [body[0][:1].upper() + body[0][1:]] + body[1:]
    ru, en = split_name(clean(name).rstrip(".:"))
    ru = re.sub(r"\s*\([^()]*[а-яё][^()]*\)\s*$", "", ru)        # «Скрытная жажда крови (криптофагия)» — второе название
    return {"name": ru, "en": en, "html": src_p(book, note) + polish._clean(md_to_html(body)), "source": book, "era": era}

def bullets(rel, title, book, era=""):
    """«- **Имя.** текст», «- **Имя** (кто): текст», «- **Имя:** текст» внутри раздела."""
    lines, _ = grab(rel, title)
    out = []
    for l in lines:
        m = re.match(r"^\s*-\s*\*\*(.+?)\*\*\s*(\([^)]*\))?\s*[.:—–-]?\s*(.*)$", l)
        if not m: continue
        # «(только гули)», «(и у вампиров)» — кому бывает: пометкой, а не началом текста
        scope = m.group(2)[1:-1].strip() if m.group(2) else ""
        note = ("Бывает и у вампиров." if scope.startswith("и у") else scope[:1].upper() + scope[1:] + ".") if scope else ""
        out.append(item(m.group(1), [m.group(3).strip()], book, era, note))
    return out

def table(rel, title, book, era=""):
    lines, _ = grab(rel, title)
    out = []
    for hd, rows in tables(lines):
        if not hd or not re.match(r"Расстройств", hd[0]): continue
        out += [item(r[0], [" ".join(r[1:])], book, era) for r in rows if len(r) >= 2]
    return out

def section(rel, title, book, era=""):
    """Весь раздел — одно расстройство; имя — в «…» заголовка."""
    lines, head = grab(rel, title)
    m = re.search(r"«([^»]+)»\s*(\([A-Z][^)]*\))?", head)
    name = (m.group(1) + (" " + m.group(2) if m.group(2) else "")) if m else head
    body = []
    for l in lines:
        if l.strip() == "---": break
        body.append(l)
    return [item(name, body, book, era)]

def groups(rel, title, book, era=""):
    """«- **Группа (пояснение):** *Имя (En)* — текст; *Имя* — текст»."""
    lines, _ = grab(rel, title)
    out = []
    for l in lines:
        m = re.match(r"^\s*-\s*\*\*(.+?):\*\*\s*(.*)$", l)
        if not m or "*" not in m.group(2): continue
        group = clean(m.group(1))
        for part in re.split(r";\s*(?=\*[^*])", m.group(2)):
            mi = re.match(r"^\*([^*]+)\*\s*[—–-]\s*(.*)$", part.strip())
            if mi: out.append(item(mi.group(1), [mi.group(2).rstrip(".") + "."], book, era, f"Группа: {group}."))
    return out

SOURCES = [
    (bullets, "Revised_Кланбуки/02_Тремер.md", r"Психозы Тремер", "Clanbook: Tremere (Revised)", ""),
    (bullets, "Revised_Кланбуки/03_Цимисхи.md", r"Психозы", "Clanbook: Tzimisce (Revised)", ""),
    (table, "Revised_Кланбуки/11_Малкавиане_Revised.md", r"Новые расстройства", "Clanbook: Malkavian (Revised)", ""),
    (section, "Black_Hand/03_Тьма_внизу_демоны_и_Асакку.md", r"Заражение души", "V20 The Black Hand", ""),
    (groups, "V20_Dark_Ages/12_Правила_и_драматические_системы.md", r"Расстройства \(Derangements\)", "V20 Dark Ages", DA),
]

# то же расстройство под другим названием — берём версию V20
SAME = {"Сангвинический анимизм"}

def norm(s): return re.sub(r"[^a-zа-яё]", "", (s or "").lower().replace("ё", "е"))

def apply(ders):
    for d in ders:
        d.setdefault("source", "V20"); d.setdefault("era", "")
    have = {norm(d.get("en")) for d in ders if d.get("en")} | {norm(d["name"]) for d in ders}
    added, report = 0, []
    for fn, rel, title, book, era in SOURCES:
        if not os.path.exists(os.path.join(REF, rel)): report.append(f"  нет файла: {rel}"); continue
        n = 0
        for d in fn(rel, title, book, era):
            if d["name"] in SAME or (d["en"] and norm(d["en"]) in have) or norm(d["name"]) in have: continue
            have |= {norm(d["en"]), norm(d["name"])} - {""}
            ders.append(d); n += 1; added += 1
        report.append(f"  {rel.split('/')[-1][:44]:44} +{n}")
    print(f"Расстройства из дополнений: +{added} (Тёмные века: {sum(1 for d in ders if d['era'] == DA)})")
    for r in report: print(r)
    return ders
