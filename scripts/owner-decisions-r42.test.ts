import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatReflectStyle } from "../app/plan/chat/intake-ui/model";

/*
 * 대표 결정 r42 — 정한 것이 다시 흩어지지 않게 지킨다.
 * 1) PC 작업실에서 오른쪽에 계획서 칸이 보이면 '계획서에 반영하기'는 계획서 칸 위 파란 단추 하나만 — 대화 칸 아래 옅은 링크는 숨긴다.
 *    계획서 칸이 안 보이면(휴대폰·태블릿 대화 탭, PC 다른 탭) 대화 칸에 그대로 보이고,
 *    반영 실패 안내·[다시 시도](점검 r42)는 단추 모양과 상관없이 어느 자리에서든 보인다.
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1) 모양 규칙
assert.equal(chatReflectStyle(true, "plan"), "none", "PC 에서 계획서 칸이 보이면 대화 칸 링크는 숨긴다");
for (const side of ["homepage", "launch", "maintenance", null, undefined]) {
  assert.equal(chatReflectStyle(true, side), "link", `PC 에서 계획서 칸이 안 보이면(${side}) 대화 칸 링크가 보인다`);
}
for (const side of ["plan", "homepage", null, undefined]) {
  assert.equal(chatReflectStyle(false, side), "button", `휴대폰·태블릿·예전 화면은 큰 단추 그대로(${side})`);
}

const intake = read("app/plan/chat/BusinessIntake.tsx");
assert.match(intake, /const reflectStyle = chatReflectStyle\(pro, studioSide\);/);
assert.equal(intake.match(/<NextStepAction reflect=\{reflectStyle\}/g)?.length, 3, "대화 칸의 반영 단추 세 자리가 같은 규칙을 쓴다");
assert.doesNotMatch(intake, /reflect=\{pro \?/, "자리마다 따로 정하지 않는다");
// 계획서 칸이 보이는지는 작업실이 넘겨 준다 — 넓은 화면에서 잠기지 않은 오른쪽 탭
assert.match(read("app/plan/studio/Studio.tsx"), /<BusinessIntake [^>]*studioSide=\{wide && !locks\[rightTab\] \? rightTab : null\} \/>/);

// 숨겨도 작성 중이면 진행 게이지는 남고, 숨기는 것은 단추뿐이다
const panels = read("app/plan/chat/intake-ui/IntakePanels.tsx");
assert.match(panels, /if \(reflect === "none" && !jobActive\) return null;/);
assert.match(panels, /className=\{reflect === "link" \? styles\.textButton : undefined\}/, "PC 다른 탭은 지금처럼 옅은 링크");

// 반영 실패 안내 · [다시 시도]는 NextStepAction 밖 대화 칸 알림에 있다 — 링크를 숨겨도 그대로 보인다
assert.match(intake, /setPreparing\(true\); setChatSent\(true\);/, "반영하기를 누른 것도 방금 보낸 요청(점검 r42)");
assert.match(intake, /\{error && !ideaError && !staleFailure && <div className=\{styles\.notice\} role="alert">/);
const notice = intake.indexOf("{error && !ideaError && !staleFailure && <div className={styles.notice}");
assert.ok(!intake.slice(notice, notice + 1200).includes("NextStepAction"), "실패 알림은 반영 단추와 따로 그린다");

// 계획서 칸의 파란 단추와 그 실패 안내 — 단추가 남아 있어 다시 누를 수 있다
const workspace = read("app/plan/document/DocumentWorkspace.tsx");
assert.match(workspace, /<RewriteConfirm snapshot=\{facts\.snapshot\} disabled=\{facts\.busy\} label="계획서에 반영하기" className=\{styles\.noticeAction\} onConfirm=\{\(\) => void reflectFacts\(\)\} \/>/);
assert.match(workspace, /\{facts\.error && <span className=\{styles\.factError\} role="alert">/, "계획서 칸에서 반영이 실패해도 안내가 보인다");
assert.match(workspace, /\{factsUnapplied && facts\.snapshot && <RewriteConfirm [^>]*label="계획서에 반영하기" className=\{styles\.primary\}/, "직접 고치는 중에는 칸 위 줄의 파란 단추");
// 계획서 칸에서 반영이 잠시 실패하면(503 · 연결 끊김) 안내 옆에 [다시 시도] — 대화 칸 알림과 같다. 횟수 모자람(402)·로그인(401)·충돌(409)은 지금처럼 각자의 안내
const factEdit = read("app/plan/document/FactEdit.tsx");
assert.equal(factEdit.match(/\.\.\.\(command\.action === "prepare" \? \{ retry: true \} : \{\}\)/g)?.length, 2, "잠시 실패(서버 오류 · 연결 끊김)일 때만 다시 시도");
assert.doesNotMatch(factEdit, /status === (?:402|401|409)[^\n]*retry: true/);
assert.match(workspace, /\{facts\.error\.retry && <button type="button" className=\{styles\.factRetry\} disabled=\{facts\.busy\} onClick=\{retryReflect\}><RefreshCw size=\{15\} aria-hidden="true" \/>다시 시도<\/button>\}/, "읽는 화면 안내 줄");
assert.ok(workspace.includes("<FactCard edit={facts} onPick={(id, rect) => setFactPick({ id, rect })} onRetry={retryReflect} />"), "직접 고치는 중의 사실 카드");
assert.match(workspace, /const retryReflect = \(\) => void reflectFacts\(\);/);
assert.match(factEdit, /\{edit\.error\.retry && onRetry && <button type="button" className=\{styles\.factRetry\}/);
const css = read("app/plan/document/DocumentWorkspace.module.css");
assert.match(css, /\.factRetry \{[^}]*min-height:32px;/, "PC 누르는 자리 32px");
assert.match(css, /@media \(max-width:1023px\) \{ \.factRetry \{ min-height:44px; \} \}/, "휴대폰·태블릿 44px");

console.log("owner-decisions-r42: ok");
