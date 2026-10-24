import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyEditRequest } from "../lib/plan-builder/intake-edit-filter";
import { PLAN_EDIT_MAX_LENGTH, planChapterComposeRequest, planChapterEditLabel, planSectionEditMessage } from "../lib/plan-builder/studio-plan-edit";

/* 장 이름표 — "{n}장 {제목} 고치기", 제목 안 겹친 빈칸은 하나로 */
{
  assert.equal(planChapterEditLabel(2, "고객과  시장"), "2장 고객과 시장 고치기");
  const request = planChapterComposeRequest(3, "목표", ["", "goals/corporate", "goals/next"]);
  assert.deepEqual(request, { target: "plan-section", label: "3장 목표 고치기", sectionId: "goals/corporate" }, "첫 항목 열쇠가 sectionId");
  assert.equal("sectionId" in planChapterComposeRequest(1, "사업 개요", []), false, "항목이 없으면 sectionId 를 빼고 보낸다");
}

/* 대화로 보낼 글 — 손님 말 앞에 장 이름을 붙이되, 서버의 규칙 거르기 갈래가 바뀌면 붙이지 않는다 */
{
  const label = planChapterEditLabel(2, "고객과 시장");
  assert.equal(planSectionEditMessage(label, "  주 고객을 1인 가구로 바꿔줘 "), "[2장 고객과 시장] 주 고객을 1인 가구로 바꿔줘");
  assert.equal(classifyEditRequest(planSectionEditMessage(label, "주 고객을 1인 가구로 바꿔줘")), "in_scope");
  // 빈 말은 빈 말 그대로 — 장 이름만으로 AI 를 부르지 않는다(서버가 정해진 '바꿀 내용을 적어 주세요'로 끝낸다)
  assert.equal(planSectionEditMessage(label, "   "), "");
  // '2장'의 숫자 때문에 말투 요청이 AI 로 넘어가면 안 된다 — 붙이지 않고 보내 그대로 '말투는 바꾸지 않아요'
  assert.equal(classifyEditRequest("말투를 부드럽게 바꿔줘"), "style");
  assert.equal(planSectionEditMessage(label, "말투를 부드럽게 바꿔줘"), "말투를 부드럽게 바꿔줘");
  // 잡담도 갈래가 그대로
  assert.equal(planSectionEditMessage(label, "안녕"), "안녕");
  // 장 제목의 낱말('톤') 때문에 사업 요청이 '말투'로 막히면 안 된다
  const tone = planChapterEditLabel(4, "브랜드 톤");
  assert.equal(classifyEditRequest("[4장 브랜드 톤] 가격을 오천원으로"), classifyEditRequest("가격을 오천원으로"));
  assert.equal(planSectionEditMessage(tone, "가격을 오천원으로"), "[4장 브랜드 톤] 가격을 오천원으로");
  // 다른 사업으로 바꾸기는 장 이름이 붙어도 같은 갈래
  assert.equal(classifyEditRequest(planSectionEditMessage(label, "다른 사업으로 할래")), "new_business");
  // 붙이면 서버 글자 수를 넘는 말은 손님 말 그대로(서버가 같은 오류를 보인다)
  const long = "가".repeat(PLAN_EDIT_MAX_LENGTH - 3);
  assert.equal(planSectionEditMessage(label, long), long);
  assert.equal(planSectionEditMessage("", "가격을 올려줘"), "가격을 올려줘", "이름표가 없으면 그대로");
}

/* 계획서 칸 — 작업실 안에서만 장 머리에 '대화로 고치기'·'직접 고치기', 휴대폰 도구 줄에도 */
{
  const workspace = readFileSync(new URL("../app/plan/document/DocumentWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /planChapterComposeRequest\(/, "장 머리 단추가 같은 요청 모양을 쓴다");
  assert.match(workspace, /nav\?\.composeInChat/, "작업실 밖(composeInChat 없음)에서는 단추가 없다");
  assert.match(workspace, />대화로 고치기</, "고치기 단추 이름은 '대화로 고치기' · '직접 고치기' 둘뿐");
  assert.doesNotMatch(workspace, /문장에서 바로 고치기|채팅으로 수정하기|이 장을 대화로 고치기/);
  assert.match(workspace, /직접 고치기/);
  assert.match(workspace, /styles\.chapterChatEdit/, "휴대폰 도구 줄의 대화로 고치기");
  assert.doesNotMatch(workspace, /registerEditHandler\(\s*["']plan-section/, "plan-section 처리기는 등록하지 않는다(대화 칸의 기존 채팅 수정을 쓴다)");
  const css = readFileSync(new URL("../app/plan/document/DocumentWorkspace.module.css", import.meta.url), "utf8");
  assert.match(css, /@media \(min-width:901px\) \{ \.chapterChatEdit \{ display:none; \} \}/, "도구 줄 단추는 좁은 화면에서만");

  /* 작업실 PC 새 화면(1024px 이상, 2026-10-24 승인 시안) — 휴대폰·작업실 밖은 예전 그대로 */
  assert.match(workspace, /const studioPc = studioHeader && wide;/, "새 화면은 머리줄이 있는 작업실 + 넓은 화면에서만");
  assert.match(workspace, /useStudioHeaderCenter\(centerInHeader \? picker : null\)/, "장 고르기는 머리줄 가운데 알약으로");
  assert.match(workspace, /\(isSample \|\| pane\) && !studioPc && grouped\.length > 0 && <aside/, "새 화면에는 왼쪽 목차 칸이 없다");
  assert.match(workspace, /\{!studioPc && <div className=\{styles\.readingBar\}>/, "새 화면은 예전 도구 줄 대신 칸 위 얇은 줄");
  assert.match(workspace, /\{studioPc && <div className=\{styles\.strip\}>/);
  assert.match(workspace, /className=\{styles\.pager\} aria-label="문서 장 이동"/, "아래 가운데 떠 있는 장 넘기기");
  assert.match(workspace, /!summaryMode && !continuous && !studioPc && <nav className=\{styles\.paging\}/, "예전 이전 장·다음 장 줄은 새 화면에서 뺀다");
  assert.match(workspace, /const directInChapter = directEditable && !studioPc;/, "새 화면의 '직접 고치기'는 얇은 줄에 하나만");
  assert.match(workspace, /previewFactChanges\(/, "대화 수정 제안을 본문에 미리 겹쳐 보인다");
  assert.match(workspace, /const previewOn = EDIT_CHAT && studioPc && factEditable && ready && !props\.writing;/, "미리보기 읽기는 새 화면에서만");
  assert.match(css, /\.pager \{ position:sticky; bottom:16px;/);
  assert.match(css, /\.page\[data-studio-pc\] \.arrival \{ top:54px; \}/, "새 항목 알림은 얇은 줄(42px) 아래에 붙는다");
  const picker = readFileSync(new URL("../app/plan/document/ChapterPicker.tsx", import.meta.url), "utf8");
  assert.match(picker, /aria-haspopup="menu"/);
  assert.match(picker, /role="menuitemradio"/);
  for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"]) assert.match(picker, new RegExp(`event\\.key === "${key}"`), `장 목록 키보드: ${key}`);
  assert.match(picker, /createPortal\(/, "목록은 body 에 띄워 아래 카드에 가리지 않는다");
  const fact = readFileSync(new URL("../app/plan/document/FactEdit.tsx", import.meta.url), "utf8");
  assert.match(fact, /job\?\.kind !== "edit" \|\| job\.status !== "complete" \|\| !job\.proposal\?\.length \|\| job\.proposalStatus/, "열려 있는(바꾸기·취소 전) 제안만 미리 보인다");
  assert.match(fact, /const ranges = findFactRanges\(text, changes, before\);/, "금액은 사실 고치기와 같은 앞말 규칙으로 가린다");
}

/* 숨은 계획서 칸 — 새로 읽기 번호(refresh)·다시 보일 때 서버에서 바뀐 장(채팅 수정의 금액 바꿔 넣기 등)을 다시 받는다 */
{
  const body = readFileSync(new URL("../app/plan/document/PlanDocumentBody.tsx", import.meta.url), "utf8");
  assert.match(body, /syncFromServer\(/);
  assert.match(body, /edits\.syncServer\(/, "고치는 중인 장(초안·저장 중)은 덮지 않는다");
  const edits = readFileSync(new URL("../app/plan/document/use-document-edits.ts", import.meta.url), "utf8");
  assert.match(edits, /function syncServer\(/);
}

console.log("studio plan edit: ok");
