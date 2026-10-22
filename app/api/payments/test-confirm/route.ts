export async function POST() {
  return Response.json(
    { error: { code: "TEST_PAYMENT_NOT_AVAILABLE", message: "테스트 결제 승인은 사용하지 않아요." } },
    { status: 410 },
  );
}
