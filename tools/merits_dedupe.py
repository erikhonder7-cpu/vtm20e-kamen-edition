# tools/merits_dedupe.py
# Одна черта — одна запись: повторы достоинств и недостатков из разных книг (основная V20, дополнения V20,
# Revised, 2nd Edition, Тёмные века 2002) схлопываются, остаётся вариант 20-й редакции.
# Повтор — тот же вид (достоинство/недостаток), линейка, клан, эпоха и английское название (без него — русское).
# Приоритет: основная книга V20 → дополнения V20 (в т. ч. V20 Dark Ages) → Revised → прочие; при равенстве — первая запись.
# Вызывается из build_data.main() перед записью data/merits.json; сам по себе — правит готовый файл:
#   python -I tools/merits_dedupe.py [data/merits.json …]
import io, json, os, re, sys


def norm(s):
    return re.sub(r"\s+", " ", (s or "").strip().lower().replace("ё", "е"))


def rank(source):
    s = source or ""
    if s == "V20": return 0
    if s.startswith(("V20", "W20")) or "20th" in s or "Anniversary" in s: return 1
    if "Revised" in s or "1999" in s or "2003" in s: return 2
    return 3


def dedupe(items):
    """Список без повторов в исходном порядке; второй элемент — что выброшено (запись, кто её заменил)."""
    best, dropped = {}, []
    def group(x, by):
        name = norm(x.get("en")) if by == "en" else norm(x.get("name"))
        return (x.get("kind"), x.get("line", ""), x.get("clan", ""), x.get("era", ""), bool(x.get("ghoul")), by, name) if name else None
    keep = list(items)
    for by in ("en", "name"):
        best.clear()
        gone = set()
        for x in keep:
            g = group(x, by)
            if g is None: continue
            if g not in best: best[g] = x; continue
            cur = best[g]
            if rank(x.get("source")) < rank(cur.get("source")):
                best[g] = x; gone.add(id(cur)); dropped.append((cur, x))
            else:
                gone.add(id(x)); dropped.append((x, cur))
        keep = [x for x in keep if id(x) not in gone]   # оставшиеся — на своих местах
    return keep, dropped


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for path in sys.argv[1:] or [os.path.join(root, "data", "merits.json")]:
        with io.open(path, encoding="utf-8") as f:
            items = json.load(f)
        keep, dropped = dedupe(items)
        for x, by in dropped:
            print(f"  − {x['name']} ({x.get('en', '')}) · {x.get('source', '')}  ⇐  {by.get('source', '')}")
        with io.open(path, "w", encoding="utf-8", newline="\n") as f:   # как build_data.dump: LF, без хвостового перевода строки
            json.dump(keep, f, ensure_ascii=False, indent=1)
        print(f"{os.path.basename(path)}: было {len(items)}, стало {len(keep)}, убрано повторов {len(dropped)}")
