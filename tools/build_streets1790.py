# -*- coding: utf-8 -*-
"""Улицы Парижа 1784–1791 годов — сеть для уточнения привязки плана 1790 года (tools/refine_paris1790.py).

    python tools/build_streets1790.py          (нужны pyshp и pyproj; без -I — они в пользовательских пакетах)

Источник — GeoHistoricalData, «"Verniquet map" and "Jacoubet Atlas" Paris street networks»
(Harvard Dataverse, doi:10.7910/DVN/CCESX4, лицензия CC0): сеть улиц, снятая с плана Верникé
(1783–1799), срез 1784–1791 годов с названиями улиц того времени, в Lambert-93 (EPSG:2154).
Файлы скачиваются один раз в tools/.cache/verniquet/.

Граф: узлы — концы отрезков (сливаются в пределах SNAP метров), рёбра — отрезки улиц с длиной,
геометрией и названием. Берётся крупнейшая связная часть (мелкие обрывки — дворы и тупики без
выхода — отбрасываются).

Результат: tools/.cache/verniquet/streets.json
  { nodes: [[lng, lat]…], names: […], edges: [[a, b, метры, номер_имени, [lng, lat, lng, lat…]]…] }
"""
import json, math, os, sys, urllib.request

import shapefile
from pyproj import Transformer

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache", "verniquet")
OUT = os.path.join(ROOT, "tools", ".cache", "verniquet", "streets.json")
FILES = {"shp": 3450337, "shx": 3450346, "dbf": 3450342}
SNAP = 1.5   # метров: концы ближе — один перекрёсток


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for ext, fid in FILES.items():
        p = os.path.join(CACHE, f"edges_1791.{ext}")
        if not os.path.exists(p):
            urllib.request.urlretrieve(f"https://dataverse.harvard.edu/api/access/datafile/{fid}", p)


def main():
    fetch()
    r = shapefile.Reader(os.path.join(CACHE, "edges_1791"), encoding="utf-8")
    to_wgs = Transformer.from_crs(2154, 4326, always_xy=True)
    nodes, index, names, name_ix, edges = [], {}, [], {}, []

    def node(x, y):
        key = (round(x / SNAP), round(y / SNAP))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                k = (key[0] + dx, key[1] + dy)
                if k in index and math.hypot(nodes[index[k]][0] - x, nodes[index[k]][1] - y) <= SNAP:
                    return index[k]
        index[key] = len(nodes)
        nodes.append((x, y))
        return index[key]

    for sr in r.iterShapeRecords():
        rec = sr.record.as_dict()
        if str(rec.get("1784-1791")).lower() != "true":
            continue
        for part in range(len(sr.shape.parts)):
            a0 = sr.shape.parts[part]
            a1 = sr.shape.parts[part + 1] if part + 1 < len(sr.shape.parts) else len(sr.shape.points)
            pts = sr.shape.points[a0:a1]
            if len(pts) < 2:
                continue
            length = sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))
            if length < .5:
                continue
            a, b = node(*pts[0]), node(*pts[-1])
            if a == b:
                continue
            nm = (rec.get("name_1784-") or "").strip()
            if nm not in name_ix:
                name_ix[nm] = len(names); names.append(nm)
            edges.append([a, b, length, name_ix[nm], pts[1:-1]])

    # крупнейшая связная часть
    adj = {}
    for e in edges:
        adj.setdefault(e[0], []).append(e[1]); adj.setdefault(e[1], []).append(e[0])
    seen, best = set(), set()
    for s in adj:
        if s in seen: continue
        comp, stack = {s}, [s]
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in comp: comp.add(v); stack.append(v)
        seen |= comp
        if len(comp) > len(best): best = comp
    print(f"рёбер {len(edges)}, узлов {len(nodes)}, в главной части узлов {len(best)} из {len(adj)}")

    keep = sorted(best)
    remap = {old: i for i, old in enumerate(keep)}
    ll = lambda x, y: [round(v, 6) for v in to_wgs.transform(x, y)]
    out_nodes = [ll(*nodes[i]) for i in keep]
    out_edges = []
    for a, b, length, nm, mid in edges:
        if a in remap and b in remap:
            flat = [c for p in mid for c in ll(*p)]
            out_edges.append([remap[a], remap[b], round(length, 1), nm, flat])
    data = {
        "source": "GeoHistoricalData, «Verniquet map» street network 1784–1791 (doi:10.7910/DVN/CCESX4, CC0)",
        "nodes": out_nodes, "names": names, "edges": out_edges,
        # с какого года улица или мост открыты (мост Людовика XVI строится с 1787-го, открыт в 1791-м)
        "since": {n: 1791 for n in names if "louis xvi" in n.lower()}
    }
    json.dump(data, open(OUT, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, separators=(",", ":"))
    bridges = sorted({names[e[3]] for e in out_edges if names[e[3]].lower().startswith("pont")})
    total = sum(e[2] for e in out_edges) / 1000
    print(f"{OUT}: {len(out_nodes)} узлов, {len(out_edges)} рёбер, {total:.0f} км улиц, {os.path.getsize(OUT) / 1e3:.0f} КБ")
    print("мосты:", ", ".join(bridges))


main()
