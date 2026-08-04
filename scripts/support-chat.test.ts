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
  assert.match(supportKnowledgeText("가격이 얼마인가요?"), /정부지원 PSST 사업계획서 169,000원/);
  assert.match(supportKnowledgeText("카드로 결제할 수 있나요?"), /나이스페이 결제창/);
  assert.match(supportKnowledgeText("제작 후 단순 변심 환불이 되나요?"), /단순 변심 환불이 제한/);
  assert.match(supportKnowledgeText("샘플 볼 수 있나요?"), /샘플 문서 3부/);

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
