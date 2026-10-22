# Собирает силы дисциплин и путей (• Сила, •• Сила ...) из текстов книг в один индекс.
# Дисциплиной/путём считается ближайший короткий заголовок над силой первого уровня.
# Запуск: python -I _скрипты/disciplines.py   (из папки ВТМ)
import csv, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TXT = ROOT / "_текст"
OUT = ROOT / "_справочник"

POWER = re.compile(r"^(?P<dots>[•●]{1,10})\s*(?P<name>[A-ZА-ЯЁ«\"'][^\n]{1,60})$")
HEADING = re.compile(r"^[A-ZА-ЯЁ«][^.!?:;,•●\n]{2,45}$")
SKIP_HEAD = re.compile(r"^(System|Система|Правила|Level|Уровень|Chapter|Глава|Table|Таблица|Successes|Успех|Result|Результат|Note|Примечание)\b", re.I)
JUNK_POWER = re.compile(r"^(Step|Шаг|Kid|Ребёнок)\b")


def scan(path):
    lines = path.read_text(encoding="utf-8", errors="replace").split("\n")
    rows, page, disc, last_level = [], 1, None, 0
    pages = []
    for raw in lines:
        page += raw.count("\f")
        pages.append(page)
    for i, raw in enumerate(lines):
        line = raw.replace("\f", "").strip()
        m = POWER.match(line)
        if not m or JUNK_POWER.match(m["name"]):
            continue
        name = m["name"].strip(" .")
        if len(name.split()) > 9 or name.endswith((",", ";")) or re.search(r"[.!?]\s", name):
            continue  # это пункт списка, а не заголовок силы
        level = len(m["dots"])
        if level == 1 or disc is None or level <= last_level - 2:
            disc = None
            for j in range(i - 1, max(i - 40, -1), -1):
                h = lines[j].replace("\f", "").strip()
                if HEADING.match(h) and not SKIP_HEAD.match(h) and not POWER.match(h):
                    disc = re.sub(r"\s+", " ", h)
                    break
        last_level = level
        rows.append({
            "Дисциплина / путь": disc or "?",
            "Уровень": level,
            "Сила": re.sub(r"\s+", " ", name),
            "Раздел": path.parent.name,
            "Книга": path.stem,
            "Стр. PDF": pages[i],
        })
    return rows


def main():
    OUT.mkdir(exist_ok=True)
    rows = []
    for p in sorted(TXT.rglob("*.txt")):
        rows += scan(p)
    seen, uniq = set(), []
    for r in rows:
        k = (r["Дисциплина / путь"].lower(), r["Уровень"], r["Сила"].lower(), r["Книга"])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    with open(OUT / "дисциплины_и_пути.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(uniq[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(uniq)
    by_book = {}
    for r in uniq:
        by_book[r["Книга"]] = by_book.get(r["Книга"], 0) + 1
    for b, n in sorted(by_book.items(), key=lambda x: -x[1]):
        print(f"{n:4d}  {b}")
    print("всего:", len(uniq))


if __name__ == "__main__":
    main()
