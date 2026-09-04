/*
 * 담당자가 답해야 정확한 종류인가.
 * 상담사(AI)는 창업 이야기만 하도록 묶여 있어 환불·결제 오류·계정·법률은 못 푼다.
 * 손님 말과 답을 함께 보고, 걸리면 그 이유를 한 줄로 돌려준다. 위젯과 정답 세트가 같이 쓴다.
 */
export function escalationReason(asked: string, answered: string): string | null {
  const text = `${asked}\n${answered}`;
  if (/환불|결제.*(안|오류|실패|취소)|취소.*결제|이중.*결제|영수증|세금계산서/.test(text)) return "결제·환불은 담당자가 직접 확인해 드려요.";
  if (/로그인.*(안|못)|비밀번호|계정|탈퇴|개인정보/.test(text)) return "계정 문제는 담당자가 확인해야 정확해요.";
  if (/소송|고소|법적|변호사|세무사|세금 신고|계약서 검토/.test(text)) return "법률·세무는 사람이 답하는 게 맞아요.";
  if (/사람.*(연결|바꿔|통화)|담당자|직원.*(연결|바꿔)|상담원/.test(asked)) return "담당자에게 바로 남길 수 있어요.";
  return null;
}

