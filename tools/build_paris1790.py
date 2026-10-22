# -*- coding: utf-8 -*-
"""Тайлы плана Парижа 1790 года для шторы «Город» (module/ui/citymap.mjs).

    python tools/build_paris1790.py            (нужны Pillow и numpy; без -I — они в пользовательских пакетах)

Источник — «Plan de la ville et faubourg de Paris avec tous ses accroissements» Л.-Ж. Мондаре
и Жана, 1790 (Gallica, на Викискладе — общественное достояние), скан 11858×7815. Скачивается
один раз в tools/.cache/mondhare-1790.jpg.

Привязка — tools/maps/paris1790_gcp.json: опорные точки (пиксель скана → координаты того же
места сегодня: статуи площадей, Хлебный рынок, Нотр-Дам, ворота Сен-Дени…). По ним — полином
второго порядка (на гравюре свои искажения, плоский поворот их не снимает); средняя ошибка
печатается при сборке. Указатели улиц, картуш, вставка и таблицы вырезаются маской (frame,
cutouts) — на карте остаётся только город.

Результат: assets/maps/paris-1790/{z}/{x}/{y}.webp (XYZ, EPSG:3857, z 12–17) и meta.json.
"""
import json, math, os, sys, time, urllib.request

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "maps"))
from paris1790_geo import Warp  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", ".cache", "mondhare-1790.jpg")
URL = ("https://upload.wikimedia.org/wikipedia/commons/d/d0/Louis-Joseph_Mondhare%2C_Plan_de_la_ville_et_faubourg_de_Paris"
       "_avec_tous_ses_accroissements%2C_1790_-_Gallica.jpg")
GCP = os.path.join(ROOT, "tools", "maps", "paris1790_gcp.json")
OUT = os.path.join(ROOT, "assets", "maps", "paris-1790")
ZOOMS = range(12, 18)
R = 6378137.0
ORIGIN = math.pi * R          # половина экватора в метрах Меркатора
SUB = 8                        # тайл режется на SUB×SUB четырёхугольников (привязка внутри почти плоская)


def merc(lat, lng):
    return math.radians(lng) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R


def poly(Q):
    x, y = Q[:, 0], Q[:, 1]
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], 1)


def fit(src, dst):
    """Полином 2-го порядка src → dst с нормировкой входа."""
    mu, s = src.mean(0), src.std(0).max()
    A = poly((src - mu) / s)
    cx, *_ = np.linalg.lstsq(A, dst[:, 0], rcond=None)
    cy, *_ = np.linalg.lstsq(A, dst[:, 1], rcond=None)
    return lambda Q: poly((np.atleast_2d(Q) - mu) / s) @ np.stack([cx, cy], 1)


def main():
    if not os.path.exists(SRC):
        os.makedirs(os.path.dirname(SRC), exist_ok=True)
        req = urllib.request.Request(URL, headers={"User-Agent": "vtm20e-kamen-edition/0.3 (Foundry system)"})
        open(SRC, "wb").write(urllib.request.urlopen(req, timeout=300).read())
    g = json.load(open(GCP, encoding="utf-8"))
    P = np.array([p["px"] for p in g["points"]], float)
    M = np.array([merc(p["lat"], p["lng"]) for p in g["points"]])
    to_merc, poly_px = fit(P, M), fit(M, P)
    # вторая ступень: поле поправок по сети улиц (tools/refine_paris1790.py)
    warp = Warp()
    to_px = (lambda Q: warp(poly_px(Q))) if warp.ok else poly_px
    print("поле поправок:", "есть" if warp.ok else "нет — только полином")
    k = math.cos(math.radians(48.856))
    err = np.hypot(*(to_merc(P) - M).T) * k
    print(f"привязка: {len(P)} точек, средняя ошибка {err.mean():.0f} м, наибольшая {err.max():.0f} м")

    src = Image.open(SRC).convert("RGB")
    mask = Image.new("L", src.size, 0)
    d = ImageDraw.Draw(mask)
    d.rectangle(g["frame"], fill=255)
    for box in g["cutouts"].values():
        d.rectangle(box, fill=0)
    # пирамида: уровень n — скан, уменьшенный в 2^n раз (без ступенек на мелких масштабах)
    levels = [(src, mask)]
    while levels[-1][0].width > 1500:
        s, m = levels[-1]
        levels.append((s.resize((s.width // 2, s.height // 2), Image.LANCZOS), m.resize((m.width // 2, m.height // 2), Image.BILINEAR)))

    f = g["frame"]
    corners = np.array([[f[0], f[1]], [f[2], f[1]], [f[2], f[3]], [f[0], f[3]]], float)
    cm = to_merc(corners)
    x0, y0 = cm.min(0); x1, y1 = cm.max(0)
    m_per_px = float(np.hypot(*(to_merc(np.array([[6000, 4000], [6001, 4000]]))[1] - to_merc(np.array([[6000, 4000]]))[0])))

    made = skipped = 0
    t0 = time.time()
    for z in ZOOMS:
        n = 2 ** z
        tile_m = 2 * ORIGIN / n
        tx0, tx1 = int((x0 + ORIGIN) // tile_m), int((x1 + ORIGIN) // tile_m)
        ty0, ty1 = int((ORIGIN - y1) // tile_m), int((ORIGIN - y0) // tile_m)
        # уровень пирамиды: пиксель скана не мельче пикселя тайла
        px_m = tile_m / 256
        lvl = max(0, min(len(levels) - 1, int(math.floor(math.log2(max(1.0, px_m / m_per_px))))))
        img, msk = levels[lvl]
        sc = 1 / 2 ** lvl
        for tx in range(tx0, tx1 + 1):
            for ty in range(ty0, ty1 + 1):
                mesh = []
                step = 256 // SUB
                for i in range(SUB):
                    for j in range(SUB):
                        bx, by = i * step, j * step
                        pts = []
                        for (u, v) in [(bx, by), (bx, by + step), (bx + step, by + step), (bx + step, by)]:
                            mx = -ORIGIN + (tx + u / 256) * tile_m
                            my = ORIGIN - (ty + v / 256) * tile_m
                            pts.append(to_px(np.array([[mx, my]]))[0] * sc)
                        mesh.append(((bx, by, bx + step, by + step), tuple(c for p in pts for c in p)))
                a = msk.transform((256, 256), Image.MESH, mesh, Image.BILINEAR)
                if not a.getbbox():
                    skipped += 1
                    continue
                t = img.transform((256, 256), Image.MESH, mesh, Image.BICUBIC)
                t.putalpha(a)
                path = os.path.join(OUT, str(z), str(tx))
                os.makedirs(path, exist_ok=True)
                t.save(os.path.join(path, f"{ty}.webp"), "WEBP", quality=74, method=4)
                made += 1
        print(f"z{z}: уровень скана {lvl}, тайлов {made} всего, {time.time() - t0:.0f} с")

    # граница плана в градусах — для камеры и источника MapLibre
    lng = lambda x: math.degrees(x / R)
    lat = lambda y: math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
    meta = {
        "name": "Plan de la ville et faubourg de Paris, 1790",
        "attribution": "План Парижа Л.-Ж. Мондаре и Жана, 1790 (Gallica, общественное достояние)",
        "bounds": [lng(x0), lat(y0), lng(x1), lat(y1)],
        "minzoom": min(ZOOMS), "maxzoom": max(ZOOMS), "format": "webp",
        "gcp": {"points": len(P), "meanError": round(float(err.mean())), "maxError": round(float(err.max()))},
        "built": time.strftime("%Y-%m-%d")
    }
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    size = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fs in os.walk(OUT) for fn in fs)
    print(f"готово: {made} тайлов, {size / 1e6:.0f} МБ, пустых пропущено {skipped}")


main()
