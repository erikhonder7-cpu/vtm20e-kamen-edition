# -*- coding: utf-8 -*-
"""Знаки, которых нет среди гербов и эмблем сект: Независимые, Автархи, гуль (печать над «воротами» создания).

    python -I tools/build_sigils.py

Знаки — game-icons.net (github.com/game-icons/icons), лицензия CC BY 3.0. Один путь глифа без фона:
лист и мастер режут его маской по прозрачности, как силуэты гербов. Пишет svg и запись в data/assets.json;
авторство — assets/sects/LICENSE-game-icons.txt.
"""
import json, os, re, sys, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# файл → (game-icons, раздел assets.json, ключ)
SIGILS = {
    "assets/sects/independent.svg": ("lorc/scales", "sects", "independent"),       # Независимые — сами по себе, весы
    "assets/sects/autarkis.svg": ("lorc/crowned-heart", "sects", "autarkis"),      # Автархи — сами себе государи: коронованное сердце
    "assets/sects/ghoul.svg": ("lorc/chained-heart", "sects", "ghoul"),            # гуль — сердце в цепях уз крови
}
AUTHORS = {"lorc": "Lorc", "delapouite": "Delapouite"}


def main():
    idx_path = os.path.join(ROOT, "data", "assets.json")
    index = json.load(open(idx_path, encoding="utf-8"))
    lic = ["Знаки сект и гуля — game-icons.net, лицензия CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/).", ""]
    for rel, (ref, section, key) in SIGILS.items():
        svg = urllib.request.urlopen(f"https://raw.githubusercontent.com/game-icons/icons/master/{ref}.svg", timeout=30).read().decode("utf-8")
        svg = re.sub(r'<path d="M0 0h512v512H0z"[^>]*/>', "", svg)
        svg = re.sub(r'\sfill="[^"]*"', "", svg)
        open(os.path.join(ROOT, rel), "w", encoding="utf-8", newline="\n").write(svg)
        index[section][key] = rel
        author, name = ref.split("/")
        lic.append(f"{os.path.basename(rel)} — {name} ({AUTHORS.get(author, author)})")
        print("знак", key, "←", ref)
    json.dump(index, open(idx_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    open(os.path.join(ROOT, "assets/sects/LICENSE-game-icons.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(lic) + "\n")


main()
