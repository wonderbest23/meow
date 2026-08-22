# -*- coding: utf-8 -*-
"""
Figma MCP 가 내준 React+Tailwind 코드(절대 좌표) → 우리 렌더러용 트리 JSON.

  python3 scripts/brainwave-convert.py <raw.tsx> <pageId> <outDir>

출력:
  <outDir>/<pageId>.json          트리 {w,h,nodes:[...]}
  public/brainwave/<pageId>/*.png|svg   자산(7일 뒤 만료되는 Figma 주소를 내려받아 둔다)

Tailwind 의 임의값 클래스만 쓰였다(left-[245px], inset-[a_b_c_d], bg-[#..] …).
여기서 다루지 않는 클래스가 나오면 'unknown' 으로 모아 마지막에 출력한다 —
조용히 버리면 그 자리가 어긋나는데 아무도 모른다.
"""
import sys, re, json, os, subprocess, html
from html.parser import HTMLParser

raw_path, page_id, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(raw_path, encoding="utf-8").read()

# ── 1. 자산 상수 ───────────────────────────────────────────────
assets = dict(re.findall(r'const (\w+) = "(https://www\.figma\.com/api/mcp/asset/[^"]+)";', src))
asset_dir = os.path.join("public", "brainwave", page_id)
os.makedirs(asset_dir, exist_ok=True)
local = {}
def compress(fn):
    """큰 PNG 사진 → JPEG(≤1800px). 로고·아이콘(작은 PNG)은 그대로 둔다. 성공하면 새 경로."""
    if not fn.endswith(".png") or os.path.getsize(fn) <= 600_000:
        return fn
    jfn = fn[:-4] + ".jpg"
    r = subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1800", fn, "--out", jfn], capture_output=True, text=True)
    if r.returncode == 0 and os.path.exists(jfn) and os.path.getsize(jfn) > 0:
        os.remove(fn)
        return jfn
    print("WARN sips failed for %s: %s" % (fn, r.stderr.strip()[-120:]), file=sys.stderr)
    return fn
for name, url in assets.items():
    ext = ".svg" if url.endswith(".svg") else ".png"
    fn = os.path.join(asset_dir, name + ext)
    jfn = os.path.join(asset_dir, name + ".jpg")
    # 이미 JPEG 로 바꿔 둔 사진이면 다시 내려받지 않는다(전에는 매번 원본을 다시 받아 8MB 로 되돌아갔다)
    if ext == ".png" and os.path.exists(jfn) and os.path.getsize(jfn) > 0:
        if os.path.exists(fn): os.remove(fn)  # 원본 PNG 가 남아 있으면 치운다
        local[name] = "/brainwave/%s/%s.jpg" % (page_id, name)
        continue
    if not os.path.exists(fn) or os.path.getsize(fn) == 0:
        subprocess.run(["curl", "-sL", "-o", fn, url], check=True)
    fn = compress(fn)
    local[name] = "/brainwave/%s/%s" % (page_id, os.path.basename(fn))

# ── 2. JSX → XML 비슷하게 정리 ─────────────────────────────────
# 하위 컴포넌트(function Foo(...) { return (...) })를 인라인으로 펼친다
comps = {}
for m in re.finditer(r'function (\w+)\(\{ className \}: \{ className\?: string \}\) \{\s*return \(\s*(.*?)\s*\);\s*\}', src, re.S):
    comps[m.group(1)] = m.group(2)
main = re.search(r'export default function \w+\(\) \{\s*return \(\s*(.*)\s*\);\s*\}\s*$', src, re.S).group(1)

def inline_components(code):
    def rep(m):
        name, cls = m.group(1), m.group(2)
        body = comps[name]
        # className={className || "..."} → 전달된 클래스
        body = re.sub(r'className=\{className \|\| "([^"]*)"\}', 'className="%s"' % cls, body, count=1)
        return body
    for _ in range(4):
        code = re.sub(r'<(%s) className="([^"]*)" />' % "|".join(comps.keys()) if comps else r'(?!x)x', rep, code)
    return code
main = inline_components(main)

# src={imgX} → src="local"
main = re.sub(r'src=\{(\w+)\}', lambda m: 'src="%s"' % local.get(m.group(1), ""), main)
# style={{ maskImage: `url("${imgX}")` }} → data-mask="local"
main = re.sub(r'style=\{\{ maskImage: `url\("\$\{(\w+)\}"\)` \}\}', lambda m: 'data-mask="%s"' % local.get(m.group(1), ""), main)
# {`...`} / {"..."} 텍스트 표현식
main = re.sub(r'\{`((?:[^`\\]|\\.)*)`\}', lambda m: html.escape(m.group(1).replace("\\`", "`"), quote=False), main, flags=re.S)
main = re.sub(r'\{"((?:[^"\\]|\\.)*)"\}', lambda m: html.escape(m.group(1), quote=False), main)
main = main.replace("className=", "class=")

# ── 3. Tailwind 클래스 → CSS ───────────────────────────────────
unknown = {}
def px(v):
    return v if v.endswith(("px", "%", "em", "vw", "vh")) or v in ("auto", "0") else v + "px"
def val(v):  # [..] 안의 값
    v = v.replace("_", " ")
    # Tailwind 는 calc(50%+69px) 처럼 붙여 쓰지만 CSS 는 + - 양옆에 공백이 있어야 한다 —
    # 없으면 그 속성이 통째로 무시돼 글이 엉뚱한 자리에 선다(카드 제목이 사진 위로 갔다)
    def fix(m):
        inner = re.sub(r'(?<=[\d%)])\s*([+-])\s*(?=[\d(])', r' \1 ', m.group(1))
        return "calc(" + inner + ")"
    return re.sub(r'calc\((.*?)\)(?=$|\s|,)', fix, v)
SIDES = {"top": "top", "right": "right", "bottom": "bottom", "left": "left"}
def tw(cls, style, extra):
    c = cls
    m = lambda p: re.fullmatch(p, c)
    if c in ("absolute", "relative", "fixed"): style["position"] = c; return
    if c == "contents": style["display"] = "contents"; return
    if c == "block": style["display"] = "block"; return
    if c == "inset-0": style["inset"] = "0"; return
    if c == "size-full": style["width"] = "100%"; style["height"] = "100%"; return
    if c == "max-w-none": style["maxWidth"] = "none"; return
    if c == "object-cover": style["objectFit"] = "cover"; return
    if c == "object-contain": style["objectFit"] = "contain"; return
    if c == "overflow-clip": style["overflow"] = "clip"; return
    if c == "overflow-hidden": style["overflow"] = "hidden"; return
    if c == "pointer-events-none": style["pointerEvents"] = "none"; return
    if c == "not-italic": style["fontStyle"] = "normal"; return
    if c == "italic": style["fontStyle"] = "italic"; return
    if c == "font-bold": style["fontWeight"] = "700"; return
    if c == "font-normal": style["fontWeight"] = "400"; return
    if c == "uppercase": style["textTransform"] = "uppercase"; return
    if c == "underline": style["textDecoration"] = "underline"; return
    if c == "whitespace-nowrap": style["whiteSpace"] = "nowrap"; return
    if c == "whitespace-pre": style["whiteSpace"] = "pre"; return
    if c == "whitespace-pre-wrap": style["whiteSpace"] = "pre-wrap"; return
    if c == "text-center": style["textAlign"] = "center"; return
    if c == "text-right": style["textAlign"] = "right"; return
    if c == "text-left": style["textAlign"] = "left"; return
    if c == "text-white": style["color"] = "#ffffff"; return
    if c == "text-black": style["color"] = "#000000"; return
    if c == "bg-white": style["backgroundColor"] = "#ffffff"; return
    if c == "bg-black": style["backgroundColor"] = "#000000"; return
    if c == "border": style["borderWidth"] = "1px"; return
    if c == "border-solid": style["borderStyle"] = "solid"; return
    if c == "mix-blend-multiply": style["mixBlendMode"] = "multiply"; return
    if c == "mix-blend-screen": style["mixBlendMode"] = "screen"; return
    if c == "mix-blend-overlay": style["mixBlendMode"] = "overlay"; return
    if c == "mb-0": style["marginBottom"] = "0"; return
    if c == "-translate-y-1/2": extra.setdefault("tf", []).append("translateY(-50%)"); return
    if c == "-translate-x-1/2": extra.setdefault("tf", []).append("translateX(-50%)"); return
    if c == "translate-y-full": extra.setdefault("tf", []).append("translateY(100%)"); return
    if c == "translate-x-full": extra.setdefault("tf", []).append("translateX(100%)"); return
    if c == "rotate-180": extra.setdefault("tf", []).append("rotate(180deg)"); return
    r = m(r'(-?)rotate-(\d+)')
    if r: extra.setdefault("tf", []).append("rotate(%s%sdeg)" % (r.group(1), r.group(2))); return
    r = m(r'(-?)rotate-\[(.+)\]')
    if r: extra.setdefault("tf", []).append("rotate(%s%s)" % (r.group(1), val(r.group(2)))); return
    if c == "-scale-x-100": extra.setdefault("tf", []).append("scaleX(-1)"); return
    if c == "-scale-y-100": extra.setdefault("tf", []).append("scaleY(-1)"); return
    r = m(r'(-?)scale-\[(.+)\]')
    if r: extra.setdefault("tf", []).append("scale(%s%s)" % (r.group(1), val(r.group(2)))); return
    if c == "flex-none": style["flex"] = "none"; return
    r = m(r'border-(\d+)')
    if r: style["borderWidth"] = r.group(1) + "px"; return
    if c == "border-white": style["borderColor"] = "#ffffff"; return
    if c == "border-black": style["borderColor"] = "#000000"; return
    if c == "border-transparent": style["borderColor"] = "transparent"; return
    if c == "border-dashed": style["borderStyle"] = "dashed"; return
    if c == "border-dotted": style["borderStyle"] = "dotted"; return
    r = m(r'border-(t|r|b|l)(?:-\[(.+)\]|-(\d+))?')
    if r:
        side = {"t": "Top", "r": "Right", "b": "Bottom", "l": "Left"}[r.group(1)]
        style["border%sWidth" % side] = val(r.group(2)) if r.group(2) else ((r.group(3) or "1") + "px"); return
    r = m(r'rounded-(t|r|b|l)-\[(.+)\]')
    if r:
        v = val(r.group(2))
        pairs = {"t": ["TopLeft", "TopRight"], "b": ["BottomLeft", "BottomRight"], "l": ["TopLeft", "BottomLeft"], "r": ["TopRight", "BottomRight"]}[r.group(1)]
        for k in pairs: style["border%sRadius" % k] = v
        return
    r = m(r'rounded-(sm|md|lg|xl|2xl|3xl)')
    if r: style["borderRadius"] = {"sm": "2px", "md": "6px", "lg": "8px", "xl": "12px", "2xl": "16px", "3xl": "24px"}[r.group(1)]; return
    if c == "rounded": style["borderRadius"] = "4px"; return
    if c == "rounded-none": style["borderRadius"] = "0"; return
    if c == "flex-col": style["flexDirection"] = "column"; return
    if c == "line-through": style["textDecoration"] = "line-through"; return
    if c == "left-px": style["left"] = "1px"; return
    if c == "top-px": style["top"] = "1px"; return
    if c == "right-px": style["right"] = "1px"; return
    if c == "bottom-px": style["bottom"] = "1px"; return
    r = m(r'drop-shadow-\[(.+)\]')
    if r: style["filter"] = "drop-shadow(%s)" % val(r.group(1)); return
    r = m(r'gap-\[(.+)\]')
    if r: style["gap"] = val(r.group(1)); return
    r = m(r'p-\[(.+)\]')
    if r: style["padding"] = val(r.group(1)); return
    r = m(r'px-\[(.+)\]')
    if r: style["paddingLeft"] = style["paddingRight"] = val(r.group(1)); return
    r = m(r'py-\[(.+)\]')
    if r: style["paddingTop"] = style["paddingBottom"] = val(r.group(1)); return
    r = m(r'min-w-\[(.+)\]')
    if r: style["minWidth"] = val(r.group(1)); return
    r = m(r'min-h-\[(.+)\]')
    if r: style["minHeight"] = val(r.group(1)); return
    r = m(r'max-w-\[(.+)\]')
    if r: style["maxWidth"] = val(r.group(1)); return
    if c == "items-start": style["alignItems"] = "flex-start"; return
    if c == "items-end": style["alignItems"] = "flex-end"; return
    if c == "justify-between": style["justifyContent"] = "space-between"; return
    if c == "justify-end": style["justifyContent"] = "flex-end"; return
    if c == "shrink-0": style["flexShrink"] = "0"; return
    if c == "grow": style["flexGrow"] = "1"; return
    if c == "text-nowrap": style["textWrap"] = "nowrap"; return
    if c == "capitalize": style["textTransform"] = "capitalize"; return
    if c == "lowercase": style["textTransform"] = "lowercase"; return
    if c == "font-medium": style["fontWeight"] = "500"; return
    if c == "font-semibold": style["fontWeight"] = "600"; return
    if c == "font-extrabold": style["fontWeight"] = "800"; return
    if c == "font-light": style["fontWeight"] = "300"; return
    if c == "invisible": style["visibility"] = "hidden"; return
    if c == "hidden": style["display"] = "none"; return
    if c == "inline": style["display"] = "inline"; return
    if c == "inline-block": style["display"] = "inline-block"; return
    if c == "grid": style["display"] = "grid"; return
    if c == "object-top": style["objectPosition"] = "top"; return
    if c == "object-bottom": style["objectPosition"] = "bottom"; return
    if c == "object-left": style["objectPosition"] = "left"; return
    if c == "object-right": style["objectPosition"] = "right"; return
    if c == "object-center": style["objectPosition"] = "center"; return
    r = m(r'object-\[(.+)\]')
    if r: style["objectPosition"] = val(r.group(1)); return
    r = m(r'bg-\[url\((.+)\)\]')
    if r: style["backgroundImage"] = "url(%s)" % val(r.group(1)); return
    if c == "bg-cover": style["backgroundSize"] = "cover"; return
    if c == "bg-center": style["backgroundPosition"] = "center"; return
    if c == "bg-no-repeat": style["backgroundRepeat"] = "no-repeat"; return
    r = m(r'bg-size-\[(.+)\]')
    if r: style["backgroundSize"] = val(r.group(1)); return
    r = m(r'bg-position-\[(.+)\]')
    if r: style["backgroundPosition"] = val(r.group(1)); return
    r = m(r'z-\[?(-?\d+)\]?')
    if r: style["zIndex"] = r.group(1); return
    r = m(r'(-?)(top|right|bottom|left)-\[(.+)\]')
    if r and r.group(1): style[SIDES[r.group(2)]] = "-" + val(r.group(3)); return
    r = m(r'-(top|right|bottom|left)-(\d+)')
    if r: style[SIDES[r.group(1)]] = "-%spx" % (int(r.group(2)) * 4); return
    r = m(r'(top|right|bottom|left)-(\d+)')
    if r: style[SIDES[r.group(1)]] = "%spx" % (int(r.group(2)) * 4); return
    r = m(r'(w|h)-(\d+)')
    if r: style["width" if r.group(1) == "w" else "height"] = "%spx" % (int(r.group(2)) * 4); return
    r = m(r'mix-blend-(\w+)')
    if r: style["mixBlendMode"] = r.group(1); return
    if c == "flex": style["display"] = "flex"; return
    if c == "items-center": style["alignItems"] = "center"; return
    if c == "justify-center": style["justifyContent"] = "center"; return
    if c == "[word-break:break-word]": style["wordBreak"] = "break-word"; return
    if c.startswith("[") and c.endswith("]") and ":" in c:
        k, v = c[1:-1].split(":", 1); style[re.sub(r'-(\w)', lambda m: m.group(1).upper(), k)] = val(v); return
    if c in ("decoration-solid", "decoration-from-font", "mask-alpha", "mask-intersect", "mask-no-clip", "mask-no-repeat"): return
    r = m(r'(top|right|bottom|left)-\[(.+)\]')
    if r: style[SIDES[r.group(1)]] = val(r.group(2)); return
    r = m(r'(top|right|bottom|left)-0')
    if r: style[SIDES[r.group(1)]] = "0"; return
    r = m(r'(top|right|bottom|left)-(\d+)/(\d+)')
    if r: style[SIDES[r.group(1)]] = "%.4f%%" % (100 * int(r.group(2)) / int(r.group(3))); return
    r = m(r'inset-\[(.+)\]')
    if r:
        parts = val(r.group(1)).split()
        if len(parts) == 1: parts = parts * 4
        if len(parts) == 2: parts = [parts[0], parts[1], parts[0], parts[1]]
        if len(parts) == 3: parts = [parts[0], parts[1], parts[2], parts[1]]
        style["top"], style["right"], style["bottom"], style["left"] = parts; return
    r = m(r'w-\[(.+)\]')
    if r: style["width"] = val(r.group(1)); return
    r = m(r'h-\[(.+)\]')
    if r: style["height"] = val(r.group(1)); return
    r = m(r'size-\[(.+)\]')
    if r: style["width"] = style["height"] = val(r.group(1)); return
    if c == "h-px": style["height"] = "1px"; return
    if c == "w-px": style["width"] = "1px"; return
    if c == "w-full": style["width"] = "100%"; return
    if c == "h-full": style["height"] = "100%"; return
    r = m(r'bg-\[(#[0-9a-fA-F]{3,8}|rgba?\(.+\))\]')
    if r: style["backgroundColor"] = r.group(1); return
    r = m(r'text-\[(#[0-9a-fA-F]{3,8}|rgba?\(.+\))\]')
    if r: style["color"] = r.group(1); return
    r = m(r'text-\[(\d+(?:\.\d+)?px)\]')
    if r: style["fontSize"] = r.group(1); return
    r = m(r'leading-\[(.+)\]')
    if r: style["lineHeight"] = val(r.group(1)); return
    r = m(r'leading-(\d+)')
    if r: style["lineHeight"] = "%.2frem" % (int(r.group(1)) / 4); return
    r = m(r'tracking-\[(.+)\]')
    if r: style["letterSpacing"] = val(r.group(1)); return
    r = m(r"font-\['([^:']+)(?::([^']+))?'\]")
    if r:
        fam, st = r.group(1), r.group(2) or "Regular"
        style["fontFamily"] = fam
        w = {"Thin": 100, "ExtraLight": 200, "Light": 300, "Regular": 400, "Medium": 500, "SemiBold": 600, "Semi Bold": 600, "Bold": 700, "ExtraBold": 800, "Heavy": 800, "Black": 900}
        for k, v in w.items():
            if k.lower().replace(" ", "") in st.lower().replace(" ", ""): style["fontWeight"] = str(v)
        if "Italic" in st: style["fontStyle"] = "italic"
        return
    r = m(r'rounded-\[(.+)\]')
    if r: style["borderRadius"] = val(r.group(1)); return
    r = m(r'rounded-(tl|tr|br|bl)-\[(.+)\]')
    if r:
        k = {"tl": "borderTopLeftRadius", "tr": "borderTopRightRadius", "br": "borderBottomRightRadius", "bl": "borderBottomLeftRadius"}[r.group(1)]
        style[k] = val(r.group(2)); return
    if c == "rounded-full": style["borderRadius"] = "9999px"; return
    r = m(r'border-\[(#[0-9a-fA-F]{3,8}|rgba?\(.+\))\]')
    if r: style["borderColor"] = r.group(1); return
    r = m(r'border-\[(\d+(?:\.\d+)?px)\]')
    if r: style["borderWidth"] = r.group(1); return
    r = m(r'opacity-\[?(\d+(?:\.\d+)?)\]?')
    if r:
        v = float(r.group(1)); style["opacity"] = str(v / 100 if v > 1 else v); return
    r = m(r'shadow-\[(.+)\]')
    if r: style["boxShadow"] = val(r.group(1)); return
    r = m(r'blur-\[(.+)\]')
    if r: style["filter"] = "blur(%s)" % val(r.group(1)); return
    r = m(r'backdrop-blur-\[(.+)\]')
    if r: style["backdropFilter"] = "blur(%s)" % val(r.group(1)); return
    r = m(r'mask-position-\[(.+)\]')
    if r: style["maskPosition"] = val(r.group(1)); return
    r = m(r'mask-size-\[(.+)\]')
    if r: style["maskSize"] = val(r.group(1)); return
    r = m(r'bg-gradient-to-(t|b|l|r|tl|tr|bl|br)')
    if r:
        extra["gdir"] = {"t": "to top", "b": "to bottom", "l": "to left", "r": "to right", "tl": "to top left", "tr": "to top right", "bl": "to bottom left", "br": "to bottom right"}[r.group(1)]; return
    r = m(r'from-\[(.+?)\](?:/(\d+))?')
    if r: extra.setdefault("gstops", []).append(("from", r.group(1))); return
    r = m(r'via-\[(.+?)\]')
    if r: extra.setdefault("gstops", []).append(("via", r.group(1))); return
    r = m(r'to-\[(.+?)\]')
    if r: extra.setdefault("gstops", []).append(("to", r.group(1))); return
    r = m(r'(from|via|to)-\[(\d+(?:\.\d+)?%)\]')
    if r: extra.setdefault("gpos", {})[r.group(1)] = r.group(2); return
    r = m(r'text-(\d+(?:\.\d+)?)')
    if r: return
    unknown[c] = unknown.get(c, 0) + 1

def classes_to_style(cls):
    style, extra = {}, {}
    for c in cls.split():
        tw(c, style, extra)
    if "tf" in extra: style["transform"] = " ".join(extra["tf"])
    if "gstops" in extra:
        stops = []
        gpos = extra.get("gpos", {})
        for kind, col in extra["gstops"]:
            s = col
            if kind in gpos: s += " " + gpos[kind]
            stops.append(s)
        style["backgroundImage"] = "linear-gradient(%s, %s)" % (extra.get("gdir", "to bottom"), ", ".join(stops))
    return style

# ── 4. 파싱 → 트리 ─────────────────────────────────────────────
class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack = [{"tag": "root", "ch": []}]
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        node = {"tag": tag}
        if "data-node-id" in a: node["id"] = a["data-node-id"]
        if "data-name" in a: node["name"] = a["data-name"]
        st = classes_to_style(a.get("class", ""))
        if "data-mask" in a:
            st["maskImage"] = 'url("%s")' % a["data-mask"]; st["WebkitMaskImage"] = st["maskImage"]
        if tag == "img":
            node["src"] = a.get("src", "")
            if a.get("width"): st["width"] = px(a["width"])
            if a.get("height"): st["height"] = px(a["height"])
        node["st"] = st
        node["ch"] = []
        self.stack[-1]["ch"].append(node)
        if tag not in ("img", "br"): self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        # <div … /> 처럼 스스로 닫힌 요소 — 스택에 올리면 안 된다(그 뒤 전부가 안으로 들어간다)
        self.handle_starttag(tag, attrs)
        if tag not in ("img", "br") and self.stack[-1]["tag"] == tag:
            self.stack.pop()
    def handle_endtag(self, tag):
        if tag in ("img", "br"): return
        # 닫는 태그까지 스택을 되감는다
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]["tag"] == tag:
                del self.stack[i:]; break
    def handle_data(self, data):
        t = data
        if t.strip() == "": return
        # JSX 가 줄바꿈+들여쓰기로 감싼 글은 양끝 공백을 버린다(JSX 규칙과 같다)
        t = re.sub(r'^\s*\n\s*', '', t); t = re.sub(r'\s*\n\s*$', '', t)
        self.stack[-1]["ch"].append({"tag": "#", "text": t})

p = P(); p.feed(main); p.close()
root = p.stack[0]["ch"][0]

# 최상위 크기
W = 1600.0
def find_h(n):
    return n["st"].get("height")
# 페이지 높이: 가장 아래 자식(top+height)로 계산 — 최상위는 size-full 이라 값이 없다
def bottom(n, base=0.0):
    st = n["st"]; top = st.get("top", "0"); h = st.get("height", "0")
    try: t = float(top.replace("px", "")) if top.endswith("px") or top == "0" else 0
    except: t = 0
    try: hh = float(h.replace("px", "")) if h.endswith("px") else 0
    except: hh = 0
    # display:contents 는 상자를 만들지 않는다 — 자식 좌표는 이 노드를 건너뛴 기준이다
    if st.get("display") == "contents": t = 0; hh = 0
    b = base + t + hh
    for c in n["ch"]:
        if c["tag"] != "#": b = max(b, bottom(c, base + t))
    return b
H = bottom(root)
if len(sys.argv) > 4:
    known = float(sys.argv[4])
    if abs(known - H) > 2: print("WARN height mismatch: computed %s, figma %s" % (H, known), file=sys.stderr)
    H = known

# 편집 가능한 자리 목록: 글(id 있는 p/span 의 직접 텍스트), 사진(img 의 부모 id)
slots = {"text": [], "image": []}
def collect(n, parent_id=None, idx=0):
    # 글을 직접 품은 노드에 id 가 없으면(푸터 목록의 <p> 들, 섞인 글의 <span>)
    # 부모 id 에 번호를 붙여 만든다 — 그래야 그 줄도 고칠 수 있다
    texts = [c["text"] for c in n["ch"] if c["tag"] == "#"]
    if texts and not n.get("id") and parent_id:
        n["id"] = "%s/%d" % (parent_id, idx)
    nid = n.get("id") or parent_id
    if n["tag"] == "img" and not n["src"].endswith(".svg"):
        slots["image"].append({"id": nid, "src": n["src"]})
    if texts and n.get("id"):
        slots["text"].append({"id": n["id"], "text": "".join(texts)})
    k = 0
    for c in n["ch"]:
        if c["tag"] != "#":
            collect(c, nid, k); k += 1
collect(root)

os.makedirs(out_dir, exist_ok=True)
out = {"id": page_id, "w": W, "h": H, "root": root, "slots": slots}
open(os.path.join(out_dir, page_id + ".json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
print(json.dumps({"page": page_id, "h": H, "assets": len(assets), "textSlots": len(slots["text"]), "imageSlots": len(slots["image"]), "unknown": unknown}, ensure_ascii=False))
