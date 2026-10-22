# -*- coding: utf-8 -*-
"""Уточнение привязки плана 1790 года по сети улиц 1784–1791 годов.

    python tools/refine_paris1790.py          (Pillow, numpy; без -I)

На гравюре улицы — светлые коридоры между заштрихованными кварталами. Для каждой клетки плана
берутся отрезки сети улиц (tools/build_streets1790.py), переводятся
в пиксели скана полиномом опорных точек и сдвигаются в пределах ±SEARCH, пока не лягут на самые
светлые места гравюры. Сдвиг клетки — поправка привязки. Выбросы (сдвиг сильно не как у соседей)
заменяются медианой соседей, пустые клетки заполняются от соседних, поле сглаживается.

Поиск идёт от крупного к мелкому (LEVELS): клетки по ~1,2 км с широким поиском, потом 600 и 300 м
вокруг оценки предыдущего уровня, — иначе повторяющаяся сетка кварталов даёт ложные сдвиги.

Результат: tools/maps/paris1790_warp.json — читает tools/build_paris1790.py.
"""
import json, os, sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "maps"))
from paris1790_geo import load, merc_arr, WARP  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "tools", ".cache", "mondhare-1790.jpg")
STREETS = os.path.join(ROOT, "tools", ".cache", "verniquet", "streets.json")   # tools/build_streets1790.py
K = 2            # скан уменьшается вдвое для поиска
STEP_M = 3.0     # шаг точек вдоль улиц, метры
# Уровни — от крупного к мелкому: (клетка, ± поиск вокруг прежней оценки, шаг), пиксели полного скана.
# Крупная клетка охватывает много улиц разных направлений — сдвиг однозначен; мелкие уточняют его.
LEVELS = [(1440, 120, 4), (720, 48, 2), (360, 24, 2)]
PENALTY = .004   # штраф за величину поправки (на пиксель): при равной яркости — меньший сдвиг


def street_points():
    d = json.load(open(STREETS, encoding="utf-8"))
    nodes = d["nodes"]
    pts = []
    for a, b, length, _nm, mid in d["edges"]:
        line = [nodes[a]] + [mid[i:i + 2] for i in range(0, len(mid), 2)] + [nodes[b]]
        for p, q in zip(line, line[1:]):
            seg = max(1, int(np.hypot((q[0] - p[0]) * 73000, (q[1] - p[1]) * 111000) / STEP_M))
            t = np.linspace(0, 1, seg, endpoint=False)
            pts.append(np.stack([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t], 1))
    return np.concatenate(pts)


def field_at(F, x0, y0, cell, px):
    """Билинейно значение поля клеток F (ny, nx, 2) в пикселях px."""
    ny, nx, _ = F.shape
    fx = np.clip((px[:, 0] - x0) / cell - .5, 0, nx - 1.0001)
    fy = np.clip((px[:, 1] - y0) / cell - .5, 0, ny - 1.0001)
    ix, iy = fx.astype(int), fy.astype(int)
    tx, ty = (fx - ix)[:, None], (fy - iy)[:, None]
    return (F[iy, ix] * (1 - tx) * (1 - ty) + F[iy, ix + 1] * tx * (1 - ty)
            + F[iy + 1, ix] * (1 - tx) * ty + F[iy + 1, ix + 1] * tx * ty)


def clean(F, ok, limit):
    """Выбросы — к медиане соседей, пустые клетки — от соседей, затем сглаживание 3×3."""
    ny, nx, _ = F.shape
    F = F.copy()
    for _ in range(2):
        for j in range(ny):
            for i in range(nx):
                if not ok[j, i]:
                    continue
                nb = [F[b, a] for b in range(j - 1, j + 2) for a in range(i - 1, i + 2)
                      if (a, b) != (i, j) and 0 <= a < nx and 0 <= b < ny and ok[b, a]]
                if len(nb) >= 3:
                    med = np.median(nb, 0)
                    if np.hypot(*(F[j, i] - med)) > limit:
                        F[j, i] = med
    have = ok.copy()
    for _ in range(80):
        if have.all():
            break
        new = have.copy()
        for j, i in zip(*np.nonzero(~have)):
            nb = [F[b, a] for b in range(j - 1, j + 2) for a in range(i - 1, i + 2)
                  if 0 <= a < nx and 0 <= b < ny and have[b, a]]
            if nb:
                F[j, i] = np.mean(nb, 0); new[j, i] = True
        have = new
    Pd = np.pad(F, ((1, 1), (1, 1), (0, 0)), mode="edge")
    return sum(Pd[b:b + ny, a:a + nx] for b in range(3) for a in range(3)) / 9


def main():
    g, to_merc, poly_px, P, M = load()
    # яркость коридоров: мелкое размытие минус крупное (без пятен бумаги и тона листа)
    img = Image.open(SRC).convert("L")
    small = img.resize((img.width // K, img.height // K), Image.BILINEAR)
    fine = np.asarray(small.filter(ImageFilter.GaussianBlur(2.2)), np.float32)
    coarse = np.asarray(small.filter(ImageFilter.GaussianBlur(24)), np.float32)
    B = fine - coarse
    H, W = B.shape
    valid = np.zeros_like(B, bool)
    f = [v // K for v in g["frame"]]
    valid[f[1]:f[3], f[0]:f[2]] = True
    for box in g["cutouts"].values():
        b = [v // K for v in box]
        valid[b[1]:b[3], b[0]:b[2]] = False
    B[~valid] = np.nan

    ll = street_points()
    mx, my = merc_arr(ll[:, 0], ll[:, 1])
    px = poly_px(np.stack([mx, my], 1))
    print(f"точек улиц: {len(px)}")
    x0, y0 = g["frame"][0], g["frame"][1]

    def mean_bright(q):
        X = np.round(q[:, 0] / K).astype(int); Y = np.round(q[:, 1] / K).astype(int)
        ok = (X >= 0) & (X < W) & (Y >= 0) & (Y < H)
        v = B[Y[ok], X[ok]]
        v = v[~np.isnan(v)]
        return (v.mean() if len(v) > .7 * len(q) else np.nan), len(v)

    print(f"яркость улиц по полиному: {mean_bright(px)[0]:.2f}")
    prior = None   # (F, cell) прежнего уровня
    for cell, search, step in LEVELS:
        nx = (g["frame"][2] - x0) // cell + 1
        ny = (g["frame"][3] - y0) // cell + 1
        base = px if prior is None else px + field_at(prior[0], x0, y0, prior[1], px)
        F = np.zeros((ny, nx, 2)) if prior is None else np.stack(
            [field_at(prior[0], x0, y0, prior[1], np.array([[x0 + (i + .5) * cell, y0 + (j + .5) * cell]]))[0]
             for j in range(ny) for i in range(nx)]).reshape(ny, nx, 2)
        ok = np.zeros((ny, nx), bool)
        ci = ((px[:, 0] - x0) // cell).astype(int); cj = ((px[:, 1] - y0) // cell).astype(int)
        for j in range(ny):
            for i in range(nx):
                sel = (ci == i) & (cj == j)
                q = base[sel]
                if len(q) < 300:
                    continue
                best = None
                for dx in range(-search, search + 1, step):
                    for dy in range(-search, search + 1, step):
                        v, n = mean_bright(q + (dx, dy))
                        if np.isnan(v):
                            continue
                        tot = F[j, i] + (dx, dy)
                        sc = v - PENALTY * np.hypot(*tot)
                        if best is None or sc > best[0]:
                            best = (sc, dx, dy)
                if best:
                    F[j, i] = F[j, i] + (best[1], best[2]); ok[j, i] = True
        F = clean(F, ok, limit=max(24, search * .6))
        prior = (F, cell)
        moved = px + field_at(F, x0, y0, cell, px)
        print(f"уровень {cell} px: клеток {ok.sum()}/{nx * ny}, яркость улиц {mean_bright(moved)[0]:.2f}, "
              f"средний сдвиг {np.hypot(F[..., 0], F[..., 1]).mean():.0f} px, наибольший {np.hypot(F[..., 0], F[..., 1]).max():.0f} px")

    F, cell = prior
    json.dump({"x0": x0, "y0": y0, "cell": cell, "dx": np.round(F[..., 0], 1).tolist(), "dy": np.round(F[..., 1], 1).tolist(),
               "note": "сдвиг пикселей скана по клеткам после полинома опорных точек; tools/refine_paris1790.py"},
              open(WARP, "w", encoding="utf-8", newline="\n"))
    print(f"→ {WARP}")


main()
