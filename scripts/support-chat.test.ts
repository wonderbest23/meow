import assert from "node:assert/strict";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";

  const {
    findSupportFaq,
    findSupportFaqCandidates,
    findSupportFaqInstant,
    findSupportFaqKeywordMatches,
    supportFaqCategories,
    supportKnowledgeText,
  } = await import("../lib/support-chat/faq");

  const {
    getAdminChat,
    getCustomerChat,
    listAdminConversationRecords,
    listAdminConversations,
    sendAdminMessage,
    sendCustomerMessage,
    setConversationStatus,
  } = await import("../lib/support-chat/repository");

  assert.equal(supportFaqCategories.length, 7);
  /* 직접 친 단골 질문은 AI 없이 FAQ 로 바로 — 띄어쓰기·어미가 달라도 잡는다 */
  const instant: [string, string][] = [
    ["가격 얼마예요?", "pay-price"],
    ["환불하고 싶어요", "pay-refund"],
    ["카드로 결제돼요?", "pay-method"],
    ["결제 내역 어디서 봐요", "account-mypage"],
    ["비번 까먹었어요", "account-recover"],
    ["워드 파일로 받을 수 있어요?", "files-download"],
    ["중간에 나가면 날아가요?", "write-continue"],
    ["핸드폰이랑 컴퓨터에서 같이 봐요?", "account-device"],
    ["작성이 멈췄어요", "error-generate"],
    ["얼마나 걸려요?", "start-time"],
  ];
  for (const [question, id] of instant) assert.equal(findSupportFaqInstant(question)?.id, id, question);
  /* 애매하거나 FAQ 밖이면 null — 지금처럼 AI 가 답한다 */
  for (const question of ["오늘 날씨 어때", "카페 창업하려면 자본금 얼마 필요해요?", "가격이랑 환불 규정 알려줘요", "ㅋㅋㅋ", "가격은요? 환불은요?"]) {
    assert.equal(findSupportFaqInstant(question), null, question);
  }

  assert.equal(findSupportFaq("가격이 얼마예요")?.id, "pay-price");
  assert.equal(findSupportFaq("환불은 어떻게 되나요")?.id, "pay-refund");
  assert.equal(findSupportFaq("완전히 무관한 문장입니다"), null);
  assert.equal(
    findSupportFaqCandidates("결제 전에는 어디까지 무료인가요?", 1)[0]?.id,
    "sample-free",
  );
  assert.equal(findSupportFaqKeywordMatches("샘플 완성본을 미리 볼 수 있나요?", 1)[0]?.id, "sample-docs");
  assert.equal(findSupportFaqKeywordMatches("세금 신고와 세무사 연결도 해주나요?", 1)[0]?.id, "error-scope");
  assert.equal(findSupportFaqKeywordMatches("휴대폰 PC 같은 문서를 볼 수 있나요?", 1)[0]?.id, "account-device");
  assert.match(supportKnowledgeText("가격이 얼마인가요?"), /사업 하나당 49,000원\(출시 기념가\)/);
  assert.match(supportKnowledgeText("카드로 결제할 수 있나요?"), /나이스페이 결제창/);
  assert.match(supportKnowledgeText("제작 후 단순 변심 환불이 되나요?"), /단순 변심 환불이 제한/);
  assert.match(supportKnowledgeText("샘플 볼 수 있나요?"), /완성 예시/);
  assert.doesNotMatch(supportKnowledgeText(""), /plan\/start|샘플 문서 3부/, "없는 화면·옛 샘플을 안내하지 않는다");

  const guest = `support-test-${crypto.randomUUID()}`;
  const otherGuest = `support-test-${crypto.randomUUID()}`;

  const initial = await getCustomerChat(guest);
  assert.equal(initial.conversation, null);
  assert.deepEqual(initial.messages, []);

  const customerChat = await sendCustomerMessage(guest, "첫 상담 메시지");
  assert.equal(customerChat.messages.length, 1);
  assert.equal(customerChat.messages[0].sender, "customer");
  assert.equal(customerChat.conversation?.unreadByAdmin, 1);

  const isolated = await getCustomerChat(otherGuest);
  assert.equal(isolated.conversation, null);

  const conversations = await listAdminConversations();
  const conversation = conversations.find((item) => item.id === customerChat.conversation?.id);
  assert.ok(conversation);

  const opened = await getAdminChat(conversation.id);
  assert.equal(opened.conversation?.unreadByAdmin, 0);

  const replied = await sendAdminMessage(conversation.id, "관리자 답장");
  assert.equal(replied.messages.length, 2);
  assert.equal(replied.messages[1].sender, "admin");
  assert.equal(replied.conversation?.unreadByCustomer, 1);

  const customerRead = await getCustomerChat(guest);
  assert.equal(customerRead.messages[1].body, "관리자 답장");
  assert.equal(customerRead.conversation?.unreadByCustomer, 0);

  // 관리자 목록 — 답장 뒤에도 손님이 마지막으로 한 말을 보여 주고, 주인 해시는 서버 안에만 있다
  const records = await listAdminConversationRecords();
  const record = records.find((item) => item.id === conversation.id);
  assert.equal(record?.lastMessagePreview, "관리자 답장");
  assert.equal(record?.lastCustomerPreview, "첫 상담 메시지");
  assert.equal(record?.ownerHash, guest);
  assert.ok(!("ownerHash" in (conversations.find((item) => item.id === conversation.id) ?? {})));

  // DB 없는 데모에서는 계정이 없으니 '로그인 안 한 손님'
  const { resolveSupportCustomers } = await import("../lib/support-chat/admin-customers");
  assert.deepEqual((await resolveSupportCustomers([guest])).get(guest), { kind: "guest" });

  const closed = await setConversationStatus(conversation.id, "closed");
  assert.equal(closed.status, "closed");

  const reopened = await sendCustomerMessage(guest, "추가 문의");
  assert.equal(reopened.conversation?.status, "open");

  console.log("support chat tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
