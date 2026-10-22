# tools/make_discipline_icons.py
# Жетоны Дисциплин для предметов (компендиум, каталог, лист): тёмный круг с тонким костяным
# кольцом, как остальные значки системы, и знак Дисциплины цвета кости.
#
# Знаки лежат в assets/disciplines (белое на чёрном), поэтому в SVG они служат маской
# по яркости: белое проступает костью, чёрное прозрачно. Картинка встраивается в SVG
# (data URI) — SVG-изображения не грузят внешние файлы.
#
# Запуск из корня системы:  python -I tools/make_discipline_icons.py
# Результат: assets/icons/disciplines/<ключ>.svg

import base64, json, os, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "icons", "disciplines")
os.makedirs(OUT, exist_ok=True)

assets = json.load(open(os.path.join(ROOT, "data", "assets.json"), encoding="utf-8"))["disciplines"]
# Своего знака нет — берём родственный (как DISCIPLINE_SYMBOL_PARENT в codex.mjs)
PARENT = {"assamiteSorcery": "thaumaturgy", "koldunism": "thaumaturgy", "setiteSorcery": "serpentis", "darkThaumaturgy": "daimoinon"}
keys = list(json.load(open(os.path.join(ROOT, "data", "disciplines.json"), encoding="utf-8")).keys())

def mime(path):
    with open(path, "rb") as fh:
        head = fh.read(12)
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP": return "image/webp"
    if head[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    return "image/jpeg"

SVG = """<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" width="64" height="64">
<defs>
<radialGradient id="bg" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="{bg0}"/><stop offset="1" stop-color="{bg1}"/></radialGradient>
<linearGradient id="bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ece4d4"/><stop offset="1" stop-color="#a69c88"/></linearGradient>
<mask id="sym" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><image x="13" y="13" width="38" height="38" preserveAspectRatio="xMidYMid meet" xlink:href="data:{mime};base64,{b64}"/></mask>
</defs>
<circle cx="32" cy="32" r="31" fill="url(#bg)" stroke="#4a463f" stroke-width="1"/>
<circle cx="32" cy="32" r="27.5" fill="none" stroke="#d8cfbf" stroke-width=".6" opacity=".35"/>
<rect x="0" y="0" width="64" height="64" fill="url(#bone)" mask="url(#sym)"/>
</svg>
"""

made = 0
for k in keys:
    rel = assets.get(k) or assets.get(PARENT.get(k, ""))
    if not rel: print("нет знака:", k); continue
    src = os.path.join(ROOT, rel)
    b64 = base64.b64encode(open(src, "rb").read()).decode("ascii")
    with open(os.path.join(OUT, f"{k}.svg"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(SVG.format(bg0="#26262a", bg1="#0c0c0e", mime=mime(src), b64=b64))
    made += 1
print(f"assets/icons/disciplines: {made} жетонов")
