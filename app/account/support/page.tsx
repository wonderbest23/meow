import type { Metadata } from "next";
import SupportCenter from "./SupportCenter";

export const metadata: Metadata = { title: "고객센터 | 오늘창업" };

export default function SupportPage() {
  return <SupportCenter />;
}
