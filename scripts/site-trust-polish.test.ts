import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toggleChip } from "../app/plan/chat/intake-ui/model";
import { START_CONDITIONS } from "../lib/plan-builder/intake-questions";

/*
 * 오픈 전 점검(2026-11-16) 작은 화면 다듬기 — 다시 생기지 않게.
 * 사업자 표기·환불 기준·가격 표기는 platform-legal / launch-pricing / route-loading 시험이 본다.
 */
const read = (path: string) => readFileSync(path, "utf8");

/* 1) '시작 조건 (최대 4개)' — 다섯째는 골라지지 않는다 */
const conditions = { id: "conditions", kind: "multi" as const, options: START_CONDITIONS.map(value => ({ value, label: value })) };
let picks: string[] = [];
for (const value of START_CONDITIONS.slice(0, 5)) picks = toggleChip(conditions, picks, value);
assert.equal(START_CONDITIONS.length >= 5, true, "시작 조건이 다섯 개 이상이어야 이 검사가 뜻이 있다");
assert.equal(picks.length, 4, "시작 조건은 4개까지만 골라진다");
assert.deepEqual(toggleChip(conditions, picks, picks[0]), picks.slice(1), "고른 것을 다시 누르면 빠진다");

/* 2) 새 대화 첫 화면의 다른 시작 길 두 개 — 높이 44px 이상의 단추 */
const intakeCss = read("app/plan/chat/intake.module.css");
assert.match(intakeCss, /\.entryOther button \{[^}]*min-height: 44px;/, "'아직 정한 사업이 없어요 / 이미 운영 중이에요'가 44px 보다 작다");

/* 3) 펼치는 행(고객센터 자주 묻는 질문 등) — 줄 전체가 눌린다 */
const settingsCss = read("components/settings-row.module.css");
assert.match(settingsCss, /\n\.disclosure \{ padding:0; \}/, "펼치는 행의 여백이 행(details)에 남아 글자만 눌린다");
assert.match(settingsCss, /\n\.summary \{[^}]*min-height:44px; padding:20px 0;/, "누르는 줄(summary)에 위아래 여백·44px 이 없다");

/* 4) 고객센터 채팅창 — 직접 문의를 보내면 접수 확인 한 줄 */
const widget = read("components/support-chat-widget.tsx");
assert.match(widget, /setReceipt\("문의를 접수했어요\./, "채팅창에서 보낸 뒤 접수 확인이 없다");
assert.match(widget, /className="support-chat-receipt" role="status"/, "접수 확인이 화면 읽기에 알려지지 않는다");

/* 5) 이름 바꾸기 오류 — 칸 바로 아래, 칸에 aria-invalid */
const planList = read("app/plan/PlanList.tsx");
assert.match(planList, /setRenameError\("사업 이름을 입력해 주세요\."\)/, "이름을 비운 오류가 목록 맨 아래(공용 error)로 간다");
assert.match(planList, /aria-invalid=\{renameError \? true : undefined\}/, "이름 칸에 오류 표시가 없다");
assert.doesNotMatch(planList, /setError\("사업 이름을 입력해 주세요\."\)/);

/* 6) 같은 것은 같은 이름으로 — 내 정보의 사업 상태는 목록과 같은 말, 새로 시작하는 단추는 '새 대화' */
const me = read("app/plan/me/page.tsx");
assert.match(me, /<StatusBadge tone=\{hub\.statusTone\} done=\{complete\}>\{hub\.status\}<\/StatusBadge>/, "내 정보 사업 상태가 목록과 다른 말('진행 중')이다");
assert.doesNotMatch(planList, />새 사업<\/Link>/, "새로 시작 단추는 '새 대화'로 부른다");

/* 7) 구글 로그인 버튼 — 한 번만 그린다(remember 가 바뀔 때 다시 그리지 않는다), 그리는 동안 원 밖으로 넘치지 않는다 */
const auth = read("components/account-auth-form.tsx");
assert.match(auth, /\}, \[mode, native\]\);/, "구글 버튼이 remember 가 바뀔 때마다 다시 그려진다");
assert.match(auth, /finishIdTokenLoginRef\.current\("google", response\.credential\)/, "구글 콜백이 최신 로그인 함수를 부르지 않는다");
assert.doesNotMatch(auth, /parent\.innerHTML = ""/, "그린 버튼을 지우고 다시 그리면 늦게 붙는 버튼과 겹친다");
assert.match(read("components/account-auth-form.module.css"), /\.root \.form div\.google \{ overflow: hidden; \}/, "구글 버튼이 그리는 동안 원 밖으로 넘친다");

console.log("site-trust-polish: ok");
