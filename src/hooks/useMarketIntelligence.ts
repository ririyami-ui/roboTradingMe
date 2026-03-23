import { useState, useEffect } from 'react';
import { fetchSummaries } from '../utils/indodaxApi';

export interface GlobalSignal {
    coin: string;
    symbol: string;
    type: 'STRONG_BUY' | 'POTENTIAL_BUY' | 'MOMENTUM_UP' | 'GEMINI_BUY' | string;
    message: string;
    timestamp: number;
    price: number;
    priceHistory?: number[];
    hourlyChange?: string | number;
    momentum?: string | number;
    potentialProfit?: string | number;
    strength?: string;
}

interface FastMover {
    id: string;
    symbol: string;
    fullName: string;
    price: number;
    change24h: number;
    volume24h: number;
}

// Global state to store signals across the app session, persisted to localStorage
const STORAGE_KEY = 'saktibot_radar_signals';

let globalSignals: GlobalSignal[] = [];
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        globalSignals = JSON.parse(saved);
        // Filter out signals older than 24 hours to keep it clean
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        globalSignals = globalSignals.filter(s => s.timestamp > oneDayAgo);
    }
} catch (e) {
    console.warn("Failed to load radar signals from localStorage", e);
}

const listeners = new Set<(signals: GlobalSignal[]) => void>();

const notifyListeners = () => {
    listeners.forEach(listener => listener([...globalSignals]));
};

export const addGlobalSignal = (signal: Omit<GlobalSignal, 'timestamp'>) => {
    // Prevent duplicates for the same coin in a short time
    const exists = globalSignals.find(s => s.coin === signal.coin && (Date.now() - s.timestamp < 300000)); // 5 mins
    if (!exists) {
        globalSignals = [{ ...signal, timestamp: Date.now() }, ...globalSignals].slice(0, 50);
        
        // Persist to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(globalSignals));
        } catch (e) {
            console.warn("Failed to save radar signals to localStorage", e);
        }
        
        notifyListeners();
    }
};

/**
 * Hook to get real-time market intelligence:
 * 1. Fast Movers (Top Volatile Coins) - Derived from Indodax
 * 2. Active signals from the scanner
 */
export const useMarketIntelligence = () => {
    const [signals, setSignals] = useState<GlobalSignal[]>([...globalSignals]);
    const [fastMovers, setFastMovers] = useState<FastMover[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        listeners.add(setSignals);
        return () => {
            listeners.delete(setSignals);
        };
    }, []);

    const fetchFastMovers = async () => {
        try {
            const summaries = await fetchSummaries();
            const tickers = summaries?.tickers || {};
            const prices24h = (summaries as any)?.prices_24h || {};

            // Map tickers to movers (Filtering for IDR pairs)
            const movers: FastMover[] = Object.keys(tickers)
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
                .filter((m): m is FastMover => m !== null)
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
