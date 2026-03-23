import { useState, useEffect, useRef, useCallback } from 'react';
import { useIndodaxAuth } from './useIndodaxAuth';
import { fetchTicker, getUserInfo, tradeOrder, fetchChartHistory, fetchOrderBook, cancelOrder, fetchBitcoin24hChange, fetchSummaries } from '../utils/indodaxApi';
import { addGlobalSignal } from './useMarketIntelligence';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { analyzeTechnicalIndicators, calculateEMA, analyzeEMAScalping } from '../utils/technicalIndicators';
import { analyzeOrderBook, findMarketWalls } from '../utils/orderBookAnalysis';
import { checkBuyOrderIntelligence, checkSellOrderIntelligence } from '../utils/orderIntelligence';
import { useCoinList } from './useCoinList';
import { supabase } from '../supabase';
import { useAuth } from './useAuth';
import { useSettings } from './useSettings';
import { ActiveTrade, TradeHistory } from '../types/trading';
import { checkExitSignal } from '../utils/strategyRules';
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
    currentPrice?: number;
}

interface Balance {
    idr: number;
    coin: number;
    assets: Asset[];
    totalBalanceReal?: number;
}

export const useAutoTrader = (coinId: string, currentSignal: any, initialIsSimulation?: boolean) => {
    // 1. External Hooks
    const { apiKey, secretKey, geminiKey, hasKeys } = useIndodaxAuth();
    const { allCoins } = useCoinList();
    const { user } = useAuth();
    const cloudSettings = useSettings(user);
    const tradingStrategy = (cloudSettings?.tradingStrategy || 'SCALPING') as string;

    // 2. Refs
    const loopRef = useRef<any>(null);
    const lastSignalRef = useRef<string | null>(null);
    const buyPriceRef = useRef<number | null>(null);
    const tradeAmountRef = useRef(50000);
    const hardStopOrderIdRef = useRef<string | null>(null);
    const isSimulationRef = useRef(true);
    const tradingStrategyRef = useRef('SCALPING');
    const lastBalanceFetchRef = useRef(0);
    const lastOrderCheckRef = useRef(0);

    // BITCOIN GUARD
    const lastBtcCheckRef = useRef(0);
    const btcCooldownTimestampRef = useRef(0);
    const BTC_COOLDOWN_MS = 2 * 60 * 60 * 1000;
    const BTC_CRASH_THRESHOLD = -4.0;

    // 3. States
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isCloudLoaded, setIsCloudLoaded] = useState(false);
    const [balance, setBalance] = useState<Balance>({ idr: 0, coin: 0, assets: [] });
    const [isSimulation, setIsSimulation] = useState(initialIsSimulation ?? true);

    useEffect(() => {
        if (initialIsSimulation !== undefined && initialIsSimulation !== isSimulation) {
            setIsSimulation(initialIsSimulation);
        }
    }, [initialIsSimulation]);

    const [simulatedBalance, setSimulatedBalance] = useState(() => {
        try {
            const saved = localStorage.getItem('traderSimulatedBalance');
            return saved ? parseFloat(saved) : 10000000;
        } catch (e) {
            return 10000000;
        }
    });

    const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
    const [tradeHistory, setTradeHistory] = useState<TradeHistory[]>([]);

    // Derived values from Cloud Settings (Single Source of Truth)
    const tradeAmount = cloudSettings.tradeAmount || 50000;
    const takeProfitPercent = cloudSettings.takeProfit || 2.0;
    const stopLossPercent = cloudSettings.stopLoss || 1.0;

    // 4. Synchronization Logic
    useEffect(() => {
        if (cloudSettings.isLoaded) {
            if (tradingStrategyRef.current !== cloudSettings.tradingStrategy) {
                tradingStrategyRef.current = cloudSettings.tradingStrategy || 'SCALPING';
            }
            setIsCloudLoaded(true);
        }
    }, [cloudSettings.isLoaded, cloudSettings.tradingStrategy]);

    // Update Refs
    useEffect(() => { 
        isSimulationRef.current = isSimulation;
        tradeAmountRef.current = tradeAmount;
    }, [isSimulation, tradeAmount]);

    useEffect(() => {
        localStorage.setItem('traderSimulatedBalance', simulatedBalance.toString());
    }, [simulatedBalance, user]);

    const isFetchingRef = useRef(false);
    useEffect(() => {
        const initCloud = async () => {
            if (user && !isFetchingRef.current && coinId) {
                isFetchingRef.current = true;
                setIsCloudLoaded(false);
                try {
                    const [{ data: cloudTrades }, { data: cloudHistory }] = await Promise.all([
                        supabase.from('active_trades').select('*').eq('user_id', user.id).eq('coin_id', coinId).eq('is_simulation', isSimulation),
                        supabase.from('trade_history').select('*').eq('user_id', user.id).eq('coin', coinId).eq('is_simulation', isSimulation).order('created_at', { ascending: false }).limit(20)
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
                        const t = (cloudTrades as any[])[0];
                        const mapped: ActiveTrade = {
                            coin: t.coin_id,
                            buyPrice: parseFloat(t.buy_price),
                            amount: parseFloat(t.quantity),
                            targetTP: parseFloat(t.target_tp),
                            targetSL: parseFloat(t.target_sl),
                            currentPrice: parseFloat(t.buy_price),
                            highestPrice: parseFloat(t.highest_price || t.buy_price),
                            isSimulation: t.is_simulation,
                            id: t.id,
                            timestamp: new Date(t.created_at).getTime(),
                            strategy: (t.strategy || 'SCALPING') as any
                        };
                        setActiveTrade(mapped);
                        buyPriceRef.current = mapped.buyPrice;
                        setIsRunning(true);
                    } else {
                        setActiveTrade(null);
                        setIsRunning(false);
                    }
                } catch (err) {
                    console.error("Initial Cloud pull (Single) failed:", err);
                } finally {
                    setIsCloudLoaded(true);
                    isFetchingRef.current = false;
                }
            }
        };
        initCloud();
    }, [user?.id, coinId, isSimulation]);

    // Realtime Monitor
    useEffect(() => {
        if (!user || !coinId) return;
        const channel = supabase.channel('trader_active_trade_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_trades', filter: `user_id=eq.${user.id}` }, (payload) => {
                const { eventType, new: newRow, old: oldRow } = payload;
                const coinMatch = ((newRow as any)?.coin_id === coinId) || ((oldRow as any)?.coin_id === coinId);
                const simMatch = ((newRow as any)?.is_simulation === isSimulation) || ((oldRow as any)?.is_simulation === isSimulation);
                if (!coinMatch || !simMatch) return;

                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    setActiveTrade({
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
                    });
                    setIsRunning(true);
                } else if (eventType === 'DELETE') {
                    setActiveTrade(prev => (prev && prev.id === (oldRow as any).id) ? null : prev);
                }
            }).subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [user?.id, coinId, isSimulation]);

    const getPair = (cid: string): string => {
        if (!cid) return 'btc_idr';
        let clean = cid.toLowerCase().replace('-', '_').split('_')[0];
        const overrides: Record<string, string> = { 
            'polygon-ecosystem-token': 'pol_idr', 'avalanche-2': 'avax_idr', 'shiba-inu': 'shib_idr', 
            'indodax-token': 'idt_idr', polygon: 'pol_idr' 
        };
        if (overrides[cid]) return overrides[cid];
        const coinObj = allCoins.find(c => c.id === cid || c.symbol?.toLowerCase() === clean);
        return `${(coinObj?.symbol || clean).toLowerCase()}_idr`;
    };

    const addLog = (message: string, type = 'info') => {
        const newLog: LogEntry = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, time: new Date().toLocaleTimeString(), message, type };
        setLogs(prev => [...prev.slice(-49), newLog]);
    };

    const updateBalance = async () => {
        if (!hasKeys || isSimulation) return;
        try {
            const info = await getUserInfo(apiKey, secretKey) as any;
            const assets: Asset[] = [];
            if (info?.balance) {
                Object.keys(info.balance).forEach(key => {
                    const val = parseFloat(info.balance[key] || 0);
                    const hold = parseFloat(info.balance_hold?.[key] || 0);
                    if (val + hold > 0 && key !== 'idr') {
                        assets.push({ symbol: key.toUpperCase(), balance: val, hold, total: val + hold });
                    }
                });
            }
            let totalValue = parseFloat(info.balance.idr || 0);
            const summaries = await fetchSummaries();
            if (summaries?.tickers) {
                assets.forEach(a => {
                    const ticker = summaries.tickers[`${a.symbol.toLowerCase()}_idr`];
                    if (ticker?.last) {
                        a.currentPrice = parseFloat(ticker.last);
                        totalValue += a.total * a.currentPrice;
                    }
                });
            }
            setBalance({ idr: parseFloat(info.balance.idr || 0), coin: 0, assets, totalBalanceReal: totalValue });
        } catch (e: any) { addLog(`Gagal ambil saldo: ${e.message}`, 'error'); }
    };

    const askGeminiConfirmation = async (cid: string, priceData: any[]): Promise<any> => {
        const gKey = geminiKey || (import.meta as any).env.VITE_GEMINI_API_KEY;
        if (!gKey) return { approved: true, reason: 'No Key' };
        
        // AI CIRCUIT BREAKER
        const lastErr = (window as any)._lastGeminiError || 0;
        if (Date.now() - lastErr < 120000) return { approved: false, reason: 'AI Cooldown' };

        const genAI = new GoogleGenerativeAI(gKey);
        const indicators = analyzeTechnicalIndicators(priceData, true);
        const latest = priceData[priceData.length - 1];
        const sequence = priceData.slice(-20).map(p => Math.round(typeof p === 'object' ? (p.Close || p.c) : p)).join(', ');
        const prompt = `Analisis Single: ${cid.toUpperCase()}, Harga: Rp ${latest.toLocaleString('id-ID')}, RSI: ${indicators.rsi?.toFixed(2)}. BELI/ABAIKAN?`;

        const tryModel = async (mName: string, isFallback = false): Promise<any> => {
            try {
                const model = genAI.getGenerativeModel({ model: mName });
                const result = await model.generateContent(prompt);
                const text = (await result.response.text()).trim();
                return { approved: text.toUpperCase().includes('BELI'), reason: text };
            } catch (err: any) {
                const isLimit = err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('limit');
                if (isLimit) (window as any)._lastGeminiError = Date.now();
                
                if (!isFallback) {
                    const nextModel = mName.includes('3.1') ? "gemini-1.5-flash" : "gemini-1.5-flash-8b";
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

    const checkSignalAndTrade = async () => {
        if (!isRunning || !coinId) return;
        try {
            const pair = getPair(coinId);
            const now = Date.now();

            if (now - lastBtcCheckRef.current > 900000) {
                lastBtcCheckRef.current = now;
                const bc = await fetchBitcoin24hChange();
                if (bc < BTC_CRASH_THRESHOLD) btcCooldownTimestampRef.current = now;
            }
            if (now - btcCooldownTimestampRef.current < BTC_COOLDOWN_MS) return;

            const ticker = await fetchTicker(pair);
            if (!ticker) return;
            const cp = parseFloat(ticker.last);

            if (activeTrade) {
                const rp = ((cp - activeTrade.buyPrice) / activeTrade.buyPrice) * 100;
                let lastHP = activeTrade.highestPrice || activeTrade.buyPrice;
                let newHP = Math.max(lastHP, cp);
                
                // Update Local & DB highest price
                if (newHP > lastHP) {
                    setActiveTrade(prev => prev ? { ...prev, highestPrice: newHP, currentPrice: cp } : null);
                    if (user && activeTrade.id) {
                        supabase.from('active_trades').update({ highest_price: newHP }).eq('id', activeTrade.id).then();
                    }
                } else if (cp !== activeTrade.currentPrice) {
                    setActiveTrade(prev => prev ? { ...prev, currentPrice: cp } : null);
                }

                // LOGIC EXIT
                const exitSig = checkExitSignal(
                    activeTrade.buyPrice,
                    cp,
                    activeTrade.highestPrice || activeTrade.buyPrice,
                    takeProfitPercent,
                    stopLossPercent
                );

                if (exitSig.action === 'SELL') {
                    addLog(`🎯 ${exitSig.reason}! Menjual ${coinId.toUpperCase()} @ Rp ${cp.toLocaleString()}`, 'success');
                    await forceSell();
                    return; 
                }
            }

            // Simple Logic for Single Trader
            if (!activeTrade && currentSignal?.type === 'BUY') {
                const history = await fetchChartHistory(pair.toUpperCase().replace('_',''), '1', now/1000 - 3600, now/1000);
                if (history?.length > 10) {
                    const prices = history.map((h: any) => parseFloat(h.Close || h.c));
                    const ai = await askGeminiConfirmation(coinId, prices);
                    if (ai.approved) {
                        addGlobalSignal({
                            coin: coinId,
                            symbol: coinId.toUpperCase(),
                            type: 'GEMINI_BUY',
                            price: cp,
                            message: `Single Trader AI: ${ai.reason}`,
                            priceHistory: prices.slice(-10),
                            strength: 'AI Approved',
                            potentialProfit: (takeProfitPercent).toFixed(1)
                        });
                        
                        if (user) {
                            const now = new Date();
                            const newHist: TradeHistory = {
                                coin: coinId.toUpperCase(),
                                trade_type: 'MANUAL_BUY',
                                buy_price: cp,
                                sell_price: 0,
                                profit_percent: 0,
                                timestamp: Date.now(),
                                is_simulation: isSimulation,
                                date: now.toLocaleDateString(),
                                time: now.toLocaleTimeString()
                            };
                            setTradeHistory(prev => [newHist, ...prev].slice(0, 50));
                            supabase.from('trade_history').insert({ ...newHist, user_id: user.id }).then();
                        }

                        if (isSimulation) {
                            const nt: ActiveTrade = {
                                coin: coinId, buyPrice: cp, amount: tradeAmountRef.current / cp,
                                currentPrice: cp, highestPrice: cp, targetTP: cp * 1.02, targetSL: cp * 0.99,
                                id: `sim-${Date.now()}`, isSimulation: true,
                                timestamp: Date.now(),
                                strategy: tradingStrategyRef.current as any
                            };
                            setActiveTrade(nt);
                            setSimulatedBalance(s => s - tradeAmountRef.current);
                        } else {
                            await tradeOrder(apiKey, secretKey, pair, 'buy', cp, tradeAmountRef.current);
                            updateBalance();
                        }
                        playBuySound(); // 🛒 Sound: buy executed
                    }
                }
            }
        } catch (e) {}
    };

    useEffect(() => {
        if (isRunning) {
            updateBalance();
            loopRef.current = setInterval(checkSignalAndTrade, 15000);
        } else if (loopRef.current) {
            clearInterval(loopRef.current);
            loopRef.current = null;
        }
        return () => { if (loopRef.current) clearInterval(loopRef.current); };
    }, [isRunning, coinId, isSimulation]);

    const forceSell = async () => {
        if (!activeTrade) return;
        const pair = getPair(activeTrade.coin);
        try {
            const ticker = await fetchTicker(pair);
            const cp = ticker ? parseFloat(ticker.last) : (activeTrade.currentPrice || activeTrade.buyPrice);
            if (!isSimulation) {
                const info = await getUserInfo(apiKey, secretKey) as any;
                const bal = info?.balance[pair.split('_')[0]] || activeTrade.amount;
                if (bal > 0) await tradeOrder(apiKey, secretKey, pair, 'sell', cp, bal);
                updateBalance();
            }
            if (isSimulation) setSimulatedBalance(s => s + (activeTrade.amount * cp));
            
            const p = (((cp - activeTrade.buyPrice) / activeTrade.buyPrice * 100) - 0.51).toFixed(2);
            // 🔊 Sound Effect on exit
            if (parseFloat(p) >= 0) playTPSound();
            else playSLSound();
            if (user) {
                const now = new Date();
                const newHistItem: TradeHistory = {
                    id: activeTrade.id || `${Date.now()}`,
                    coin: activeTrade.coin.toUpperCase(),
                    trade_type: parseFloat(p) >= 0 ? 'PROFIT' : 'LOSS',
                    buy_price: activeTrade.buyPrice,
                    sell_price: cp,
                    profit_percent: parseFloat(p),
                    is_simulation: isSimulation,
                    timestamp: now.getTime(),
                    date: now.toLocaleDateString(),
                    time: now.toLocaleTimeString()
                };
                setTradeHistory(prev => [newHistItem, ...prev].slice(0, 50));
                supabase.from('trade_history').insert({ user_id: user.id, coin: activeTrade.coin.toUpperCase(), trade_type: newHistItem.trade_type, buy_price: activeTrade.buyPrice, sell_price: cp, profit_percent: parseFloat(p), is_simulation: isSimulation }).then();
                if (activeTrade.id && activeTrade.id.length > 20) {
                    supabase.from('active_trades').delete().eq('id', activeTrade.id).then();
                }
            }

            setActiveTrade(null);
            addLog(`✅ Force Sell Sukses | P/L: ${p}% @ Rp ${cp.toLocaleString()}`, 'success');
        } catch (e: any) { addLog(`Gagal Jual: ${e.message}`, 'error'); }
    };

    const toggleBot = useCallback((v?: boolean) => setIsRunning(v ?? !isRunning), [isRunning]);

    return {
        isRunning, toggleBot,
        forceSell: (tid?: string) => forceSell(), // tid ignored in single trader
        panicSellAll: forceSell, logs, clearLogs: () => setLogs([]),
        balance: isSimulation ? { idr: simulatedBalance, coin: 0, assets: activeTrade ? [{ symbol: activeTrade.coin.split('-')[0].toUpperCase(), balance: activeTrade.amount, hold: 0, total: activeTrade.amount, currentPrice: activeTrade.currentPrice }] : [] } : balance,
        totalBalance: isSimulation ? simulatedBalance + (activeTrade ? (activeTrade.amount * (activeTrade.currentPrice || activeTrade.buyPrice)) : 0) : balance.totalBalanceReal || balance.idr,
        activeTrade, activeTrades: activeTrade ? [activeTrade] : [],
        tradeAmount, setTradeAmount: (v: number) => cloudSettings.saveSettings({ tradeAmount: v }),
        takeProfitPercent, setTakeProfitPercent: (v: number) => cloudSettings.saveSettings({ takeProfit: v }),
        stopLossPercent, setStopLossPercent: (v: number) => cloudSettings.saveSettings({ stopLoss: v }),
        isSimulation, setIsSimulation, tradeHistory, clearHistory: () => setTradeHistory([]), isCloudLoaded,
        isSyncing: false, isBotActive: isRunning, toggleGlobalBot: (v: boolean) => setIsRunning(v)
    };
};
