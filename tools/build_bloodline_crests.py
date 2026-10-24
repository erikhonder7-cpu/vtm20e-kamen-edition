# -*- coding: utf-8 -*-
"""Гербы линий крови, у которых на White Wolf Wiki своего знака нет (иначе — tools/import_wiki.py).

    python -I tools/build_bloodline_crests.py

Знаки — game-icons.net (github.com/game-icons/icons), лицензия CC BY 3.0. Один путь глифа без фона:
справочник и лист режут его маской по прозрачности, как силуэты гербов кланов. Пишет
assets/clans/<ключ>.svg, запись в data/assets.json (clans) и авторство в assets/clans/LICENSE-game-icons.txt.
"""
import json, os, re, sys, urllib.error, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "clans")

# ключ линии (data/clans.json) → варианты на game-icons.net, берётся первый найденный
CRESTS = {
    "angraMaynyu": ["lorc/daemon-skull", "lorc/horned-skull"],          # Ангра-Майнью — дух разрушения
    "brahmany": ["lorc/lotus", "delapouite/lotus-flower"],              # Брахманы — жрецы, лотос
    "daytya": ["lorc/hydra", "lorc/snake"],                             # Дайтья — асуры, многоглавый змей
    "angelisAter": ["lorc/evil-wings", "lorc/feathered-wing"],          # Ангелис Атер — чёрные ангелы
    "moreplavateli": ["lorc/anchor", "delapouite/anchor"],              # Мореплаватели — моряки-Гангрелы
    "gorodskieGangrely": ["delapouite/rat", "lorc/rat"],                # Городские Гангрелы — звери подворотен
    "dikieGangrely": ["lorc/wolf-howl", "lorc/wolf-head"],              # Дикие Гангрелы — волки глуши
}
AUTHORS = {"lorc": "Lorc", "delapouite": "Delapouite", "skoll": "Skoll"}


def fetch(ref):
    try:
        return urllib.request.urlopen(f"https://raw.githubusercontent.com/game-icons/icons/master/{ref}.svg", timeout=30).read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def main():
    idx_path = os.path.join(ROOT, "data", "assets.json")
    index = json.load(open(idx_path, encoding="utf-8"))
    used = {}
    for key, refs in CRESTS.items():
        p = os.path.join(OUT, f"{key}.svg")
        for ref in refs:
            svg = fetch(ref)
            if svg:
                break
        else:
            sys.exit(f"нет ни одного знака для {key}: {refs}")
        # без фоновой плашки и без своих цветов: остаётся один путь глифа
        svg = re.sub(r'<path d="M0 0h512v512H0z"[^>]*/>', "", svg)
        svg = re.sub(r'\sfill="[^"]*"', "", svg)
        open(p, "w", encoding="utf-8", newline="\n").write(svg)
        index["clans"][key] = f"assets/clans/{key}.svg"
        used[key] = ref
        print("герб", key, "←", ref)
    json.dump(index, open(idx_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    lic = ["Гербы линий крови без своего знака — game-icons.net, лицензия CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).", ""]
    lic += [f"{k}.svg — {ref.split('/')[1]} ({AUTHORS.get(ref.split('/')[0], ref.split('/')[0])})" for k, ref in used.items()]
    open(os.path.join(OUT, "LICENSE-game-icons.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(lic) + "\n")
    print(f"assets/clans: {len(used)} гербов")


main()
