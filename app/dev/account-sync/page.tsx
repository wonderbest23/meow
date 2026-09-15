import { notFound } from "next/navigation";
import AccountSyncFixture from "./AccountSyncFixture";

export default function AccountSyncPreview() {
  if (process.env.NODE_ENV !== "development" || process.env.SUPABASE_URL !== "http://127.0.0.1:55431" || process.env.PLAN_ACCOUNT_LINKING_ENABLED !== "true") notFound();
  return <AccountSyncFixture />;
}
