# -*- coding: utf-8 -*-
"""Пятна засохшей крови на бумаге — для карты «Город» (module/ui/citymap.mjs).

    python tools/make_blood_stains.py          (нужны Pillow и numpy; без -I)

Рисуются процедурно: несколько слившихся клякс, тёмный засохший край, брызги-сателлиты
с хвостиками по направлению удара. Детерминированно (свой посев у каждого пятна).
Результат: assets/maps/fx/blood-<n>.png (RGBA 512×512).
"""
import math, os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "maps", "fx")
N = 512


def stain(seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    field = np.zeros((N, N), np.float32)
    # главная клякса — слившиеся пятна
    cx, cy = N / 2 + rng.normal(0, 15), N / 2 + rng.normal(0, 15)
    for _ in range(rng.integers(7, 12)):
        x, y = cx + rng.normal(0, 52), cy + rng.normal(0, 46)
        r = rng.uniform(16, 52)
        field += np.exp(-(((xx - x) ** 2 + (yy - y) ** 2) / (2 * r * r)))
    # брызги: капли и вытянутые хвосты по направлению удара
    ang0 = rng.uniform(0, math.tau)
    for _ in range(rng.integers(14, 26)):
        a = ang0 + rng.normal(0, .7)
        d = rng.uniform(90, 220)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        r = rng.uniform(3, 10)
        stretch = rng.uniform(1, 2.6)
        ca, sa = math.cos(a), math.sin(a)
        u = (xx - x) * ca + (yy - y) * sa
        v = -(xx - x) * sa + (yy - y) * ca
        field += 1.2 * np.exp(-((u / (r * stretch)) ** 2 + (v / r) ** 2))
    # неровный край: шум
    noise = np.asarray(Image.fromarray((rng.random((N // 8, N // 8)) * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC), np.float32) / 255
    f = field + (noise - .5) * .45
    mask = np.clip((f - .55) * 6, 0, 1)
    # засохший край темнее середины, середина чуть прозрачнее — как впитавшаяся кровь
    edge = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    rim = np.clip((mask - edge) * 3 + (1 - edge) * mask * 1.5, 0, 1)
    inner = np.clip(mask - rim, 0, 1)
    r_ = 104 - 66 * rim + noise * 14
    g_ = 8 + noise * 5
    b_ = 9 + noise * 5
    alpha = np.clip(mask * (.8 + .18 * rim + (noise - .5) * .12), 0, 1)
    img = np.stack([r_, np.broadcast_to(g_, r_.shape), np.broadcast_to(b_, r_.shape), alpha * 255], -1)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(.6))


def main():
    os.makedirs(OUT, exist_ok=True)
    for i, seed in enumerate([1789, 1793, 1794], 1):
        stain(seed).save(os.path.join(OUT, f"blood-{i}.png"), optimize=True)
    print("assets/maps/fx: 3 пятна")


main()
