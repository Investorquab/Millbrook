"""Generates the isometric Millbrook diorama as a static SVG (moodboard stand-in for the 3D scene)."""
import math, random, sys

random.seed(7)
W, H = 1600, 1000
TW, TH, ZH = 72, 36, 30
OX, OY = 800, 250

def iso(x, y, z=0.0):
    return (OX + (x - y) * TW / 2, OY + (x + y) * TH / 2 - z * ZH)

def hexc(c):
    c = c.lstrip('#'); return [int(c[i:i+2], 16) for i in (0, 2, 4)]
def shade(c, f):
    r, g, b = hexc(c)
    if f >= 0: r, g, b = [int(v + (255 - v) * f) for v in (r, g, b)]
    else: r, g, b = [int(v * (1 + f)) for v in (r, g, b)]
    return '#%02x%02x%02x' % (r, g, b)
def poly(pts, fill, extra=''):
    return '<polygon points="%s" fill="%s"%s/>' % (' '.join('%.1f,%.1f' % p for p in pts), fill, extra)

items = []  # (depth, svg)
def add(depth, svg): items.append((depth, svg))

def box(x, y, w, d, h, color, z0=0.0, depth=None):
    t = [iso(x, y, z0+h), iso(x+w, y, z0+h), iso(x+w, y+d, z0+h), iso(x, y+d, z0+h)]
    left = [iso(x, y+d, z0), iso(x+w, y+d, z0), iso(x+w, y+d, z0+h), iso(x, y+d, z0+h)]
    right = [iso(x+w, y, z0), iso(x+w, y+d, z0), iso(x+w, y+d, z0+h), iso(x+w, y, z0+h)]
    return poly(left, color) + poly(right, shade(color, -0.28)) + poly(t, shade(color, 0.18))

def gable(x, y, w, d, z1, rh, roof):
    ridge_a, ridge_b = iso(x, y+d/2, z1+rh), iso(x+w, y+d/2, z1+rh)
    back = [iso(x, y, z1), iso(x+w, y, z1), ridge_b, ridge_a]
    front = [iso(x, y+d, z1), iso(x+w, y+d, z1), ridge_b, ridge_a]
    end = [iso(x+w, y, z1), iso(x+w, y+d, z1), ridge_b]
    over = 0.0
    return poly(back, shade(roof, 0.12)) + poly(end, shade(roof, -0.35)) + poly(front, roof)

def window(x, y, z, face, lit=True):
    # small window on +y face (face='L') or +x face (face='R')
    c = '#F2C76B' if lit else '#3a3f46'
    if face == 'L':
        pts = [iso(x, y, z), iso(x+0.28, y, z), iso(x+0.28, y, z+0.32), iso(x, y, z+0.32)]
    else:
        pts = [iso(x, y, z), iso(x, y+0.28, z), iso(x, y+0.28, z+0.32), iso(x, y, z+0.32)]
    return poly(pts, c)

def door(x, y, face, color='#4a3424'):
    if face == 'L':
        pts = [iso(x, y, 0), iso(x+0.3, y, 0), iso(x+0.3, y, 0.5), iso(x, y, 0.5)]
    else:
        pts = [iso(x, y, 0), iso(x, y+0.3, 0), iso(x, y+0.3, 0.5), iso(x, y, 0.5)]
    return poly(pts, color)

def building(x, y, w, d, h, wall, roof, rh=0.7, chimney=False, smoke=False, lit=True, sign=None, extra=''):
    s = box(x, y, w, d, h, wall)
    # windows on both visible faces
    for i in range(int(w // 0.7)):
        s += window(x + 0.25 + i * 0.7, y + d, h * 0.45, 'L', lit and (i % 2 == 0))
    for j in range(int(d // 0.7)):
        s += window(x + w, y + 0.25 + j * 0.7, h * 0.45, 'R', lit and (j % 2 == 1))
    s += door(x + w * 0.5 - 0.15, y + d, 'L')
    s += gable(x, y, w, d, h, rh, roof)
    if chimney:
        cx, cy = x + w * 0.75, y + d * 0.3
        s += box(cx, cy, 0.25, 0.25, 0.9, '#7b6f63', z0=h + 0.2)
        if smoke:
            sx, sy = iso(cx + 0.12, cy + 0.12, h + 1.25)
            for k, (dx, dy, r, o) in enumerate([(0, -8, 9, .55), (6, -24, 12, .45), (14, -44, 15, .35), (24, -68, 18, .25)]):
                s += '<circle cx="%.1f" cy="%.1f" r="%d" fill="#cfcac2" fill-opacity="%.2f"/>' % (sx + dx, sy + dy, r, o)
    if sign:
        sx, sy = iso(x + w * 0.5, y + d, h * 0.9)
        s += '<rect x="%.1f" y="%.1f" width="26" height="12" rx="2" fill="%s"/>' % (sx - 13, sy - 6, sign)
    return s + extra

def tree(x, y, size=1.0, color='#4f7a45'):
    bx, by = iso(x, y, 0)
    s = '<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="#000" fill-opacity="0.18"/>' % (bx, by + 2, 14 * size, 6 * size)
    s += '<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#5a4030"/>' % (bx - 2.5 * size, by - 16 * size, 5 * size, 16 * size)
    s += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (bx, by - 26 * size, 15 * size, color)
    s += '<path d="M%.1f %.1f a%.1f %.1f 0 0 1 0 %.1f a%.1f %.1f 0 0 0 0 -%.1f z" fill="%s"/>' % (bx, by - 41 * size, 15 * size, 15 * size, 30 * size, 9 * size, 15 * size, 30 * size, shade(color, -0.25))
    s += '<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>' % (bx - 5 * size, by - 31 * size, 5 * size, shade(color, 0.2))
    return s

def person(x, y, shirt, skin='#c58c5c', hat=None, apron=None):
    bx, by = iso(x, y, 0)
    s = '<ellipse cx="%.1f" cy="%.1f" rx="6" ry="2.5" fill="#000" fill-opacity="0.25"/>' % (bx, by)
    s += '<rect x="%.1f" y="%.1f" width="7" height="6" rx="1.5" fill="#3b3a40"/>' % (bx - 3.5, by - 6)
    s += '<rect x="%.1f" y="%.1f" width="9" height="10" rx="3" fill="%s"/>' % (bx - 4.5, by - 15, shirt)
    if apron:
        s += '<rect x="%.1f" y="%.1f" width="6" height="7" rx="1" fill="%s"/>' % (bx - 3, by - 11, apron)
    s += '<circle cx="%.1f" cy="%.1f" r="3.6" fill="%s"/>' % (bx, by - 18.5, skin)
    if hat == 'top':
        s += '<rect x="%.1f" y="%.1f" width="6" height="7" fill="#1f1d22"/><rect x="%.1f" y="%.1f" width="9" height="1.6" fill="#1f1d22"/>' % (bx - 3, by - 28, bx - 4.5, by - 21.6)
    elif hat == 'toque':
        s += '<ellipse cx="%.1f" cy="%.1f" rx="4.2" ry="3" fill="#f4f1ea"/>' % (bx, by - 22.5)
    elif hat == 'cap':
        s += '<path d="M%.1f %.1f h8 l-1 -3 h-6 z" fill="#4a5a68"/>' % (bx - 4, by - 20.5)
    return s

def lamp(x, y):
    bx, by = iso(x, y, 0)
    return ('<circle cx="%.1f" cy="%.1f" r="16" fill="#F2C76B" fill-opacity="0.18"/>' % (bx, by - 26) +
            '<rect x="%.1f" y="%.1f" width="2.4" height="26" fill="#2b2b30"/>' % (bx - 1.2, by - 26) +
            '<circle cx="%.1f" cy="%.1f" r="3.4" fill="#F7D98C"/>' % (bx, by - 27))

out = []
out.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H))
out.append('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27384a"/><stop offset="0.55" stop-color="#4d5f72"/><stop offset="1" stop-color="#b98a68"/></linearGradient>'
           '<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#f2c76b" stop-opacity="0.35"/><stop offset="1" stop-color="#f2c76b" stop-opacity="0"/></radialGradient></defs>')
out.append('<rect width="%d" height="%d" fill="url(#sky)"/>' % (W, H))
out.append('<ellipse cx="800" cy="560" rx="760" ry="330" fill="url(#glow)"/>')

N = 14
# diorama base (table plinth)
base_h = 1.1
top = [iso(0, 0), iso(N, 0), iso(N, N), iso(0, N)]
leftface = [iso(0, N), iso(N, N), iso(N, N, -base_h), iso(0, N, -base_h)]
rightface = [iso(N, 0), iso(N, N), iso(N, N, -base_h), iso(N, 0, -base_h)]
sx, sy = iso(N, N, -base_h)
out.append('<ellipse cx="%.1f" cy="%.1f" rx="470" ry="56" fill="#000" fill-opacity="0.22"/>' % (sx, sy + 10))
out.append(poly(leftface, '#5b4433') + poly(rightface, '#3f2f24'))
# strata line
out.append(poly([iso(0, N, -0.25), iso(N, N, -0.25), iso(N, N, -0.35), iso(0, N, -0.35)], '#7a5c43'))
out.append(poly([iso(N, 0, -0.25), iso(N, N, -0.25), iso(N, N, -0.35), iso(N, 0, -0.35)], '#56412f'))
out.append(poly(top, '#6f9150'))
# grass patches
for i in range(70):
    gx, gy = random.uniform(0.3, N - 0.3), random.uniform(0.3, N - 0.3)
    px, py = iso(gx, gy)
    out.append('<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" fill-opacity="0.5"/>' % (px, py, random.uniform(10, 26), random.uniform(4, 9), random.choice(['#7da35b', '#628548', '#86ab62'])))
# river along x at y 9.2..10.3
out.append(poly([iso(0, 9.2), iso(N, 9.2), iso(N, 10.3), iso(0, 10.3)], '#4e7f8c'))
out.append(poly([iso(0, 9.45), iso(N, 9.45), iso(N, 9.6), iso(0, 9.6)], '#7fb0ba', ' fill-opacity="0.6"'))
out.append(poly([iso(0, 9.9), iso(N, 9.9), iso(N, 10.0), iso(0, 10.0)], '#7fb0ba', ' fill-opacity="0.45"'))
# river cut into plinth edge
out.append(poly([iso(N, 9.2), iso(N, 10.3), iso(N, 10.3, -0.5), iso(N, 9.2, -0.5)], '#3d6670'))
# roads: main street along y at x 6..6.8, cross street along x at y 5..5.7
road = '#b79a74'
out.append(poly([iso(6, 0), iso(6.8, 0), iso(6.8, 9.2), iso(6, 9.2)], road))
out.append(poly([iso(6, 10.3), iso(6.8, 10.3), iso(6.8, N), iso(6, N)], road))
out.append(poly([iso(0, 5), iso(N, 5), iso(N, 5.7), iso(0, 5.7)], road))
# market square
out.append(poly([iso(4.8, 4), iso(8.2, 4), iso(8.2, 7), iso(4.8, 7)], '#c2a987'))
for i in range(5):
    for j in range(4):
        out.append(poly([iso(4.9 + i * 0.66, 4.1 + j * 0.72), iso(5.45 + i * 0.66, 4.1 + j * 0.72), iso(5.45 + i * 0.66, 4.7 + j * 0.72), iso(4.9 + i * 0.66, 4.7 + j * 0.72)], '#cbb594', ' fill-opacity="0.8"'))
# bridge
add(6.4 + 9.75, box(5.8, 9.0, 1.2, 1.5, 0.18, '#8a6a4c'))
# co-op wheat fields
for r in range(9):
    out.append(poly([iso(0.5, 11 + r * 0.3), iso(4.6, 11 + r * 0.3), iso(4.6, 11.18 + r * 0.3), iso(0.5, 11.18 + r * 0.3)], '#d9a441' if r % 2 == 0 else '#c7913a'))

# buildings (x, y, w, d, h, wall, roof)
add(1 + 3.2 + 0.1, building(1.0, 1.0, 1.8, 1.6, 1.0, '#c9b9a0', '#9e3b3b', chimney=True))            # house
add(3.2 + 3.6, building(3.0, 2.0, 2.0, 1.6, 1.3, '#d8c7a6', '#9e3b3b', chimney=True, smoke=True, sign='#d9a441'))  # bakery
add(4.8 + 7.8, building(3.0, 6.2, 1.8, 1.6, 1.1, '#6d655d', '#4f5d6b', chimney=True, smoke=True, sign='#5e8c93',
                         extra=''))  # smithy
add(10.4 + 3.0, building(8.2, 1.0, 2.4, 2.0, 2.0, '#cfc3ad', '#4f5d6b', rh=0.9))                    # town hall
add(11.0 + 7.5, building(9.2, 6.0, 2.0, 1.5, 1.2, '#c4b79c', '#5f7f4f', sign='#6e9b5a'))           # weaver
add(13.3 + 4.8, building(11.5, 3.0, 1.8, 1.8, 1.4, '#b89f80', '#c9a55a', chimney=True, sign='#b23a48'))  # brewery
add(13.6 + 1.6, building(12.0, 0.4, 1.4, 1.2, 0.9, '#cbbfa8', '#9e3b3b'))                          # house
add(6.6 + 1.4, building(5.0, 0.3, 1.4, 1.1, 0.9, '#d2c4ad', '#5f7f4f'))                            # house
add(2.6 + 8.6, building(1.0, 7.4, 1.4, 1.2, 0.9, '#cdbfa6', '#9e3b3b'))                            # house
add(13.6 + 7.6, building(12.2, 6.6, 1.4, 1.0, 0.9, '#d0c2a8', '#4f5d6b'))                          # house
add(7.2 + 12.2, building(7.2, 11.0, 1.3, 1.2, 0.9, '#cbbda4', '#9e3b3b'))                          # south house
add(9.0 + 12.4, building(8.9, 11.2, 1.3, 1.2, 0.9, '#d4c6ad', '#5f7f4f'))                          # south house
add(6.2 + 12.4, building(4.6, 11.0, 1.6, 1.4, 1.2, '#8e5a3c', '#7a3a30', rh=0.8))                  # barn
# town hall tower with pyramid roof and clock
tx0, ty0, tw, tz0, th = 9.0, 1.9, 0.7, 2.0, 1.7
tower = box(tx0, ty0, tw, tw, th, '#cfc3ad', z0=tz0)
apex = iso(tx0 + tw/2, ty0 + tw/2, tz0 + th + 0.9)
tower += poly([iso(tx0, ty0 + tw, tz0 + th), iso(tx0 + tw, ty0 + tw, tz0 + th), apex], '#4f5d6b')
tower += poly([iso(tx0 + tw, ty0, tz0 + th), iso(tx0 + tw, ty0 + tw, tz0 + th), apex], '#39434e')
ccx, ccy = iso(tx0 + tw/2, ty0 + tw, tz0 + th*0.62)
tower += '<circle cx="%.1f" cy="%.1f" r="7" fill="#f4ecd9"/><path d="M%.1f %.1f v-5 M%.1f %.1f h4" stroke="#2f3640" stroke-width="1.4"/>' % (ccx, ccy, ccx, ccy, ccx, ccy)
add(10.9 + 2.9, tower)
# mine: faceted rocky mound
hx, hy = iso(12.9, 12.9)
add(12.9 + 12.9, '<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#857b6e"/>' % (hx - 78, hy + 14, hx - 26, hy - 78, hx + 6, hy - 64, hx - 4, hy + 30) +
    '<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#62594f"/>' % (hx - 4, hy + 30, hx + 6, hy - 64, hx + 46, hy - 40, hx + 80, hy + 12) +
    '<polygon points="%.1f,%.1f %.1f,%.1f %.1f,%.1f" fill="#9a907f"/>' % (hx - 26, hy - 78, hx + 6, hy - 64, hx - 12, hy - 40) +
    '<path d="M%.1f %.1f q16 -30 32 0 z" fill="#1e1b1a"/>' % (hx - 40, hy + 14) +
    '<rect x="%.1f" y="%.1f" width="34" height="4" fill="#8a6a4c"/>' % (hx - 41, hy + 12) +
    box(13.2, 11.7, 0.35, 0.3, 0.25, '#5a4030'))
# well
wx, wy = iso(6.4, 5.4)
add(6.4 + 5.4 + 0.5, '<ellipse cx="%.1f" cy="%.1f" rx="15" ry="7" fill="#7b6f63"/><ellipse cx="%.1f" cy="%.1f" rx="10" ry="4.5" fill="#2e4a52"/><rect x="%.1f" y="%.1f" width="3" height="20" fill="#5a4030"/><rect x="%.1f" y="%.1f" width="3" height="20" fill="#5a4030"/><path d="M%.1f %.1f l17 -9 l17 9 z" fill="#9e3b3b"/>' % (wx, wy, wx, wy - 1, wx - 13, wy - 20, wx + 10, wy - 20, wx - 17, wy - 19))
# market stalls
for k, (mx, my, c) in enumerate([(7.4, 4.3, '#b23a48'), (7.5, 6.2, '#5e8c93'), (5.0, 6.3, '#d9a441')]):
    add(mx + my + 0.6, box(mx, my, 0.6, 0.45, 0.35, '#8a6a4c') + gable(mx - 0.05, my - 0.05, 0.7, 0.55, 0.65, 0.22, c) +
        ''.join(box(mx + 0.05 + t * 0.25, my + 0.42, 0.04, 0.04, 0.65, '#5a4030') for t in range(2)))
# trees
for (tx, ty, sz) in [(0.4, 4.4, 1.0), (0.6, 6.4, .9), (2.6, 4.6, .8), (13.2, 2.4, 1.0), (10.8, 4.9, .85), (13.4, 8.4, .9), (0.5, 8.6, .9),
                     (11.2, 0.4, .8), (3.3, 0.5, .9), (13.1, 11.0, .9), (5.6, 13.4, .9), (9.6, 13.5, .85), (0.6, 13.6, .8), (7.8, 8.4, .75)]:
    add(tx + ty + 0.3, tree(tx, ty, sz, random.choice(['#4f7a45', '#5b8a4c', '#456d3d'])))
# lamps
for (lx, ly) in [(5.9, 3.8), (8.3, 4.0), (5.9, 7.2), (8.3, 7.1), (6.9, 10.6)]:
    add(lx + ly + 0.2, lamp(lx, ly))
# people (residents)
skins = ['#c58c5c', '#8d5a3b', '#e0b28a', '#a86b45', '#6b4329', '#d9a07a']
people = [
    (5.4, 4.8, '#d8c7a6', 'toque', '#f4f1ea'), (5.9, 5.3, '#5e8c93', None, None), (7.1, 5.0, '#6e9b5a', None, None),
    (7.7, 5.9, '#b23a48', None, None), (5.2, 6.4, '#c9a55a', 'cap', None), (6.4, 3.2, '#4f5d6b', None, '#8a6a4c'),
    (6.3, 1.8, '#6e9b5a', None, None), (6.5, 8.2, '#7a3a30', None, None), (4.2, 5.4, '#5e8c93', None, None),
    (9.2, 5.35, '#d9a441', None, None), (10.6, 5.3, '#4f5d6b', 'cap', None), (2.3, 5.3, '#b23a48', None, None),
    (6.4, 11.4, '#6e9b5a', None, None), (6.6, 12.8, '#c9a55a', None, None), (3.0, 12.2, '#7a3a30', 'cap', None),
    (4.1, 12.9, '#4f5d6b', None, None), (7.9, 6.6, '#1f1d22', 'top', None), (12.2, 5.4, '#b23a48', None, None),
    (3.6, 8.1, '#6d655d', None, '#8a6a4c'), (8.9, 3.4, '#5f7f4f', None, None),
]
for i, (px, py, sh, hat, ap) in enumerate(people):
    add(px + py + 0.1, person(px, py, sh, skins[i % len(skins)], hat, ap))

# the bold element: coins flowing from a resident (5.4,4.8) to the bakery door
ax, ay = iso(9.2, 5.35, 0.75)
bx, by = iso(4.15, 3.6, 0.45)
mx, my = (ax + bx) / 2, min(ay, by) - 95
coins = ''
for t in [0.08, 0.22, 0.36, 0.5, 0.64, 0.78, 0.9]:
    cx = (1 - t) ** 2 * ax + 2 * (1 - t) * t * mx + t ** 2 * bx
    cy = (1 - t) ** 2 * ay + 2 * (1 - t) * t * my + t ** 2 * by
    o = 0.45 + 0.55 * t
    coins += '<circle cx="%.1f" cy="%.1f" r="10" fill="#f7d98c" fill-opacity="%.2f"/><circle cx="%.1f" cy="%.1f" r="7.5" fill="#d9a441" fill-opacity="%.2f"/><circle cx="%.1f" cy="%.1f" r="3" fill="#a8761f" fill-opacity="%.2f"/>' % (cx, cy, o * 0.5, cx, cy, o, cx - 1, cy - 1, o)
add(99, coins)

for _, s in sorted(items, key=lambda t: t[0]):
    out.append(s)
out.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(out))
print('ok')
