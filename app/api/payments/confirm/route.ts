export async function POST() {
  return Response.json(
    { error: { code: "CARD_PAYMENT_NOT_AVAILABLE", message: "현재는 계좌이체로만 신청할 수 있습니다." } },
    { status: 410 },
  );
}
