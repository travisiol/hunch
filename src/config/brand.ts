/**
 * Everything that names the product lives here. Rename the project by editing
 * this file (plus package.json and the icon), nothing else refers to the name.
 */
export const brand = {
  name: "HUNCH",
  wordmark: "hunch",
  /** The short line under the name, everywhere. */
  tagline: "Call it. Get paid.",
  /** The long line for search engines and link previews. */
  description:
    "Prediction markets and perpetual futures on Robinhood Chain assets, sharing one USDG balance. Stocks, ETFs, private companies and crypto. Open 24/7, settled onchain.",
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://hunch.markets",
  x: { handle: "@hunchmarkets", url: "https://x.com/hunchmarkets" },
  /** Footer line. */
  legal: "Positions are public onchain. Nothing here is investment advice.",
  year: 2026,
} as const;
