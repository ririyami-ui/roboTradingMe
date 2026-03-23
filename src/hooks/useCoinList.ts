import { useState, useEffect } from "react";
import { fetchSummaries } from "../utils/indodaxApi";

export interface Coin {
    id: string;
    symbol: string;
    name: string;
    lastPrice: number;
    change24h: number;
    volume24h: number;
    volumeIdr24h: number;
    logoUrl: string;
    isAvailable: boolean;
}

interface CategorizedCoins {
    [category: string]: Coin[];
}

/**
 * Mengambil daftar koin langsung dari Indodax Summaries.
 * Diurutkan berdasarkan volume 24 jam untuk menentukan "Top Coins".
 * @returns {{categorizedCoins: CategorizedCoins, allCoins: Coin[], loading: boolean}}
 */
export function useCoinList() {
  const [categorizedCoins, setCategorizedCoins] = useState<CategorizedCoins>({});
  const [allCoins, setAllCoins] = useState<Coin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAndProcess = async () => {
      try {
        const summaries = await fetchSummaries();
        const tickers = summaries?.tickers || {};
        const prices24h = (summaries as any)?.prices_24h || {};

        // 1. Map tickers to coin objects
        const rawCoins: Coin[] = Object.keys(tickers).map(pair => {
          const ticker = tickers[pair];
          const [base, target] = pair.split('_');

          // Kita fokus pada pair IDR untuk listing utama
          if (target !== 'idr') return null;

          const lastPrice = parseFloat(ticker.last);
          const price24h = parseFloat(prices24h[pair.replace('_', '')] || lastPrice);
          const change24h = price24h > 0 ? ((lastPrice - price24h) / price24h * 100) : 0;

          return {
            id: base,
            symbol: base.toUpperCase(),
            name: ticker.name || base.toUpperCase(),
            lastPrice: lastPrice,
            change24h: change24h,
            volume24h: parseFloat(ticker.vol_btc || (ticker as any)['vol_' + base] || 0),
            volumeIdr24h: parseFloat(ticker.vol_idr || 0),
            logoUrl: `https://indodax.com/v2/logo/png/color/${base.toLowerCase()}.png`,
            isAvailable: true
          };
        }).filter((c): c is Coin => c !== null);

        // 2. Sort by Volume IDR (Most active first)
        const sortedByVolume = [...rawCoins].sort((a, b) => b.volumeIdr24h - a.volumeIdr24h);
        const sortedAlphabetically = [...rawCoins].sort((a, b) => a.symbol.localeCompare(b.symbol));

        // 3. Categories
        const memeSymbols = new Set(['DOGE', 'SHIB', 'PEPE', 'WIF', 'FLOKI', 'BONK']);
        const nftSymbols = new Set(['ICP', 'IMX', 'SAND', 'MANA', 'AXS']);

        const categories: CategorizedCoins = {
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
