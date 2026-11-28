# 한국 사업 정보 자료

손님 질문에 AI 가 근거로 쓰는 공식 정보입니다. 모양과 규칙은 `lib/business-facts/schema.ts` 에 있습니다.

| 파일 | 묶음 |
| --- | --- |
| registration.json | 사업자등록 |
| tax-type.json | 간이·일반과세 |
| tax-calendar.json | 세금 신고 일정 |
| permit.json | 업종별 영업신고·허가 |

넣는 순서
1. 정부 공식 페이지(내용이 적힌 페이지)를 열어 읽는다. 블로그·커뮤니티·AI 답변은 출처가 아니다.
2. `status: "draft"` 로 항목을 쓰고 출처 주소 · 근거 법 · 적용 기간을 채운다.
3. 사람이 출처를 다시 열어 확인한 뒤 `status: "verified"`, `checkedAt`, `checkedBy`, `recheckBy` 를 적는다.
4. `node --import tsx scripts/business-facts.test.ts` 가 통과해야 한다(신뢰성 시험에도 들어 있다).

`recheckBy` 가 지난 확인됨 항목이 있으면 시험이 떨어진다 — 출처를 다시 열어 확인하고 날짜를 고친다.
