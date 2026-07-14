import { PaymentSuccessClient } from "../../../components/payment-result-client";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => {
    const item = params[key];
    return Array.isArray(item) ? item[0] ?? "" : item ?? "";
  };
  return (
    <PaymentSuccessClient
      paymentKey={value("paymentKey")}
      orderId={value("orderId")}
      amount={Number(value("amount"))}
    />
  );
}
