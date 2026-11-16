# 일반 모드 AI 읽기 — 시험 100문제

사이트의 읽기 지시문은 `lib/plan-builder/intake-reader.ts`(`READER_RULES`, `checkReaderResult`)에 있다.

- `cases.json`: 문제(묻던 칸 · 지금 표 · 사용자가 적은 말)
- `expected.json`: 정답(꼭 있어야 할 칸 · 있으면 안 되는 칸 · 모름 · 되물음 · 뜻 분류)
- `grade.cjs`: 채점. 모델 답을 이 폴더에 `out-<이름>.json`(`[{id, intent, updates:[{field,value,quote}], unknown, ask}]`)으로 두고 `node grade.cjs out-<이름>.json`

기준 점수(2026-11-16): Haiku 5.5 + 사이트 코드 97/100, 평균 1.6초, p95 2.9초, 한 번에 약 0.54원.
