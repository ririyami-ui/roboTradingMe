/**
 * Memetakan ID koin dari CoinGecko ke simbol yang digunakan oleh CryptoCompare.
 * Ini diperlukan karena API yang berbeda menggunakan identifikasi yang berbeda.
 * Daftar ini dapat diperluas sesuai kebutuhan.
 */
export const coinIdToSymbolMap = {
  // Format: 'coingecko-id': 'CRYPTOCOMPARE_SYMBOL'
  'bitcoin': 'BTC',
  'ethereum': 'ETH',
  'tether': 'USDT',
  'binancecoin': 'BNB',
  'solana': 'SOL',
  'ripple': 'XRP',
  'dogecoin': 'DOGE',
  'cardano': 'ADA',
  'shiba-inu': 'SHIB',
  'avalanche-2': 'AVAX',
  'chainlink': 'LINK',
  'polkadot': 'DOT',
  'tron': 'TRX',
  'the-sandbox': 'SAND',
  'decentraland': 'MANA',
  'axie-infinity': 'AXS',
};

/**
 * Peta terbalik dari simbol CryptoCompare ke ID CoinGecko.
 * Dibuat secara otomatis dari coinIdToSymbolMap.
 */
export const symbolToCoinIdMap = Object.fromEntries(
  Object.entries(coinIdToSymbolMap).map(([id, symbol]) => [symbol, id])
);