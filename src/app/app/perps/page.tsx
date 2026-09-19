import type { Metadata } from "next";
import { PerpsList } from "@/components/perps/PerpsList";

export const metadata: Metadata = { title: "Perpetuals", description: "Perpetual futures on Robinhood Chain assets, priced by Chainlink. Up to 20x, funding every hour." };

export default function PerpsPage() {
  return <PerpsList />;
}
