# 레퍼런스 섹션 편집 방식 관찰 기록

관찰 대상: `app.ventureplanner.ai/plan/document/the_business/description`
관찰일: 2026-07-29 / 로그인 상태에서 직접 조작하며 확인

## 한 줄 요약

문서 전체가 **항상 편집 가능한 상태**다. "편집 모드"로 들어가는 버튼이 없고,
본문 블록마다 인라인 에디터가 이미 올라가 있다. 마우스를 올리면 그 블록에만
서식 툴바가 뜨고, 타이핑하면 몇 초 뒤 그 블록만 자동 저장된다.

## 화면 구조

```
[좌] 챕터/섹션 목차        [우] 문서
                          ├ Structural View / Document View 전환
                          ├ 인쇄 · 도움말 · Edit Section Setup
                          └ 본문 (블록의 나열)
```

`Edit Section Setup`을 누르면 질문 위저드로 돌아간다. 즉 **질문 화면과 문서 화면이
별도 라우트로 공존**하고, 문서 쪽에서 바로 글을 고칠 수 있다.

## 본문 블록 구조

블록 하나가 `div.plan-section-element` 이고, 본문 블록은 다음 3열로 되어 있다.

| 위치 | 요소 | 역할 |
| --- | --- | --- |
| 좌 | `i.input-handle.fi-tr-arrows-h-copy` | 드래그 핸들 (블록 순서 변경) |
| 중 | `div.ck-editor__editable[contenteditable]` | CKEditor 5 인라인 에디터 |
| 우 | `.v-popper` → `⋮` | 블록 메뉴 |

- **에디터는 블록마다 하나씩 따로 붙는다.** 이 페이지에만 4개가 떠 있었다
  (도입부, 1.1.1 사업 모델, 1.1.2 가치 제안, 1.1.3 경쟁 우위).
  문서 전체를 하나의 에디터로 두지 않는다.
- 제목(1.1.1 등)은 별도 블록이며 본문 에디터와 분리되어 있다.

### ⋮ 블록 메뉴

```
Protect | Copy | Resize | Delete
```

`Protect`가 있다는 건 **재생성 시 이 블록을 보존**한다는 뜻으로 보인다
(AI가 다시 쓸 때 사용자가 손댄 문단을 덮어쓰지 않게 하는 장치).

### 서식 툴바 (호버 시 그 블록 위에 뜸)

```
Paragraph/Heading · Bold · Italic · Underline · Bulleted List
· 들여쓰기 ± · 정렬 · Block quote · Insert table · Link · Undo · Redo
```

## 저장 방식 — 실측

문단 끝에 글자를 입력하고 네트워크를 관찰했다.

- 요청: `PATCH https://server.ventureplanner.ai/public/api/plan/plan_data_detail`
- 시점: 타이핑 멈추고 **약 2~3초 뒤 1회** (디바운스). 저장 버튼 없음.
- 본문:

```json
{
  "plan_id": 87856,
  "path": "sections.DescriptionSection.elements.1.output",
  "save_code": "eqw7OJN",
  "method": "set",
  "data": "<p>서울 캔버스는 …</p><p>기업들은 …</p>"
}
```

핵심:

1. **HTML을 그대로 저장한다.** 마크다운이 아니다.
2. **경로 지정 부분 갱신** — `sections.<섹션ID>.elements.<인덱스>.output`.
   문서 전체를 다시 보내지 않고 고친 블록만 보낸다.
3. `save_code`는 요청마다 붙는 토큰으로 보인다.

## 우리 구현과의 차이

| | 레퍼런스 | 오늘창업 (현재) |
| --- | --- | --- |
| 편집 진입 | 없음 — 늘 편집 가능 | 본문 클릭 → 편집 모드 |
| 편집 단위 | 블록(문단·목록) 하나씩 | 섹션 전체 |
| 편집 형태 | WYSIWYG 인라인 | 마크다운 textarea |
| 서식 | 툴바(굵게·목록·표·링크) | 마크다운 문법 직접 입력 |
| 저장 | 자동(디바운스), 블록 단위 | 저장 버튼, 섹션 전체 |
| 저장 형식 | HTML | 마크다운(+서버 렌더 HTML) |
| 블록 조작 | 순서 변경·복사·삭제·보호 | 없음 |

우리 쪽은 사용자가 **마크다운을 알아야** 서식을 넣을 수 있고, 한 글자 고치려 해도
섹션 전체 텍스트를 마주하게 된다. 레퍼런스는 워드처럼 그 자리에서 고친다.

## 재현 시 고려할 점

- 우리는 마크다운을 원본으로 삼고 PDF·DOCX를 거기서 만든다. HTML 편집을 받으면
  두 형식이 어긋날 수 있으므로, 저장 시 HTML → 마크다운 역변환을 하거나
  원본 형식 자체를 HTML로 옮기는 결정이 필요하다.
- `Protect`에 해당하는 개념이 없으면, 다시 생성할 때 사용자가 고친 문단이 사라진다.
