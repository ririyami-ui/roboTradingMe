import { useState, useEffect } from 'react';
import { fetchSummaries } from '../utils/indodaxApi';

// Global state to store signals across the app session
let globalSignals = [];
const listeners = new Set();

const notifyListeners = () => {
    listeners.forEach(listener => listener([...globalSignals]));
};

export const addGlobalSignal = (signal) => {
    // Prevent duplicates for the same coin in a short time
    const exists = globalSignals.find(s => s.coin === signal.coin && (Date.now() - s.timestamp < 300000)); // 5 mins
    if (!exists) {
        globalSignals = [{ ...signal, timestamp: Date.now() }, ...globalSignals].slice(0, 20);
        notifyListeners();
    }
};

/**
 * Hook to get real-time market intelligence:
 * 1. Fast Movers (Top Volatile Coins) - Derived from Indodax
 * 2. Active signals from the scanner
 */
export const useMarketIntelligence = () => {
    const [signals, setSignals] = useState([...globalSignals]);
    const [fastMovers, setFastMovers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        listeners.add(setSignals);
        return () => listeners.delete(setSignals);
    }, []);

    const fetchFastMovers = async () => {
        try {
            const summaries = await fetchSummaries();
            const tickers = summaries?.tickers || {};

            const prices24h = summaries?.prices_24h || {};

            // Map tickers to movers (Filtering for IDR pairs)
            const movers = Object.keys(tickers)
                .map(pair => {
                    const t = tickers[pair];
                    const [base, target] = pair.split('_');
                    if (target !== 'idr') return null;

                    const lastPrice = parseFloat(t.last);
                    const price24h = parseFloat(prices24h[pair.replace('_', '')] || lastPrice);
                    const change24h = price24h > 0 ? ((lastPrice - price24h) / price24h * 100) : 0;

                    return {
                        id: base,
                        symbol: base.toUpperCase(),
                        fullName: t.name || base.toUpperCase(),
                        price: lastPrice,
                        change24h: change24h,
                        volume24h: parseFloat(t.vol_idr || 0),
                    };
                })
                .filter(Boolean)
                // Sort by absolute 24h change to find the most "volatile" movers
                .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
                .slice(0, 4);

            setFastMovers(movers);
        } catch (error) {
            console.error("Failed to fetch Indodax fast movers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFastMovers();
        const interval = setInterval(fetchFastMovers, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    return { signals, fastMovers, loading };
};
