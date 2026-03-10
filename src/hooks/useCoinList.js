import { useState, useEffect } from "react";
import { fetchSummaries } from "../utils/indodaxApi";

/**
 * Mengambil daftar koin langsung dari Indodax Summaries.
 * Diurutkan berdasarkan volume 24 jam untuk menentukan "Top Coins".
 * @returns {{categorizedCoins: object, allCoins: Array, loading: boolean}}
 */
export function useCoinList() {
  const [categorizedCoins, setCategorizedCoins] = useState({});
  const [allCoins, setAllCoins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndProcess = async () => {
      try {
        const summaries = await fetchSummaries();
        const tickers = summaries?.tickers || {};

        const prices24h = summaries?.prices_24h || {};

        // 1. Map tickers to coin objects
        const rawCoins = Object.keys(tickers).map(pair => {
          const ticker = tickers[pair];
          const [base, target] = pair.split('_');

          // Kita fokus pada pair IDR untuk listing utama
          if (target !== 'idr') return null;

          const lastPrice = parseFloat(ticker.last);
          const price24h = parseFloat(prices24h[pair.replace('_', '')] || lastPrice);
          const change24h = price24h > 0 ? ((lastPrice - price24h) / price24h * 100) : 0;

          return {
            id: base, // Menggunakan simbol base sebagai ID (Indodax style)
            symbol: base.toUpperCase(),
            name: ticker.name || base.toUpperCase(),
            lastPrice: lastPrice,
            change24h: change24h,
            volume24h: parseFloat(ticker.vol_btc || ticker['vol_' + base] || 0),
            volumeIdr24h: parseFloat(ticker.vol_idr || 0),
            logoUrl: `https://indodax.com/v2/logo/png/color/${base.toLowerCase()}.png`,
            isAvailable: true
          };
        }).filter(Boolean);

        // 2. Sort by Volume IDR (Most active first)
        const sortedByVolume = [...rawCoins].sort((a, b) => b.volumeIdr24h - a.volumeIdr24h);
        const sortedAlphabetically = [...rawCoins].sort((a, b) => a.symbol.localeCompare(b.symbol));

        // 3. Categories
        const memeSymbols = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'FLOKI', 'BONK']);
        const nftSymbols = new Set(['ICP', 'IMX', 'SAND', 'MANA', 'AXS']);

        const categories = {
          '🔥 Indodax Top Volume': sortedByVolume.slice(0, 100),
          '😂 Meme Coins': sortedByVolume.filter(c => memeSymbols.has(c.symbol)),
          '🎨 NFT & Gaming': sortedByVolume.filter(c => nftSymbols.has(c.symbol)),
          '🔤 Semua Koin (A-Z)': sortedAlphabetically,
        };

        setAllCoins(sortedByVolume);
        setCategorizedCoins(categories);
        setIsLoading(false);
      } catch (err) {
        console.error("Pure Indodax CoinList fetch failed:", err);
        setIsLoading(false);
      }
    };

    fetchAndProcess();
  }, []);

  return { categorizedCoins, allCoins, loading: isLoading };
}
