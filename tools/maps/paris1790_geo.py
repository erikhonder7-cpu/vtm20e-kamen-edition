# -*- coding: utf-8 -*-
"""Привязка плана Мондаре 1790 года: общие функции для tools/build_paris1790.py и tools/refine_paris1790.py.

Две ступени:
  1. полином 2-го порядка по опорным точкам (paris1790_gcp.json) — общий поворот, масштаб, изгиб гравюры;
  2. поле поправок (paris1790_warp.json) — сдвиги по клеткам, найденные совмещением с сетью улиц 1784–1791
     годов: гравёр ошибался местами по-разному, и плоский полином этого не снимает.
Пиксели — полного скана 11858×7815; координаты — веб-Меркатор (EPSG:3857), метры.
"""
import json, math, os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
GCP = os.path.join(HERE, "paris1790_gcp.json")
WARP = os.path.join(HERE, "paris1790_warp.json")
R = 6378137.0


def merc(lat, lng):
    return math.radians(lng) * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R


def merc_arr(lng, lat):
    lng, lat = np.asarray(lng, float), np.asarray(lat, float)
    return np.radians(lng) * R, np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)) * R


def _poly(Q):
    x, y = Q[:, 0], Q[:, 1]
    return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], 1)


def _fit(src, dst):
    mu, s = src.mean(0), src.std(0).max()
    A = _poly((src - mu) / s)
    cx, *_ = np.linalg.lstsq(A, dst[:, 0], rcond=None)
    cy, *_ = np.linalg.lstsq(A, dst[:, 1], rcond=None)
    return lambda Q: _poly((np.atleast_2d(np.asarray(Q, float)) - mu) / s) @ np.stack([cx, cy], 1)


def load():
    """→ (gcp, to_merc, poly_px) — полиномы скан ↔ Меркатор по опорным точкам."""
    g = json.load(open(GCP, encoding="utf-8"))
    P = np.array([p["px"] for p in g["points"]], float)
    M = np.array([merc(p["lat"], p["lng"]) for p in g["points"]])
    return g, _fit(P, M), _fit(M, P), P, M


class Warp:
    """Поле поправок: сдвиг (dx, dy) в пикселях скана по клеткам, билинейно между центрами клеток."""

    def __init__(self, path=WARP):
        self.ok = os.path.exists(path)
        if not self.ok:
            return
        w = json.load(open(path, encoding="utf-8"))
        self.x0, self.y0, self.cell = w["x0"], w["y0"], w["cell"]
        self.dx, self.dy = np.array(w["dx"], float), np.array(w["dy"], float)

    def __call__(self, px):
        px = np.atleast_2d(np.asarray(px, float))
        if not self.ok:
            return px
        ny, nx = self.dx.shape
        fx = np.clip((px[:, 0] - self.x0) / self.cell - .5, 0, nx - 1.0001)
        fy = np.clip((px[:, 1] - self.y0) / self.cell - .5, 0, ny - 1.0001)
        ix, iy = fx.astype(int), fy.astype(int)
        tx, ty = fx - ix, fy - iy

        def bil(a):
            return (a[iy, ix] * (1 - tx) * (1 - ty) + a[iy, ix + 1] * tx * (1 - ty)
                    + a[iy + 1, ix] * (1 - tx) * ty + a[iy + 1, ix + 1] * tx * ty)
        return np.stack([px[:, 0] + bil(self.dx), px[:, 1] + bil(self.dy)], 1)
