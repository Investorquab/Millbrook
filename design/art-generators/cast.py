"""Generates original low-poly character art for the Millbrook cast (full body + portrait SVGs)."""
import sys, os

def hexc(c):
    c = c.lstrip('#'); return [int(c[i:i+2], 16) for i in (0, 2, 4)]
def shade(c, f):
    r, g, b = hexc(c)
    if f >= 0: r, g, b = [int(v + (255 - v) * f) for v in (r, g, b)]
    else: r, g, b = [int(v * (1 + f)) for v in (r, g, b)]
    return '#%02x%02x%02x' % (r, g, b)
def P(pts, fill, extra=''):
    return '<polygon points="%s" fill="%s"%s/>' % (' '.join('%g,%g' % p for p in pts), fill, extra)

CAST = {
    'ada':  dict(skin='#c58c5c', hair='#3a2418', hstyle='bun',   shirt='#d8c7a6', pants='#4a4a52', apron='#f1ece2', hat='toque',   prop='loaf'),
    'ike':  dict(skin='#6b4329', hair='#1d1715', hstyle='short', shirt='#6d655d', pants='#3b3a40', apron='#7a4b2e', hat='band',    prop='hammer'),
    'tom':  dict(skin='#e0b28a', hair='#b8612f', hstyle='curly', shirt='#5e8c93', pants='#4a4a52', apron=None,      hat=None,      prop='spool'),
    'mara': dict(skin='#a86b45', hair='#2b1d16', hstyle='long',  shirt='#c9a55a', pants='#5a4030', apron='#7b6f63', hat=None,      prop='mug'),
    'gus':  dict(skin='#d9a07a', hair='#6b6b6b', hstyle='short', shirt='#b23a48', pants='#26252b', apron=None,      hat='top',     prop='purse', coat='#2b2b33', tache=True),
    'fern': dict(skin='#8d5a3b', hair='#c9c2b6', hstyle='bun',   shirt='#6e9b5a', pants='#4f5d6b', apron=None,      hat=None,      prop='basket', shawl='#4f7a45'),
    'sam':  dict(skin='#c58c5c', hair='#5a4030', hstyle='short', shirt='#7b6f63', pants='#4f5d6b', apron=None,      hat='cap',     prop='ledger', beard=True),
    'rita': dict(skin='#6b4329', hair='#1d1715', hstyle='short', shirt='#f2c76b', pants='#2f3640', apron=None,      hat=None,      prop='scroll', coat='#e0703a', streak='#b23a48'),
}

def figure(c):
    s = []
    s.append('<ellipse cx="80" cy="226" rx="40" ry="7" fill="#000" fill-opacity="0.22"/>')
    # long hair behind
    if c['hstyle'] == 'long':
        s.append(P([(50, 50), (110, 50), (116, 120), (44, 120)], shade(c['hair'], -0.1)))
    # legs + shoes
    s.append('<rect x="60" y="166" width="18" height="54" rx="6" fill="%s"/>' % c['pants'])
    s.append('<rect x="82" y="166" width="18" height="54" rx="6" fill="%s"/>' % shade(c['pants'], -0.25))
    s.append('<ellipse cx="67" cy="221" rx="13" ry="6" fill="#2a211c"/><ellipse cx="93" cy="221" rx="13" ry="6" fill="#1f1814"/>')
    # coat behind torso
    if c.get('coat'):
        s.append(P([(48, 96), (112, 96), (122, 200), (38, 200)], c['coat']))
        s.append(P([(80, 96), (112, 96), (122, 200), (80, 200)], shade(c['coat'], -0.25)))
    # arms
    sl = c.get('coat') or c['shirt']
    s.append(P([(54, 98), (42, 104), (36, 160), (49, 163), (56, 122)], sl))
    s.append(P([(106, 98), (118, 104), (124, 160), (111, 163), (104, 122)], shade(sl, -0.28)))
    # torso
    s.append(P([(52, 94), (108, 94), (112, 172), (48, 172)], c['shirt']))
    s.append(P([(80, 94), (108, 94), (112, 172), (80, 172)], shade(c['shirt'], -0.22)))
    if c.get('coat'):
        s.append(P([(52, 94), (66, 94), (70, 172), (48, 172)], c['coat']))
        s.append(P([(94, 94), (108, 94), (112, 172), (90, 172)], shade(c['coat'], -0.25)))
    if c.get('apron'):
        a = c['apron']
        s.append(P([(66, 100), (94, 100), (96, 120), (64, 120)], a))
        s.append(P([(58, 120), (102, 120), (106, 182), (54, 182)], a))
        s.append(P([(80, 120), (102, 120), (106, 182), (80, 182)], shade(a, -0.15)))
        s.append('<rect x="72" y="140" width="16" height="12" rx="2" fill="%s"/>' % shade(a, -0.25))
    if c.get('shawl'):
        sh = c['shawl']
        s.append(P([(46, 94), (114, 94), (100, 132), (80, 146), (60, 132)], sh))
        s.append(P([(80, 94), (114, 94), (100, 132), (80, 146)], shade(sh, -0.25)))
    # hands
    s.append('<circle cx="43" cy="165" r="7" fill="%s"/><circle cx="117" cy="165" r="7" fill="%s"/>' % (c['skin'], shade(c['skin'], -0.2)))
    # neck
    s.append('<rect x="72" y="80" width="16" height="16" fill="%s"/>' % shade(c['skin'], -0.15))
    # head (octagon, faceted)
    cx, cy, r = 80, 58, 27
    oct_ = [(cx - 11, cy - r), (cx + 11, cy - r), (cx + r, cy - 11), (cx + r - 2, cy + 12), (cx + 11, cy + r), (cx - 11, cy + r), (cx - r + 2, cy + 12), (cx - r, cy - 11)]
    s.append('<circle cx="52" cy="60" r="5" fill="%s"/><circle cx="108" cy="60" r="5" fill="%s"/>' % (c['skin'], shade(c['skin'], -0.25)))
    s.append(P(oct_, c['skin']))
    s.append(P([(cx, cy - r), (cx + 11, cy - r), (cx + r, cy - 11), (cx + r - 2, cy + 12), (cx + 11, cy + r), (cx, cy + r)], shade(c['skin'], -0.14)))
    # face
    s.append('<ellipse cx="70" cy="60" rx="3" ry="3.6" fill="#1f1a18"/><ellipse cx="90" cy="60" rx="3" ry="3.6" fill="#1f1a18"/>')
    s.append('<circle cx="71" cy="58.8" r="1" fill="#fff"/><circle cx="91" cy="58.8" r="1" fill="#fff"/>')
    s.append('<path d="M65 52 q5 -3 10 0 M85 52 q5 -3 10 0" stroke="%s" stroke-width="2.4" fill="none" stroke-linecap="round"/>' % shade(c['hair'], -0.2))
    s.append('<circle cx="65" cy="69" r="4" fill="#d96c5a" fill-opacity="0.25"/><circle cx="95" cy="69" r="4" fill="#d96c5a" fill-opacity="0.25"/>')
    if c.get('tache'):
        s.append('<path d="M70 72 q10 -6 20 0 q-10 4 -20 0z" fill="%s"/>' % c['hair'])
        s.append('<path d="M75 78 q5 3 10 0" stroke="#5a2a20" stroke-width="2" fill="none" stroke-linecap="round"/>')
    elif c.get('beard'):
        s.append(P([(60, 66), (100, 66), (94, 84), (80, 90), (66, 84)], c['hair']))
        s.append('<path d="M74 74 q6 3 12 0" stroke="#3a2418" stroke-width="2" fill="none" stroke-linecap="round"/>')
    else:
        s.append('<path d="M73 73 q7 5 14 0" stroke="#5a2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>')
    # hair
    hs, h = c['hstyle'], c['hair']
    if hs in ('short', 'long', 'bun'):
        s.append(P([(53, 50), (60, 34), (80, 28), (100, 34), (107, 50), (96, 42), (80, 40), (64, 42)], h))
        s.append(P([(80, 28), (100, 34), (107, 50), (96, 42), (80, 40)], shade(h, -0.2)))
    if hs == 'bun':
        s.append('<circle cx="80" cy="26" r="10" fill="%s"/><path d="M80 16 a10 10 0 0 1 0 20z" fill="%s"/>' % (h, shade(h, -0.2)))
    if hs == 'curly':
        for (x, y, rr) in [(58, 44, 9), (68, 34, 10), (80, 30, 11), (92, 34, 10), (102, 44, 9), (55, 56, 6), (105, 56, 6)]:
            s.append('<circle cx="%d" cy="%d" r="%d" fill="%s"/>' % (x, y, rr, h if x <= 80 else shade(h, -0.2)))
    if c.get('streak'):
        s.append(P([(70, 38), (80, 32), (84, 40), (74, 44)], c['streak']))
    # hats
    hat = c.get('hat')
    if hat == 'toque':
        s.append('<rect x="60" y="30" width="40" height="10" rx="2" fill="#e6e0d4"/>')
        for (x, y, rr) in [(64, 22, 11), (80, 16, 13), (96, 22, 11)]:
            s.append('<circle cx="%d" cy="%d" r="%d" fill="%s"/>' % (x, y, rr, '#f4f1ea' if x <= 80 else '#dcd5c8'))
    elif hat == 'top':
        s.append('<rect x="52" y="34" width="56" height="7" rx="2" fill="#1a191e"/>')
        s.append(P([(62, 34), (98, 34), (96, -2), (64, -2)], '#24232a'))
        s.append(P([(80, 34), (98, 34), (96, -2), (80, -2)], '#18171c'))
        s.append('<rect x="63" y="26" width="34" height="6" fill="%s"/>' % c['shirt'])
    elif hat == 'cap':
        s.append(P([(54, 44), (60, 30), (100, 30), (108, 42)], '#4a5a68'))
        s.append(P([(54, 44), (108, 42), (114, 46), (52, 48)], '#3a4753'))
    elif hat == 'band':
        s.append('<rect x="53" y="42" width="54" height="7" fill="#b23a48"/><rect x="80" y="42" width="27" height="7" fill="#8e2d39"/>')
    # props in right hand (viewer's right)
    p = c['prop']
    if p == 'loaf':
        s.append('<ellipse cx="124" cy="158" rx="18" ry="10" fill="#c98a3c"/><ellipse cx="124" cy="155" rx="15" ry="6" fill="#dca457"/><path d="M114 154 l5 -4 M122 155 l5 -4 M130 156 l5 -4" stroke="#9a6328" stroke-width="2"/>')
    elif p == 'hammer':
        s.append('<rect x="114" y="128" width="6" height="44" rx="2" fill="#8a6a4c" transform="rotate(18 117 165)"/><rect x="112" y="118" width="26" height="12" rx="2" fill="#5d636b" transform="rotate(18 117 165)"/>')
    elif p == 'spool':
        s.append('<rect x="110" y="148" width="22" height="22" rx="3" fill="#5e8c93"/><rect x="108" y="146" width="26" height="4" fill="#8a6a4c"/><rect x="108" y="168" width="26" height="4" fill="#8a6a4c"/><path d="M110 154 h22 M110 160 h22" stroke="#8fb8c0" stroke-width="2"/>')
    elif p == 'mug':
        s.append('<rect x="110" y="146" width="20" height="24" rx="3" fill="#8a6a4c"/><path d="M130 151 h5 a5 5 0 0 1 0 12 h-5" stroke="#8a6a4c" stroke-width="3" fill="none"/><ellipse cx="120" cy="146" rx="11" ry="5" fill="#f4ecd9"/>')
    elif p == 'purse':
        s.append('<path d="M108 156 q12 -10 24 0 q2 18 -12 18 q-14 0 -12 -18z" fill="#7a5a2a"/><circle cx="120" cy="150" r="4" fill="#d9a441"/><circle cx="127" cy="146" r="3.5" fill="#f2c76b"/>')
    elif p == 'basket':
        s.append('<path d="M106 156 h30 l-4 18 h-22z" fill="#a67c4e"/><path d="M110 156 q11 -16 22 0" stroke="#8a6a4c" stroke-width="3" fill="none"/><ellipse cx="114" cy="155" rx="6" ry="4" fill="#dca457"/><ellipse cx="126" cy="154" rx="6" ry="4" fill="#c98a3c"/>')
    elif p == 'ledger':
        s.append('<rect x="108" y="142" width="24" height="30" rx="2" fill="#4f5d6b"/><rect x="112" y="146" width="16" height="22" fill="#e6e0d4"/><path d="M114 152 h12 M114 157 h12 M114 162 h8" stroke="#7b6f63" stroke-width="1.5"/>')
    elif p == 'scroll':
        s.append('<rect x="106" y="148" width="34" height="16" rx="8" fill="#e6e0d4"/><circle cx="108" cy="156" r="8" fill="#cfc6b6"/><path d="M114 152 h20 M114 156 h16 M114 160 h18" stroke="#5e8c93" stroke-width="1.5"/>')
    return '\n'.join(s)

outdir = sys.argv[1]
for name, c in CAST.items():
    body = figure(c)
    open(os.path.join(outdir, 'char-%s.svg' % name), 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 160 248" width="160" height="248">\n%s\n</svg>' % body)
    open(os.path.join(outdir, 'face-%s.svg' % name), 'w').write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 -6 120 120" width="120" height="120">\n'
        '<rect x="20" y="-6" width="120" height="120" fill="#3c4652"/>\n<circle cx="80" cy="140" r="78" fill="#4a5664"/>\n%s\n</svg>' % body)
print('ok')
