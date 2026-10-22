# Собирает достоинства и недостатки из текстов книг (_текст/) в один индекс.
# Запуск: python -I _скрипты/merits.py   (из папки ВТМ)
import csv, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TXT = ROOT / "_текст"
OUT = ROOT / "_справочник"

# Название (1 pt. Merit) / (1–3 pt Flaw) / (Variable Merit)
EN = re.compile(r"^(?P<name>[A-Z][^()\n]{1,60}?)\s*\((?P<cost>[^()\n]{0,30}?)\s*pts?\.?\s*(?P<kind>Merit|Flaw)s?\)\s*$")
EN_VAR = re.compile(r"^(?P<name>[A-Z][^()\n]{1,60}?)\s*\((?P<cost>Variable|[0-9][^()\n]{0,20}?)\s*(?P<kind>Merit|Flaw)s?\)\s*$")
# Название (достоинство, 1 пункт) / (недостаток, от 1 до 3 пунктов) / (Достоинство 2 очка)
RU1 = re.compile(r"^(?P<name>[А-ЯЁA-Z][^()\n]{1,60}?)\s*:?\s*\((?P<kind>[Дд]остоинство|[Нн]едостаток),?\s*(?P<cost>[^()\n]{0,30}?)\)\s*$")
# Название (2 очка, Недостаток) / (1-пт. Достоинство) / (от 1 до 5 пт. Достоинство)
RU2 = re.compile(r"^(?P<name>[А-ЯЁA-Z][^()\n]{1,60}?)\s*:?\s*\((?P<cost>[^()\n]{0,30}?),?\s*(?P<kind>[Дд]остоинство|[Нн]едостаток)\)\s*$")

KIND = {"merit": "Достоинство", "flaw": "Недостаток", "достоинство": "Достоинство", "недостаток": "Недостаток"}


def clean_cost(c):
    c = c.strip(" ,.:-").replace("–", "-")
    c = re.sub(r"\s*(pts?|очк[а-я]*|пункт[а-я]*|пт)\.?", "", c, flags=re.I).strip(" ,.-")
    c = re.sub(r"^от\s+(\d+)\s+до\s+(\d+)$", r"\1-\2", c)
    return c.replace(" or ", " или ").replace(" или ", "/").replace(", ", "/") or "?"


def scan(path):
    book = path.stem
    folder = path.parent.name
    rows = []
    page = 1
    for line in path.read_text(encoding="utf-8", errors="replace").split("\n"):
        page += line.count("\f")
        line = line.replace("\f", "").strip()
        if len(line) > 110:
            continue
        for rx in (EN, EN_VAR, RU1, RU2):
            m = rx.match(line)
            if m:
                name = re.sub(r"\s+", " ", m["name"]).strip(" :•-")
                if len(name) < 3:
                    break
                rows.append({
                    "Название": name,
                    "Тип": KIND[m["kind"].lower()],
                    "Стоимость": clean_cost(m["cost"]),
                    "Раздел": folder,
                    "Книга": book,
                    "Стр. PDF": page,
                })
                break
    return rows


def main():
    OUT.mkdir(exist_ok=True)
    rows = []
    for p in sorted(TXT.rglob("*.txt")):
        rows += scan(p)
    # убираем точные повторы (одна и та же строка дважды на странице)
    seen, uniq = set(), []
    for r in rows:
        k = (r["Название"].lower(), r["Тип"], r["Книга"])
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    uniq.sort(key=lambda r: (r["Тип"], r["Название"].lower()))
    with open(OUT / "достоинства_и_недостатки.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(uniq[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(uniq)
    by_book = {}
    for r in uniq:
        by_book[r["Книга"]] = by_book.get(r["Книга"], 0) + 1
    for b, n in sorted(by_book.items(), key=lambda x: -x[1]):
        print(f"{n:4d}  {b}")
    print("всего:", len(uniq), file=sys.stderr)


if __name__ == "__main__":
    main()
