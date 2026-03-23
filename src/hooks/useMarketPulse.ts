import { useState, useEffect, useCallback } from 'react';
import { fetchSummaries } from '../utils/indodaxApi';

export interface MarketStats {
    sentiment: string;
    btcChange: number;
    upCount: number;
    downCount: number;
    stableCount: number;
    totalCoins: number;
    advice: string;
    level: 'danger' | 'warning' | 'success' | 'normal';
    loading?: boolean;
    refresh?: () => Promise<void>;
}

/**
 * useMarketPulse
 * Custom hook to calculate global market sentiment from Indodax summaries.
 */
export function useMarketPulse() {
    const [stats, setStats] = useState<Omit<MarketStats, 'loading' | 'refresh'>>({
        sentiment: 'NETRAL', // BULLISH, BEARISH, JENUH, NETRAL
        btcChange: 0,
        upCount: 0,
        downCount: 0,
        stableCount: 0,
        totalCoins: 0,
        advice: 'Initializing analysis...',
        level: 'normal'
    });
    const [loading, setLoading] = useState(true);

    const analyze = useCallback(async () => {
        try {
            const data = await fetchSummaries();
            if (!data || !data.tickers) return;

            const tickers = data.tickers;
            const prices24h = (data as any).prices_24h || {};

            let up = 0;
            let down = 0;
            let stable = 0;
            let total = 0;

            // 1. Analyze BTC
            const btc_current = parseFloat(tickers.btc_idr?.last || '0');
            const btc_24h = parseFloat(prices24h.btcidr || '0');
            const btcChange = btc_24h > 0 ? ((btc_current - btc_24h) / btc_24h) * 100 : 0;

            // 2. Scan all IDR pairs
            for (const pair in tickers) {
                if (pair.endsWith('_idr')) {
                    const current = parseFloat(tickers[pair].last);
                    const key24 = pair.replace('_', '');
                    const old = parseFloat(prices24h[key24] || '0');

                    if (old > 0) {
                        const change = ((current - old) / old) * 100;
                        if (change > 1.2) up++;
                        else if (change < -1.2) down++;
                        else stable++;
                        total++;
                    }
                }
            }

            // 3. Determine Sentiment
            let sentiment = 'NETRAL';
            let advice = 'Mencari arah pasar...';
            let level: 'danger' | 'warning' | 'success' | 'normal' = 'normal';

            if (btcChange < -2.5) {
                sentiment = 'BEARISH';
                advice = 'BTC anjlok! Risiko tinggi altcoin ikut terseret turun.';
                level = 'danger';
            } else if (btcChange > 2.5) {
                sentiment = 'BULLISH';
                advice = 'BTC sedang pump! Momentum kuat di seluruh pasar.';
                level = 'success';
            } else if (stable > (up + down) * 1.2) {
                sentiment = 'JENUH';
                advice = 'Pasar sedang sideways. Momentum rendah, scalping mungkin sulit.';
                level = 'warning';
            } else if (up > down * 1.5) {
                sentiment = 'OPTIMIS';
                advice = 'Pembeli mendominasi. Waktu yang baik untuk cari peluang breakout.';
                level = 'success';
            } else if (down > up * 1.5) {
                sentiment = 'LEMAH';
                advice = 'Tekanan jual tinggi. Harap berhati-hati saat entry.';
                level = 'warning';
            } else {
                sentiment = 'NETRAL';
                advice = 'Sinyal pasar campur aduk. Momentum kemungkinan selektif.';
                level = 'normal';
            }

            setStats({
                sentiment,
                btcChange,
                upCount: up,
                downCount: down,
                stableCount: stable,
                totalCoins: total,
                advice,
                level
            });
            setLoading(false);
        } catch (error) {
            console.error("MarketPulse analysis failed:", error);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        analyze();
        const timer = setInterval(analyze, 60000); // Update every minute
        return () => clearInterval(timer);
    }, [analyze]);

    return { ...stats, loading, refresh: analyze };
}
