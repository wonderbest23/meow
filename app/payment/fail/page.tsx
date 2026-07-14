import { PaymentFailClient } from "../../../components/payment-result-client";

export default async function PaymentFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => {
    const item = params[key];
    return Array.isArray(item) ? item[0] ?? "" : item ?? "";
  };
  return <PaymentFailClient code={value("code")} message={value("message")} />;
}
