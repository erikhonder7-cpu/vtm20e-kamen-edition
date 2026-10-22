# -*- coding: utf-8 -*-
"""Печати фракций Теневого Собрания: миниатюры из рисунков мастера (assets/factions/*.png).

    python tools/build_faction_seals.py

Исходники — круглые знаки 1300 px, их рисовал Kamen. Для интерфейса и карты хватает 192 px:
assets/factions/seal-<ключ>.webp (ключи — module/data/assembly.mjs → FACTIONS, плюс крылья и престол).
"""
import os, sys
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "assets", "factions")
SEALS = {
    "montagnards": "Монтаньяры.png", "girondins": "Жирондисты.png", "feuillants": "Фельяны.png",
    "royalists": "Роялисты.png", "neutral": "Теневой Совет2.png",
    "anarchs": "Анархи.png", "camarilla": "Камарильский Кружочек.png", "sabbat": "Шабаш.png"
}
SIZE = 192

for key, name in SEALS.items():
    im = Image.open(os.path.join(DIR, name)).convert("RGBA")
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    out = os.path.join(DIR, f"seal-{key}.webp")
    im.save(out, "WEBP", quality=90, method=6)
    print(f"{key:12} ← {name}  {os.path.getsize(out) // 1024} КБ")
