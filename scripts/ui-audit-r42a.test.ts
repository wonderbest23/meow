import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 화면 점검 r42-A(누르고 바꾸는 흐름) — 고친 것이 다시 흩어지지 않게 소스로 지킨다.
 * (지난 답을 고치면 예전 말풍선을 숨기는 것·'25000원' 가격 예시는 business-intake-ui · document-render 시험이 화면 결과로 본다)
 * 1) 계획서 [계획서에 반영하기]가 실패하면(503 등) 지난 실패로 숨기지 않고 안내와 [다시 시도]를 보인다
 * 2) 계획서 '직접 고치기' 창: 열면 초점이 창 안으로, 닫거나 바꾸면 연 자리(칩)로 돌아온다 · 휴대폰 닫기 단추 44px
 * 3) 개업 준비: 저장 안 한 체크·메모가 있으면 새로고침·나가기 전에 묻는다
 * 4) 다른 창에서 사업 이름을 바꾸면 작업실 머리줄도 돌아왔을 때 새 이름으로
 * 5) 홈페이지 편집기: 디자인을 바꾼 뒤 '고친 곳'이 새 디자인의 글 전부(212개)로 늘지 않는다
 * 6) 이미 보낸 대화 수정 예시는 다시 권하지 않는다
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const intake = read("app/plan/chat/BusinessIntake.tsx");
const startPrepare = intake.slice(intake.indexOf("const startPrepare = () => {"), intake.indexOf("const job = plan?.intake.job;"));
assert.match(startPrepare, /setChatSent\(true\)/, "반영하기 실패가 지난 실패(staleFailure)로 숨는다");
assert.match(intake, /editExamples\([^)]*\)\.filter\(text => !plan\.coach\.messages\.some/, "이미 보낸 수정 예시를 다시 권한다");

const fact = read("app/plan/document/FactEdit.tsx");
assert.match(fact, /box\.current\?\.focus\(\{ preventScroll: true \}\)/, "고치기 창을 열어도 초점이 창 밖에 남는다");
assert.match(fact, /opener\.focus\(\{ preventScroll: true \}\)/, "고치기 창을 닫으면 초점이 사라진다");
assert.match(fact, /data-fact-chip="\$\{CSS\.escape\(questionId\)\}"/, "사파리(단추에 초점이 안 감)에서 돌아갈 자리가 없다");
assert.match(fact, /role="dialog" aria-label=\{`\$\{fact\.label\} 바꾸기`\} tabIndex=\{-1\}/);
assert.match(read("app/plan/document/DocumentWorkspace.module.css"), /@media \(pointer: coarse\) \{ \.factPopover header button \{ min-width:44px; min-height:44px; \} \.factPopover footer \.primary \{ min-width:44px; \} \}/, "휴대폰 고치기 창 단추가 44px 보다 작다");
// 고치기 창 저장 단추는 공통 버튼(작은 크기 — 보이는 높이 36px, 누르는 자리 44px)
assert.match(fact, /<AppButton type="button" variant="primary" size="small" className=\{styles\.primary\}/, "고치기 창 저장 단추가 공통 버튼이 아니다");

assert.match(read("app/plan/workspace/LaunchWorkspace.tsx"), /useStudioDirty\("launch-draft", !sample && drafting,/, "저장 안 한 체크·메모가 새로고침에 말없이 사라진다");

const studio = read("app/plan/studio/Studio.tsx");
assert.match(studio, /setTitle\(current => \(fresher && found\.title\) \|\| current \|\| found\.title\)/, "다른 창에서 바꾼 사업 이름이 머리줄에 안 보인다");

const editor = read("components/brainwave-editor.tsx");
assert.match(editor, /designBase\.current = \{ page: next, over: generated \};/, "디자인을 바꾼 직후 모습을 기준으로 세지 않는다");
assert.doesNotMatch(editor, /const changed = page !== init\.page \? 1 :/, "자동 저장 뒤 init.page 가 바뀌어 고친 곳이 새 디자인 글 전부로 늘어난다");

console.log("ui audit r42-A: ok");
