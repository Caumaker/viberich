# Builds examples/scene3d/table.glb: a small vibrating table (base, springs, table, two motors) made of boxes.
# Node names follow CAD style ("Part:instance") so the scene keys in table.md match them. Z-up mm in, glTF Y-up metres out.
import json, struct, os
def box(sx, sy, sz):  # unit cube scaled, returns positions, normals, indices (glTF frame)
    P, N, I = [], [], []
    faces = [((1,0,0),(0,1,0),(0,0,1)),((-1,0,0),(0,0,1),(0,1,0)),((0,1,0),(0,0,1),(1,0,0)),((0,-1,0),(1,0,0),(0,0,1)),((0,0,1),(1,0,0),(0,1,0)),((0,0,-1),(0,1,0),(1,0,0))]
    for n, u, v in faces:
        b = len(P)
        for a, c in ((-1,-1),(1,-1),(1,1),(-1,1)):
            p = [n[k] * 0.5 + u[k] * 0.5 * a + v[k] * 0.5 * c for k in range(3)]
            P.append([p[0] * sx, p[1] * sy, p[2] * sz]); N.append(list(n))
        I += [b, b+1, b+2, b, b+2, b+3]
    return P, N, I
parts = [  # name, color, centre mm (x,y,z Z-up), size mm
    ("Base:1", "#8a96a3", (0, 0, 40), (900, 600, 80)),
    ("Spring_1:1", "#2c2c2c", (-350, -220, 110), (60, 60, 60)), ("Spring_1:2", "#2c2c2c", (350, -220, 110), (60, 60, 60)),
    ("Spring_1:3", "#2c2c2c", (-350, 220, 110), (60, 60, 60)), ("Spring_1:4", "#2c2c2c", (350, 220, 110), (60, 60, 60)),
    ("Table:1", "#5b7fa6", (0, 0, 155), (820, 540, 30)),
    ("Motor_1:1", "#e0b020", (-200, 0, 210), (160, 280, 80)), ("Motor_1:2", "#e0b020", (200, 0, 210), (160, 280, 80)),
]
buf = b""; acc = []; views = []; meshes = []; nodes = []; mats = []
def add(data, fmt, target):
    global buf
    while len(buf) % 4: buf += b"\0"
    off = len(buf); raw = b"".join(struct.pack(fmt, *x) if isinstance(x, (list, tuple)) else struct.pack(fmt, x) for x in data); buf += raw
    views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target}); return len(views) - 1
for name, color, c, s in parts:
    P, N, I = box(s[0] / 1000, s[2] / 1000, s[1] / 1000)
    vp = add(P, "<3f", 34962); vn = add(N, "<3f", 34962); vi = add(I, "<H", 34963)
    acc += [{"bufferView": vp, "componentType": 5126, "count": len(P), "type": "VEC3", "min": [min(p[k] for p in P) for k in range(3)], "max": [max(p[k] for p in P) for k in range(3)]},
            {"bufferView": vn, "componentType": 5126, "count": len(N), "type": "VEC3"}, {"bufferView": vi, "componentType": 5123, "count": len(I), "type": "SCALAR"}]
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    mats.append({"pbrMetallicRoughness": {"baseColorFactor": rgb + [1], "metallicFactor": 0.2, "roughnessFactor": 0.6}})
    meshes.append({"name": name.split(":")[0], "primitives": [{"attributes": {"POSITION": len(acc) - 3, "NORMAL": len(acc) - 2}, "indices": len(acc) - 1, "material": len(mats) - 1}]})
    body = len(nodes); nodes.append({"name": name.split(":")[0] + "_body", "mesh": len(meshes) - 1})
    nodes.append({"name": name, "children": [body], "translation": [c[0] / 1000, c[2] / 1000, -c[1] / 1000]})
root = {"name": "table", "children": [i for i, n in enumerate(nodes) if ":" in n["name"]]}; nodes.append(root)
while len(buf) % 4: buf += b"\0"
g = {"asset": {"version": "2.0", "generator": "viberich example"}, "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": meshes, "materials": mats,
     "accessors": acc, "bufferViews": views, "buffers": [{"byteLength": len(buf)}]}
j = json.dumps(g).encode(); j += b" " * ((4 - len(j) % 4) % 4)
out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(buf)) + struct.pack("<I4s", len(j), b"JSON") + j + struct.pack("<I4s", len(buf), b"BIN\0") + buf
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "table.glb"), "wb").write(out); print("table.glb", len(out), "bytes")
