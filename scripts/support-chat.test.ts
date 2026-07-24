import assert from "node:assert/strict";

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";

  const {
    findSupportFaq,
    findSupportFaqCandidates,
    findSupportFaqKeywordMatches,
    supportFaqCategories,
    supportKnowledgeText,
  } = await import("../lib/support-chat/faq");

  const {
    getAdminChat,
    getCustomerChat,
    listAdminConversations,
    sendAdminMessage,
    sendCustomerMessage,
    setConversationStatus,
  } = await import("../lib/support-chat/repository");

  assert.equal(supportFaqCategories.length, 7);
  assert.equal(findSupportFaq("다음 버튼이 안 눌려요")?.id, "error-disabled");
  assert.equal(findSupportFaq("도메인 비용이 궁금해요")?.id, "landing-domain");
  assert.equal(findSupportFaq("완전히 무관한 문장입니다"), null);
  assert.equal(
    findSupportFaqCandidates("창을 닫으면 자료 제작도 취소되나요?", 1)[0]?.id,
    "project-background",
  );
  assert.deepEqual(
    findSupportFaqKeywordMatches("자료 제작 중 창을 닫으면 취소되나요?", 3).map((item) => item.id),
    ["project-background"],
  );
  assert.equal(findSupportFaqKeywordMatches("세금 신고와 세무사 연결도 해주나요?", 1)[0]?.id, "error-scope");
  assert.deepEqual(
    findSupportFaqKeywordMatches("로그인 안 하고 휴대폰 작업을 PC에서 볼 수 있나요?", 3).map((item) => item.id),
    ["account-other-device", "account-guest"],
  );
  assert.match(supportKnowledgeText("카드로 결제할 수 있나요?"), /카드와 토스페이먼츠 결제는 아직 제공하지 않습니다/);
  assert.match(supportKnowledgeText("PPT를 수정할 수 있나요?"), /저장한 내용은 내려받는 PPTX에도 반영됩니다/);
  assert.match(supportKnowledgeText("제작 후 단순 변심 환불이 되나요?"), /단순 변심 환불이 제한됩니다/);
  assert.match(supportKnowledgeText("결과물이 계약과 다르면 환불되나요?"), /법정 예외/);

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
