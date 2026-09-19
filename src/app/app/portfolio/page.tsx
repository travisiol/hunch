import type { Metadata } from "next";
import { Portfolio } from "@/components/Portfolio";

export const metadata: Metadata = { title: "Portfolio", description: "Every open bet and position, and everything you have settled." };

export default function PortfolioPage() {
  return <Portfolio />;
}
