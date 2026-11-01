# lovable 구조(크롬 실측) → 오늘창업 내용·밝은 테마로 옮긴 시안 생성기
import json, os, pathlib

OUT = pathlib.Path(__file__).parent / "project"
OUT.mkdir(exist_ok=True)

# ---- 공통 CSS (실측값 주석) -------------------------------------------------
BASE = """
*{box-sizing:border-box}
body{margin:0;background:#eceff3;font-family:Pretendard,"Pretendard Variable","Apple SD Gothic Neo",-apple-system,system-ui,sans-serif;color:#202632;-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.5}
a{color:inherit;text-decoration:none}p,h1,h2,h3{margin:0}button{font:inherit;color:inherit;cursor:pointer}
svg{flex:0 0 auto}
/* 색: 우리 토큰 */
:root{--text:#202632;--body:#465365;--muted:#6b7686;--line:#e1e7ef;--raised:#eef1f5;--surface:#fff;--bg:#f7f9fc;--primary:#1b64da;--onprimary:#fff}
/* 밝은 테마용 그라데이션 (lovable: 검정 바탕 + 분홍/파랑/주황) */
.hero{background:
 radial-gradient(55% 45% at 50% 78%,#ffbfd9 0%,rgba(255,191,217,0) 70%),
 radial-gradient(45% 40% at 28% 62%,#b9d1ff 0%,rgba(185,209,255,0) 70%),
 radial-gradient(45% 40% at 72% 62%,#cbbfff 0%,rgba(203,191,255,0) 70%),
 linear-gradient(180deg,#f7f9fc 0%,#f7f9fc 36%,#e7efff 60%,#ffdce9 84%,#ffe0c8 100%)}
/* 버튼·알약: 32px, r8 / r999 */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:6px 10px;border:0;border-radius:8px;background:rgba(95,107,124,.14);font-size:14px;white-space:nowrap}
.btn.outline{background:transparent;box-shadow:inset 0 0 0 1px #d6dde6}
.btn.primary{background:var(--primary);color:#fff}
.btn.ghost{background:transparent}
.pill{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;font-size:14px;color:var(--body);white-space:nowrap}
.pill.on{background:rgba(32,38,50,.08);color:var(--text)}
.pill.blue{background:var(--primary);color:#fff}
.circ{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;border:0;background:transparent;color:var(--body)}
.circ.ring{box-shadow:inset 0 0 0 1px #d6dde6}
.circ.fill{background:var(--text);color:#fff}
.badge{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600}
.badge.ok{background:#eef8f2;color:#267959}.badge.info{background:#e3edfc;color:#244e84}.badge.warn{background:#fff8e8;color:#795914}
.muted{color:var(--muted)}
"""

PC = BASE + """
/* ── PC: 왼쪽 메뉴 256(안쪽 8) ── */
.app{display:flex;min-height:900px;background:#eceff3}
.side{flex:0 0 256px;padding:8px;display:flex;flex-direction:column}
.logo{display:flex;align-items:center;height:32px;padding:0 8px;font-weight:700;font-size:15px;letter-spacing:-.2px}
.logo i{display:inline-block;width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,#1b64da,#7aa7ff);margin-right:8px}
.ws{display:flex;align-items:center;gap:8px;width:240px;height:32px;margin-top:8px;padding:6px 8px 6px 6px;border-radius:10px;box-shadow:inset 0 0 0 1px #d6dde6;background:#fff;font-size:14px}
.ws b{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:var(--primary);color:#fff;font-size:11px;font-weight:600}
.ws svg{margin-left:auto;color:var(--muted)}
.nav{display:flex;align-items:center;gap:8px;width:240px;height:32px;padding:4px 6px;border-radius:8px;font-size:14px;color:#3a4553}
.nav svg{width:20px;height:20px;color:#5f6b7c}
.nav.on{background:rgba(32,38,50,.08);color:var(--text)}.nav.on svg{color:var(--text)}
.grp{display:flex;align-items:center;justify-content:space-between;margin:16px 8px 6px;font-size:14px;color:var(--muted)}
.proj{display:flex;align-items:center;gap:8px;width:240px;height:32px;padding:4px 6px;border-radius:8px;font-size:14px;color:#3a4553}
.proj b{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;background:#e3edfc;color:#244e84;font-size:11px;font-weight:600}
.proj.on{background:rgba(32,38,50,.08);color:var(--text)}
.more{display:block;margin:4px 8px;font-size:14px;color:var(--muted)}
.promo{margin-top:auto;display:flex;align-items:center;width:240px;height:64px;padding:12px 14px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line);overflow:hidden;position:relative}
.promo .t{font-size:14px;font-weight:600}.promo .d{font-size:12px;color:var(--muted)}
.promo i{position:absolute;right:-6px;top:-6px;width:76px;height:76px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#ffd3e6,#cfdfff 60%,#ffead9)}
.foot{display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 8px;margin-top:8px}
.av{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#1b64da;color:#fff;font-size:11px;font-weight:600;position:relative}
.av em{position:absolute;right:-4px;top:-4px;width:14px;height:14px;border-radius:50%;background:#e5484d;color:#fff;font:600 9px/14px Pretendard,sans-serif;text-align:center;font-style:normal}
/* ── 본문 패널: 8px 띄움, r16 ── */
.panel{flex:1;min-width:0;margin:8px 8px 8px 0;border-radius:16px;background:var(--bg);box-shadow:0 0 0 1px var(--line),0 2px 0 rgba(16,24,40,.03),0 2px 1px -.5px rgba(16,24,40,.04),0 4px 3px -1.5px rgba(16,24,40,.04),0 7px 6px -3px rgba(16,24,40,.04);overflow:hidden;position:relative}
"""

MOBILE = BASE + """
/* ── 휴대폰 390: lovable 실측(2026-11-01, 375×812 — 가로로 꽉 찬 요소만 390으로 환산) ── */
body{background:#fff}
.screen{width:390px;min-height:844px;position:relative;overflow:hidden;background:var(--bg)}
/* 첫 화면 머리: 위 16 · 좌우 16, 계정 알약 44(안쪽 4 14 4 6, 아바타 32, 16/400) · 아바타 44 */
.top{display:flex;align-items:center;justify-content:space-between;height:44px;padding:16px 16px 0;box-sizing:content-box}
.wsp{display:inline-flex;align-items:center;gap:8px;height:44px;padding:4px 14px 4px 6px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line);font-size:16px;font-weight:400}
.wsp b{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--primary);color:#fff;font-size:13px;font-weight:600}
.avatar{width:44px;height:44px;border-radius:50%;background:#1b64da;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600;position:relative}
.avatar em{position:absolute;right:-2px;top:-2px;width:14px;height:14px;border-radius:50%;background:#e5484d;border:2px solid #fff;font-style:normal}
/* 아래 탭 막대 296×57 r999 안쪽 4, 칸 48, 아래 24 */
.tabbar{position:absolute;left:50%;transform:translateX(-50%);bottom:24px;display:flex;align-items:center;width:296px;height:57px;padding:4px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line),0 12px 32px -12px rgba(16,24,40,.25)}
.tabbar a{flex:1;display:flex;align-items:center;justify-content:center;height:48px;border-radius:999px;color:var(--body)}
.tabbar a.on{background:rgba(32,38,50,.08);color:var(--text)}
/* 대화 머리 68(안쪽 12 10) · 설정 머리(위 16 · 좌우 16, 제목 16/500) */
.navbar{display:flex;align-items:center;justify-content:space-between;height:44px;padding:12px 10px;box-sizing:content-box}
.setbar{display:flex;align-items:center;justify-content:space-between;height:44px;padding:16px 16px 0;box-sizing:content-box}
.setbar .t{font-size:16px;font-weight:500}
.ic44{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px var(--line);color:var(--text)}
.titlepill{display:inline-flex;align-items:center;gap:6px;height:44px;padding:10px 14px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line);font-size:18px;font-weight:600}
/* 프로필 시트: 위 모서리 32, 손잡이 64×6(닫기 80×44), 아바타 40 · 이름 16/500 · 이메일 14, 행 44 r12 안쪽 0 12 · 16px · 행 사이 4 */
.sheet{position:absolute;left:0;right:0;bottom:0;border-radius:32px 32px 0 0;background:#fff;box-shadow:0 -1px 0 var(--line),0 -20px 60px -20px rgba(16,24,40,.25);padding:0 16px 24px}
.grab{display:flex;align-items:center;justify-content:center;width:80px;height:44px;margin:0 auto 4px}
.grab::before{content:"";width:64px;height:6px;border-radius:999px;background:#d6dde6}
.menu{display:flex;align-items:center;gap:12px;height:44px;padding:0 12px;border-radius:12px;font-size:16px}
.menu + .menu{margin-top:4px}
.menu svg{width:20px;height:20px;color:var(--text)}
.menu .chev{margin-left:auto;color:var(--muted)}
.menu .n{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#e5484d;color:#fff;font-size:12px;font-weight:600}
.hr{height:1px;background:var(--line);margin:8px 0}
/* 계정 설정 목록: 행 48 r8 안쪽 12 · 16px · 아이콘 20 */
.srow{display:flex;align-items:center;gap:12px;height:48px;padding:0 12px;border-radius:8px;font-size:16px}
.srow svg{width:20px;height:20px}
"""

def page(title, css, body, w, h):
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>{css}</style>
</helmet>
{body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""

# ---- SVG 아이콘 -------------------------------------------------------------
def ico(d, s=20, sw=1.8):
    return f'<svg aria-hidden="true" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
I = dict(
 edit='<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 search='<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 grid='<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 chat='<path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
 inbox='<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
 chev='<path d="M6 9l6 6 6-6"/>',
 chevr='<path d="M9 6l6 6-6 6"/>',
 chevl='<path d="M15 18l-6-6 6-6"/>',
 updown='<path d="M8 9l4-4 4 4"/><path d="M16 15l-4 4-4-4"/>',
 plus='<path d="M12 5v14"/><path d="M5 12h14"/>',
 mic='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
 up='<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
 arrow='<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
 home='<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
 x='<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
 bell='<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
 user='<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 gear='<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 card='<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
 help='<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5"/><path d="M12 17h.01"/>',
 book='<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13"/>',
 half='<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
 users='<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15 20a5 5 0 0 1 7 0"/>',
 shield='<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
 slider='<path d="M4 7h10"/><circle cx="17" cy="7" r="2"/><path d="M20 17H10"/><circle cx="7" cy="17" r="2"/>',
 device='<rect x="3" y="4" width="14" height="10" rx="2"/><rect x="15" y="12" width="6" height="9" rx="1.5"/>',
 building='<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/>',
 refresh='<path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/>',
 external='<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
 monitor='<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
 file='<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6"/>',
 code='<path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/>',
 layers='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 history='<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>',
 sidebar='<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
 share='<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
 copy='<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
 thumb='<path d="M7 11v9H3v-9z"/><path d="M7 11l4-7a2 2 0 0 1 3 2v4h5a2 2 0 0 1 2 2l-1.5 7a2 2 0 0 1-2 1.5H7"/>',
 reply='<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
 dots='<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
 star='<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
 gift='<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M5 12v9h14v-9"/><path d="M12 8a3 3 0 1 0-3-3c0 2 3 3 3 3zm0 0a3 3 0 1 1 3-3c0 2-3 3-3 3z"/>',
 cursor='<path d="M4 4l7 16 2-7 7-2z"/>',
 text='<path d="M4 6h16"/><path d="M12 6v14"/>',
 pencil='<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
 bubble='<circle cx="12" cy="12" r="9"/>',
 sparkle='<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
 clock='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
)

# ---- PC 공통: 왼쪽 메뉴 ------------------------------------------------------
def side_pc(active="new", proj_on=None):
    def nav(key, icon, label):
        return f'<a href="#" class="nav{" on" if active==key else ""}">{ico(I[icon])}{label}</a>'
    def proj(key, letter, label):
        return f'<a href="#" class="proj{" on" if proj_on==key else ""}"><b>{letter}</b>{label}</a>'
    return f"""
<nav class="side" aria-label="주 메뉴">
  <div class="logo"><i></i>오늘창업</div>
  <button type="button" class="ws"><b>아</b>아트앤브릿지{ico(I['updown'],16)}</button>
  <div style="margin-top:8px;display:flex;flex-direction:column;gap:0">
    {nav("new","edit","새 대화")}
    {nav("search","search","검색")}
    {nav("biz","grid","내 사업")}
    {nav("inq","inbox","손님 문의")}
  </div>
  <div class="grp"><span>내 사업</span>{ico(I['chev'],14)}</div>
  {proj("cookie","성","성수 쿠키공방")}
  {proj("new","새","새 사업 구상")}
  <a href="#" class="more">모든 사업 보기</a>
  <div class="grp"><span>최근 대화</span></div>
  <a href="#" class="more">아직 대화가 없어요</a>
  <div class="promo"><div><p class="t">앱으로도 이어서</p><p class="d">카카오 알림으로 다음 단계 안내</p></div><i></i></div>
  <div class="foot"><span class="av">아<em>1</em></span>{ico(I['inbox'],20)}</div>
</nav>"""

# ---- A. PC 첫 화면 -----------------------------------------------------------
def pc_home():
    cards = ""
    for name, when, badge, tone, letter in [("성수 쿠키공방","수정됨 2일 전","개업 준비","info","성"),("새 사업 구상","수정됨 어제","대화 중","warn","새")]:
        cards += f"""
<a href="#" style="display:block;width:316px">
  <div style="position:relative;height:178px;border-radius:8px;background:#fff;box-shadow:0 0 0 1px var(--line);overflow:hidden">
    <div style="position:absolute;inset:14px;display:flex;flex-direction:column;gap:6px">
      <div style="height:10px;width:46%;border-radius:3px;background:#dfe5ee"></div>
      <div style="height:6px;width:80%;border-radius:3px;background:#edf1f6"></div>
      <div style="height:6px;width:72%;border-radius:3px;background:#edf1f6"></div>
      <div style="display:flex;gap:6px;margin-top:6px"><div style="flex:1;height:54px;border-radius:6px;background:#eef3ff"></div><div style="flex:1;height:54px;border-radius:6px;background:#fff0f5"></div><div style="flex:1;height:54px;border-radius:6px;background:#f2f5f8"></div></div>
      <div style="height:6px;width:64%;border-radius:3px;background:#edf1f6"></div>
    </div>
    <span class="badge {tone}" style="position:absolute;left:10px;bottom:10px;height:22px">{badge}</span>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
    <span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#e3edfc;color:#244e84;font-weight:600;font-size:13px">{letter}</span>
    <div><p style="font-size:14px;font-weight:500">{name}</p><p class="muted" style="font-size:13px">{when}</p></div>
  </div>
</a>"""
    body = f"""
<div class="app">
{side_pc("new")}
<main class="panel hero" style="min-height:884px">
  <div style="display:flex;justify-content:center;padding-top:32px">
    <a href="#" class="pill" style="height:36px;background:#fff;box-shadow:0 0 0 1px var(--line);gap:10px;padding:0 14px 0 8px">
      <span style="display:inline-flex"><i style="width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;justify-content:center;color:#1b64da">{ico(I['sparkle'],12,2)}</i><i style="width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;justify-content:center;margin-left:-6px;color:#267959">{ico(I['bubble'],12,2)}</i><i style="width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px var(--line);display:inline-flex;align-items:center;justify-content:center;margin-left:-6px;color:#b23b47">{ico(I['star'],12,2)}</i></span>
      <span style="font-weight:500">오늘 할 일 1건 — 사업자등록 서류 확인</span>{ico(I['arrow'],16,2)}
    </a>
  </div>
  <h1 style="margin-top:88px;text-align:center;font-size:30px;font-weight:600;line-height:37.5px;letter-spacing:-.675px">아트앤브릿지님, 오늘은 어떤 사업을 시작해볼까요?</h1>
  <div style="width:672px;margin:30px auto 0;padding:12px;border-radius:28px;background:#fff;box-shadow:0 0 0 1px var(--line),0 25px 50px -12px rgba(16,24,40,.18)">
    <div style="min-height:40px;padding:8px 10px;font-size:16px;color:#8a94a3">예: 성수동에 작은 쿠키 공방을 열고 싶어요</div>
    <div style="display:flex;align-items:center;gap:8px;padding:6px 4px 0">
      <button type="button" class="circ" aria-label="첨부">{ico(I['plus'],18,2)}</button>
      <span style="flex:1"></span>
      <button type="button" class="pill" style="height:32px;padding:6px 10px;font-weight:500">사업계획서{ico(I['chev'],14,2)}</button>
      <button type="button" class="circ" aria-label="음성">{ico(I['mic'],18)}</button>
      <button type="button" class="circ fill" aria-label="보내기">{ico(I['up'],16,2.2)}</button>
    </div>
  </div>
  <section style="position:absolute;left:48px;right:48px;top:612px;padding:24px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px var(--line)">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:inline-flex;align-items:center;gap:2px;height:40px;padding:4px;border-radius:999px;background:var(--raised)">
        <span class="pill" style="padding-left:10px">{ico(I['search'],16)}검색</span><span class="pill on" style="background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08)">내 사업</span><span class="pill">최근 본 항목</span><span class="pill">예시 사업</span><span class="pill">개업 안내</span>
      </div>
      <a href="#" class="pill" style="font-size:14px">전체 둘러보기{ico(I['arrow'],16)}</a>
    </div>
    <div style="display:flex;gap:30px;margin-top:20px">{cards}</div>
  </section>
</main>
</div>"""
    return page("첫 화면 · PC", PC, body, 1440, 900)

# ---- B. PC 작업 화면 ----------------------------------------------------------
def pc_studio():
    body = f"""
<div class="app" style="min-height:900px">
{side_pc("biz", "cookie")}
<div style="flex:1;min-width:0;display:flex;flex-direction:column">
  <header style="display:flex;align-items:center;height:48px;padding:0 8px 0 16px">
    <div style="display:flex;align-items:center;gap:6px;width:435px;font-size:14px;font-weight:500">성수 쿠키공방{ico(I['chev'],14)}<span style="flex:1"></span>{ico(I['history'],18)}<span style="width:12px"></span>{ico(I['sidebar'],18)}</div>
    <div style="display:flex;align-items:center;gap:6px;flex:1;padding-left:16px">
      <span class="pill on" style="height:28px;padding:0 12px;background:#e3edfc;color:#244e84;font-weight:500">{ico(I['monitor'],14)}미리보기</span>
      <span class="pill" style="height:28px;padding:0 8px">{ico(I['file'],16)}</span><span class="pill" style="height:28px;padding:0 8px">{ico(I['code'],16)}</span><span class="pill" style="height:28px;padding:0 8px">{ico(I['layers'],16)}</span>
      <span style="flex:1"></span>
      <span class="pill" style="height:28px;padding:0 8px">{ico(I['monitor'],16)}</span><span class="pill" style="height:28px;padding:0 8px">{ico(I['refresh'],16)}</span>
      <span class="pill" style="height:28px;width:260px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);justify-content:center">사업계획서{ico(I['chev'],14)}</span>
      <span class="pill" style="height:28px;padding:0 8px">{ico(I['external'],16)}</span>
      <span style="flex:1"></span>
      <span class="circ ring" style="background:#fff">{ico(I['user'],16)}</span><span class="circ ring" style="background:#fff">{ico(I['share'],16)}</span>
    </div>
  </header>
  <div style="display:flex;flex:1;min-height:0">
    <section style="width:451px;flex:0 0 451px;display:flex;flex-direction:column;padding:0 16px 16px">
      <div style="flex:1;display:flex;flex-direction:column;gap:20px;padding-top:8px;font-size:14px;line-height:1.65">
        <div style="padding:16px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line)">
          <p class="muted" style="font-size:13px">4장 · 시장과 손님</p>
          <p style="margin-top:4px">성수동 반경 1km 디저트 수요와 경쟁 가게 7곳을 정리해 4장을 채웠어요.</p>
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn outline" style="flex:1;height:36px;border-radius:999px">세부 정보</button><button class="btn outline" style="flex:1;height:36px;border-radius:999px;color:var(--muted)">미리보기 중</button></div>
        </div>
        <p>객단가는 8,500원, 하루 60명이면 월 매출 1,500만 원대예요. 임대료가 월 200만 원을 넘으면 손익분기가 늦어져요.</p>
        <div style="display:flex;gap:16px;color:var(--muted)">{ico(I['reply'],16)}{ico(I['thumb'],16)}{ico(I['copy'],16)}{ico(I['dots'],16)}</div>
        <div style="align-self:flex-end;max-width:70%;padding:12px 16px;border-radius:16px;background:#fff;box-shadow:0 0 0 1px var(--line)">임대료 150만 원이면 몇 달 만에 본전이야?</div>
        <p class="muted" style="font-size:14px">손익분기 계산을 안내했어요 {ico(I['chevr'],12)}</p>
        <p>초기 비용 4,200만 원 기준으로 7~8개월째에 본전을 넘겨요. 5장에 표로 넣어 둘게요.</p>
        <div style="display:flex;gap:16px;color:var(--muted)">{ico(I['reply'],16)}{ico(I['thumb'],16)}{ico(I['copy'],16)}{ico(I['dots'],16)}</div>
      </div>
      <div style="display:flex;gap:8px;overflow:hidden;margin:12px 0">
        <span class="pill blue" style="font-weight:500">{ico(I['shield'],14,2)}5장 표로 넣기</span><span class="pill" style="box-shadow:inset 0 0 0 1px var(--line);background:#fff">임대료 조건 비교</span><span class="pill" style="box-shadow:inset 0 0 0 1px var(--line);background:#fff">홈페이지 만들기</span>
      </div>
      <div style="padding:12px 12px 10px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line),0 8px 24px -12px rgba(16,24,40,.2)">
        <div style="min-height:28px;padding:4px 4px 8px;font-size:14px;color:#8a94a3">오늘창업에게 물어보기…</div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="circ ring">{ico(I['plus'],16,2)}</button><span style="flex:1"></span>
          <button class="pill" style="height:32px;padding:6px 10px;font-weight:500;box-shadow:inset 0 0 0 1px var(--line)">사업계획서{ico(I['chev'],14,2)}</button>
          <button class="circ ring">{ico(I['mic'],16)}</button><button class="circ fill">{ico(I['up'],14,2.2)}</button>
        </div>
      </div>
    </section>
    <section class="panel" style="margin:0 8px 8px 0;background:#fff;display:flex;flex-direction:column">
      <div style="flex:1;padding:40px 56px;overflow:hidden">
        <p class="muted" style="font-size:13px">사업계획서 · 5장</p>
        <h2 style="margin-top:6px;font-size:22px;font-weight:600;letter-spacing:-.3px">손익과 자금 계획</h2>
        <p style="margin-top:12px;max-width:620px;color:var(--body)">초기 비용 4,200만 원(보증금 2,000·인테리어 1,500·장비 700)과 월 고정비 320만 원 기준으로, 하루 60명·객단가 8,500원이면 7~8개월째에 본전을 넘겨요.</p>
        <div style="margin-top:24px;border-radius:12px;box-shadow:0 0 0 1px var(--line);overflow:hidden;max-width:620px">
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;background:var(--raised);font-size:13px;font-weight:600;color:var(--body)"><span style="padding:10px 14px">항목</span><span style="padding:10px 14px">임대료 150만</span><span style="padding:10px 14px">임대료 200만</span></div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;border-top:1px solid var(--line)"><span style="padding:10px 14px">월 고정비</span><span style="padding:10px 14px">320만 원</span><span style="padding:10px 14px">370만 원</span></div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;border-top:1px solid var(--line)"><span style="padding:10px 14px">월 순이익</span><span style="padding:10px 14px">560만 원</span><span style="padding:10px 14px">510만 원</span></div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;border-top:1px solid var(--line)"><span style="padding:10px 14px">본전 시점</span><span style="padding:10px 14px;font-weight:600">7.5개월</span><span style="padding:10px 14px;font-weight:600">8.2개월</span></div>
        </div>
      </div>
      <div style="position:absolute;left:50%;transform:translateX(-50%);bottom:16px;display:flex;gap:4px;padding:4px;border-radius:999px;background:#fff;box-shadow:0 0 0 1px var(--line),0 8px 24px -12px rgba(16,24,40,.25)"><span class="circ ring">{ico(I['cursor'],14)}</span><span class="circ ring">{ico(I['text'],14)}</span><span class="circ ring">{ico(I['pencil'],14)}</span><span class="circ ring">{ico(I['bubble'],14)}</span></div>
    </section>
  </div>
</div>
</div>"""
    return page("작업 화면 · PC", PC, body, 1440, 900)

# ---- 휴대폰 ------------------------------------------------------------------
def m_home():
    body = f"""
<div class="screen hero">
  <header class="top"><span class="wsp"><b>아</b>아트앤브릿지{ico(I['updown'],14)}</span><span class="avatar">아<em></em></span></header>
  <div style="display:flex;justify-content:center;margin-top:145px"><a href="#" class="pill" style="height:36px;background:#fff;box-shadow:0 0 0 1px var(--line);gap:8px;padding:6px 12px 6px 6px;font-weight:500;font-size:14px">{ico(I['clock'],24)}오늘 할 일 1건{ico(I['arrow'],16,2)}</a></div>
  <h1 style="margin:48px 16px 0;text-align:center;font-size:24px;font-weight:600;line-height:30px;letter-spacing:-.48px">아트앤브릿지님, 어떤 사업을 시작해볼까요?</h1>
  <div style="margin:30px 16px 0;padding:12px;border-radius:28px;background:#fff;box-shadow:0 0 0 1px var(--line),0 25px 50px -12px rgba(16,24,40,.18)">
    <div style="min-height:60px;padding:4px 6px;font-size:16px;line-height:24px;color:#8a94a3">성수동에 쿠키 공방을…</div>
    <div style="display:flex;align-items:center;gap:8px;height:36px">
      <button class="circ" style="width:36px;height:36px">{ico(I['plus'],20,1.8)}</button><span style="flex:1"></span>
      <button class="pill" style="height:36px;padding:8px 12px;border:0;background:transparent;font-size:14px">사업계획서{ico(I['chev'],14)}</button><button class="circ" style="width:36px;height:36px">{ico(I['mic'],20)}</button>
    </div>
  </div>
  <nav class="tabbar"><a href="#" class="on">{ico(I['home'],24)}</a><a href="#">{ico(I['grid'],24)}</a><a href="#">{ico(I['chat'],24)}</a></nav>
</div>"""
    return page("첫 화면 · 휴대폰", MOBILE, body, 390, 844)

def m_chat():
    body = f"""
<div class="screen" style="background:var(--bg)">
  <header class="navbar"><span class="ic44">{ico(I['x'],20,2)}</span><span class="titlepill">성수 쿠키공방{ico(I['chev'],16)}</span><span class="ic44">{ico(I['chevr'],20,2)}</span></header>
  <div style="padding:0 16px;display:flex;flex-direction:column;gap:18px;font-size:16px;line-height:25px">
    <div style="border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line);overflow:hidden">
      <p style="padding:12px 12px 4px">4장 '시장과 손님'을 채웠어요</p>
      <div style="display:flex;gap:8px;padding:8px 12px 12px"><button class="btn outline" style="flex:1;height:36px;border-radius:999px;font-size:16px">세부 정보</button><button class="btn outline" style="flex:1;height:36px;border-radius:999px;font-size:16px;color:var(--muted)">미리보기</button></div>
    </div>
    <p>객단가 8,500원, 하루 60명이면 월 매출 1,500만 원대예요. 임대료가 200만 원을 넘으면 본전이 늦어져요.</p>
    <div style="display:flex;gap:8px;margin:-10px -6px 0;color:var(--muted)"><span class="circ">{ico(I['reply'],18)}</span><span class="circ">{ico(I['thumb'],18)}</span><span class="circ">{ico(I['copy'],18)}</span><span class="circ">{ico(I['dots'],18)}</span></div>
    <div style="align-self:flex-end;max-width:80%;padding:12px 16px;border-radius:24px;background:#fff;box-shadow:0 0 0 1px var(--line)">임대료 150이면 몇 달 만에 본전이야?</div>
    <p class="muted" style="font-size:15px">손익분기 계산을 안내했어요 {ico(I['chevr'],14)}</p>
    <p>초기 비용 4,200만 원 기준으로 7~8개월째에 본전을 넘겨요. 5장에 표로 넣어 둘게요.</p>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;padding:0 8px 16px">
    <div style="display:flex;gap:6px;padding:0 0 12px;overflow:hidden">
      <span class="pill blue" style="height:32px;padding:6px 10px;font-size:14px;font-weight:500">{ico(I['shield'],14,2)}5장 표로 넣기</span><span class="pill" style="height:32px;padding:6px 10px;font-size:14px;background:#fff;box-shadow:inset 0 0 0 1px var(--line)">임대료 비교</span><span class="pill" style="height:32px;padding:6px 10px;font-size:14px;background:#fff;box-shadow:inset 0 0 0 1px var(--line)">홈페이지 만들기</span>
    </div>
    <div style="padding:12px 12px 10px;border-radius:28px;background:#fff;box-shadow:0 0 0 1px var(--line),0 -8px 32px -16px rgba(16,24,40,.2)">
      <div style="min-height:40px;padding:4px 4px 8px;font-size:16px;line-height:24px;color:#8a94a3">오늘창업에게 물어보기…</div>
      <div style="display:flex;align-items:center;gap:8px"><button class="circ ring" style="width:36px;height:36px">{ico(I['plus'],20,2)}</button><span style="flex:1"></span><button class="pill" style="height:36px;padding:4px 6px 4px 8px;border:0;background:transparent;box-shadow:inset 0 0 0 1px var(--line);font-size:14px">사업계획서{ico(I['chev'],14)}</button><button class="circ ring" style="width:36px;height:36px">{ico(I['mic'],20)}</button></div>
    </div>
  </div>
</div>"""
    return page("작업 대화 · 휴대폰", MOBILE, body, 390, 844)

def m_profile():
    items = [
      ("inbox","받은 알림",'<span class="n">1</span>',True),("bell","새로운 소식","",True),None,
      ("user","프로필","",False),("gear","계정 설정","",False),("card","결제 내역","",False),("gift","친구 초대","",False),
      ("help","고객센터","",True),("book","이용 안내","",True),("half","화면 설정","",True),("users","창업자 모임","",False)]
    rows=""
    for it in items:
        if it is None: rows+='<div class="hr"></div>'; continue
        icon,label,extra,chev=it
        rows+=f'<a href="#" class="menu">{ico(I[icon],20)}{label}{extra}{("<span class=chev>"+ico(I["chevr"],18)+"</span>") if chev else ""}</a>'
    body = f"""
<div class="screen" style="background:#dfe3e9">
  <header class="top" style="opacity:.6"><span class="wsp"><b>아</b>아트앤브릿지{ico(I['updown'],14)}</span><span class="avatar">아<em></em></span></header>
  <div class="sheet">
    <div class="grab"></div>
    <div style="display:flex;align-items:center;gap:12px;margin:0 12px 12px"><span class="avatar" style="width:40px;height:40px;font-size:16px">아</span><div><p style="font-size:16px;font-weight:500">아트앤브릿지</p><p class="muted" style="font-size:14px">rena35200@gmail.com</p></div></div>
    {rows}
  </div>
</div>"""
    return page("프로필 시트 · 휴대폰", MOBILE, body, 390, 844)

def m_settings():
    body = f"""
<div class="screen" style="background:var(--bg)">
  <header class="setbar"><span class="ic44">{ico(I['x'],20,2)}</span><span class="t">계정 설정</span><span style="width:44px"></span></header>
  <div style="margin:16px 16px 0;display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:8px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:16px">{ico(I['search'],18)}설정 검색</div>
  <div style="padding:12px 12px 0;display:flex;flex-direction:column">
    <a href="#" class="srow">{ico(I['user'],20)}아트앤브릿지</a>
    <a href="#" class="srow">{ico(I['slider'],20)}환경설정</a>
    <a href="#" class="srow">{ico(I['shield'],20)}보안</a>
    <a href="#" class="srow">{ico(I['device'],20)}기기 및 앱</a>
  </div>
  <a href="#" class="btn outline" style="position:absolute;left:12px;right:12px;bottom:12px;height:32px;padding:6px 10px;border-radius:8px;background:#fff;font-size:14px;gap:6px">{ico(I['building'],16)}사업 설정</a>
</div>"""
    return page("계정 설정 · 휴대폰", MOBILE, body, 390, 844)

def m_pref():
    def toggle(on=True):
        return f'<span style="display:inline-flex;align-items:center;width:32px;height:20px;padding:2px;border-radius:10px;background:{"var(--primary)" if on else "#d6dde6"};justify-content:{"flex-end" if on else "flex-start"};flex:0 0 auto"><i style="width:16px;height:16px;border-radius:50%;background:#fff"></i></span>'
    sel = 'display:flex;align-items:center;justify-content:space-between;margin-top:14px;height:32px;padding:0 12px;border-radius:8px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);font-size:16px'
    body = f"""
<div class="screen" style="background:var(--bg)">
  <header class="setbar"><span class="ic44">{ico(I['chevl'],20,2)}</span><span class="t">환경설정</span><span style="width:44px"></span></header>
  <div style="padding:24px 28px 20px"><h2 style="font-size:16px;font-weight:500">환경설정</h2><p class="muted" style="margin-top:4px;font-size:14px">오늘창업이 일하는 방식을 나에게 맞게 바꿔요.</p></div>
  <div style="background:#fff;box-shadow:0 -1px 0 var(--line),0 1px 0 var(--line);padding:0 28px">
    <div style="padding:24px 0;border-bottom:1px solid var(--line)"><p style="font-size:16px;font-weight:500">AI가 먼저 묻지 않고 할 일</p><p class="muted" style="margin-top:4px;font-size:14px;line-height:1.5">계획서 수정·표 추가처럼 묻지 않고 바로 해도 되는 일을 골라요.</p><button class="btn" style="margin-top:14px">관리</button></div>
    <div style="padding:24px 0;border-bottom:1px solid var(--line)"><p style="font-size:16px;font-weight:500">말투</p><p class="muted" style="margin-top:4px;font-size:14px">대화와 계획서에서 쓸 말투예요.</p><div style="{sel}">친근하게(해요체){ico(I['chev'],16)}</div></div>
    <div style="padding:24px 0;border-bottom:1px solid var(--line)"><p style="font-size:16px;font-weight:500">기본 지역</p><p class="muted" style="margin-top:4px;font-size:14px">새 사업의 상권·규정을 볼 기준 지역이에요.</p><div style="{sel}">서울 성동구{ico(I['chev'],16)}</div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0;border-bottom:1px solid var(--line)"><div><p style="font-size:16px;font-weight:500">대화 제안</p><p class="muted" style="margin-top:4px;font-size:14px;line-height:1.5">대화 중 다음에 할 만한 일을 알약 버튼으로 보여 줘요.</p></div>{toggle(True)}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px 0"><div><p style="font-size:16px;font-weight:500">카카오 알림</p><p class="muted" style="margin-top:4px;font-size:14px;line-height:1.5">단계가 바뀌면 카카오톡으로 다음 할 일을 보내 줘요.</p></div>{toggle(True)}</div>
  </div>
</div>"""
    return page("환경설정 · 휴대폰", MOBILE, body, 390, 844)

def m_preview():
    body = f"""
<div class="screen" style="background:#fff">
  <div style="height:776px;overflow:hidden;position:relative;background:#fff">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px 12px;border-bottom:1px solid #202632"><span style="font-size:30px;font-weight:800;letter-spacing:-1px">성수쿠키공방</span>{ico(I['x'],20,2)}</div>
    <div style="margin:24px 24px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #202632;padding-bottom:10px;color:#8a94a3;font-size:18px">검색{ico(I['search'],24,2)}</div>
    <p style="margin:40px 24px 0;font-size:40px;font-weight:800;letter-spacing:-1px">MENU</p>
    <p style="margin:18px 24px 0;font-size:40px;font-weight:800;letter-spacing:-1px">STORY</p>
    <div style="position:absolute;left:16px;right:16px;top:430px;background:#fff;box-shadow:0 0 0 2px #202632,10px 10px 0 #202632">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;background:#22a559;color:#fff;font-size:12px;font-weight:700;letter-spacing:2px">성수쿠키공방 · 오픈 혜택{ico(I['x'],18,2.2)}</div>
      <div style="padding:20px"><p style="font-size:24px;font-weight:800;line-height:1.2;letter-spacing:-.5px">첫 방문 쿠키<br>1개 더 드려요</p><p class="muted" style="margin-top:12px;font-size:15px;line-height:1.6">오픈 첫 달, 인스타 팔로우하고 오시면 쿠키 1개를 더 드려요.</p><div style="display:flex;gap:12px;margin-top:16px"><button class="btn" style="flex:1;height:48px;border-radius:0;background:#202632;color:#fff;font-weight:600">지금 받기 {ico(I['external'],16,2)}</button><button class="btn ghost" style="height:48px;color:var(--muted)">나중에</button></div></div>
    </div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:68px;display:flex;align-items:center;justify-content:space-between;padding:16px 8px 16px 9px;box-sizing:border-box;background:var(--bg);box-shadow:0 -1px 0 var(--line)">
    <div style="display:flex;gap:8px"><span class="pill" style="height:36px;padding:8px 16px 8px 8px;gap:4px;background:#fff;box-shadow:0 0 0 1px var(--line);font-size:16px;font-weight:500;color:var(--text)">{ico(I['chevl'],20,2)}대화</span><span class="ic44" style="width:36px;height:36px">{ico(I['mic'],18)}</span></div>
    <div style="display:flex;gap:8px"><span class="ic44" style="width:36px;height:36px">{ico(I['dots'],18)}</span><span class="pill blue" style="height:36px;padding:8px 12px;font-size:16px;font-weight:600">공개하기</span></div>
  </div>
</div>"""
    return page("홈페이지 미리보기 · 휴대폰", MOBILE, body, 390, 844)

boards = {
 "Main.dc.html": (pc_home(), 1440, 900, "첫 화면 · PC"),
 "PcStudio.dc.html": (pc_studio(), 1440, 900, "작업 화면 · PC"),
 "MHome.dc.html": (m_home(), 390, 844, "첫 화면 · 휴대폰"),
 "MChat.dc.html": (m_chat(), 390, 844, "작업 대화 · 휴대폰"),
 "MProfile.dc.html": (m_profile(), 390, 844, "프로필 시트 · 휴대폰"),
 "MSettings.dc.html": (m_settings(), 390, 844, "계정 설정 · 휴대폰"),
 "MPref.dc.html": (m_pref(), 390, 844, "환경설정 · 휴대폰"),
 "MPreview.dc.html": (m_preview(), 390, 844, "홈페이지 미리보기 · 휴대폰"),
}
for name,(html,w,h,title) in boards.items():
    (OUT/name).write_text(html, encoding="utf-8")

x=0; layout={}
for name,(html,w,h,title) in boards.items():
    layout[name]={"x":x,"y":0,"w":w,"h":h,"title":title,"expand":"fill"}
    x += w + (80 if w>400 else 60)
canvas={"v":3,"createdOnFiles":{"v":1,"at":"2026-10-31T06:00:00Z"},"title":"lovable 구조 시안 (오늘창업 · 밝은 테마)","launch":{"view":"canvas"},"pages":[],
 "boards":layout,"order":list(boards.keys()),
 "notes":{"t1":{"x":0,"y":-320,"text":"lovable 구조 1:1 시안 — PC는 크롬 실측, 휴대폰은 보내주신 캡처 6장 기준. 색·글꼴·내용만 오늘창업(밝은 테마)","kind":"title1","maxW":x},
          "t2":{"x":0,"y":-220,"text":"PC 실측: 왼쪽 메뉴 256(항목 240×32, 아이콘 20) · 본문 패널 8px 띄움 r16 · 인사말 30px/480 · 입력 상자 672×97 r28(안쪽 12, 글자 16) · 작업 화면 대화 열 451 · 미리보기 패널 r16 · 위 막대 48 · 알약 32 r999 / 설정 화면 실측은 '설정 화면 시안' 참고","kind":"body","maxW":1440},
          "t3":{"x":1520,"y":-220,"text":"휴대폰(캡처 기준): 위 56 — 왼쪽 워크스페이스 알약·오른쪽 아바타 / 인사 30px 2줄 / 입력 상자 r28 / 아래 떠 있는 3탭 막대 300×56 r999 / 대화 화면 위: ✕ · 이름 알약 · › / 프로필은 아래서 올라오는 시트 / 설정은 ✕·검색·목록·아래 버튼 / 미리보기 아래 막대: ‹대화 · 마이크 · … · 공개하기","kind":"body","maxW":1200}},
 "designSystems":[]}
(OUT/"canvas.json").write_text(json.dumps(canvas,ensure_ascii=False), encoding="utf-8")
print("ok", list(boards))
