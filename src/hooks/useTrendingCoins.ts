import { useCoinList, Coin } from "./useCoinList";

/**
 * Mengambil daftar 7 koin teratas yang sedang tren (berdasarkan volume) dari Indodax.
 * @returns {{trendingCoins: Coin[], loading: boolean}}
 */
export function useTrendingCoins() {
  const { allCoins, loading } = useCoinList();

  // Ambil 7 koin teratas yang diurutkan berdasarkan volume di Indodax
  const trendingCoins = Array.isArray(allCoins) ? allCoins.slice(0, 7) : [];

  return { trendingCoins, loading };
}
