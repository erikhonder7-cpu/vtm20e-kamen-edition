# -*- coding: utf-8 -*-
"""48 секций Парижа 1790 года для карты «Город» (слой «Секции»).

    python -I tools/build_sections1790.py

Декрет Учредительного собрания от 21 мая 1790 года разделил Париж на 48 секций вместо 60 округов.
В 1811-м их переименовали в кварталы (по четыре на двенадцать округов), почти не меняя границ, — эти
кварталы обведены в атласе Вассеро; контуры — проект ALPAGE (Stanford Geospatial Center, ODbL):
https://purl.stanford.edu/ry227xq8127 , копия на ArcGIS VasserotQuartiers_1790to1860.

Исходник кладётся в tools/.cache/alpage/vasserot_quartiers.geojson (GeoJSON, WGS84):
    https://services.arcgis.com/ak2bo87wLfUpMrt1/ArcGIS/rest/services/VasserotQuartiers_1790to1860/FeatureServer/1/query?where=1%3D1&outFields=*&outSR=4326&f=geojson
Имена — секций 1790 года (каким был каждый квартал до переименования); соответствие восстановлено
по истории секций, для нескольких центральных кварталов оно приблизительно.
"""
import json, math, os, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", ".cache", "alpage", "vasserot_quartiers.geojson")
OUT = os.path.join(ROOT, "data", "cities", "paris-1790-sections.json")

# номер квартала ALPAGE → (секция 1790 года по-русски, по-французски)
SECTIONS = {
    1: ("Руль", "Section du Roule"), 2: ("Елисейские Поля", "Section des Champs-Élysées"),
    3: ("Вандомская площадь", "Section de la Place-Vendôme"), 4: ("Тюильри", "Section des Tuileries"),
    5: ("Гранж-Бательер", "Section de la Grange-Batelière"), 6: ("Пале-Рояль", "Section du Palais-Royal"),
    7: ("Библиотека", "Section de la Bibliothèque"), 8: ("Фобур-Монмартр", "Section du Faubourg-Montmartre"),
    9: ("Улица Пуассоньер", "Section de la Rue-Poissonnière"), 10: ("Фонтан Монморанси", "Section de la Fontaine-Montmorency"),
    11: ("Почты", "Section des Postes"), 12: ("Площадь Людовика XIV", "Section de la Place-Louis-XIV"),
    13: ("Оратория", "Section de l'Oratoire"), 14: ("Лувр", "Section du Louvre"),
    15: ("Рынок Невинных", "Section du Marché-des-Innocents"), 16: ("Хлебный рынок", "Section de la Halle-au-Blé"),
    17: ("Фобур-Сен-Дени", "Section du Faubourg-Saint-Denis"), 18: ("Бонди", "Section de Bondy"),
    19: ("Бон-Нувель", "Section de Bonne-Nouvelle"), 20: ("Моконсей", "Section de Mauconseil"),
    21: ("Понсо", "Section du Ponceau"), 22: ("Гравилье", "Section des Gravilliers"),
    23: ("Ломбардцы", "Section des Lombards"), 24: ("Тампль", "Section du Temple"),
    25: ("Улица Бобур", "Section de la Rue-Beaubourg"), 26: ("Красные Дети", "Section des Enfants-Rouges"),
    27: ("Король Сицилийский", "Section du Roi-de-Sicile"), 28: ("Арси", "Section des Arcis"),
    29: ("Королевская площадь", "Section de la Place-Royale"), 30: ("Попенкур", "Section de Popincourt"),
    31: ("Улица Монтрёй", "Section de la Rue-de-Montreuil"), 32: ("Кенз-Вен", "Section des Quinze-Vingts"),
    33: ("Остров Сен-Луи", "Section de l'Île-Saint-Louis"), 34: ("Ратуша", "Section de l'Hôtel-de-Ville"),
    35: ("Нотр-Дам", "Section de Notre-Dame"), 36: ("Арсенал", "Section de l'Arsenal"),
    37: ("Четыре Нации", "Section des Quatre-Nations"), 38: ("Фонтан Гренель", "Section de la Fontaine-de-Grenelle"),
    39: ("Инвалиды", "Section des Invalides"), 40: ("Красный Крест", "Section de la Croix-Rouge"),
    41: ("Люксембург", "Section du Luxembourg"), 42: ("Французский театр", "Section du Théâtre-Français"),
    43: ("Термы Юлиана", "Section des Thermes-de-Julien"), 44: ("Генрих IV", "Section d'Henri-IV"),
    45: ("Святая Женевьева", "Section de Sainte-Geneviève"), 46: ("Гобелены", "Section des Gobelins"),
    47: ("Ботанический сад", "Section du Jardin-des-Plantes"), 48: ("Обсерватория", "Section de l'Observatoire")
}


def simplify(pts, tol):
    """Дуглас — Пекер в градусах (≈ tol × 111 км)."""
    if len(pts) < 4:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy) or 1e-12
        best, idx = 0, None
        for i in range(a + 1, b):
            d = abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / n
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def label_point(ring):
    """Точка для подписи: середина самого широкого горизонтального сечения у центра тяжести."""
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    cy = sum(ys) / len(ys)
    best = None
    for k in range(-6, 7):
        y = cy + k * (max(ys) - min(ys)) / 16
        hits = []
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            if (y1 <= y < y2) or (y2 <= y < y1):
                hits.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
        hits.sort()
        for i in range(0, len(hits) - 1, 2):
            w = hits[i + 1] - hits[i]
            if not best or w > best[0]:
                best = (w, (hits[i] + hits[i + 1]) / 2, y)
    return [round(best[1], 5), round(best[2], 5)] if best else [round(sum(xs) / len(xs), 5), round(cy, 5)]


def main():
    src = json.load(open(SRC, encoding="utf-8"))
    out = []
    for f in src["features"]:
        p = f["properties"]
        no = int(p["NUM_QUARTI"])
        ru, fr = SECTIONS[no]
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        rings = []
        for poly in polys:
            pts = [[round(x, 6), round(y, 6)] for x, y in poly[0]]
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            # замкнутое кольцо упрощаем двумя половинами — от первой точки до самой дальней и обратно
            far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
            ring = simplify(pts[:far + 1], 0.000035)[:-1] + simplify(pts[far:] + [pts[0]], 0.000035)
            rings.append([[round(x, 5), round(y, 5)] for x, y in ring])
        big = max(rings, key=len)
        out.append({"no": no, "ru": ru, "fr": fr, "quartier": p["NOM"], "arrond": p["NUM_ARROND"],
                    "label": label_point(big), "rings": rings})
    out.sort(key=lambda s: s["no"])
    data = {"source": "ALPAGE / Vasserot, quartiers 1790–1860 (ODbL), https://purl.stanford.edu/ry227xq8127",
            "about": "48 секций Парижа по декрету 21 мая 1790 года", "sections": out}
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: {len(out)} секций, {os.path.getsize(OUT) // 1024} КБ")


main()
