export async function POST() {
  return Response.json(
    { error: { code: "PAYMENT_WEBHOOK_NOT_AVAILABLE", message: "결제사 웹훅은 아직 연결하지 않았습니다." } },
    { status: 410 },
  );
}
