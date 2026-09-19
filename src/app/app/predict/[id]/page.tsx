import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PredictDetail } from "@/components/predict/PredictDetail";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Market ${id}`, description: "A yes or no market on a Robinhood Chain asset, settled parimutuel from a Chainlink feed." };
}

export default async function PredictMarketPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  return <PredictDetail id={BigInt(id)} />;
}
