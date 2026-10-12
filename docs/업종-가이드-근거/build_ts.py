"""배치 조사 결과(배치N.json)를 앱 코드로 옮긴다. 형식 규칙을 어기면 멈추고 무엇이 틀렸는지 알려 준다.
다시 만들 때: python3 docs/업종-가이드-근거/build_ts.py lib/plan-builder/industry-playbooks-extended.ts"""
import json, glob, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
EXISTING = {"bakery", "cafe", "restaurant", "snack", "side-dish", "beauty", "academy", "online-store", "gym", "lodging", "brokerage", "rental-room", "pet-treat", "moving-truck", "laundry"}
ALLOWED_DIGITS = re.compile(r"제\d종(?:\s*[·,]\s*제\d종|\s*또는\s*제\d종)*\s*근린생활시설")

guides, extensions, decisions, problems = [], [], [], []
for path in sorted(glob.glob(os.path.join(HERE, "배치*.json")) or glob.glob(os.path.join(HERE, "batch-*.json"))):
    data = json.load(open(path))
    batch = os.path.basename(path)
    for g in data.get("guides", []):
        gid = g["id"]
        where = f"{batch}:{gid}"
        if gid in EXISTING: problems.append(f"{where} 기존 id와 겹침")
        if not (3 <= len(g["needs"]) <= 6): problems.append(f"{where} needs {len(g['needs'])}개")
        if not (4 <= len(g["steps"]) <= 8): problems.append(f"{where} steps {len(g['steps'])}개")
        if not (2 <= len(g["pitfalls"]) <= 5): problems.append(f"{where} pitfalls {len(g['pitfalls'])}개")
        for s in g["steps"]:
            text = ALLOWED_DIGITS.sub("", s["title"] + s["detail"])
            if re.search(r"\d", text): problems.append(f"{where} 단계에 숫자: {s['title']}")
        if "오늘창업 홈페이지" not in g["steps"][-1]["where"]: problems.append(f"{where} 마지막 단계에 오늘창업 홈페이지 없음")
        if not any("사업자등록" in s["title"] + s["detail"] or "세무서" in s["where"] for s in g["steps"]): problems.append(f"{where} 사업자등록 단계 없음")
        if g.get("keywords"):
            import subprocess
            check = subprocess.run(["node", "-e", "new RegExp(process.argv[1])", g["keywords"]], capture_output=True, text=True)
            if check.returncode: problems.append(f"{where} 키워드 정규식 오류(JS) {check.stderr.strip()[:120]}")
        guides.append({**g, "batch": batch})
    extensions += [{**e, "batch": batch} for e in data.get("extensions", [])]
    decisions += [{**d, "batch": batch} for d in data.get("verifyDecisions", [])]

ids = [g["id"] for g in guides]
dups = {i for i in ids if ids.count(i) > 1}
if dups: problems.append(f"id 중복 {sorted(dups)}")
print(f"가이드 {len(guides)}개 · 기존 확장 {len(extensions)}건 · 확인 필요 결정 {len(decisions)}건")
if problems:
    print("\n".join(problems))
    sys.exit(1)

def ts(value):
    return json.dumps(value, ensure_ascii=False)

def links(g):
    out = []
    for s in g.get("sources", []):
        url = s.get("url", "")
        if s.get("opened") and url.startswith("https://") and not any(o["url"] == url for o in out):
            out.append({"title": s["title"][:60], "url": url})
        if len(out) == 3: break
    return out

lines = [
    "/*",
    " * 업종 가이드 확장(2026-10-12) — 표준산업분류 1,205개를 같은 법 절차 묶음으로 나눠(제외 219개: 1인·소상공인이 현실적으로 시작할 수 없는 업종)",
    " * 묶음마다 공식 원문(국가법령정보센터·정부24·소관 기관)으로 확인해 만든 가이드. 근거는 docs/업종-가이드-확장-2026-10-12.md.",
    " * 이 파일은 조사 결과에서 만든다(형식 규칙은 industry-playbooks.test.ts가 지킨다). 기본 가이드(industry-playbooks.ts)가 같은 업종에 더 구체적이면 그쪽이 이긴다.",
    " */",
    'import type { IndustryPlaybook } from "./industry-playbooks";',
    "",
    "export const EXTENDED_PLAYBOOKS: IndustryPlaybook[] = [",
]
for g in guides:
    lines += [
        "  {",
        f"    id: {ts(g['id'])}, name: {ts(g['name'])}, ksic: {ts(g['ksic'])},",
        f"    needs: {ts(g['needs'])},",
        "    steps: [",
        *[f"      {{ title: {ts(s['title'])}, where: {ts(s['where'])}, detail: {ts(s['detail'])} }}," for s in g["steps"]],
        "    ],",
        f"    pitfalls: {ts(g['pitfalls'])},",
        f"    links: {ts(links(g) or [{'title': '국가법령정보센터 · 법령 원문', 'url': 'https://www.law.go.kr'}])},",
        "  },",
    ]
lines += ["];", "", "/** 사업 설명으로 찾을 말(구체적인 묶음만 — 넓은 자유업 묶음은 업종 코드로만 찾는다) */",
          "export const EXTENDED_PLAYBOOK_WORDS: Array<[string, RegExp]> = ["]
for g in guides:
    if g.get("keywords"):
        lines.append(f"  [{ts(g['id'])}, /{g['keywords']}/],")
lines += ["];", ""]
open(OUT, "w").write("\n".join(lines))
json.dump({"extensions": extensions, "decisions": decisions}, open(os.path.join(HERE, "merge-notes.json"), "w"), ensure_ascii=False, indent=1)
print("저장함", OUT)
