# tools/merge_evocations.py — пересказы призывов (data/demon-evocations.json) в описания сил data/demon.json.
# Запуск: python tools/merge_evocations.py. То же делает tools/build_demon.py при полной пересборке.
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = "Demon: The Fallen"


def evocation_html(page, level, evo):
    """Описание призыва: источник, обычный эффект, эффект высокой Муки (своими словами)."""
    if not evo:
        return f"<p><em>{BOOK}, с. {page}.</em> Призыв {level}-го круга. Эффект обычный — если кость Муки выше Муки демона, иначе — эффект высокой Муки (см. книгу).</p>"
    return (f"<p><em>{BOOK}, с. {page}.</em> {evo['text']}</p>"
            f"<p><strong>Высокая Мука:</strong> {evo['high']}</p>")


def load_evocations():
    with open(os.path.join(ROOT, "data", "demon-evocations.json"), encoding="utf-8") as f:
        return json.load(f)["evocations"]


def main():
    path = os.path.join(ROOT, "data", "demon.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    evo, n = load_evocations(), 0
    for lore in data["lores"]:
        for p in lore["powers"]:
            e = evo.get(f"{lore['key']}|{p['level']}")
            p["html"] = evocation_html(p["page"], p["level"], e)
            n += bool(e)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("призывов с пересказом:", n)


if __name__ == "__main__":
    main()
