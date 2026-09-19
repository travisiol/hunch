import type { Metadata } from "next";
import { PredictList } from "@/components/predict/PredictList";

export const metadata: Metadata = { title: "Predictions", description: "Yes or no markets on Robinhood Chain assets. Parimutuel payouts, resolved by Chainlink." };

export default function PredictPage() {
  return <PredictList />;
}
