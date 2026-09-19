/**
 * Every Robinhood Chain asset HUNCH knows about, with its Chainlink feed (8 decimals).
 * The first sixteen (perp: true) are the perpetual markets, in engine index order —
 * `perpIndex(symbol)` is the marketIndex the PerpEngine expects. The rest only back
 * prediction markets. Feeds verified on chain 4663.
 */
export type AssetCategory = "stock" | "etf" | "private" | "crypto";

export type Asset = {
  symbol: string;
  name: string;
  category: AssetCategory;
  perp: boolean;
  /** Robinhood Chain stock token, when one exists. */
  token?: `0x${string}`;
  priceFeed: `0x${string}`;
  /** TradingView symbol for the chart embed. */
  tv?: string;
};

export const ASSETS: Asset[] = [
  { symbol: "AAPL", name: "Apple", category: "stock", perp: true, token: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", priceFeed: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", tv: "NASDAQ:AAPL" },
  { symbol: "NVDA", name: "NVIDIA", category: "stock", perp: true, token: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", priceFeed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", tv: "NASDAQ:NVDA" },
  { symbol: "TSLA", name: "Tesla", category: "stock", perp: true, token: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", priceFeed: "0x4A1166a659A55625345e9515b32adECea5547C38", tv: "NASDAQ:TSLA" },
  { symbol: "SPY", name: "S&P 500 ETF", category: "etf", perp: true, token: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", priceFeed: "0x319724394D3A0e3669269846abE664Cd621f9f6A", tv: "AMEX:SPY" },
  { symbol: "BTC", name: "Bitcoin", category: "crypto", perp: true, priceFeed: "0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251", tv: "CRYPTO:BTCUSD" },
  { symbol: "ETH", name: "Ether", category: "crypto", perp: true, priceFeed: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9", tv: "CRYPTO:ETHUSD" },
  { symbol: "MSFT", name: "Microsoft", category: "stock", perp: true, token: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", priceFeed: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E", tv: "NASDAQ:MSFT" },
  { symbol: "AMZN", name: "Amazon", category: "stock", perp: true, token: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", priceFeed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C", tv: "NASDAQ:AMZN" },
  { symbol: "GOOGL", name: "Alphabet", category: "stock", perp: true, token: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", priceFeed: "0xF6f373a037c30F0e5010d854385cA89185AE638b", tv: "NASDAQ:GOOGL" },
  { symbol: "META", name: "Meta", category: "stock", perp: true, token: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", priceFeed: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1", tv: "NASDAQ:META" },
  { symbol: "COIN", name: "Coinbase", category: "stock", perp: true, token: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", priceFeed: "0xA3a468A452940B7D6b69991207B508c609a98Ef2", tv: "NASDAQ:COIN" },
  { symbol: "MSTR", name: "Strategy", category: "stock", perp: true, token: "0xec262a75e413fAfD0dF80480274532C79D42da09", priceFeed: "0x396118bdFB181e6240E74D243F266B061c0edc3D", tv: "NASDAQ:MSTR" },
  { symbol: "AMD", name: "AMD", category: "stock", perp: true, priceFeed: "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72", tv: "NASDAQ:AMD" },
  { symbol: "PLTR", name: "Palantir", category: "stock", perp: true, priceFeed: "0x820ABedFF239034956B7A9d2F0a331f9F075eB4c", tv: "NASDAQ:PLTR" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF", category: "etf", perp: true, token: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", priceFeed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae", tv: "NASDAQ:QQQ" },
  { symbol: "SPCX", name: "SpaceX", category: "private", perp: true, token: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", priceFeed: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb", tv: "NASDAQ:SPCX" },
  { symbol: "ASML", name: "ASML", category: "stock", perp: false, priceFeed: "0xB4106147E8cce40b7d46124090d373A71b70f87D", tv: "NASDAQ:ASML" },
  { symbol: "BABA", name: "Alibaba", category: "stock", perp: false, priceFeed: "0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984", tv: "NYSE:BABA" },
  { symbol: "CLSK", name: "CleanSpark", category: "stock", perp: false, priceFeed: "0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF", tv: "NASDAQ:CLSK" },
  { symbol: "CRCL", name: "Circle", category: "stock", perp: false, priceFeed: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a", tv: "NYSE:CRCL" },
  { symbol: "CRWV", name: "CoreWeave", category: "stock", perp: false, priceFeed: "0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C", tv: "NASDAQ:CRWV" },
  { symbol: "EWY", name: "MSCI South Korea ETF", category: "etf", perp: false, priceFeed: "0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1", tv: "AMEX:EWY" },
  { symbol: "GME", name: "GameStop", category: "stock", perp: false, priceFeed: "0x27C71df6A64fB476468EdF256CF72c038baB5B67", tv: "NYSE:GME" },
  { symbol: "INTC", name: "Intel", category: "stock", perp: false, priceFeed: "0x3f390C5C24628Ac7C489515402235FeAD71D1913", tv: "NASDAQ:INTC" },
  { symbol: "IONQ", name: "IonQ", category: "stock", perp: false, priceFeed: "0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb", tv: "NYSE:IONQ" },
  { symbol: "MU", name: "Micron", category: "stock", perp: false, priceFeed: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596", tv: "NASDAQ:MU" },
  { symbol: "NBIS", name: "Nebius", category: "stock", perp: false, priceFeed: "0xE1D87B116Ba0fe898998f1D140339D1fA1E09705", tv: "NASDAQ:NBIS" },
  { symbol: "ORCL", name: "Oracle", category: "stock", perp: false, priceFeed: "0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844", tv: "NYSE:ORCL" },
  { symbol: "RGTI", name: "Rigetti", category: "stock", perp: false, priceFeed: "0x2A045cF1C49c61c166C036d2f06FA2D2d984f765", tv: "NASDAQ:RGTI" },
  { symbol: "RKLB", name: "Rocket Lab", category: "stock", perp: false, priceFeed: "0x045477BF65Aef6f4F2386ad0164579e48381CC74", tv: "NASDAQ:RKLB" },
  { symbol: "SLV", name: "Silver Trust", category: "etf", perp: false, priceFeed: "0x209b73908e92Ae021826eD79609845451Ecba2ce", tv: "AMEX:SLV" },
  { symbol: "SNDK", name: "SanDisk", category: "stock", perp: false, priceFeed: "0xfb133Fa4B7b385802B693a293606682Df47109A3", tv: "NASDAQ:SNDK" },
  { symbol: "TSM", name: "TSMC", category: "stock", perp: false, priceFeed: "0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F", tv: "NYSE:TSM" },
  { symbol: "USO", name: "US Oil Fund", category: "etf", perp: false, priceFeed: "0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c", tv: "AMEX:USO" },
];

export const ASSET_BY_SYMBOL: Record<string, Asset> = Object.fromEntries(ASSETS.map((a) => [a.symbol, a]));

export const PERP_MARKETS: Asset[] = ASSETS.filter((a) => a.perp);

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  stock: "Stocks",
  etf: "ETFs",
  private: "Private companies",
  crypto: "Crypto",
};

/** The PerpEngine market index of a symbol, or -1. */
export function perpIndex(symbol: string): number {
  return PERP_MARKETS.findIndex((a) => a.symbol === symbol);
}

/** Feed lookup for the candles API and the seeding scripts. */
export function feedOf(symbol: string): `0x${string}` | undefined {
  return ASSET_BY_SYMBOL[symbol]?.priceFeed;
}
