import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PerpDetail } from "@/components/perps/PerpDetail";
import { ASSET_BY_SYMBOL, perpIndex } from "@/config/assets";

type Props = { params: Promise<{ symbol: string }> };

const clean = (s: string) => s.toUpperCase().replace(/-PERP$/, "");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const symbol = clean((await params).symbol);
  const asset = ASSET_BY_SYMBOL[symbol];
  return { title: asset ? `${symbol}-PERP` : "Perpetual", description: asset ? `${asset.name} perpetual futures, priced by Chainlink, up to 20x.` : undefined };
}

export default async function PerpPage({ params }: Props) {
  const symbol = clean((await params).symbol);
  if (!ASSET_BY_SYMBOL[symbol] || perpIndex(symbol) < 0) notFound();
  return <PerpDetail symbol={symbol} />;
}
