import math, os, json, sys
GREEN = "#A7C080"
BG = (0x33, 0x3C, 0x43)
ANVIL_D = "M17,18L17,18.223L18.357,20.486C18.543,20.794 18.548,21.179 18.37,21.493C18.193,21.806 17.86,22 17.5,22L8.5,22C8.14,22 7.807,21.806 7.63,21.493C7.452,21.179 7.457,20.794 7.643,20.486L9,18.223L9,18C7.299,18 5.193,17.379 3.778,16.277C2.69,15.43 2,14.308 2,13C2,12.448 2.448,12 3,12L21,12C21.552,12 22,12.448 22,13L22,14C22,14.927 21.517,15.813 20.732,16.513C19.715,17.419 18.2,18 17,18Z"

def bez(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n; u = 1 - t
        pts.append((u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                    u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]))
    return pts

R = 1.0  # half of the 2 px stroke
def circle(c):
    x, y = c
    return f"M{x-R:.4f},{y:.4f}a{R},{R} 0 1,0 {2*R},0a{R},{R} 0 1,0 {-2*R},0Z"

def quad(a, b):
    dx, dy = b[0]-a[0], b[1]-a[1]
    L = math.hypot(dx, dy)
    if L == 0: return ""
    nx, ny = -dy/L*R, dx/L*R
    pts = [(a[0]+nx, a[1]+ny), (b[0]+nx, b[1]+ny), (b[0]-nx, b[1]-ny), (a[0]-nx, a[1]-ny)]
    # the circles above wind one way; make every quad wind the same way (nonzero fill then draws the union)
    area = sum(pts[i][0]*pts[(i+1)%4][1] - pts[(i+1)%4][0]*pts[i][1] for i in range(4))
    if area > 0: pts.reverse()
    return "M" + "L".join(f"{x:.4f},{y:.4f}" for x, y in pts) + "Z"

def stroke_outline(polyline):
    out = []
    for i in range(len(polyline)):
        out.append(circle(polyline[i]))
        if i: out.append(quad(polyline[i-1], polyline[i]))
    return "".join(out)

def quill_polylines():
    c1 = bez((6,9), (5,5), (15.5,3.7), (21,3), 400)
    c2 = bez((21,3), (19.3,8.5), (10,11.5), (7,9), 400)
    line = [(3, 10), (14, 6.5)]  # one capsule: a single quad and two round caps
    return [c1 + c2[1:], line]

def layer_svg(body_attr, content, scale, extra=""):
    s = 1024 * scale / 24
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">'
            f'<g transform="translate(512 512) scale({s:.6f}) translate(-12 -12)"{extra}>{content}</g></svg>\n')

def anvil_svg(scale):
    return layer_svg("", f'<path d="{ANVIL_D}" fill="{GREEN}" fill-rule="evenodd"/>', scale)

def quill_svg(scale):
    d = "".join(stroke_outline(p) for p in quill_polylines())
    return layer_svg("", f'<path d="{d}" fill="{GREEN}" fill-rule="nonzero"/>', scale)

def reference_svg(scale):  # the artwork as drawn (strokes), for comparing the converted quill against
    s = 1024 * scale / 24
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#333C43"/>'
            f'<g transform="translate(512 512) scale({s:.6f}) translate(-12 -12)" stroke-linecap="round" stroke-linejoin="round"><path d="{ANVIL_D}" fill="{GREEN}" fill-rule="evenodd"/>'
            f'<path d="M6,9C5,5 15.5,3.7 21,3C19.3,8.5 10,11.5 7,9" fill="none" stroke="{GREEN}" stroke-width="2"/><path d="M3,10L14,6.5" fill="none" stroke="{GREEN}" stroke-width="2"/></g></svg>')

def icon_json():
    # The document's fill is the background (#333C43, srgb); two layers.
    r, g, b = (v / 255 for v in BG)
    return {
        "fill": {"solid": f"srgb:{r:.5f},{g:.5f},{b:.5f},1.00000"},
        "groups": [{
            "layers": [
                {"image-name": "quill.svg", "name": "quill", "glass": True},
                {"image-name": "anvil.svg", "name": "anvil", "glass": True},
            ],
            "shadow": {"kind": "neutral", "opacity": 0.5},
            "translucency": {"enabled": True, "value": 0.5},
        }],
        "supported-platforms": {"squares": ["macOS"]},
    }

if __name__ == "__main__":
    out = sys.argv[1]
    for name, scale in (("A", 1.0), ("B", 0.70 / (20/24)), ("C", 0.60 / (20/24))):
        d = os.path.join(out, name, "storyForge.icon")
        os.makedirs(os.path.join(d, "Assets"), exist_ok=True)
        open(os.path.join(d, "Assets", "anvil.svg"), "w").write(anvil_svg(scale))
        open(os.path.join(d, "Assets", "quill.svg"), "w").write(quill_svg(scale))
        open(os.path.join(d, "icon.json"), "w").write(json.dumps(icon_json(), indent=2) + "\n")
        open(os.path.join(out, name, "reference.svg"), "w").write(reference_svg(scale))
        print(name, "scale", round(scale, 4), "content share", round(scale * 20 / 24, 3))
