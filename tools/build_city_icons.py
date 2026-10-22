# -*- coding: utf-8 -*-
"""Эмблемы мест для карты «Город» (module/ui/citymap.mjs): гравюрные значки с game-icons.net.

    python -I tools/build_city_icons.py

Значки — game-icons.net (репозиторий github.com/game-icons/icons), лицензия CC BY 3.0;
авторы — Lorc, Delapouite, Skoll. Скачиваются в assets/icons/city/<ключ>.svg одним путём без
фона; цвет и сургучную печать дорисовывает карта. Авторство — assets/icons/city/LICENSE.txt.
"""
import os, re, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "icons", "city")

# ключ на карте → автор/имя на game-icons.net
ICONS = {
    # виды мест Парижа 1789 года (k в data/cities/paris-1789.json)
    "church": "delapouite/church", "prison": "delapouite/window-bars", "court": "lorc/scales",
    "government": "delapouite/greek-temple", "palace": "lorc/crown", "military": "lorc/cannon",
    "club": "delapouite/phrygian-cap", "bar": "delapouite/coffee-pot", "nightdistrict": "lorc/wine-glass",
    "theatre": "lorc/drama-masks", "museum": "lorc/open-book", "hospital": "lorc/hospital-cross",
    "cemetery": "lorc/tombstone", "mortuary": "lorc/coffin", "gibbet": "lorc/skull-crossed-bones",
    "market": "delapouite/basket", "manufacture": "delapouite/barrel", "historic": "delapouite/gate",
    "landmark": "delapouite/obelisk", "bridge": "delapouite/arch-bridge", "mill": "delapouite/windmill",
    "park": "lorc/oak", "faubourg": "delapouite/street-light", "castle": "lorc/castle",
    # метки хроники (категории)
    "elysium": "lorc/candlebright", "haven": "delapouite/castle", "hunting": "skoll/fangs",
    "domain": "lorc/stone-tower", "danger": "lorc/skull-crossed-bones", "kindred": "delapouite/vampire-dracula",
    "mortal": "lorc/hood", "event": "lorc/candle-light", "other": "lorc/drop",
    "guillotine": "lorc/guillotine", "liberty": "delapouite/liberty-wing",
    # метки ночей Революции и штабы фракций Теневого Собрания
    "assembly": "lorc/candle-holder",
    "meeting": "lorc/conversation",
    "catacomb": "delapouite/cave-entrance",
    "rumor": "lorc/shouting",
    "battle": "lorc/crossed-swords",
    "torpor": "lorc/sleepy",
    "ghoul": "lorc/chained-heart",
    "stash": "lorc/locked-chest",
    "barricade": "delapouite/barricade",
    "press": "lorc/quill-ink",
    "breach": "lorc/cracked-mask",
    "hunter": "lorc/holy-symbol",
    "mob": "delapouite/torch",
    "f-montagnards": "delapouite/phrygian-cap",
    "f-girondins": "lorc/scales",
    "f-feuillants": "lorc/scroll-unfurled",
    "f-royalists": "delapouite/fleur-de-lys",
    "f-neutral": "lorc/eyeball"
}
AUTHORS = {"lorc": "Lorc", "delapouite": "Delapouite", "skoll": "Skoll"}


def main():
    os.makedirs(OUT, exist_ok=True)
    used = set()
    for key, ref in ICONS.items():
        p = os.path.join(OUT, f"{key}.svg")
        used.add(ref.split("/")[0])
        if os.path.exists(p):
            continue
        svg = urllib.request.urlopen(f"https://raw.githubusercontent.com/game-icons/icons/master/{ref}.svg", timeout=30).read().decode("utf-8")
        # без фоновой плашки и без своих цветов: остаётся один путь глифа
        svg = re.sub(r'<path d="M0 0h512v512H0z"[^>]*/>', "", svg)
        svg = re.sub(r'\sfill="[^"]*"', "", svg)
        open(p, "w", encoding="utf-8", newline="\n").write(svg)
        print("значок", key, "←", ref)
    lic = ["Эмблемы мест карты «Город» — game-icons.net, лицензия CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).",
           "Авторы: " + ", ".join(AUTHORS[a] for a in sorted(used)) + ".", ""]
    lic += [f"{k}.svg — {ref.split('/')[1]} ({AUTHORS[ref.split('/')[0]]})" for k, ref in ICONS.items()]
    open(os.path.join(OUT, "LICENSE.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(lic) + "\n")
    print(f"assets/icons/city: {len(ICONS)} значков")


main()
