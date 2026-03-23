import { useState, useEffect, useRef, useCallback } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { 
    fetchTicker, 
    getUserInfo, 
    tradeOrder, 
    cancelOrder, 
    fetchSummaries, 
    fetchOrderBook, 
    fetchOpenOrders, 
    fetchBitcoin24hChange, 
    fetchChartHistory 
} from '../utils/indodaxApi';
import { useCoinList } from './useCoinList';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
    analyzeTechnicalIndicators, 
    calculateEMA, 
    calculateRSI, 
    calculateStochasticRSI, 
    analyzeEMAScalping, 
    OHLC 
} from '../utils/technicalIndicators';
import { analyzeOrderBook, findMarketWalls } from '../utils/orderBookAnalysis'; // Refresh
import { checkBuyOrderIntelligence, checkSellOrderIntelligence } from '../utils/orderIntelligence';
import { addGlobalSignal } from './useMarketIntelligence';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';
import { ActiveTrade, TradeHistory } from '../types/trading';
import { checkEntrySignal, checkExitSignal } from '../utils/strategyRules';
import { playBuySound, playTPSound, playSLSound } from '../utils/sounds';

interface LogEntry {
    id: string;
    time: string;
    message: string;
    type: string;
}

interface Asset {
    symbol: string;
    balance: number;
    hold: number;
    total: number;
    currentPrice: number;
}

interface Balance {
    idr: number;
    coin: number;
    assets: Asset[];
    totalBalanceReal?: number;
}

export const useAutoScanner = (onCoinChange: (coin: string) => void, initialIsSimulation?: boolean) => {
    // 1. External Hooks
    const { 
        apiKey, 
        secretKey, 
        geminiKey, 
        hasKeys,
    } = useIndodaxAuth();
    const { allCoins } = useCoinList();
    const { user } = useAuth();
    const cloudSettings = useSettings(user);

    // Derived values from Cloud Settings (Single Source of Truth)
    const tradingStrategy = cloudSettings.tradingStrategy || 'SCALPING';
    const tpVal = cloudSettings.takeProfit || 1.5;
    const slVal = cloudSettings.stopLoss || 1.0;
    const amntVal = cloudSettings.tradeAmount || 50000;
    const dlyLossVal = cloudSettings.dailyLossLimit || 5.0;

    // 2. Refs
    const loopRef = useRef<any>(null);
    const top20CoinsRef = useRef<any[]>([]);
    const scanIndexRef = useRef(0);
    const activeTradesRef = useRef<ActiveTrade[]>([]);
    const tradeAmountRef = useRef(50000);
    const isSimulationRef = useRef(true);
    const takeProfitPercentRef = useRef(2.0);
    const stopLossPercentRef = useRef(1.0);
    const tradingStrategyRef = useRef('SCALPING');
    const isInitialSweepRef = useRef(false);
    const sweepIndexRef = useRef(0);
    const recentlyScannedRef = useRef(new Set<string>());
    const onCoinChangeRef = useRef(onCoinChange);
    const lastLossTimestampRef = useRef(0);
    const LOSS_COOLDOWN_MS = 20 * 60 * 1000;

    // BITCOIN GUARD
    const isFetchingRef = useRef(false);
    const lastBtcCheckRef = useRef(0);
    const btcCooldownTimestampRef = useRef(0);
    const BTC_COOLDOWN_MS = 2 * 60 * 60 * 1000;
    const BTC_CRASH_THRESHOLD = -4.0;
    const MAX_ACTIVE_POSITIONS = 3;
    const consecutiveLossesRef = useRef(0);
    const activeCooldownDurationRef = useRef(15 * 60 * 1000);
    const dailyLossLimitRef = useRef(5.0);
    const lastDailyLossCooldownRef = useRef<number>(parseInt(localStorage.getItem('bot_loss_cooldown') || '0', 10));
    const lastDailyLossLogRef = useRef<number>(0);
    const DAILY_LOSS_COOLDOWN_MS = 60 * 60 * 1000; // 1 Jam
    const lastGlobalBotStateRef = useRef<boolean | null>(null);
    const pendingBuyOrdersRef = useRef<any[]>([]);
    const dailyPLRef = useRef(0);
    const lastSentimentLogRef = useRef(0);

    useEffect(() => {
        onCoinChangeRef.current = onCoinChange;
    }, [onCoinChange]);

    // 3. States
    const [pendingBuyOrders, setPendingBuyOrders] = useState<any[]>([]);
    const [indodaxPairs, setIndodaxPairs] = useState(new Set<string>());
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [balance, setBalance] = useState<Balance>({ idr: 0, coin: 0, assets: [] });
    const [isBullishMarket, setIsBullishMarket] = useState(false);
    
    const [isSimulation, setIsSimulation] = useState(initialIsSimulation ?? true);
    
    // Auto-sync refs with indodaxAuth values
    useEffect(() => {
        tradingStrategyRef.current = tradingStrategy;
        takeProfitPercentRef.current = tpVal;
        stopLossPercentRef.current = slVal;
        tradeAmountRef.current = amntVal;
        dailyLossLimitRef.current = dlyLossVal;
        isSimulationRef.current = isSimulation;
    }, [tradingStrategy, tpVal, slVal, amntVal, dlyLossVal, isSimulation]);

    useEffect(() => {
        if (initialIsSimulation !== undefined && initialIsSimulation !== isSimulation) {
            setIsSimulation(initialIsSimulation);
        }
    }, [initialIsSimulation]);

    const [simulatedBalance, setSimulatedBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('scannerSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });
    const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
    const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);
    const [currentScanCoinDisplay, setCurrentScanCoinDisplay] = useState('Wait');
    const [cooldownRemaining, setCooldownRemaining] = useState('');
    const [scannerStatus, setScannerStatus] = useState({ message: 'Siap mulai memindai pasar', level: 'chill' });
    const [isCloudLoaded, setIsCloudLoaded] = useState(false);

    // 4. Refs sync from useIndodaxAuth is handled in a separate useEffect above

    const syncToCloud = useCallback((newVals: Partial<any>) => {
        cloudSettings.saveSettings(newVals);
    }, [cloudSettings]);

    useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);
    // Persistence is handled by cloudSettings/useSettings now
    useEffect(() => {
        isSimulationRef.current = isSimulation;
    }, [isSimulation]);

    useEffect(() => {
        pendingBuyOrdersRef.current = pendingBuyOrders;
    }, [pendingBuyOrders]);
    // Removed redundant ref syncs (already handled in auto-sync useEffect)
    useEffect(() => {
        localStorage.setItem('scannerSimulatedBalance', simulatedBalance.toString());
    }, [simulatedBalance, user?.id]);

    // Live cooldown countdown
    useEffect(() => {
        const interval = setInterval(() => {
            if (lastLossTimestampRef.current > 0) {
                const now = Date.now();
                const diff = lastLossTimestampRef.current + activeCooldownDurationRef.current - now;
                
                if (diff > 0) {
                    const minutes = Math.floor(diff / 60000);
                    const seconds = Math.floor((diff % 60000) / 1000);
                    setCooldownRemaining(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                } else {
                    setCooldownRemaining('');
                }
            } else {
                setCooldownRemaining('');
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // HEARTBEAT SYSTEM
    useEffect(() => {
        if (!user) return;
        const updateHeartbeat = async () => {
            try {
                await supabase
                    .from('profiles')
                    .update({ last_active_at: new Date().toISOString() })
                    .eq('id', user.id);
            } catch (err: any) {
                console.warn("[HEARTBEAT] Gagal update:", err.message);
            }
        };
        updateHeartbeat();
        const interval = setInterval(updateHeartbeat, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    // Global Bot State Switch Sync
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            if (lastGlobalBotStateRef.current === true && cloudSettings.isBotActive === false && cloudSettings.isScannerActive) {
                cloudSettings.saveSettings({ isScannerActive: false });
                const stopMsg = '🛑 Remote Stop: Bot dimatikan melalui Saklar Global (Cloud).';
                addLog(stopMsg, 'warning');
                alert(stopMsg);
                setScannerStatus({ message: 'Bot dimatikan via Saklar Global', level: 'chill' });
            }
            lastGlobalBotStateRef.current = cloudSettings.isBotActive;
        }
    }, [cloudSettings.isBotActive, cloudSettings.isLoaded, cloudSettings.isScannerActive]);

    const lastDailyPLFetchRef = useRef(0);
    const fetchDailyPL = async (force = false): Promise<number> => {
        if (!user) return 0;
        const now = Date.now();
        if (!force && now - lastDailyPLFetchRef.current < 2 * 60 * 1000) return dailyPLRef.current;
        
        lastDailyPLFetchRef.current = now;
        const today = new Date().toISOString().split('T')[0];
        const currentIsSim = isSimulationRef.current;
        try {
            const { data, error } = await supabase
                .from('trade_history')
                .select('profit_percent')
                .eq('user_id', user.id)
                .eq('is_simulation', currentIsSim)
                .gte('created_at', `${today}T00:00:00Z`)
                .lte('created_at', `${today}T23:59:59Z`);

            if (error) throw error;
            const total = (data as any[]).reduce((acc: number, curr: any) => acc + (parseFloat(curr.profit_percent) || 0), 0);
            dailyPLRef.current = total;
            return total;
        } catch (err: any) {
            console.warn("[DAILY PL] Gagal fetch:", err.message);
            return dailyPLRef.current;
        }
    };

    useEffect(() => {
        if (!cloudSettings.isLoaded) return;

        const initIndodax = async () => {
            if (isFetchingRef.current) return;
            isFetchingRef.current = true;
            setIsCloudLoaded(false);
            try {
                if (user) {
                    console.log("SaktiBot: Initializing cloud data...");
                    const [{ data: cloudTrades }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
                    ]);

                    if (cloudHistory && cloudHistory.length > 0) {
                        setTradeHistory((cloudHistory as any[]).map(h => ({
                            id: h.id,
                            coin: h.coin,
                            trade_type: h.trade_type || 'EXIT',
                            buy_price: parseFloat(h.buy_price) || 0,
                            sell_price: parseFloat(h.sell_price) || 0,
                            profit_percent: parseFloat(h.profit_percent) || 0,
                            is_simulation: h.is_simulation,
                            timestamp: new Date(h.created_at).getTime(),
                            date: new Date(h.created_at).toLocaleDateString(),
                            time: new Date(h.created_at).toLocaleTimeString()
                        })));
                    }

                    if (cloudTrades && (cloudTrades as any[]).length > 0) {
                        const info = await getUserInfo(apiKey, secretKey).catch(() => null);
                        const balances = (info as any)?.balance || {};
                        const validTrades: ActiveTrade[] = (cloudTrades as any[]).map(t => ({
                            coin: t.coin_id,
                            buyPrice: parseFloat(t.buy_price),
                            amount: parseFloat(t.quantity),
                            targetTP: parseFloat(t.target_tp),
                            targetSL: parseFloat(t.target_sl),
                            highestPrice: parseFloat(t.highest_price || t.buy_price),
                            currentPrice: parseFloat(t.highest_price || t.buy_price),
                            isSimulation: t.is_simulation,
                            id: t.id,
                            timestamp: new Date(t.created_at).getTime(),
                            strategy: (t.strategy || 'SCALPING') as any
                        }));

                        if (validTrades.length > 0) {
                            setActiveTrades(validTrades);
                            if (!cloudSettings.isScannerActive) cloudSettings.saveSettings({ isScannerActive: true });
                        }

                        if (info && apiKey) {
                            for (const t of (cloudTrades as any[])) {
                                if (t.is_simulation) continue;
                                const coinToken = t.coin_id.split('_')[0].toLowerCase();
                                if (parseFloat(balances[coinToken] || 0) <= 0.000001) {
                                    await supabase.from('active_trades').delete().eq('id', t.id);
                                }
                            }
                        }
                    }
                }

                const summaries = await fetchSummaries();
                if (summaries?.tickers) setIndodaxPairs(new Set(Object.keys(summaries.tickers)));
            } catch (err) {
                console.error("Initial Indodax/Cloud fetch failed:", err);
            } finally {
                setIsCloudLoaded(true);
                isFetchingRef.current = false;
            }
        };
        initIndodax();
    }, [user?.id, isSimulation, cloudSettings.isLoaded]);

    // Realtime Sync
    useEffect(() => {
        if (!user) return;
        const channel = supabase.channel('scanner_active_trades_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.id}` }, (payload) => {
                const { eventType, new: newRow, old: oldRow } = payload;
                const targetMode = (newRow as any)?.is_simulation ?? (oldRow as any)?.is_simulation;
                if (targetMode !== isSimulation) return;

                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    setActiveTrades(prev => {
                        const mapped: ActiveTrade = {
                            id: (newRow as any).id,
                            coin: (newRow as any).coin_id,
                            buyPrice: parseFloat((newRow as any).buy_price),
                            amount: parseFloat((newRow as any).quantity),
                            targetTP: parseFloat((newRow as any).target_tp),
                            targetSL: parseFloat((newRow as any).target_sl),
                            highestPrice: parseFloat((newRow as any).highest_price),
                            currentPrice: parseFloat((newRow as any).highest_price),
                            isSimulation: (newRow as any).is_simulation,
                            timestamp: new Date((newRow as any).created_at).getTime(),
                            strategy: ((newRow as any).strategy || 'SCALPING') as any
                        };
                        const idx = prev.findIndex(t => t.id === mapped.id);
                        if (idx > -1) {
                            const nt = [...prev];
                            nt[idx] = { ...nt[idx], ...mapped };
                            return nt;
                        }
                        return [...prev, mapped].slice(-10);
                    });
                } else if (eventType === 'DELETE') {
                    setActiveTrades(prev => prev.filter(t => t.id !== (oldRow as any).id));
                }
            }).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, isSimulation]);

    const getPair = (coinId: string): string => {
        if (!coinId) return 'btc_idr';
        let cid = coinId.toLowerCase().replace('-', '_').split('_')[0];
        const overrides: Record<string, string> = { 
            perp: 'perp_idr', 'polygon-ecosystem-token': 'pol_idr', 'avalanche-2': 'avax_idr', 
            'shiba-inu': 'shib_idr', 'indodax-token': 'idt_idr', polygon: 'pol_idr', 'matic-network': 'pol_idr' 
        };
        if (overrides[coinId]) return overrides[coinId];
        if (overrides[cid]) return overrides[cid];
        
        const variations = [`${cid}_idr`, `${cid}idr`, `${cid}_usdt`, `${cid}usdt`];
        for (const v of variations) if (indodaxPairs.has(v)) return v;
        return `${cid}_idr`;
    };

    const addLog = (message: string, type = 'info') => {
        const newLog: LogEntry = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, time: new Date().toLocaleTimeString(), message, type };
        setLogs(prev => [...prev.slice(-99), newLog]);
    };

    const speak = (text: string) => {
        if (!window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'id-ID'; u.rate = 1.0;
        window.speechSynthesis.speak(u);
    };

    const fetchBalance = async () => {
        if (!hasKeys || isSimulation) return;
        try {
            const [info, summaries] = await Promise.all([
                getUserInfo(apiKey, secretKey),
                fetchSummaries().catch(() => null)
            ]);
            if (info && (info as any).balance) {
                const tickers = summaries?.tickers || {};
                const assets: Asset[] = [];
                let totalIdr = parseFloat((info as any).balance.idr || 0);
                for (const key of Object.keys((info as any).balance)) {
                    if (key === 'idr') continue;
                    const val = parseFloat((info as any).balance[key] || 0);
                    const hold = parseFloat((info as any).balance_hold?.[key] || 0);
                    const total = val + hold;
                    if (total > 0.000001) {
                        const ticker = tickers[`${key.toLowerCase()}_idr`] || tickers[`${key.toLowerCase()}_usdt`];
                        if (ticker) {
                            const cp = parseFloat(ticker.last || 0);
                            assets.push({ symbol: key.toUpperCase(), balance: val, hold, total, currentPrice: cp });
                            totalIdr += total * cp;
                        }
                    }
                }
                setBalance({ idr: parseFloat((info as any).balance.idr || 0), coin: 0, assets, totalBalanceReal: totalIdr });
            }
        } catch (err) { console.error("Balance fetch failed:", err); }
    };

    useEffect(() => {
        if (isSimulation && balance.totalBalanceReal && balance.totalBalanceReal > 0) return;
        fetchBalance();
        let interval: any;
        if (hasKeys && !isSimulation && cloudSettings.isScannerActive) interval = setInterval(fetchBalance, 120000);
        return () => clearInterval(interval);
    }, [hasKeys, isSimulation, cloudSettings.isScannerActive]);

    const logRejection = async (coin: string, reason: string, type = 'rejection') => {
        if (!user) return;
        supabase.from('bot_logs').insert({ user_id: user.id, message: `[${isSimulationRef.current ? 'VIRTUAL' : 'REAL'} ABORTED] ${coin.toUpperCase()}: ${reason}`, type });
    };

    const askGeminiConfirmation = async (coinId: string, priceData: any[], strat = 'SCALPING'): Promise<any> => {
        const key = geminiKey || (import.meta as any).env.VITE_GEMINI_API_KEY;
        if (!key) return false;
        
        // AI CIRCUIT BREAKER (429/503 Protection)
        const lastErr = (window as any)._lastGeminiError || 0;
        if (Date.now() - lastErr < 120000) { // 2 mins cooldown if error
            console.log("🧊 AI Cooldown active, skipping Gemini for now.");
            return false; 
        }
        
        const genAI = new GoogleGenerativeAI(key);
        const indicators = strat === 'EMA_SCALPING' ? { rsi: analyzeTechnicalIndicators(priceData, true).rsi } : analyzeTechnicalIndicators(priceData, true);
        const latest = priceData[priceData.length - 1];
        const sequence = priceData.slice(-20).map(p => Math.round(typeof p === 'object' ? (p.Close || p.c) : p)).join(', ');

        const prompt = `Analisis Scalping: ${coinId.toUpperCase()}, Harga: Rp ${latest.toLocaleString('id-ID')}, History: [${sequence}], RSI: ${indicators.rsi?.toFixed(2)}. Keputusan: 'BELI' atau 'ABAIKAN' - [Alasan]`;

        const tryModel = async (mName: string, isFallback = false): Promise<any> => {
            try {
                const model = genAI.getGenerativeModel({ model: mName });
                const result = await model.generateContent(prompt);
                const text = (await result.response.text()).trim();
                return { approved: text.toUpperCase().includes('BELI'), reason: text };
            } catch (err: any) {
                const isLimit = err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('limit');
                if (isLimit) {
                    (window as any)._lastGeminiError = Date.now();
                    addLog("🧊 AI Circuit Breaker: Limit tercapai, jeda 2 menit.", "error");
                }
                
                if (!isFallback) {
                    // Fallback order: 3.1 -> 1.5 -> 1.5-8b
                    const nextModel = mName.includes('3.1') ? "gemini-1.5-flash" : "gemini-1.5-flash-8b";
                    console.warn(`Gemini ${mName} failed, trying ${nextModel}...`);
                    return tryModel(nextModel, true);
                }
                return { approved: false, reason: err.message };
            }
        };

        return await Promise.race([
            tryModel("gemini-3.1-flash-lite-preview"), 
            new Promise(res => setTimeout(() => res({ approved: false, reason: 'Timeout' }), 6500))
        ]);
    };

    const executeScalpTrade = async (coin: string, price: number, sType = 'POTENTIAL_BUY', depth: any = null, reason = '') => {
        const amountIdr = tradeAmountRef.current;
        const isSim = isSimulationRef.current;
        addLog(`⚡ [SCALPER] Memulai eksekusi beli ${coin} @ Rp ${price.toLocaleString()}${reason ? ` (${reason})` : ''}...`);
        
        let bPrice = price; 
        let bought = 0;
        let oId: string | undefined = undefined;

        if (!isSim) {
            try {
                const pair = getPair(coin);
                const dData = depth || await fetchOrderBook(pair);
                if (!dData?.sell?.[0]) {
                    addLog(`🔴 GAGAL: Order book ${coin} kosong, tidak bisa membeli.`, 'error');
                    return;
                }
                bPrice = parseFloat(dData.sell[0][0]);
                const order = await tradeOrder(apiKey, secretKey, pair, 'buy', bPrice, amountIdr);
                
                // STICT CHECK: Must have positive receive from Indodax
                bought = parseFloat((order as any).receive || 0);
                oId = (order as any).order_id?.toString();

                if (bought <= 0) {
                    const rem = (order as any).remain || amountIdr;
                    addLog(`⚠️ [PENDING] Order ${coin} dibuat (ID: ${oId || '?'}) tapi belum terisi (fill). Saldo IDR masih tertahan di order book.`, 'warning');
                    
                    // Track for Smart Cancel & Fill Detection
                    if (oId) {
                        const currentTP = takeProfitPercentRef.current;
                        const currentSL = stopLossPercentRef.current;
                        const targetTP = bPrice * (1 + currentTP / 100);
                        const targetSL = bPrice * (1 - currentSL / 100);

                        setPendingBuyOrders(prev => [...prev, { 
                            coin, 
                            orderId: oId, 
                            timestamp: Date.now(), 
                            pair,
                            buyPrice: bPrice,
                            amount: amountIdr / bPrice,
                            targetTP,
                            targetSL,
                            signal: sType,
                            strategy: tradingStrategy
                        }]);
                    }
                    return; 
                }

                addLog(`🟢 REAL TRADE Sukses! ${coin.toUpperCase()} @ Rp ${bPrice.toLocaleString()} | ID: ${oId}`, 'success');
                speak(`Berhasil membeli ${coin}`);
                fetchBalance();
            } catch (err: any) { 
                addLog(`🔴 GAGAL: ${err.message}`, 'error'); 
                return; 
            }
        } else {
            addLog(`🟢 SIMULASI: [BELI] ${coin} @ Rp ${price.toLocaleString()}${reason ? ` [${reason}]` : ''}`, 'buy');
            setSimulatedBalance(p => p - amountIdr);
            bought = amountIdr / price;
        }

        if (bought > 0) {
            playBuySound(); // 🛒 Sound: successful buy
            const currentTP = takeProfitPercentRef.current;
            const currentSL = stopLossPercentRef.current;
            const targetTP = bPrice * (1 + currentTP / 100);
            const targetSL = bPrice * (1 - currentSL / 100);
            
            const nt: ActiveTrade = { 
                coin, buyPrice: bPrice, amount: bought, targetTP, targetSL, 
                highestPrice: bPrice, currentPrice: bPrice, isSimulation: isSim, 
                id: `${coin}-${Date.now()}`, signal: sType,
                timestamp: Date.now(),
                strategy: tradingStrategy as any,
                orderId: oId
            };

            if (!isSim && oId) {
                try {
                    const pair = getPair(coin);
                    const slPrice = Math.floor(bPrice * (1 - (currentSL + 0.5) / 100));
                    const slOrder = await tradeOrder(apiKey, secretKey, pair, 'sell', slPrice, bought, { order_type: 'stoplimit', stop_price: Math.floor(targetSL) });
                    nt.hardStopOrderId = (slOrder as any).order_id?.toString();
                } catch (e: any) { 
                    addLog(`⚠️ SL Pengaman Gagal: ${e.message}`, 'error'); 
                }
            }

            // Sync with local state for instant UI update
            setActiveTrades(prev => [nt, ...prev]);

            if (user) {
                const { data, error } = await supabase.from('active_trades').upsert({
                    user_id: user.id, 
                    coin_id: coin, 
                    buy_price: bPrice, 
                    target_tp: targetTP, 
                    target_sl: targetSL, 
                    highest_price: bPrice, 
                    quantity: bought, 
                    is_simulation: isSim,
                    strategy: tradingStrategy
                }, { onConflict: 'user_id,coin_id,is_simulation' }).select().maybeSingle();
                
                if (data) nt.id = data.id;
                if (error) console.error("Supabase Save Error:", error.message);
            }
        }
    };

    const forceSell = async (tid: string) => {
        const t = activeTradesRef.current.find(x => x.id === tid);
        if (!t) return;
        const pair = getPair(t.coin);
        try {
            let cp = t.currentPrice || t.buyPrice;
            if (!t.isSimulation) {
                const d = await fetchOrderBook(pair);
                if (d?.buy?.[0]) cp = parseFloat(d.buy[0][0]);
                if (t.hardStopOrderId) await cancelOrder(apiKey, secretKey, pair, t.hardStopOrderId, 'sell').catch(()=>{});
                const info = await getUserInfo(apiKey, secretKey) as any;
                const bal = info?.balance[pair.split('_')[0]] || t.amount;
                if (bal > 0) await tradeOrder(apiKey, secretKey, pair, 'sell', cp, bal);
                fetchBalance();
            }
            const p = (((cp - t.buyPrice) / t.buyPrice * 100) - 0.51).toFixed(2);
            if (t.isSimulation) setSimulatedBalance(s => s + (t.amount * cp));
            if (user) {
                fetchDailyPL(true); // Force refresh PL on exit
                const now = new Date();
                const newHistItem: TradeHistory = {
                    id: tid,
                    coin: t.coin.toUpperCase(),
                    trade_type: parseFloat(p) >= 0 ? 'PROFIT' : 'LOSS',
                    buy_price: t.buyPrice,
                    sell_price: cp,
                    profit_percent: parseFloat(p),
                    is_simulation: t.isSimulation,
                    timestamp: now.getTime(),
                    date: now.toLocaleDateString(),
                    time: now.toLocaleTimeString()
                };
                setTradeHistory(prev => [newHistItem, ...prev].slice(0, 50));
                supabase.from('trade_history').insert({ user_id: user.id, coin: t.coin.toUpperCase(), trade_type: newHistItem.trade_type, buy_price: t.buyPrice, sell_price: cp, profit_percent: parseFloat(p), is_simulation: t.isSimulation }).then();
                if (tid.length > 20) supabase.from('active_trades').delete().eq('id', tid).then();
            }
            setActiveTrades(prev => prev.filter(x => x.id !== tid));
        } catch (e) {
            console.error("Force Sell error:", e);
        }
    };

    const scanNextCoin = async () => {
        const now = Date.now();
        await checkPendingOrders();
        const hasActiveTrades = activeTradesRef.current.length > 0;
        const isMasterBotEnabled = cloudSettings.isBotActive !== false;
        
        // If everything is completely off AND no active trades, stop the loop entirely
        if (!cloudSettings.isScannerActive && !hasActiveTrades) {
            console.log("SaktiBot: Scanner & Radar stopped (No active trades)");
            return;
        }

        // 1. MONITORING SECTION (Highest Priority)
        if (hasActiveTrades) {
            const currentTrades = activeTradesRef.current;
            addLog(`🧐 Memantau ${currentTrades.length} posisi terbuka...`, 'info');
            for (const t of currentTrades) {
                try {
                    const pair = getPair(t.coin);
                    const ticker = await fetchTicker(pair);
                    if (!ticker) continue;
                    const cp = parseFloat(ticker.last);
                    
                    t.currentPrice = cp;
                    let lastHP = t.highestPrice || t.buyPrice;
                    let newHP = Math.max(lastHP, cp);
                    
                    if (newHP > lastHP) {
                        t.highestPrice = newHP;
                        if (user) {
                            supabase.from('active_trades').update({ highest_price: newHP }).eq('id', t.id).then();
                        }
                    }

                    const rp = ((cp - t.buyPrice) / t.buyPrice) * 100;
                    const exitSig = checkExitSignal(
                        t.buyPrice, 
                        cp, 
                        t.highestPrice || t.buyPrice, 
                        t.targetTP ? ((t.targetTP - t.buyPrice) / t.buyPrice * 100) : tpVal,
                        t.targetSL ? ((t.buyPrice - t.targetSL) / t.buyPrice * 100) : slVal
                    );

                    if (exitSig.action === 'SELL') {
                        const finalPnl = rp.toFixed(2);
                        const status = parseFloat(finalPnl) >= 0 ? 'success' : 'error';
                        const emoji = parseFloat(finalPnl) >= 0 ? '💰' : '🛑';
                        addLog(`${emoji} EXIT ${t.coin.toUpperCase()}: ${exitSig.reason} | P/L: ${finalPnl}% @ Rp ${cp.toLocaleString()}`, status);
                        // 🔊 Sound Effect
                        if (parseFloat(finalPnl) >= 0) playTPSound();
                        else playSLSound();
                        await forceSell(t.id);
                        continue;
                    } else if (exitSig.reason.includes('TTP Active')) {
                        addLog(`📈 ${t.coin.toUpperCase()}: ${exitSig.reason}`, 'success');
                    }
                } catch (err) {
                    console.error(`Monitor failed for ${t.coin}:`, err);
                }
            }
        }

        // 2. RADAR MODE CHECK (Master Switch or Local Stop)
        const isMonitorOnly = !cloudSettings.isScannerActive || !isMasterBotEnabled;
        if (isMonitorOnly) {
            const reason = !isMasterBotEnabled ? "MASTER BOT OFF" : "SCANNER STOPPED";
            
            setCurrentScanCoinDisplay(`RADAR ON (${reason})`);
            loopRef.current = setTimeout(scanNextCoin, 30000); 
            return;
        }

        // 3. NEW BUYING PRE-CHECKS
        try {
            // Daily Loss Cooldown
            const dPL = await fetchDailyPL().catch(() => 0);
            if (dPL <= -dlyLossVal) {
                const diff = now - lastDailyLossCooldownRef.current;
                if (lastDailyLossCooldownRef.current > 0 && diff < DAILY_LOSS_COOLDOWN_MS) {
                    if (now - lastDailyLossLogRef.current > 600000) {
                        const remaining = Math.ceil((DAILY_LOSS_COOLDOWN_MS - diff) / 60000);
                        addLog(`⏸️ Loss limit harian tercapai. Radar tetap aktif. Scan koin baru berhenti (${remaining} menit lagi)...`, 'info');
                        lastDailyLossLogRef.current = now;
                    }
                    loopRef.current = setTimeout(scanNextCoin, 30000); 
                    return;
                } else if (lastDailyLossCooldownRef.current === 0) {
                    addLog(`⛔ [JEDA 1 JAM] Limit loss tercapai (${dPL.toFixed(2)}%). Radar tetap aktif.`, 'error');
                    lastDailyLossCooldownRef.current = now; 
                    localStorage.setItem('bot_loss_cooldown', now.toString());
                    cloudSettings.saveSettings({ lossCooldownAt: now });
                    lastDailyLossLogRef.current = now;
                    loopRef.current = setTimeout(scanNextCoin, 30000); 
                    return;
                }
            }

            // Bitcoin Guard
            if (now - lastBtcCheckRef.current > 300000) {
                lastBtcCheckRef.current = now;
                const bc = await fetchBitcoin24hChange().catch(() => 0);
                if (bc < BTC_CRASH_THRESHOLD) {
                    btcCooldownTimestampRef.current = now;
                    addLog(`🛑 [BITCOIN GUARD] Deteksi crash: ${bc.toFixed(2)}%. Berhenti beli koin untuk perlindungan aset.`, 'error');
                } else if (Math.abs(bc) > 1.5 && now - lastSentimentLogRef.current > 1800000) {
                    const emoji = bc > 0 ? '📈' : '📉';
                    const status = bc > 0 ? 'success' : 'warning';
                    addLog(`${emoji} Sentimen Pasar: BTC ${bc > 0 ? '+' : ''}${bc.toFixed(2)}% (24j). ${bc > 0 ? 'Kondisi Bullish.' : 'Waspada Bearish.'}`, status);
                    lastSentimentLogRef.current = now;
                }
                setIsBullishMarket(bc > 2.0);
            }

            if (now - btcCooldownTimestampRef.current < BTC_COOLDOWN_MS) {
                if (now - lastDailyLossLogRef.current > 300000) {
                   addLog("🧊 Menunggu pasar stabil (Bitcoin Guard aktif). Radar tetap memantau.", "info");
                   lastDailyLossLogRef.current = now;
                }
                loopRef.current = setTimeout(scanNextCoin, 60000);
                return;
            }
        } catch (err) {
            console.warn("Scanner pre-check failed:", err);
        }

        // 4. SCANNING NEW COINS
        if (now - lastLossTimestampRef.current < activeCooldownDurationRef.current) {
            const rem = Math.ceil((lastLossTimestampRef.current + activeCooldownDurationRef.current - now) / 60000);
            setCurrentScanCoinDisplay(`COOLING (${rem}m)`);
            loopRef.current = setTimeout(scanNextCoin, 30000);
            return;
        }
        
        if (activeTradesRef.current.length >= MAX_ACTIVE_POSITIONS) {
            setCurrentScanCoinDisplay("FULL");
            loopRef.current = setTimeout(scanNextCoin, 30000);
            return;
        }

        let target = ''; 
        const held = balance.assets.filter(a => a.balance > 0.00001);
        
        if (isInitialSweepRef.current && held.length > 0) {
            const a = held[sweepIndexRef.current];
            target = a ? a.symbol : '';
            sweepIndexRef.current++;
            if (sweepIndexRef.current >= held.length) isInitialSweepRef.current = false;
            addLog(`🔍 Mengecek aset yang dimiliki: ${target}`, 'info');
        } else {
            if (allCoins.length === 0) {
                addLog("⌛ Menunggu daftar koin (Memuat data Indodax...)", "info");
                setCurrentScanCoinDisplay("Loading...");
                loopRef.current = setTimeout(scanNextCoin, 5000);
                return; 
            }
            
            if (top20CoinsRef.current.length === 0 || scanIndexRef.current % 50 === 0) {
                addLog("📡 Memperbarui daftar koin unggulan (Mix Gainers & Volatility)...", "info");
                const sortedByGain = [...allCoins].sort((a: any, b: any) => b.change24h - a.change24h);
                const sortedByVol = [...allCoins].sort((a: any, b: any) => Math.abs(b.change24h) - Math.abs(a.change24h));
                const uniqueCoins = Array.from(new Set([...sortedByGain.slice(0, 25), ...sortedByVol.slice(0, 25)]));
                top20CoinsRef.current = uniqueCoins;
            }
            
            if (top20CoinsRef.current.length === 0) { 
                addLog("❌ Daftar koin kosong, mencoba lagi...", "error");
                scanIndexRef.current = 0; 
                loopRef.current = setTimeout(scanNextCoin, 5000);
                return; 
            }
            
            const idx = scanIndexRef.current % top20CoinsRef.current.length;
            target = top20CoinsRef.current[idx]?.id;
            setCurrentScanCoinDisplay(target?.toUpperCase() || "...");
        }

        if (!target) { 
            scanIndexRef.current++; 
            loopRef.current = setTimeout(scanNextCoin, 2000);
            return; 
        }
        
        try {
            const pair = getPair(target);
            const is5m = tradingStrategy === 'SCALPER_5M';
            const tf = is5m ? '5' : '1';
            const windowSeconds = is5m ? 14400 : 7200; 
            const from = Math.floor(now / 1000 - windowSeconds);
            const to = Math.floor(now / 1000);
            const history = await fetchChartHistory(pair.toUpperCase().replace('_',''), tf, from, to);
            
            if (!history || history.length === 0) {
                addLog(`⚠️ [Data Error] Gagal mengambil riwayat ${target.toUpperCase()}. Lewati...`, 'warning');
                scanIndexRef.current++;
                loopRef.current = setTimeout(scanNextCoin, 2000);
                return;
            }

            if (history?.length > (is5m ? 24 : 30)) {
                const prices = history.map((h: any) => parseFloat(h.Close || h.c));
                const ema9Arr = calculateEMA(prices, 9);
                const ema21Arr = calculateEMA(prices, 21);
                const ema25Arr = calculateEMA(prices, 25);
                const rsiArr = calculateRSI(prices, 14);
                const stochRsi = calculateStochasticRSI(rsiArr, 14, 3, 3);
                
                const ema9 = ema9Arr[ema9Arr.length - 1] || 0;
                const ema21 = ema21Arr[ema21Arr.length - 1] || 0;
                const ema25 = ema25Arr[ema25Arr.length - 1] || 0;
                const rsi = rsiArr[rsiArr.length - 1] || 50;
                const stochK = stochRsi.k[stochRsi.k.length - 1] || 50;
                const stochD = stochRsi.d[stochRsi.d.length - 1] || 50;
                const cp = prices[prices.length - 1];
                
                let emaStatus = ema9 > ema21 ? '📈' : '📉';
                if (tradingStrategyRef.current === 'MICRO_SCALPING') emaStatus = cp > ema25 ? '📈' : '📉';
                const scanInfo = `🔍 ${target.toUpperCase()}: Rp ${cp.toLocaleString()} | RSI: ${rsi.toFixed(1)} ${emaStatus}`;
                
                const bcData = await fetchBitcoin24hChange().catch(() => 0);
                const currentVol = parseFloat(history[history.length - 1].v || history[history.length - 1].Volume || "0");
                const avgVol = history.slice(-20).reduce((acc: number, b: any) => acc + parseFloat(b.v || b.Volume || "0"), 0) / 20;

                const entry = checkEntrySignal({
                    rsi, ema9, ema21, ema25, stochK, stochD,
                    currentPrice: cp, volume: currentVol, avgVolume: avgVol, btcChange24h: bcData,
                    strategy: tradingStrategyRef.current as any
                });
                
                if (entry.action === 'BUY') {
                    const pureTarget = target.split('_')[0].toLowerCase();
                    const isAlreadyActive = 
                        held.some(h => h.symbol.toLowerCase() === pureTarget) ||
                        activeTradesRef.current.some(t => t.coin.split('_')[0].toLowerCase() === pureTarget) ||
                        pendingBuyOrdersRef.current.some(p => p.coin.split('_')[0].toLowerCase() === pureTarget);

                    if (isAlreadyActive) { 
                        scanIndexRef.current++; 
                        loopRef.current = setTimeout(scanNextCoin, 2000);
                        return; 
                    }
                    
                    addLog(`🎯 Sinyal beli terdeteksi pada ${target.toUpperCase()}: ${entry.reason}`, 'success');
                    const depth = await fetchOrderBook(pair);
                    const anal = analyzeOrderBook(depth) as any;
                    if (!anal.isValid) { 
                        addLog(`⚠️ Order book ${target} tidak responsif, melewati...`, 'warning');
                        scanIndexRef.current++; 
                        loopRef.current = setTimeout(scanNextCoin, 2000);
                        return; 
                    }
                    
                    if (anal.spread > 2.0) { 
                        addLog(`⏳ Skip ${target.toUpperCase()}: Spread terlalu lebar (${anal.spread.toFixed(2)}% > 2.00%)`, 'info');
                        scanIndexRef.current++; 
                        loopRef.current = setTimeout(scanNextCoin, 2000);
                        return; 
                    }
                    
                    if (anal.buyPressure < 40) {
                        addLog(`⏳ Skip ${target.toUpperCase()}: Tekanan jual tinggi (Buy Pressure: ${anal.buyPressure.toFixed(1)}%)`, 'info');
                        scanIndexRef.current++; 
                        loopRef.current = setTimeout(scanNextCoin, 2000);
                        return;
                    }

                    addGlobalSignal({
                        coin: target, symbol: target.split('_')[0].toUpperCase(), type: 'STRATEGY_BUY',
                        price: cp, message: entry.reason, priceHistory: prices.slice(-10),
                        strength: 'Optimized EMA/RSI', potentialProfit: (tpVal).toFixed(1)
                    });
                    
                    await executeScalpTrade(target, cp, 'OPTIMIZED_BUY', depth, entry.reason);
                } else {
                    addLog(`${scanInfo} | ℹ️ ${entry.reason}`, 'info');
                }
            }
        } catch(e: any) {
            console.error(`[Scanner] Critical error scanning ${target}:`, e.message);
        }
        
        scanIndexRef.current++;
        loopRef.current = setTimeout(scanNextCoin, 2000);
    };

    useEffect(() => {
        let alive = true;
        const trigger = async () => {
            if (!alive) return;
            const hasActiveTrades = activeTradesRef.current.length > 0;
            const isMasterBotEnabled = cloudSettings.isBotActive !== false;
            const isScannerActive = cloudSettings.isScannerActive;
            const shouldRun = isScannerActive || (isMasterBotEnabled && hasActiveTrades);

            if (shouldRun) {
                if (!loopRef.current) {
                    console.log("[Scanner Loop] Starting...");
                    isInitialSweepRef.current = true;
                    sweepIndexRef.current = 0;
                    scanNextCoin();
                }
            } else {
                if (loopRef.current) {
                    console.log("[Scanner Loop] Stopping...");
                    clearTimeout(loopRef.current);
                    loopRef.current = null;
                }
            }
        };

        trigger();
        return () => { 
            alive = false; 
            if (loopRef.current) {
                clearTimeout(loopRef.current);
                loopRef.current = null;
            }
        };
    }, [cloudSettings.isScannerActive, cloudSettings.isBotActive, activeTrades.length]);
    // PENDING ORDER MANAGEMENT (Smart Cancel & Fill Detection)
    const checkPendingOrders = async () => {
        if (isSimulation || !hasKeys) return;
        const now = Date.now();
        const currentPending = pendingBuyOrdersRef.current;
        if (currentPending.length === 0) return;

        // Group by pairs to minimize API calls
        const pairs = Array.from(new Set(currentPending.map(o => o.pair)));
        
        for (const pair of pairs) {
            try {
                const openOrders = await fetchOpenOrders(apiKey, secretKey, pair);
                const pairPending = currentPending.filter(o => o.pair === pair);
                
                for (const o of pairPending) {
                    const stillOpen = openOrders.find(oo => oo.order_id.toString() === o.orderId);
                    
                    if (!stillOpen) {
                        // Order is no longer in Indodax open orders list!
                        // Check if it was filled (if not recently moved to history or canceled by us elsewhere)
                        addLog(`✨ Pending Order ${o.coin} terdeteksi terpenuhi (Filled)! Memindahkan ke Radar...`, 'success');
                        
                        const nt: ActiveTrade = { 
                            coin: o.coin, buyPrice: o.buyPrice, amount: o.amount, 
                            targetTP: o.targetTP, targetSL: o.targetSL, 
                            highestPrice: o.buyPrice, currentPrice: o.buyPrice, 
                            isSimulation: false, id: `${o.coin}-${Date.now()}`, 
                            signal: o.signal, timestamp: Date.now(),
                            strategy: o.strategy, orderId: o.orderId
                        };

                        // Add to Radar
                        setActiveTrades(prev => [nt, ...prev]);
                        if (user) {
                            supabase.from('active_trades').upsert({
                                user_id: user.id, coin_id: o.coin, buy_price: o.buyPrice, 
                                target_tp: o.targetTP, target_sl: o.targetSL, 
                                highest_price: o.buyPrice, quantity: o.amount, 
                                is_simulation: false, strategy: o.strategy
                            }, { onConflict: 'user_id,coin_id,is_simulation' }).select().maybeSingle().then(({data}) => {
                                if (data) nt.id = data.id;
                            });
                        }

                        // Remove from Pending
                        setPendingBuyOrders(prev => prev.filter(p => p.orderId !== o.orderId));
                        fetchBalance();
                    } else if (now - o.timestamp > 2 * 60 * 1000) {
                        // Order is still open but too old (2 mins timeout)
                        addLog(`⏳ Auto-cancel order beli ${o.coin} yang sudah terlalu lama (ID: ${o.orderId})...`, 'warning');
                        await cancelOrder(apiKey, secretKey, pair, o.orderId, 'buy');
                        setPendingBuyOrders(prev => prev.filter(p => p.orderId !== o.orderId));
                    }
                }
            } catch (e: any) {
                console.error(`Check pending order fail for ${pair}:`, e.message);
            }
        }
    };


    return {
        isRunning: cloudSettings.isScannerActive, 
        toggleBot: (v?: boolean) => cloudSettings.saveSettings({ isScannerActive: v ?? !cloudSettings.isScannerActive }),
        forceSell, panicSellAll: async () => { for (const t of activeTrades) await forceSell(t.id); },
        logs, clearLogs: () => setLogs([]),
        balance: isSimulation ? { idr: simulatedBalance, coin: 0, assets: activeTrades.map(t => ({ symbol: t.coin.split('-')[0].toUpperCase(), balance: t.amount, hold: 0, total: t.amount, currentPrice: t.currentPrice })) } : balance,
        totalBalance: isSimulation ? simulatedBalance + activeTrades.reduce((a,c) => a + (c.amount * (c.currentPrice || c.buyPrice)), 0) : balance.totalBalanceReal || balance.idr,
        tradeAmount: amntVal, setTradeAmount: (v: number) => syncToCloud({ tradeAmount: v }), 
        takeProfitPercent: tpVal, setTakeProfitPercent: (v: number) => syncToCloud({ takeProfit: v }), 
        stopLossPercent: slVal, setStopLossPercent: (v: number) => syncToCloud({ stopLoss: v }),
        isSimulation, setIsSimulation, activeTrades, tradeHistory, clearHistory: () => setTradeHistory([]),
        currentScanCoin: currentScanCoinDisplay, scannerStatus, isCloudLoaded,
        isBotActive: cloudSettings.isBotActive, toggleGlobalBot: (v: boolean) => cloudSettings.saveSettings({ isBotActive: v }),
        cooldownRemaining, isSyncing: cloudSettings.isSyncing
    };
};
