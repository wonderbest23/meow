# lovable.dev 로그인 후 화면 통째 캡처 (2026-11-01)

내장 브라우저(로그인 상태)에서 `document.body` 전체(스크립트 제외)와 페이지가 실제로 쓰는 CSS 파일 전부를 그대로 받은 것. 배치·간격·글자·둥글기·색이 원본과 같다.

| 파일 | 화면 | 폭 | 테마 | 비고 |
|---|---|---|---|---|
| dashboard-pc-dark/-light.html | 로그인 후 첫 화면(/dashboard) | 1440 | 다크/라이트 | 둘 다 실제 DOM |
| dashboard-mobile-dark/-light.html | 첫 화면 휴대폰 | 375 | 다크/라이트 | 실제 DOM(아래 탭 막대 포함) |
| project-pc-dark.html | 프로젝트 작업 화면(대화+미리보기) | 1440 | 다크 | 실제 DOM |
| project-pc-light.html | 〃 | 1440 | 라이트 | 다크 DOM에 `html.light`만 바꾼 파생본(테마는 html 클래스로만 바뀜) |
| project-mobile-dark/-light.html | 프로젝트 휴대폰(대화) | 375 | 다크/라이트(파생) | ✕·이름·› 머리, 아래 입력 상자 |
| dashboard.css / project.css | 그 화면이 불러온 CSS 전부(원본 순서) | | | Tailwind v4 + lovable 토큰(`:root`/`.dark`) |

- 여는 법: 폴더를 정적 서버로 열기(`python3 -m http.server`). 이미지(아바타·썸네일)는 개인정보라 `about:blank`.
- 테마: `<html class="dark">` ↔ `class="light"` 하나로 전체가 바뀐다. 색 토큰은 CSS의 `:root{…}` / `.dark{…}`(oklch).
- 글꼴: 원본 `Camera Plain Variable`은 lovable 전용이라 못 쓴다 → Pretendard. 크기·굵기·행간은 그대로.
- 지운 것: 이메일→owner@example.com, 이름→사용자, 워크스페이스→오늘창업, 프로젝트→sample-project-a/b, 이미지 URL→about:blank, ID→PLACEHOLDER.
- 쓰는 법: HTML/CSS를 복붙하는 게 아니라 요소 트리와 클래스의 수치(간격·크기·둥글기·색 토큰)를 우리 컴포넌트에 옮긴다. 기능·문구는 우리 것.
