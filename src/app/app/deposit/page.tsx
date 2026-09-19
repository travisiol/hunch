import type { Metadata } from "next";
import { Deposit } from "@/components/Deposit";

export const metadata: Metadata = { title: "Deposit", description: "Fund one USDG balance that backs every bet and every position." };

export default function DepositPage() {
  return <Deposit />;
}
