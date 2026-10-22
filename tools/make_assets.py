# tools/make_assets.py
# Рисует SVG-оформление системы «Liberté»: кокарду, лавровые ветви и венок,
# восковую печать, розетку, угловой орнамент, гильош (как на ассигнатах),
# текстуру бумаги и медальоны-иконки актёров и предметов.
#
# Запуск из корня системы:  python -I tools/make_assets.py

import math, os, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, "assets", "ui")
IC = os.path.join(ROOT, "assets", "icons")
os.makedirs(UI, exist_ok=True); os.makedirs(IC, exist_ok=True)

BLUE, WHITE, RED = "#22396b", "#efe6d0", "#9b1c23"
GOLD, GOLD_L, GOLD_D = "#b8903f", "#e2c27a", "#6e5320"
NAVY, NAVY_D = "#16213a", "#0b1120"
INK = "#2a1f17"

def f(x): return f"{x:.2f}".rstrip("0").rstrip(".")

def write(path, body, w, h, defs=""):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}">'
    if defs: svg += f"<defs>{defs}</defs>"
    svg += body + "</svg>\n"
    with open(path, "w", encoding="utf-8", newline="\n") as fh: fh.write(svg)

def gold_grad(id_):
    return (f'<linearGradient id="{id_}" x1="0" y1="0" x2="0.4" y2="1">'
            f'<stop offset="0" stop-color="{GOLD_L}"/><stop offset=".45" stop-color="{GOLD}"/>'
            f'<stop offset=".55" stop-color="#9c7630"/><stop offset="1" stop-color="{GOLD_L}"/></linearGradient>')

# ── Кокарда ──────────────────────────────────────────────────────────────────

def cockade(size=64, pleats=36):
    c = size / 2
    rays = []
    for i in range(pleats):
        a = 2 * math.pi * i / pleats
        x1, y1 = c + math.cos(a) * size * 0.17, c + math.sin(a) * size * 0.17
        x2, y2 = c + math.cos(a) * size * 0.485, c + math.sin(a) * size * 0.485
        rays.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>')
    # зубчатый край ленты
    edge = []
    n = 72
    for i in range(n + 1):
        a = 2 * math.pi * i / n
        r = size * (0.49 if i % 2 == 0 else 0.47)
        edge.append(f"{f(c + math.cos(a) * r)},{f(c + math.sin(a) * r)}")
    defs = (f'<radialGradient id="sh" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff" stop-opacity=".38"/>'
            f'<stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>'
            + gold_grad("gb"))
    body = (f'<polygon points="{" ".join(edge)}" fill="{RED}"/>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.335)}" fill="{WHITE}"/>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.2)}" fill="{BLUE}"/>'
            f'<g stroke="#000" stroke-opacity=".16" stroke-width="{f(size/90)}">{"".join(rays)}</g>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.49)}" fill="url(#sh)"/>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.075)}" fill="url(#gb)" stroke="{GOLD_D}" stroke-width="{f(size/128)}"/>')
    return body, defs

body, defs = cockade(64)
write(os.path.join(UI, "cockade.svg"), body, 64, 64, defs)

# ── Лавр ─────────────────────────────────────────────────────────────────────

def leaf(x, y, ang, length, width, fill, stroke):
    """Миндалевидный лист, основание в (x, y), направлен под углом ang (рад)."""
    l, w = length, width
    d = f"M0 0 C {f(l*0.3)} {f(-w)}, {f(l*0.75)} {f(-w*0.8)}, {f(l)} 0 C {f(l*0.75)} {f(w*0.8)}, {f(l*0.3)} {f(w)}, 0 0 Z"
    vein = f"M0 0 L {f(l*0.92)} 0"
    deg = math.degrees(ang)
    return (f'<g transform="translate({f(x)} {f(y)}) rotate({f(deg)})">'
            f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width=".6"/>'
            f'<path d="{vein}" stroke="{stroke}" stroke-width=".45" fill="none" opacity=".7"/></g>')

def branch_points(cx, cy, r, a0, a1, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = a0 + (a1 - a0) * t
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r, a, t))
    return pts

def laurel_branch(cx, cy, r, a0, a1, leaves=11, size=1.0, fill="url(#lg)", stroke=GOLD_D, berries=True):
    """Ветвь вдоль дуги окружности от a0 к a1; листья парами, к концу мельче."""
    pts = branch_points(cx, cy, r, a0, a1, 60)
    stem = "M" + " L".join(f"{f(x)} {f(y)}" for x, y, _, _ in pts)
    out = [f'<path d="{stem}" fill="none" stroke="{stroke}" stroke-width="{f(1.6*size)}" stroke-linecap="round"/>']
    direction = 1 if a1 > a0 else -1
    for i in range(leaves):
        t = 0.06 + 0.9 * i / max(1, leaves - 1)
        a = a0 + (a1 - a0) * t
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
        tangent = a + direction * math.pi / 2
        k = (1.15 - 0.55 * t) * size
        for side in (-1, 1):
            ang = tangent + side * math.radians(38)
            out.append(leaf(x, y, ang, 15 * k, 4.6 * k, fill, stroke))
        if berries and i % 3 == 1:
            bx = x + math.cos(a) * 5 * k * (1 if direction > 0 else 1)
            by = y + math.sin(a) * 5 * k
            out.append(f'<circle cx="{f(bx)}" cy="{f(by)}" r="{f(1.9*k)}" fill="{RED}" stroke="{GOLD_D}" stroke-width=".4"/>')
    # верхушка
    a = a1
    x, y = cx + math.cos(a) * r, cy + math.sin(a) * r
    out.append(leaf(x, y, a + direction * math.pi / 2, 13 * 0.6 * size, 3.6 * 0.6 * size, fill, stroke))
    return "".join(out)

leaf_grad = (f'<linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD_L}"/>'
             f'<stop offset=".6" stop-color="{GOLD}"/><stop offset="1" stop-color="#8a6a2a"/></linearGradient>')

# Венок вокруг медальона 200×200: две ветви от низа к верху, лента внизу
W = 200; C = 100; R = 88
left = laurel_branch(C, C, R, math.radians(100), math.radians(250), leaves=12)
right = laurel_branch(C, C, R, math.radians(80), math.radians(-70), leaves=12)
ribbon = (f'<path d="M86 186 C 92 180, 108 180, 114 186 L 120 198 L 108 192 L 100 197 L 92 192 L 80 198 Z" fill="{RED}" stroke="{GOLD_D}" stroke-width=".8"/>'
          f'<path d="M88 186 C 94 182, 106 182, 112 186" fill="none" stroke="{WHITE}" stroke-width="2.2" opacity=".85"/>'
          f'<circle cx="100" cy="186" r="5.5" fill="{BLUE}" stroke="{GOLD_D}" stroke-width=".8"/>')
write(os.path.join(UI, "wreath.svg"), left + right + ribbon, W, W, leaf_grad)

# Веточка для заголовков разделов (смотрит вправо), 120×36
sprig = []
sx = 4
stem = f'<path d="M4 18 C 40 22, 80 20, 116 14" fill="none" stroke="{GOLD_D}" stroke-width="1.3" stroke-linecap="round"/>'
sprig.append(stem)
for i in range(8):
    t = i / 7
    x = 8 + 100 * t
    y = 18 + 3 * math.sin(t * math.pi) - 4 * t
    k = 1.0 - 0.45 * t
    sprig.append(leaf(x, y, math.radians(-30), 15 * k, 4.4 * k, "url(#lg)", GOLD_D))
    sprig.append(leaf(x, y, math.radians(28), 15 * k, 4.4 * k, "url(#lg)", GOLD_D))
sprig.append(leaf(114, 14, math.radians(-8), 10, 3, "url(#lg)", GOLD_D))
write(os.path.join(UI, "sprig.svg"), "".join(sprig), 124, 36, leaf_grad)

# ── Восковая печать ──────────────────────────────────────────────────────────

def seal(size=120, seed=3):
    c = size / 2
    pts = []
    n = 120
    for i in range(n):
        a = 2 * math.pi * i / n
        r = size * 0.46 * (1 + 0.035 * math.sin(7 * a + seed) + 0.025 * math.sin(13 * a + 2 * seed) + 0.02 * math.sin(3 * a))
        pts.append(f"{f(c + math.cos(a) * r)},{f(c + math.sin(a) * r)}")
    defs = ('<radialGradient id="wx" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#c8323a"/>'
            '<stop offset=".55" stop-color="#8e141c"/><stop offset="1" stop-color="#4a070c"/></radialGradient>'
            '<radialGradient id="wi" cx="60%" cy="65%" r="60%"><stop offset="0" stop-color="#000" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>')
    dots = []
    for i in range(48):
        a = 2 * math.pi * i / 48
        dots.append(f'<circle cx="{f(c + math.cos(a)*size*0.335)}" cy="{f(c + math.sin(a)*size*0.335)}" r="{f(size*0.008)}"/>')
    body = (f'<polygon points="{" ".join(pts)}" fill="url(#wx)"/>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.36)}" fill="url(#wi)" stroke="#5a0a10" stroke-width="{f(size*0.02)}"/>'
            f'<circle cx="{c}" cy="{c}" r="{f(size*0.36)}" fill="none" stroke="#e05a60" stroke-opacity=".35" stroke-width="{f(size*0.006)}" transform="translate(-1 -1)"/>'
            f'<g fill="#3c0509" opacity=".55">{"".join(dots)}</g>'
            f'<ellipse cx="{f(c - size*0.16)}" cy="{f(c - size*0.2)}" rx="{f(size*0.12)}" ry="{f(size*0.05)}" fill="#fff" opacity=".12" transform="rotate(-30 {c} {c})"/>')
    return body, defs

b, d = seal(120)
write(os.path.join(UI, "seal.svg"), b, 120, 120, d)

# ── Розетка (орнамент Людовика XVI) ─────────────────────────────────────────

def rosette(size=40, petals=8):
    c = size / 2
    out = []
    for i in range(petals):
        a = 360 * i / petals
        out.append(f'<ellipse cx="{c}" cy="{f(c - size*0.22)}" rx="{f(size*0.11)}" ry="{f(size*0.2)}" transform="rotate({f(a)} {c} {c})" fill="url(#rg)" stroke="{GOLD_D}" stroke-width=".7"/>')
    for i in range(petals):
        a = 360 * i / petals + 180 / petals
        out.append(f'<ellipse cx="{c}" cy="{f(c - size*0.17)}" rx="{f(size*0.06)}" ry="{f(size*0.12)}" transform="rotate({f(a)} {c} {c})" fill="{GOLD_D}" opacity=".55"/>')
    out.append(f'<circle cx="{c}" cy="{c}" r="{f(size*0.12)}" fill="{RED}" stroke="{GOLD_D}" stroke-width=".8"/>')
    out.append(f'<circle cx="{c}" cy="{c}" r="{f(size*0.05)}" fill="{GOLD_L}"/>')
    return "".join(out), gold_grad("rg")

b, d = rosette(40)
write(os.path.join(UI, "rosette.svg"), b, 40, 40, d)

# ── Углы рамки (четыре, отзеркаленные) ──────────────────────────────────────

corner_body = (f'<path d="M4 62 L4 4 L62 4" fill="none" stroke="{GOLD}" stroke-width="1.6"/>'
               f'<path d="M9 62 L9 9 L62 9" fill="none" stroke="{GOLD}" stroke-width=".7"/>'
               f'<path d="M15 46 C 15 27, 27 15, 46 15" fill="none" stroke="{GOLD}" stroke-width=".9"/>'
               f'<path d="M15 46 c 4 -2 6 -6 4 -10 M46 15 c -2 4 -6 6 -10 4" fill="none" stroke="{GOLD}" stroke-width=".9"/>'
               + leaf(17, 34, math.radians(-75), 9, 3, "url(#lg)", GOLD_D)
               + leaf(34, 17, math.radians(-15), 9, 3, "url(#lg)", GOLD_D)
               + '<g transform="translate(-4 -4) scale(.6)">' + rosette(40)[0].replace("url(#rg)", "url(#lg)") + '</g>')
# розетка в углу: центр (8, 8), радиус ≈ 7 — помещается в поле 66×66
for name, tr in {"corner": "", "corner-tl": "", "corner-tr": "translate(66 0) scale(-1 1)",
                 "corner-bl": "translate(0 66) scale(1 -1)", "corner-br": "translate(66 66) scale(-1 -1)"}.items():
    body = f'<g transform="{tr}">' + corner_body.replace('translate(-4 -4)', 'translate(-4 -4)') + '</g>' if tr else corner_body
    write(os.path.join(UI, f"{name}.svg"), body, 66, 66, leaf_grad)

# ── Гильош (лента как на ассигнатах) ─────────────────────────────────────────

def guilloche(w=48, h=14, lines=6, color=BLUE, opacity=0.55):
    out = []
    for k in range(lines):
        ph = 2 * math.pi * k / lines
        pts = []
        for i in range(97):
            x = w * i / 96
            y = h / 2 + (h * 0.42) * math.sin(2 * math.pi * x / w * 2 + ph) * math.cos(2 * math.pi * x / w + ph / 2)
            pts.append(f"{f(x)} {f(y)}")
        out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width=".55" opacity="{opacity}"/>')
    out.append(f'<line x1="0" y1=".5" x2="{w}" y2=".5" stroke="{color}" stroke-width=".8" opacity=".7"/>')
    out.append(f'<line x1="0" y1="{f(h-.5)}" x2="{w}" y2="{f(h-.5)}" stroke="{color}" stroke-width=".8" opacity=".7"/>')
    return "".join(out)

write(os.path.join(UI, "guilloche.svg"), guilloche(), 48, 14)
write(os.path.join(UI, "guilloche-gold.svg"), guilloche(color=GOLD, opacity=0.8), 48, 14)
write(os.path.join(UI, "guilloche-red.svg"), guilloche(color=RED, opacity=0.6), 48, 14)

# ── Бумага ───────────────────────────────────────────────────────────────────

paper = ('<filter id="p" x="0" y="0" width="100%" height="100%">'
         '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="7" result="n"/>'
         '<feColorMatrix in="n" type="matrix" values="0 0 0 0 .32  0 0 0 0 .22  0 0 0 0 .1  0 0 0 -1.1 .62"/>'
         '</filter>'
         '<filter id="s" x="0" y="0" width="100%" height="100%">'
         '<feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="2" seed="3" result="m"/>'
         '<feColorMatrix in="m" type="matrix" values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 .12  0 0 0 -2.4 1.05"/>'
         '</filter>')
paper_dark = ('<filter id="p" x="0" y="0" width="100%" height="100%">'
              '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="11" result="n"/>'
              '<feColorMatrix in="n" type="matrix" values="0 0 0 0 .86  0 0 0 0 .74  0 0 0 0 .52  0 0 0 -1.25 .62"/>'
              '</filter>'
              '<filter id="s" x="0" y="0" width="100%" height="100%">'
              '<feTurbulence type="fractalNoise" baseFrequency=".01" numOctaves="2" seed="5" result="m"/>'
              '<feColorMatrix in="m" type="matrix" values="0 0 0 0 .55  0 0 0 0 .42  0 0 0 0 .22  0 0 0 -2.2 .95"/>'
              '</filter>')
write(os.path.join(UI, "paper-dark.svg"), '<rect width="100%" height="100%" filter="url(#s)" opacity=".16"/><rect width="100%" height="100%" filter="url(#p)" opacity=".1"/>', 400, 400, paper_dark)
write(os.path.join(UI, "paper.svg"), '<rect width="100%" height="100%" filter="url(#s)" opacity=".55"/><rect width="100%" height="100%" filter="url(#p)" opacity=".5"/>', 400, 400, paper)

# ── Медальоны-иконки ─────────────────────────────────────────────────────────

def medallion(glyph, red=False):
    """Тёмный жетон: уголь (или запёкшаяся кровь), тонкое костяное кольцо, знак цвета кости."""
    defs = (f'<radialGradient id="bg" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="{"#3a1215" if red else "#26262a"}"/>'
            f'<stop offset="1" stop-color="{"#140608" if red else "#0c0c0e"}"/></radialGradient>'
            '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece4d4"/><stop offset="1" stop-color="#a69c88"/></linearGradient>')
    body = (f'<circle cx="32" cy="32" r="31" fill="url(#bg)" stroke="#4a463f" stroke-width="1"/>'
            f'<circle cx="32" cy="32" r="27.5" fill="none" stroke="#d8cfbf" stroke-width=".6" opacity=".35"/>'
            f'<g fill="url(#gl)" stroke="#2a2724" stroke-width=".7" stroke-linejoin="round">{glyph}</g>')
    return body, defs

DROP = "M32 13 C 27 22, 20 30, 20 38 a 12 12 0 0 0 24 0 C 44 30, 37 22, 32 13 Z"
GLYPHS = {
    "vampire": (f'<path d="{DROP}" fill="#a3161f" stroke="#d8cfbf" stroke-width="1.3"/>'
                f'<path d="M26 36 c 1 4 3 7 6 8" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>', True),
    "ghoul": (f'<path d="{DROP}" fill="none" stroke="{GOLD_L}" stroke-width="1.6"/>'
              f'<path d="M20.4 40 a 11.6 11.6 0 0 0 23.2 0 Z" fill="#a3161f" stroke="none"/>'
              f'<path d="M14 46 c 6 6 30 6 36 0" fill="none" stroke="{GOLD_L}" stroke-width="2" stroke-linecap="round"/>', False),
    "mortal": ('<path d="M17 50 c 0 -9 7 -13 15 -13 s 15 4 15 13 Z"/>'
               '<circle cx="32" cy="29" r="6.5"/>'
               '<path d="M19 24 C 24 17, 40 17, 45 24 C 40 22, 36 23, 32 26 C 28 23, 24 22, 19 24 Z"/>'
               f'<circle cx="40" cy="22" r="2.2" fill="{RED}" stroke="{WHITE}" stroke-width=".8"/>', False),
    "discipline": ('<path d="M12 32 C 20 21, 44 21, 52 32 C 44 43, 20 43, 12 32 Z" fill="none" stroke-width="2"/>'
                   f'<circle cx="32" cy="32" r="7.5" fill="#a3161f" stroke="{GOLD_L}"/><circle cx="32" cy="32" r="2.6" fill="#0b0f1a" stroke="none"/>'
                   '<path d="M32 14 v5 M20 17 l2.5 4 M44 17 l-2.5 4" fill="none" stroke-width="1.6" stroke-linecap="round"/>', False),
    "thaumPath": ('<path d="M12 22 C 20 19, 27 20, 32 24 C 37 20, 44 19, 52 22 L 52 45 C 44 42, 37 43, 32 47 C 27 43, 20 42, 12 45 Z"/>'
                  '<path d="M32 24 V 47" fill="none" stroke-width="1.2"/>'
                  '<path d="M16 28 c 4 -1 8 -1 12 1 M16 33 c 4 -1 8 -1 12 1 M36 29 c 4 -2 8 -2 12 -1 M36 34 c 4 -2 8 -2 12 -1" fill="none" stroke-width="1" opacity=".8"/>', False),
    "ritual": ('<rect x="27" y="30" width="10" height="20" rx="1.5"/>'
               '<path d="M22 50 h20 v3 h-20 Z"/>'
               '<path d="M32 15 C 28 20, 29 25, 32 28 C 35 25, 36 20, 32 15 Z" fill="#e8822a" stroke="#f3cf70"/>'
               '<path d="M32 28 v3" stroke-width="1.2"/>', False),
    "background": ('<path d="M14 24 L32 14 L50 24 Z"/><rect x="14" y="25" width="36" height="3"/>'
                   '<rect x="17" y="29" width="4" height="16"/><rect x="25" y="29" width="4" height="16"/>'
                   '<rect x="35" y="29" width="4" height="16"/><rect x="43" y="29" width="4" height="16"/>'
                   '<rect x="13" y="46" width="38" height="3"/><rect x="11" y="49.5" width="42" height="3"/>', False),
    "merit": ('<path d="M32 13 L36.5 26 L50 26 L39 34.5 L43 48 L32 40 L21 48 L25 34.5 L14 26 L27.5 26 Z"/>', False),
    "flaw": ('<path d="M24 16 h16 v4 h-2 v8 l-4 4 l5 3 l-3 4 v7 h2 v4 h-16 v-4 h2 v-9 l4 -3 l-4 -3 v-11 h-2 Z"/>'
             '<path d="M30 30 l-3 3 l4 3" fill="none" stroke="#a3161f" stroke-width="1.6"/>', True),
    "derangement": ('<path d="M32 32 m0 -2 a2 2 0 1 1 -2 2 a4 4 0 0 1 4 -4 a6 6 0 0 1 6 6 a8 8 0 0 1 -8 8 a10 10 0 0 1 -10 -10 a12 12 0 0 1 12 -12 a14 14 0 0 1 14 14" fill="none" stroke-width="2.4" stroke-linecap="round"/>', False),
    "weapon": ('<path d="M17 47 C 25 37, 35 25, 47 15 L 49 17 C 39 28, 28 39, 19 49 Z"/>'
               '<path d="M47 47 C 39 37, 29 25, 17 15 L 15 17 C 25 28, 36 39, 45 49 Z"/>'
               '<path d="M14 44 l6 6 M50 44 l-6 6" fill="none" stroke-width="3" stroke-linecap="round"/>'
               '<circle cx="15" cy="51" r="2.2"/><circle cx="49" cy="51" r="2.2"/>', False),
    "armor": ('<path d="M20 16 C 26 19, 38 19, 44 16 L 49 22 C 46 26, 46 33, 48 40 C 44 47, 38 51, 32 52 C 26 51, 20 47, 16 40 C 18 33, 18 26, 15 22 Z"/>'
              '<path d="M32 21 V 50 M22 30 C 26 33, 38 33, 42 30" fill="none" stroke-width="1"/>', False),
    "gear": ('<path d="M26 18 h12 l3 5 h-18 Z"/><circle cx="32" cy="14.5" r="2.6" fill="none" stroke-width="1.4"/>'
             '<rect x="23" y="24" width="18" height="21" rx="1.5" fill="#2a1a10" stroke-width="1.4"/>'
             '<path d="M32 29 C 29 33, 29.5 37, 32 40 C 34.5 37, 35 33, 32 29 Z" fill="#f0a838" stroke="#f6d27a"/>'
             '<path d="M23 34 h18 M32 24 v21" fill="none" stroke-width=".9" opacity=".7"/>'
             '<path d="M21 45 h22 l-2 4 h-18 Z"/>', False),
    "item": ('<circle cx="32" cy="32" r="9"/>', False),
    "creature": ('<path d="M20 44 C 18 34, 22 24, 32 22 C 42 24, 46 34, 44 44 C 40 40, 36 40, 32 44 C 28 40, 24 40, 20 44 Z"/>'
                 '<path d="M24 22 L 21 13 L 28 19 Z M40 22 L 43 13 L 36 19 Z"/>'
                 '<circle cx="27.5" cy="31" r="2.2" fill="#e8822a" stroke="#f3cf70"/><circle cx="36.5" cy="31" r="2.2" fill="#e8822a" stroke="#f3cf70"/>', True),
    "power": ('<path d="M32 12 L35 27 L50 22 L38 32 L50 42 L35 37 L32 52 L29 37 L14 42 L26 32 L14 22 L29 27 Z"/>'
              '<circle cx="32" cy="32" r="4" fill="#a3161f" stroke="#f1d796"/>', False),
}
for name, (glyph, red) in GLYPHS.items():
    b, d = medallion(glyph, red)
    write(os.path.join(IC, f"{name}.svg"), b, 64, 64, d)
# одинаковые изображения для родственных типов
for alias, src in {"path": "thaumPath"}.items():
    b, d = medallion(*GLYPHS[src])
    write(os.path.join(IC, f"{alias}.svg"), b, 64, 64, d)

# ── Овальная рама портрета (Людовик XVI): бант-кокарда, бусы, розетки, лавр ──

def ellipse_pts(cx, cy, rx, ry, n):
    return [(cx + math.cos(2 * math.pi * i / n) * rx, cy + math.sin(2 * math.pi * i / n) * ry) for i in range(n)]

def oval_frame():
    W, H, cx, cy = 240, 300, 120, 152
    defs = (gold_grad("fg") + leaf_grad +
            '<linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e2a8"/>'
            f'<stop offset=".35" stop-color="{GOLD}"/><stop offset=".5" stop-color="#7a5a22"/><stop offset=".65" stop-color="{GOLD}"/>'
            '<stop offset="1" stop-color="#f1d796"/></linearGradient>'
            '<radialGradient id="rb" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#d23a43"/><stop offset="1" stop-color="#6e1219"/></radialGradient>'
            '<radialGradient id="bb" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#4a6fc0"/><stop offset="1" stop-color="#16244a"/></radialGradient>')
    out = []
    # кольцо рамы (evenodd между внешним и внутренним овалом)
    def ell(rx, ry):
        return f"M{f(cx - rx)} {cy} a{rx} {ry} 0 1 0 {f(2 * rx)} 0 a{rx} {ry} 0 1 0 {f(-2 * rx)} 0 Z"
    out.append(f'<path d="{ell(106, 136)} {ell(84, 112)}" fill="url(#fr)" fill-rule="evenodd" stroke="{GOLD_D}" stroke-width="1.2"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="96" ry="125" fill="none" stroke="#3a2a0e" stroke-width="3.2" opacity=".55"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="96" ry="125" fill="none" stroke="#f6e2a8" stroke-width=".8" opacity=".6" transform="translate(-.6 -.8)"/>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="102" ry="132" fill="none" stroke="#f6e2a8" stroke-width=".6" opacity=".7"/>')
    # бусы по внутренней кромке
    beads = "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.3"/>' for x, y in ellipse_pts(cx, cy, 88.5, 116.5, 64))
    out.append(f'<g fill="url(#fg)" stroke="{GOLD_D}" stroke-width=".5">{beads}</g>')
    # насечка «акантовой» ленты по внешней кромке
    ticks = []
    for i in range(96):
        a = 2 * math.pi * i / 96
        x1, y1 = cx + math.cos(a) * 99, cy + math.sin(a) * 128
        x2, y2 = cx + math.cos(a + .03) * 104.5, cy + math.sin(a + .03) * 134.5
        ticks.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>')
    out.append(f'<g stroke="{GOLD_D}" stroke-width=".9" opacity=".75">{"".join(ticks)}</g>')
    out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="84" ry="112" fill="none" stroke="#1a1206" stroke-width="1.6"/>')
    # розетки по бокам
    rb, _ = rosette(40)
    for x in (cx - 106, cx + 106):
        out.append(f'<g transform="translate({f(x - 11)} {cy - 11}) scale(.55)">{rb.replace("url(#rg)", "url(#fg)")}</g>')
    # лавр снизу — две ветви, сходящиеся к ленте
    out.append(laurel_branch(cx, cy + 4, 132, math.radians(96), math.radians(146), leaves=7, size=.95))
    out.append(laurel_branch(cx, cy + 4, 132, math.radians(84), math.radians(34), leaves=7, size=.95))
    out.append(f'<g transform="translate({cx - 9} {cy + 126})" ><path d="M0 4 L18 4 L15 16 L9 12 L3 16 Z" fill="url(#rb)" stroke="{GOLD_D}" stroke-width=".6"/>'
               f'<circle cx="9" cy="5" r="5.5" fill="url(#fg)" stroke="{GOLD_D}" stroke-width=".6"/></g>')
    # бант сверху: красные петли, синие хвосты, кокарда в узле
    bow = (f'<path d="M120 26 C 104 4, 76 4, 80 20 C 83 33, 104 32, 120 26 Z" fill="url(#rb)" stroke="#3c070b" stroke-width=".8"/>'
           f'<path d="M120 26 C 136 4, 164 4, 160 20 C 157 33, 136 32, 120 26 Z" fill="url(#rb)" stroke="#3c070b" stroke-width=".8"/>'
           f'<path d="M84 19 C 90 12, 104 14, 114 24" fill="none" stroke="{WHITE}" stroke-width="1.6" opacity=".75"/>'
           f'<path d="M156 19 C 150 12, 136 14, 126 24" fill="none" stroke="{WHITE}" stroke-width="1.6" opacity=".75"/>'
           f'<path d="M116 30 C 108 44, 98 50, 90 60 L 99 58 L 100 67 C 108 55, 116 44, 121 32 Z" fill="url(#bb)" stroke="#0b1120" stroke-width=".8"/>'
           f'<path d="M124 30 C 132 44, 142 50, 150 60 L 141 58 L 140 67 C 132 55, 124 44, 119 32 Z" fill="url(#bb)" stroke="#0b1120" stroke-width=".8"/>')
    out.append(bow)
    ck, _ = cockade(64)
    out.append(f'<g transform="translate(108 14) scale(.375)">{ck}</g>')
    return "".join(out), W, H, defs + cockade(64)[1]

b, w, h, d = oval_frame()
write(os.path.join(UI, "frame-oval.svg"), b, w, h, d)

# ── Дамаск: решётка с розетками и лавровыми звёздами (плитка фона) ────────────

def damask(size=96, color=GOLD_L):
    s, c = size, size / 2
    out = [f'<path d="M0 {c} L{c} 0 L{s} {c} L{c} {s} Z" fill="none" stroke="{color}" stroke-width=".55"/>',
           f'<path d="M0 {c} L{c} 0 L{s} {c} L{c} {s} Z" fill="none" stroke="{color}" stroke-width=".35" transform="translate({c} {c}) scale(.86) translate({-c} {-c})"/>']
    # четырёхлистник в центре ромба
    for a in range(0, 360, 90):
        out.append(f'<ellipse cx="{c}" cy="{f(c - 7)}" rx="2.6" ry="6" transform="rotate({a} {c} {c})" fill="{color}"/>')
    for a in range(45, 360, 90):
        out.append(f'<ellipse cx="{c}" cy="{f(c - 5)}" rx="1.3" ry="3.4" transform="rotate({a} {c} {c})" fill="{color}" opacity=".7"/>')
    out.append(f'<circle cx="{c}" cy="{c}" r="2" fill="none" stroke="{color}" stroke-width=".7"/>')
    # бусины в узлах решётки
    for x, y in ((0, c), (c, 0), (s, c), (c, s)):
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="2.2" fill="{color}"/>')
    # звёздочки по углам плитки (между ромбами)
    for x, y in ((0, 0), (s, 0), (0, s), (s, s)):
        pts = []
        for i in range(10):
            r = 5 if i % 2 == 0 else 2
            a = math.pi / 2 + i * math.pi / 5
            pts.append(f"{f(x + math.cos(a) * r)},{f(y - math.sin(a) * r)}")
        out.append(f'<polygon points="{" ".join(pts)}" fill="{color}"/>')
    return "".join(out)

write(os.path.join(UI, "damask.svg"), damask(), 96, 96)
write(os.path.join(UI, "damask-faint.svg"), f'<g opacity=".06">{damask()}</g>', 96, 96)
write(os.path.join(UI, "damask-ink-faint.svg"), f'<g opacity=".08">{damask(color="#4a3a2c")}</g>', 96, 96)

# ── Рамка карточек для border-image (срез 30): двойная линия, угловые розетки ─

def card_frame(size=90, gold=GOLD, dark=NAVY_D):
    s = size
    out = [f'<rect x="3.5" y="3.5" width="{s - 7}" height="{s - 7}" fill="none" stroke="{gold}" stroke-width="1.3"/>',
           f'<rect x="8" y="8" width="{s - 16}" height="{s - 16}" fill="none" stroke="{gold}" stroke-width=".6" opacity=".8"/>']
    rb, _ = rosette(40)
    for x, y in ((0, 0), (s - 18, 0), (0, s - 18), (s - 18, s - 18)):
        out.append(f'<rect x="{x + .7}" y="{y + .7}" width="16.6" height="16.6" fill="{dark}" stroke="{gold}" stroke-width="1"/>'
                   f'<g transform="translate({x + 1.4} {y + 1.4}) scale(.38)">{rb.replace("url(#rg)", "url(#lg)")}</g>')
    # листки, отходящие от угловых квадратов вдоль кромок
    for (x, y, rot) in ((18, 6, 0), (6, 18, 90), (s - 18, 6, 180), (s - 6, 18, 90),
                        (18, s - 6, 0), (6, s - 18, -90), (s - 18, s - 6, 180), (s - 6, s - 18, -90)):
        out.append(leaf(x, y, math.radians(rot), 9, 2.4, "url(#lg)", GOLD_D))
    return "".join(out)

write(os.path.join(UI, "frame-card.svg"), card_frame(), 90, 90, leaf_grad + gold_grad("rg"))
write(os.path.join(UI, "frame-card-light.svg"), card_frame(gold="#8a6a2a", dark="#efe4c8"), 90, 90, leaf_grad + gold_grad("rg"))

# ── Гильош-розетка (водяной знак ассигната) ──────────────────────────────────

def guilloche_rosette(size=200, color=GOLD, loops=3, width=.45):
    c = size / 2
    out = []
    # гипотрохоиды: (R, r, d, масштаб) — r и R взаимно просты, кривая замыкается за r оборотов
    for k, (R, r, d, scale) in enumerate(((62, 9, 34, 1.0), (50, 7, 22, .74), (38, 5, 14, .5))[:loops]):
        pts = []
        n = 260 * r
        for i in range(n + 1):
            t = 2 * math.pi * r * i / n
            x = (R - r) * math.cos(t) + d * math.cos((R - r) / r * t)
            y = (R - r) * math.sin(t) - d * math.sin((R - r) / r * t)
            k2 = (c - 4) / (R - r + d) * scale
            pts.append(f"{f(c + x * k2)} {f(c + y * k2)}")
        out.append(f'<path d="M{" L".join(pts)}" fill="none" stroke="{color}" stroke-width="{width}" opacity="{.85 - k * .18}"/>')
    out.append(f'<circle cx="{c}" cy="{c}" r="{f(c - 1)}" fill="none" stroke="{color}" stroke-width=".8" opacity=".6"/>')
    return "".join(out)

write(os.path.join(UI, "rosette-guilloche-gold.svg"), guilloche_rosette(), 200, 200)
write(os.path.join(UI, "rosette-guilloche-red.svg"), guilloche_rosette(color="#c8303a"), 200, 200)

print("UI:", sorted(os.listdir(UI)))
print("icons:", sorted(os.listdir(IC)))
